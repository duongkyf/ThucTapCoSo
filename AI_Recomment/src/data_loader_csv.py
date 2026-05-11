"""
data_loader_csv.py  —  DataLoader (Training / Offline mode)
=============================================================
Phiên bản đọc dữ liệu từ file CSV trong data/processed/
thay vì kết nối SQL Server.

Dùng cho:
  - Tái hiện quá trình training LightGBM LambdaRank
  - Chạy evaluate_baselines.py
  - Chạy step2_features.py, step3_ranking.py

Interface hoàn toàn tương thích với data_loader.py (production).
Các file cần có trong data/processed/:
  - flights.csv   — dữ liệu chuyến bay đã làm sạch
  - users.csv     — danh sách user với preference vector
  - history.csv   — lịch sử tương tác (user_id, flight_id, relevance)

Cách dùng:
  # Thay dòng import trong step2_features.py / step3_ranking.py:
  #   from src.data_loader     import DataLoader  (production)
  #   from src.data_loader_csv import DataLoader  (training)

  from src.data_loader_csv import DataLoader, PREFERENCE_DIMS
  dl = DataLoader()
  dl.summary()
"""

import pandas as pd
import numpy as np
from pathlib import Path
from typing import Optional

# ── Đường dẫn ────────────────────────────────────────────────────────────────
BASE_DIR      = Path(__file__).parent.parent
DATA_DIR      = BASE_DIR / "data" / "processed"

FLIGHTS_CSV   = DATA_DIR / "flights.csv"
USERS_CSV     = DATA_DIR / "users.csv"
HISTORY_CSV   = DATA_DIR / "history.csv"

# ── Mapping IATA → tên thành phố (giữ nguyên với data_loader.py) ─────────────
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

# ── Global normalization range (giữ nguyên với data_loader.py) ───────────────
PRICE_MIN    = 500_000
PRICE_MAX    = 9_000_000
DURATION_MIN = 30
DURATION_MAX = 600

# ── Tên các chiều của preference vector ──────────────────────────────────────
PREFERENCE_DIMS = [
    "price_sensitivity",
    "duration_preference",
    "stop_tolerance",
    "airline_loyalty",
    "morning_preference",
    "business_class_pref",
]


class DataLoader:
    """
    DataLoader đọc dữ liệu từ CSV — dùng cho training offline.

    Interface giống hệt data_loader.py (production) để các file
    step2_features.py, step3_ranking.py, evaluate_baselines.py
    có thể import không cần sửa đổi.
    """

    def __init__(self):
        self._flights: Optional[pd.DataFrame] = None
        self._users:   Optional[pd.DataFrame] = None
        self._history: Optional[pd.DataFrame] = None
        self._user_pref_cache: dict = {}
        self._load_all()

    # ══════════════════════════════════════════════════════════════════════════
    # PRIVATE — Load từng bảng từ CSV
    # ══════════════════════════════════════════════════════════════════════════

    def _load_all(self):
        """Điều phối load toàn bộ dữ liệu từ CSV."""
        print("[DataLoader CSV] Đang load data từ file CSV...")
        self._load_flights()
        self._load_users()
        self._load_history()
        print("[DataLoader CSV] Load xong.\n")

    def _load_flights(self):
        """
        Input : data/processed/flights.csv
                Các cột bắt buộc: flight_id, airline, source_city,
                destination_city, price, duration (phút), stops_num,
                is_business, dep_slot, departure_time, arrival_time

        Xử lý :
          - Chuẩn hóa price_norm, duration_norm về [0, 1]
            bằng global Min-Max Scaling với PRICE_MIN/MAX, DURATION_MIN/MAX
          - Đổi tên cột duration → duration (giờ), giữ duration_minutes riêng
          - Thêm cột seat_class mặc định = "Economy"
          - Nếu CSV đã có price_norm / duration_norm thì tính lại cho nhất quán

        Output: self._flights — DataFrame sẵn sàng cho FeatureEngineer
        """
        if not FLIGHTS_CSV.exists():
            raise FileNotFoundError(f"Không tìm thấy {FLIGHTS_CSV}")

        df = pd.read_csv(FLIGHTS_CSV, low_memory=False)
        df["flight_id"] = df["flight_id"].astype(str)

        # ── Ánh xạ IATA nếu CSV dùng mã thay vì tên thành phố ────────────────
        if "source_iata" in df.columns and "source_city" not in df.columns:
            df["source_city"]      = df["source_iata"].map(IATA_TO_CITY)
            df["destination_city"] = df["dest_iata"].map(IATA_TO_CITY)
            before = len(df)
            df = df.dropna(subset=["source_city", "destination_city"]).reset_index(drop=True)
            dropped = before - len(df)
            if dropped:
                print(f"  [warn] Bỏ {dropped} chuyến do thiếu city mapping")

        # ── Tính lại duration_minutes nếu CSV chỉ có duration (giờ) ──────────
        if "duration_minutes" not in df.columns:
            if "duration" in df.columns:
                # Nếu duration đơn vị là giờ (float)
                df["duration_minutes"] = (df["duration"] * 60).round().astype(int)
            else:
                raise ValueError("CSV thiếu cột duration hoặc duration_minutes")

        # ── Normalize ──────────────────────────────────────────────────────────
        df["price_norm"] = (
            (df["price"] - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)
        ).clip(0, 1)

        df["duration_norm"] = (
            (df["duration_minutes"] - DURATION_MIN) / (DURATION_MAX - DURATION_MIN)
        ).clip(0, 1)

        # duration tính bằng giờ (float) — dùng trong _flight_to_dict của api.py
        df["duration"] = df["duration_minutes"] / 60.0

        # ── Đảm bảo các cột bắt buộc tồn tại ────────────────────────────────
        if "stops_num" not in df.columns:
            df["stops_num"] = 0
        if "is_business" not in df.columns:
            df["is_business"] = 0
        if "dep_slot" not in df.columns:
            # Tính dep_slot từ departure_time nếu có
            if "departure_time" in df.columns:
                dep_hour = pd.to_datetime(df["departure_time"]).dt.hour
                df["dep_slot"] = pd.cut(
                    dep_hour,
                    bins=[-1, 5, 11, 17, 22, 24],
                    labels=[0, 1, 2, 3, 4]
                ).astype(int)
            else:
                df["dep_slot"] = 2   # mặc định: buổi chiều

        if "seat_class" not in df.columns:
            df["seat_class"] = "Economy"

        self._flights = df
        routes = df[["source_city", "destination_city"]].drop_duplicates()
        print(f"  ✓ flights  : {len(df):,} records, {len(routes)} tuyến")
        print(f"  ✓ cities   : {sorted(df['source_city'].unique().tolist())}")

    def _load_users(self):
        """
        Input : data/processed/users.csv
                Các cột bắt buộc: user_id
                Cột tùy chọn:     price_sensitivity, duration_preference,
                                  stop_tolerance, airline_loyalty,
                                  morning_preference, business_class_pref,
                                  preferred_airline, archetype

        Xử lý :
          - Nếu CSV có sẵn 6 chiều preference → đọc trực tiếp
          - Nếu thiếu chiều nào → điền mặc định 0.5
          - Cache preference vector vào self._user_pref_cache để get_user_preference_vector()
            trả về nhanh mà không cần query lại DataFrame

        Output: self._users — DataFrame, self._user_pref_cache — dict[user_id → np.ndarray]
        """
        if not USERS_CSV.exists():
            raise FileNotFoundError(f"Không tìm thấy {USERS_CSV}")

        df = pd.read_csv(USERS_CSV)
        df["user_id"] = df["user_id"].astype(str)

        # Điền các chiều preference còn thiếu
        for dim in PREFERENCE_DIMS:
            if dim not in df.columns:
                df[dim] = 0.5
                print(f"  [warn] Thiếu cột '{dim}', dùng mặc định 0.5")

        if "preferred_airline" not in df.columns:
            df["preferred_airline"] = ""
        if "archetype" not in df.columns:
            df["archetype"] = "real_user"

        df["preferred_airline"] = df["preferred_airline"].fillna("")

        # Build cache: user_id → np.ndarray shape (6,)
        for _, row in df.iterrows():
            uid = row["user_id"]
            vec = np.array([float(row[dim]) for dim in PREFERENCE_DIMS], dtype=np.float32)
            self._user_pref_cache[uid] = vec

        self._users = df
        print(f"  ✓ users    : {len(df):,} records")
        print(f"  ✓ pref cache: {len(self._user_pref_cache)} entries")

    def _load_history(self):
        """
        Input : data/processed/history.csv
                Các cột bắt buộc: user_id, flight_id, relevance
                  relevance = 2 (book), 1 (click), 0 (impression/ignore)
                Cột tùy chọn:     session_id

        Xử lý :
          - Nếu CSV đã có session_id → dùng luôn
          - Nếu chưa có → tự sinh session_id = index (mỗi dòng là 1 session)
            Note: điều này sẽ làm mỗi (user, flight) pair = 1 session riêng,
            không lý tưởng nhưng vẫn chạy được với LightGBM group=[1,1,1,...]

        Output: self._history — DataFrame với cột session_id
        """
        if not HISTORY_CSV.exists():
            raise FileNotFoundError(f"Không tìm thấy {HISTORY_CSV}")

        df = pd.read_csv(HISTORY_CSV)
        df["user_id"]   = df["user_id"].astype(str)
        df["flight_id"] = df["flight_id"].astype(str)
        df["relevance"] = df["relevance"].astype(int)

        if "session_id" not in df.columns:
            # Sinh session_id: nhóm theo (user_id, ngày tìm kiếm nếu có)
            df["session_id"] = df.index.astype(str)
            print("  [warn] Không có session_id trong CSV, dùng index làm session_id")
        else:
            df["session_id"] = df["session_id"].astype(str)

        self._history = df
        pos = (df["relevance"] == 2).sum()
        neg = (df["relevance"] == 0).sum()
        print(f"  ✓ history  : {len(df):,} interactions (pos={pos}, neg={neg})")

    # ══════════════════════════════════════════════════════════════════════════
    # PROPERTIES — Truy cập dữ liệu (giữ nguyên interface với data_loader.py)
    # ══════════════════════════════════════════════════════════════════════════

    @property
    def flights(self) -> pd.DataFrame:
        """Trả về DataFrame toàn bộ chuyến bay."""
        return self._flights

    @property
    def users(self) -> pd.DataFrame:
        """Trả về DataFrame toàn bộ user."""
        return self._users

    @property
    def history(self) -> pd.DataFrame:
        """Trả về DataFrame lịch sử tương tác."""
        return self._history

    # ══════════════════════════════════════════════════════════════════════════
    # PUBLIC — Candidate generation
    # ══════════════════════════════════════════════════════════════════════════

    def get_candidates(
        self,
        origin:      str,
        destination: str,
        seat_class:  Optional[str] = None,
        max_stops:   Optional[int] = None,
    ) -> pd.DataFrame:
        """
        Lọc danh sách chuyến bay theo tuyến đường.

        Input:
          origin      : tên thành phố đi  (VD: "Ho Chi Minh City")
          destination : tên thành phố đến (VD: "Hanoi")
          seat_class  : lọc theo hạng ghế (tùy chọn)
          max_stops   : số điểm dừng tối đa (tùy chọn)

        Output:
          DataFrame các chuyến bay phù hợp, reset index.
        """
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

    # ══════════════════════════════════════════════════════════════════════════
    # PUBLIC — User preference
    # ══════════════════════════════════════════════════════════════════════════

    def get_user_preference_vector(self, user_id: str) -> np.ndarray:
        """
        Trả về preference vector 6 chiều của user dưới dạng np.ndarray.

        Input : user_id (str)
        Output: np.ndarray shape (6,), dtype float32, mỗi chiều ∈ [0, 1]

        Nếu user_id không tồn tại → trả về default vector
        [0.6, 0.5, 0.5, 0.5, 0.5, 0.5] (nghiêng về giá rẻ).
        """
        if user_id in self._user_pref_cache:
            return self._user_pref_cache[user_id].astype(np.float32)
        # Default: user mới chưa có history
        default = np.array([0.6, 0.5, 0.5, 0.5, 0.5, 0.5], dtype=np.float32)
        print(f"  [warn] User '{user_id}' không có trong CSV, dùng default vector")
        return default

    def get_user_preference_dict(self, user_id: str) -> dict:
        """
        Trả về preference vector dưới dạng dict {dim_name: value}.

        Input : user_id (str)
        Output: dict với 6 keys theo thứ tự PREFERENCE_DIMS
        """
        return dict(zip(PREFERENCE_DIMS, self.get_user_preference_vector(user_id)))

    def get_user_history(self, user_id: str) -> pd.DataFrame:
        """
        Lấy toàn bộ lịch sử tương tác của 1 user.

        Input : user_id (str)
        Output: DataFrame các dòng history của user đó
        """
        return self._history[self._history["user_id"] == user_id].copy()

    def update_user_preference(
        self,
        user_id:   str,
        flight_id: str,
        action:    str,
        alpha:     float = 0.1,
    ):
        """
        Stub — trong training mode, preference được đọc từ CSV tĩnh,
        không cập nhật online. Giữ nguyên để tương thích interface.
        """
        pass

    def get_available_routes(self) -> list:
        """
        Trả về danh sách các tuyến bay có trong dữ liệu.

        Output: list of (origin, destination) tuples
        """
        return (
            self._flights[["source_city", "destination_city"]]
            .drop_duplicates()
            .apply(tuple, axis=1)
            .tolist()
        )

    # ══════════════════════════════════════════════════════════════════════════
    # DEBUG
    # ══════════════════════════════════════════════════════════════════════════

    def summary(self):
        """In tóm tắt dữ liệu đã load."""
        print("=" * 55)
        print("  DataLoader Summary (Training - CSV mode)")
        print("=" * 55)
        print(f"  Flights : {len(self._flights):,}")
        print(f"  Users   : {len(self._users):,}")
        print(f"  History : {len(self._history):,}")
        print(f"\n  Tuyến bay:")
        for o, d in self.get_available_routes():
            n = len(self.get_candidates(o, d))
            print(f"    {o} -> {d}  ({n} chuyến)")
        print(f"\n  Label distribution (history):")
        for label, name in [(2, "book"), (1, "click"), (0, "ignore")]:
            cnt = (self._history["relevance"] == label).sum()
            print(f"    label={label} ({name}): {cnt:,}")
        print("=" * 55)


# ── Chạy trực tiếp để kiểm tra ───────────────────────────────────────────────
if __name__ == "__main__":
    dl = DataLoader()
    dl.summary()

    # Test get_candidates
    routes = dl.get_available_routes()
    if routes:
        origin, dest = routes[0]
        candidates = dl.get_candidates(origin, dest)
        print(f"\n-- Test get_candidates('{origin}', '{dest}') --")
        print(f"  Kết quả: {len(candidates)} chuyến")
        if len(candidates) > 0:
            print(candidates[[
                "flight_id", "airline", "price",
                "price_norm", "duration_norm", "dep_slot"
            ]].head(5).to_string())

    # Test get_user_preference_vector
    sample_users = dl.users["user_id"].head(3).tolist()
    print(f"\n-- Test preference vectors --")
    for uid in sample_users:
        vec = dl.get_user_preference_vector(uid)
        print(f"  {uid}: {vec}")