"""
Data Loader — Production (SQL Server)
======================================
Dùng khi: tích hợp vào hệ thống thật (FastAPI serving)
Database: SQL Server (SkyBooker)

Khác với data_loader_csv.py (training):
  - Đọc data từ SQL Server thay vì CSV
  - Users & history là dữ liệu thật từ booking history
  - get_user_history() trả về booking history thật
  - update_user_preference() để pass vì Node.js (ai.helper.js)
    đảm nhiệm online learning qua updateUserPreferenceOnline()
  - Model (ranker_model.pkl) đã được train offline bằng data_loader_csv.py

Luồng production:
  Node.js (ai.helper.js)
    → computePreferenceVector()  — tính preference vector từ SQL
    → callAIRanker()             — gọi FastAPI POST /search-by-vector
    → FastAPI (api.py)
        → DataLoader.get_candidates()       — lấy candidates từ SQL
        → FeatureEngineer + FlightRanker    — rank bằng model đã train
        → Explainer                         — giải thích kết quả
    → mergeAIWithSQL()           — merge kết quả AI với SQL flights

Ghi chú đồng bộ:
  Model được train với dataset Kaggle (INR):
    TRAIN_PRICE_MIN = 1_000, TRAIN_PRICE_MAX = 200_000
  Production dùng giá VND:
    PROD_PRICE_MIN  = 500_000, PROD_PRICE_MAX  = 9_000_000
  → Hàm normalize_price_to_training() chuyển đổi về cùng không gian [0,1]
    trước khi đưa vào model, đảm bảo feature distribution nhất quán.
"""

import pandas as pd
import numpy as np
from sqlalchemy import create_engine
from pathlib import Path
from typing import Optional
import os
import urllib

# ── Cấu hình DB ───────────────────────────────────────────────────────────────
DB_SERVER   = r"HLong_023503\SQLEXPRESS"
DB_NAME     = "skybooker"
DB_TRUSTED  = os.getenv("DB_TRUSTED_CONNECTION", "yes")
DB_USERNAME = "sa"
DB_PASSWORD = "123456"

# ── Map IATA → tên thành phố (khớp với ai.helper.js IATA_TO_CITY) ────────────
IATA_TO_CITY = {
    "SGN": "Ho Chi Minh City",
    "HAN": "Hanoi",
    "DAD": "Da Nang",
    "PQC": "Phu Quoc",
    "HPH": "Hai Phong",
    "BKK": "Bangkok",
    "SIN": "Singapore",
    "ICN": "Seoul",
    "NRT": "Tokyo",
    "KUL": "Kuala Lumpur",
}

# ── Hằng số normalize production (VND) ───────────────────────────────────────
PRICE_MIN    = 500_000    # VND
PRICE_MAX    = 9_000_000  # VND
DURATION_MIN = 30         # phút
DURATION_MAX = 600        # phút

# ── Hằng số normalize training (INR — Kaggle dataset) ────────────────────────
# Model được train trên không gian này → cần map production về đây
TRAIN_PRICE_MIN = 1_000
TRAIN_PRICE_MAX = 200_000

PREFERENCE_DIMS = [
    "price_sensitivity",
    "duration_preference",
    "stop_tolerance",
    "airline_loyalty",
    "morning_preference",
    "business_class_pref",
]


def normalize_price_to_training(price_vnd: float) -> float:
    """
    Chuyển đổi giá VND (production) về không gian [0,1] tương đương
    với không gian training (INR — Kaggle dataset).

    Cách hoạt động:
      1. Normalize giá VND về [0,1] theo thang sản xuất
      2. Giữ nguyên giá trị đó (cùng vị trí tương đối trong [0,1])
      → Model nhận được feature trong đúng phân phối đã train

    Ví dụ:
      500_000 VND (rẻ nhất)  → 0.0
      9_000_000 VND (đắt nhất) → 1.0
      Tương tự:
      1_000 INR (rẻ nhất)    → 0.0
      200_000 INR (đắt nhất) → 1.0

    Args:
        price_vnd: Giá vé thực tế (VND)

    Returns:
        float trong [0, 1] — dùng làm feature price_norm cho model
    """
    normalized = (price_vnd - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)
    return float(np.clip(normalized, 0.0, 1.0))


def _make_engine():
    params = urllib.parse.quote_plus(
        f"DRIVER={{ODBC Driver 17 for SQL Server}};"
        f"SERVER={DB_SERVER};"
        f"DATABASE={DB_NAME};"
        f"UID={DB_USERNAME};"
        f"PWD={DB_PASSWORD};"
        f"TrustServerCertificate=yes;"
    )

    return create_engine(
        f"mssql+pyodbc:///?odbc_connect={params}",
        fast_executemany=True,
    )


class DataLoader:
    """
    DataLoader cho production — đọc từ SQL Server.

    Attributes:
        flights  : DataFrame chuyến bay từ DB (không Cancelled)
        users    : DataFrame users active từ DB
        history  : DataFrame booking history (positive + sampled negative)
    """

    def __init__(self):
        self._engine = _make_engine()
        self._flights: Optional[pd.DataFrame] = None
        self._users:   Optional[pd.DataFrame] = None
        self._history: Optional[pd.DataFrame] = None
        self._user_pref_cache: dict[str, np.ndarray] = {}
        self._load_all()

    # ── Load ──────────────────────────────────────────────────────────────────

    def _load_all(self):
        print("[DataLoader] Đang load data từ SQL Server...")
        self._load_flights()
        self._load_users()
        self._load_history()
        print("[DataLoader] Load xong.\n")

    def _load_flights(self):
        query = """
            SELECT
                CAST(f.flight_id AS NVARCHAR)                       AS flight_id,
                f.flight_code,
                f.source_airport_id                                 AS source_iata,
                f.destination_airport_id                            AS dest_iata,
                CAST(f.base_price AS FLOAT)                         AS price,
                al.airline_name                                     AS airline,
                al.airline_code,
                DATEDIFF(MINUTE, f.departure_time, f.arrival_time)  AS duration_minutes,
                0                                                   AS stops_num,
                0                                                   AS is_business,
                CASE
                    WHEN DATEPART(HOUR, f.departure_time) BETWEEN 0  AND 5  THEN 0
                    WHEN DATEPART(HOUR, f.departure_time) BETWEEN 6  AND 11 THEN 1
                    WHEN DATEPART(HOUR, f.departure_time) BETWEEN 12 AND 17 THEN 2
                    WHEN DATEPART(HOUR, f.departure_time) BETWEEN 18 AND 22 THEN 3
                    ELSE 4
                END                                                 AS dep_slot,
                f.departure_time,
                f.arrival_time
            FROM   dbo.Flights   f
            JOIN   dbo.Airlines  al  ON f.airline_id = al.airline_id
            WHERE  f.status != 'Cancelled'
        """
        df = pd.read_sql(query, self._engine)

        df["source_city"]      = df["source_iata"].map(IATA_TO_CITY)
        df["destination_city"] = df["dest_iata"].map(IATA_TO_CITY)

        before = len(df)
        df = df.dropna(subset=["source_city", "destination_city"]).reset_index(drop=True)
        if len(df) < before:
            print(f"  [warn] Bỏ {before - len(df)} chuyến do thiếu city mapping")

        # Normalize giá VND → [0,1] theo thang production
        # Sau đó dùng normalize_price_to_training() khi build feature vector
        # để đảm bảo đồng bộ với không gian training (INR)
        df["price_norm"]    = df["price"].apply(normalize_price_to_training)
        df["duration_norm"] = (
            (df["duration_minutes"] - DURATION_MIN) / (DURATION_MAX - DURATION_MIN)
        ).clip(0, 1)
        df["duration"]   = df["duration_minutes"] / 60.0
        df["seat_class"] = "Economy"

        self._flights = df
        routes = df[["source_city", "destination_city"]].drop_duplicates()
        print(f"  ✓ flights  : {len(df):,} records, {len(routes)} tuyến")
        print(f"  ✓ cities   : {sorted(df['source_city'].unique().tolist())}")

    def _load_users(self):
        query_users = """
            SELECT
                CAST(user_id AS NVARCHAR) AS user_id,
                username,
                email,
                role
            FROM dbo.Users
            WHERE status = 'active'
        """
        df = pd.read_sql(query_users, self._engine)

        df["preferred_airline"] = ""
        df["archetype"]         = "real_user"
        for dim in PREFERENCE_DIMS:
            df[dim] = 0.5

        self._users = df
        print(f"  ✓ users    : {len(df):,} records")
        self._update_preferred_airlines()

    def _update_preferred_airlines(self):
        """Tính preferred_airline từ booking history (query riêng — tránh collation)."""
        try:
            query_pref = """
                SELECT b.user_id, al.airline_name, COUNT(*) AS booking_count
                FROM dbo.Bookings b
                JOIN dbo.Tickets  t  ON b.booking_id = t.booking_id
                JOIN dbo.Flights  f  ON t.flight_id  = f.flight_id
                JOIN dbo.Airlines al ON f.airline_id = al.airline_id
                WHERE b.status = N'Thành công'
                  AND t.status != N'Đã hủy'
                GROUP BY b.user_id, al.airline_name
            """
            pref_df = pd.read_sql(query_pref, self._engine)
            if len(pref_df) == 0:
                print("  [info] Chưa có booking history để tính preferred_airline")
                return

            pref_df = pref_df.sort_values("booking_count", ascending=False)
            top_per_user = (
                pref_df.groupby("user_id")["airline_name"]
                .first().reset_index()
            )
            top_per_user["user_id"] = top_per_user["user_id"].astype(str)
            pref_map = dict(zip(top_per_user["user_id"], top_per_user["airline_name"]))
            self._users["preferred_airline"] = (
                self._users["user_id"].map(pref_map).fillna("")
            )
            n_updated = (self._users["preferred_airline"] != "").sum()
            print(f"  ✓ preferred_airline: cập nhật cho {n_updated} users")
        except Exception as e:
            print(f"  [warn] Không lấy được preferred_airline: {e}")

    def _load_history(self):
        query_positive = """
            SELECT
                CAST(b.user_id   AS NVARCHAR) AS user_id,
                CAST(t.flight_id AS NVARCHAR) AS flight_id,
                2                             AS relevance
            FROM dbo.Bookings b
            JOIN dbo.Tickets  t ON b.booking_id = t.booking_id
            WHERE b.status = N'Thành công'
              AND t.status != N'Đã hủy'
        """
        try:
            pos_df = pd.read_sql(query_positive, self._engine)
        except Exception as e:
            print(f"  [warn] Lỗi load booking history: {e}")
            pos_df = pd.DataFrame(columns=["user_id", "flight_id", "relevance"])

        neg_rows = []
        if len(pos_df) > 0 and self._flights is not None:
            flights_idx = self._flights.set_index("flight_id")
            for _, row in pos_df.iterrows():
                fid = str(row["flight_id"])
                if fid not in flights_idx.index:
                    continue
                flight = flights_idx.loc[fid]
                origin = flight["source_city"]
                dest   = flight["destination_city"]
                same_route = self._flights[
                    (self._flights["source_city"]      == origin) &
                    (self._flights["destination_city"] == dest) &
                    (self._flights["flight_id"]        != fid)
                ]
                if len(same_route) == 0:
                    continue
                sample_size = min(2, len(same_route))
                for _, neg_flight in same_route.sample(sample_size).iterrows():
                    neg_rows.append({
                        "user_id":   str(row["user_id"]),
                        "flight_id": str(neg_flight["flight_id"]),
                        "relevance": 0,
                    })

        neg_df = pd.DataFrame(neg_rows) if neg_rows else pd.DataFrame(
            columns=["user_id", "flight_id", "relevance"]
        )
        combined = pd.concat([pos_df, neg_df], ignore_index=True)
        combined["user_id"]    = combined["user_id"].astype(str)
        combined["flight_id"]  = combined["flight_id"].astype(str)
        combined["session_id"] = combined.index.astype(str)
        self._history = combined
        print(f"  ✓ history  : {len(combined):,} interactions "
              f"(pos={len(pos_df):,}, neg={len(neg_df):,})")

    # ── Properties ────────────────────────────────────────────────────────────

    @property
    def flights(self) -> pd.DataFrame:
        return self._flights

    @property
    def users(self) -> pd.DataFrame:
        return self._users

    @property
    def history(self) -> pd.DataFrame:
        return self._history

    # ── User history ──────────────────────────────────────────────────────────

    def get_user_history(self, user_id: str) -> pd.DataFrame:
        uid = str(user_id)
        return self._history[self._history["user_id"] == uid].reset_index(drop=True)

    # ── User preference vector ─────────────────────────────────────────────────

    def get_user_preference_vector(self, user_id: str) -> np.ndarray:
        uid = str(user_id)
        if uid in self._user_pref_cache:
            return self._user_pref_cache[uid].astype(np.float32)
        return np.array([0.6, 0.5, 0.5, 0.5, 0.5, 0.5], dtype=np.float32)

    def get_user_preference_dict(self, user_id: str) -> dict:
        return dict(zip(PREFERENCE_DIMS, self.get_user_preference_vector(user_id)))

    def get_available_routes(self) -> list[tuple[str, str]]:
        return (
            self._flights[["source_city", "destination_city"]]
            .drop_duplicates()
            .apply(tuple, axis=1)
            .tolist()
        )

    def update_user_preference(self, user_id, flight_id, action, alpha=0.1):
        """
        Online learning — EMA update preference vector (in-memory).
        Persist sang SQL do Node.js đảm nhiệm qua updateUserPreferenceOnline().
        """
        uid = str(user_id)
        fid = str(flight_id)
        current_vec = self.get_user_preference_vector(uid)
        flights_idx = self._flights.set_index("flight_id")
        if fid not in flights_idx.index:
            return
        flight = flights_idx.loc[fid]
        user_row     = self._users[self._users["user_id"] == uid]
        pref_airline = ""
        if len(user_row) > 0:
            pref_airline = str(user_row.iloc[0].get("preferred_airline", ""))

        price_norm   = float(flight["price_norm"])
        dur_norm     = float(flight["duration_norm"])
        stops_num    = float(flight["stops_num"])
        dep_slot     = int(flight["dep_slot"])
        is_morning   = 1.0 if dep_slot in [0, 1] else 0.0
        is_biz       = float(flight["is_business"])
        is_preferred = 1.0 if (pref_airline and flight["airline"] == pref_airline) else 0.2

        signal = np.array([
            1.0 - price_norm,
            1.0 - dur_norm,
            stops_num / 2.0,
            is_preferred,
            is_morning,
            is_biz,
        ], dtype=np.float32)

        sign_map = {"book": 1.0, "click": 0.5, "ignore": -0.3}
        sign = sign_map.get(action, 0.0)
        if sign == 0.0:
            return
        new_vec = np.clip(current_vec + sign * alpha * (signal - current_vec), 0.0, 1.0)
        self._user_pref_cache[uid] = new_vec.astype(np.float32)

    # ── Candidate generation ───────────────────────────────────────────────────

    def get_candidates(
        self,
        origin:      str,
        destination: str,
        seat_class:  Optional[str] = None,
        max_stops:   Optional[int] = None,
    ) -> pd.DataFrame:
        mask = (
            (self._flights["source_city"].str.lower()      == origin.lower()) &
            (self._flights["destination_city"].str.lower() == destination.lower())
        )
        candidates = self._flights[mask].copy()
        if seat_class is not None:
            candidates = candidates[
                candidates["seat_class"].str.lower() == seat_class.lower()
            ]
        if max_stops is not None:
            candidates = candidates[candidates["stops_num"] <= max_stops]
        return candidates.reset_index(drop=True)

    # ── Summary ───────────────────────────────────────────────────────────────

    def summary(self):
        print("=" * 60)
        print("  DataLoader Summary (Production - SQL Server)")
        print("=" * 60)
        print(f"  Flights : {len(self._flights):,}")
        print(f"  Users   : {len(self._users):,}")
        print(f"  History : {len(self._history):,}")
        for o, d in self.get_available_routes():
            n = len(self.get_candidates(o, d))
            print(f"    {o} → {d} ({n} chuyến)")
        print(f"\n  Price normalization: VND [{PRICE_MIN:,} – {PRICE_MAX:,}] → [0, 1]")
        print(f"  (Đồng bộ với training space qua normalize_price_to_training())")
        print("=" * 60)


if __name__ == "__main__":
    dl = DataLoader()
    dl.summary()