"""
Data loader for production (SQL Server)
========================================
- source_city / destination_city dùng tên tiếng Anh khớp với IATA_TO_CITY
- price_norm / duration_norm dùng global range (không per-group)
- SQLAlchemy engine thay pyodbc trực tiếp (tránh UserWarning)
- preferred_airline được tính từ booking history thật
"""

import pandas as pd
import numpy as np
from sqlalchemy import create_engine
from pathlib import Path
from typing import Optional
import os
from dotenv import load_dotenv
load_dotenv()
import urllib

DB_SERVER   = os.getenv("DB_SERVER",             "localhost")
DB_NAME     = os.getenv("DB_NAME",               "skybooker")
DB_TRUSTED  = os.getenv("DB_TRUSTED_CONNECTION", "yes")
DB_USERNAME = os.getenv("DB_USERNAME", "")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")

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

PRICE_MIN    = 500_000
PRICE_MAX    = 9_000_000
DURATION_MIN = 30
DURATION_MAX = 600

PREFERENCE_DIMS = [
    "price_sensitivity",
    "duration_preference",
    "stop_tolerance",
    "airline_loyalty",
    "morning_preference",
    "business_class_pref",
]


def _make_engine():
    if DB_USERNAME and DB_PASSWORD:
        params = urllib.parse.quote_plus(
            f"DRIVER={{ODBC Driver 17 for SQL Server}};"
            f"SERVER={DB_SERVER};DATABASE={DB_NAME};"
            f"UID={DB_USERNAME};PWD={DB_PASSWORD}"
        )
    else:
        params = urllib.parse.quote_plus(
            f"DRIVER={{ODBC Driver 17 for SQL Server}};"
            f"SERVER={DB_SERVER};DATABASE={DB_NAME};"
            f"Trusted_Connection=yes;"
        )
    return create_engine(
        f"mssql+pyodbc:///?odbc_connect={params}",
        fast_executemany=True,
    )


class DataLoader:
    def __init__(self):
        self._engine = _make_engine()
        self._flights: Optional[pd.DataFrame] = None
        self._users:   Optional[pd.DataFrame] = None
        self._history: Optional[pd.DataFrame] = None
        self._user_pref_cache: dict = {}
        self._load_all()

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

        df["price_norm"]    = ((df["price"] - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)).clip(0, 1)
        df["duration_norm"] = ((df["duration_minutes"] - DURATION_MIN) / (DURATION_MAX - DURATION_MIN)).clip(0, 1)
        df["duration"]      = df["duration_minutes"] / 60.0
        df["seat_class"]    = "Economy"

        self._flights = df
        routes = df[["source_city", "destination_city"]].drop_duplicates()
        print(f"  ✓ flights  : {len(df):,} records, {len(routes)} tuyến")
        print(f"  ✓ cities   : {sorted(df['source_city'].unique().tolist())}")

    def _load_users(self):
        query = """
            SELECT
                CAST(u.user_id AS NVARCHAR) AS user_id,
                u.username,
                u.email,
                u.role,
                (
                    SELECT TOP 1 al2.airline_name
                    FROM   dbo.Bookings  b2
                    JOIN   dbo.Tickets   t2  ON b2.booking_id = t2.booking_id
                    JOIN   dbo.Flights   f2  ON t2.flight_id  = f2.flight_id
                    JOIN   dbo.Airlines  al2 ON f2.airline_id = al2.airline_id
                    WHERE  b2.user_id = u.user_id
                      AND  b2.status  = N'Thanh cong'
                      AND  t2.status != N'Da huy'
                    GROUP BY al2.airline_name
                    ORDER BY COUNT(*) DESC
                ) AS preferred_airline
            FROM dbo.Users u
            WHERE u.status = 'active'
        """
        # Dùng query đơn giản hơn để tránh lỗi collation tiếng Việt
        query_simple = """
            SELECT
                CAST(user_id AS NVARCHAR) AS user_id,
                username,
                email,
                role,
                '' AS preferred_airline
            FROM dbo.Users
            WHERE status = 'active'
        """
        df = pd.read_sql(query_simple, self._engine)
        df["preferred_airline"] = df["preferred_airline"].fillna("")
        df["archetype"]         = "real_user"
        for dim in PREFERENCE_DIMS:
            df[dim] = 0.5
        self._users = df
        print(f"  ✓ users    : {len(df):,} records")

        # Cập nhật preferred_airline từ booking history (query riêng tránh collation)
        try:
            pref_query = """
                SELECT b.user_id, al.airline_name, COUNT(*) AS cnt
                FROM dbo.Bookings b
                JOIN dbo.Tickets  t  ON b.booking_id = t.booking_id
                JOIN dbo.Flights  f  ON t.flight_id  = f.flight_id
                JOIN dbo.Airlines al ON f.airline_id = al.airline_id
                WHERE b.status = N'Thành công'
                GROUP BY b.user_id, al.airline_name
            """
            pref_df = pd.read_sql(pref_query, self._engine)
            if len(pref_df) > 0:
                pref_df = pref_df.sort_values("cnt", ascending=False)
                top_airline = pref_df.groupby("user_id")["airline_name"].first().reset_index()
                top_airline.columns = ["user_id_int", "preferred_airline_real"]
                top_airline["user_id_int"] = top_airline["user_id_int"].astype(str)
                pref_map = dict(zip(top_airline["user_id_int"], top_airline["preferred_airline_real"]))
                self._users["preferred_airline"] = self._users["user_id"].map(pref_map).fillna("")
                print(f"  ✓ preferred_airline: cập nhật cho {len(pref_map)} users")
        except Exception as e:
            print(f"  [warn] Không lấy được preferred_airline: {e}")

    def _load_history(self):
        query_pos = """
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
            pos = pd.read_sql(query_pos, self._engine)
        except Exception:
            # Fallback nếu collation lỗi
            pos = pd.read_sql("""
                SELECT CAST(b.user_id AS NVARCHAR) AS user_id,
                       CAST(t.flight_id AS NVARCHAR) AS flight_id, 2 AS relevance
                FROM dbo.Bookings b JOIN dbo.Tickets t ON b.booking_id=t.booking_id
                WHERE b.status=N'Th\u00e0nh c\u00f4ng'
            """, self._engine)

        neg_list = []
        if len(pos) > 0 and self._flights is not None:
            flights_idx = self._flights.set_index("flight_id")
            for _, row in pos.iterrows():
                fid = str(row["flight_id"])
                if fid not in flights_idx.index:
                    continue
                f      = flights_idx.loc[fid]
                origin = f["source_city"]
                dest   = f["destination_city"]
                others = self._flights[
                    (self._flights["source_city"]      == origin) &
                    (self._flights["destination_city"] == dest) &
                    (self._flights["flight_id"]        != fid)
                ]
                if len(others) == 0:
                    continue
                for _, neg in others.sample(min(2, len(others))).iterrows():
                    neg_list.append({
                        "user_id":   row["user_id"],
                        "flight_id": neg["flight_id"],
                        "relevance": 0,
                    })

        neg = pd.DataFrame(neg_list) if neg_list else pd.DataFrame(
            columns=["user_id", "flight_id", "relevance"]
        )
        combined = pd.concat([pos, neg], ignore_index=True)
        combined["session_id"] = combined.index.astype(str)
        self._history = combined
        print(f"  ✓ history  : {len(combined):,} interactions (pos={len(pos)}, neg={len(neg)})")

    # ── Properties ──────────────────────────────────────────────
    @property
    def flights(self) -> pd.DataFrame:
        return self._flights

    @property
    def users(self) -> pd.DataFrame:
        return self._users

    @property
    def history(self) -> pd.DataFrame:
        return self._history

    # ── Candidate generation ─────────────────────────────────────
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
        if max_stops is not None:
            candidates = candidates[candidates["stops_num"] <= max_stops]
        return candidates.reset_index(drop=True)

    # ── User preference ──────────────────────────────────────────
    def get_user_preference_vector(self, user_id: str) -> np.ndarray:
        if user_id in self._user_pref_cache:
            return self._user_pref_cache[user_id].astype(np.float32)
        # Mặc định nghiêng về giá rẻ (price_sensitivity=0.6, các chiều khác=0.5)
        default = [0.6, 0.5, 0.5, 0.5, 0.5, 0.5]
        return np.array(default, dtype=np.float32)

    def get_user_preference_dict(self, user_id: str) -> dict:
        return dict(zip(PREFERENCE_DIMS, self.get_user_preference_vector(user_id)))

    def update_user_preference(self, user_id: str, flight_id: str, action: str, alpha: float = 0.1):
        pass  # Managed by Node.js from SQL

    def get_available_routes(self) -> list:
        return (
            self._flights[["source_city", "destination_city"]]
            .drop_duplicates()
            .apply(tuple, axis=1)
            .tolist()
        )

    def summary(self):
        print("=" * 55)
        print("  DataLoader Summary (Production - SQL Server)")
        print("=" * 55)
        print(f"  Flights : {len(self._flights):,}")
        print(f"  Users   : {len(self._users):,}")
        print(f"  History : {len(self._history):,}")
        for o, d in self.get_available_routes():
            n = len(self.get_candidates(o, d))
            print(f"    {o} -> {d} ({n} chuyen)")
        print("=" * 55)


if __name__ == "__main__":
    dl = DataLoader()
    dl.summary()
    print("\n-- Test get_candidates('Ho Chi Minh City', 'Hanoi') --")
    c = dl.get_candidates("Ho Chi Minh City", "Hanoi")
    print(f"  Ket qua: {len(c)} chuyen")
    if len(c) > 0:
        print(c[["flight_id", "airline", "price", "price_norm", "duration_norm", "dep_slot"]].to_string())
