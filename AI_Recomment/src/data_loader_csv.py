"""
data_loader_csv.py — DataLoader (Training / Offline mode)
==========================================================
Cập nhật: hỗ trợ binary history (book=1 / ignore=0).
Interface tương thích hoàn toàn với phiên bản cũ.
"""

import pandas as pd
import numpy as np
from pathlib import Path
from typing import Optional

BASE_DIR    = Path(__file__).parent.parent
DATA_DIR    = BASE_DIR / "data" / "processed"
FLIGHTS_CSV = DATA_DIR / "flights.csv"
USERS_CSV   = DATA_DIR / "users.csv"
HISTORY_CSV = DATA_DIR / "history.csv"

IATA_TO_CITY = {
    "SGN": "Ho Chi Minh City", "HAN": "Hanoi", "DAD": "Da Nang",
    "PQC": "Phu Quoc", "HPH": "Hai Phong", "BKK": "Bangkok",
    "SIN": "Singapore", "ICN": "Seoul", "NRT": "Tokyo", "KUL": "Kuala Lumpur",
}

PRICE_MIN    = 1_000
PRICE_MAX    = 200_000
DURATION_MIN = 30
DURATION_MAX = 600

PREFERENCE_DIMS = [
    "price_sensitivity", "duration_preference", "stop_tolerance",
    "airline_loyalty", "morning_preference", "business_class_pref",
]


class DataLoader:
    def __init__(self):
        self._flights: Optional[pd.DataFrame] = None
        self._users:   Optional[pd.DataFrame] = None
        self._history: Optional[pd.DataFrame] = None
        self._user_pref_cache: dict = {}
        self._load_all()

    # ── Load ──────────────────────────────────────────────────────────────────

    def _load_all(self):
        print("[DataLoader CSV] Đang load data từ file CSV...")
        self._load_flights()
        self._load_users()
        self._load_history()
        print("[DataLoader CSV] Load xong.\n")

    def _load_flights(self):
        if not FLIGHTS_CSV.exists():
            raise FileNotFoundError(f"Không tìm thấy {FLIGHTS_CSV}")
        df = pd.read_csv(FLIGHTS_CSV, low_memory=False)
        df["flight_id"] = df["flight_id"].astype(str)

        if "source_iata" in df.columns and "source_city" not in df.columns:
            df["source_city"]      = df["source_iata"].map(IATA_TO_CITY)
            df["destination_city"] = df["dest_iata"].map(IATA_TO_CITY)
            df = df.dropna(subset=["source_city","destination_city"]).reset_index(drop=True)

        if "duration_minutes" not in df.columns:
            if "duration" in df.columns:
                df["duration_minutes"] = (df["duration"] * 60).round().astype(int)
            else:
                raise ValueError("CSV thiếu cột duration hoặc duration_minutes")

        df["price_norm"]    = ((df["price"] - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)).clip(0, 1)
        df["duration_norm"] = ((df["duration_minutes"] - DURATION_MIN) / (DURATION_MAX - DURATION_MIN)).clip(0, 1)
        df["duration"]      = df["duration_minutes"] / 60.0

        for col, default in [("stops_num",0), ("is_business",0), ("dep_slot",2)]:
            if col not in df.columns:
                df[col] = default
        if "seat_class" not in df.columns:
            df["seat_class"] = "Economy"

        self._flights = df
        routes = df[["source_city","destination_city"]].drop_duplicates()
        print(f"  ✓ flights  : {len(df):,} records, {len(routes)} tuyến")
        print(f"  ✓ cities   : {sorted(df['source_city'].unique().tolist())}")

    def _load_users(self):
        if not USERS_CSV.exists():
            raise FileNotFoundError(f"Không tìm thấy {USERS_CSV}")
        df = pd.read_csv(USERS_CSV)
        df["user_id"] = df["user_id"].astype(str)
        for dim in PREFERENCE_DIMS:
            if dim not in df.columns:
                df[dim] = 0.5
        if "preferred_airline" not in df.columns:
            df["preferred_airline"] = ""
        if "archetype" not in df.columns:
            df["archetype"] = "real_user"
        df["preferred_airline"] = df["preferred_airline"].fillna("")

        for _, row in df.iterrows():
            self._user_pref_cache[row["user_id"]] = np.array(
                [float(row[d]) for d in PREFERENCE_DIMS], dtype=np.float32
            )
        self._users = df
        print(f"  ✓ users    : {len(df):,} records")
        print(f"  ✓ pref cache: {len(self._user_pref_cache)} entries")

    def _load_history(self):
        if not HISTORY_CSV.exists():
            raise FileNotFoundError(f"Không tìm thấy {HISTORY_CSV}")
        df = pd.read_csv(HISTORY_CSV)
        df["user_id"]   = df["user_id"].astype(str)
        df["flight_id"] = df["flight_id"].astype(str)
        df["relevance"] = df["relevance"].astype(int)

        if "session_id" not in df.columns:
            df["session_id"] = df.index.astype(str)
        else:
            df["session_id"] = df["session_id"].astype(str)

        self._history = df

        # Thống kê labels
        n_book   = (df["relevance"] == 1).sum()  # binary: book=1
        n_ignore = (df["relevance"] == 0).sum()
        n_click  = (df["relevance"] == 2).sum()  # cũ: book=2 (tương thích ngược)
        if n_click > 0:
            # Data cũ (3-class): book=2, click=1, ignore=0
            print(f"  ✓ history  : {len(df):,} interactions "
                  f"(book={n_click}, click={n_book}, ignore={n_ignore})  [3-class]")
        else:
            print(f"  ✓ history  : {len(df):,} interactions "
                  f"(book={n_book}, ignore={n_ignore})  [binary]")

    # ── Properties ────────────────────────────────────────────────────────────

    @property
    def flights(self) -> pd.DataFrame: return self._flights

    @property
    def users(self) -> pd.DataFrame: return self._users

    @property
    def history(self) -> pd.DataFrame: return self._history

    # ── Candidates ────────────────────────────────────────────────────────────

    def get_candidates(self, origin: str, destination: str,
                       seat_class: Optional[str] = None,
                       max_stops:  Optional[int] = None) -> pd.DataFrame:
        mask = (
            (self._flights["source_city"].str.lower()      == origin.lower()) &
            (self._flights["destination_city"].str.lower() == destination.lower())
        )
        df = self._flights[mask].copy()
        if seat_class is not None:
            df = df[df["seat_class"].str.lower() == seat_class.lower()]
        if max_stops is not None:
            df = df[df["stops_num"] <= max_stops]
        return df.reset_index(drop=True)

    # ── User preference ───────────────────────────────────────────────────────

    def get_user_preference_vector(self, user_id: str) -> np.ndarray:
        if user_id in self._user_pref_cache:
            return self._user_pref_cache[user_id].astype(np.float32)
        return np.array([0.6, 0.5, 0.5, 0.5, 0.5, 0.5], dtype=np.float32)

    def get_user_preference_dict(self, user_id: str) -> dict:
        return dict(zip(PREFERENCE_DIMS, self.get_user_preference_vector(user_id)))

    def get_user_history(self, user_id: str) -> pd.DataFrame:
        return self._history[self._history["user_id"] == user_id].copy()

    def get_available_routes(self) -> list:
        return (self._flights[["source_city","destination_city"]]
                .drop_duplicates().apply(tuple, axis=1).tolist())

    def update_user_preference(self, user_id, flight_id, action, alpha=0.1):
        pass  # stub — training mode

    # ── Debug ─────────────────────────────────────────────────────────────────

    def summary(self):
        print("="*55)
        print("  DataLoader Summary (Training - CSV mode)")
        print("="*55)
        print(f"  Flights : {len(self._flights):,}")
        print(f"  Users   : {len(self._users):,}")
        print(f"  History : {len(self._history):,}")
        y = self._history["relevance"]
        # Auto-detect 2-class vs 3-class
        if y.max() <= 1:
            print(f"  Labels  : book(1)={(y==1).sum():,}  ignore(0)={(y==0).sum():,}  [binary]")
        else:
            print(f"  Labels  : book(2)={(y==2).sum():,}  click(1)={(y==1).sum():,}  ignore(0)={(y==0).sum():,}  [3-class]")
        print("="*55)


if __name__ == "__main__":
    dl = DataLoader()
    dl.summary()