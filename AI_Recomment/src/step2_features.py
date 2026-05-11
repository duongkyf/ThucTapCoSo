"""
STEP 2A — Feature Engineering
==============================
Tạo feature matrix kết hợp flight features + user features.
Đây là input trực tiếp cho LightGBM Ranker ở Tuần 3.

Feature vector cuối cùng gồm 3 nhóm:
  [A] Flight features     (6 dims) — đặc trưng của chuyến bay
  [B] User features       (6 dims) — preference vector của user
  [C] Interaction features(5 dims) — mức độ khớp giữa flight và user

Tổng: 17 features / (user, flight) pair

Cách dùng:
    python src/step2_features.py

    Hoặc import:
        from src.step2_features import FeatureEngineer
        fe = FeatureEngineer(data_loader)
        X, y, groups = fe.build_training_matrix()
"""

import pandas as pd
import numpy as np
import os
import sys
import pickle
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.data_loader_csv import DataLoader, PREFERENCE_DIMS

# ── Đường dẫn output ────────────────────────────────────────────────────────
BASE_DIR        = Path(__file__).parent.parent
FEATURES_OUT    = BASE_DIR / "data/processed/train_features.pkl"
FEATURE_NAMES_OUT = BASE_DIR / "data/processed/feature_names.txt"

# ── Tên feature — thứ tự này cố định, không đổi ─────────────────────────────
FLIGHT_FEATURE_NAMES = [
    "price_norm",           # giá đã normalize [0,1]
    "duration_norm",        # thời gian bay đã normalize [0,1]
    "stops_num_norm",       # số điểm dừng normalize (0→0, 1→0.5, 2→1)
    "dep_slot_norm",        # giờ bay normalize (0–5 → 0–1)
    "is_business",          # 0=Economy, 1=Business
    "airline_idx_norm",     # airline encode thành số, normalize
]

USER_FEATURE_NAMES = [f"u_{d}" for d in PREFERENCE_DIMS]
# ['u_price_sensitivity', 'u_duration_preference', ...]

INTERACTION_FEATURE_NAMES = [
    "price_match",          # 1 - |price_norm - (1 - u_price_sensitivity)|
    "duration_match",       # 1 - |duration_norm - (1 - u_duration_pref)|
    "stop_match",           # khớp stop_tolerance vs stops_num
    "airline_match",        # 1 nếu đúng hãng ưa thích, 0 nếu không
    "timeslot_match",       # khớp morning_preference vs dep_slot
]

ALL_FEATURE_NAMES = (
    FLIGHT_FEATURE_NAMES +
    USER_FEATURE_NAMES +
    INTERACTION_FEATURE_NAMES
)  # 17 features tổng


class FeatureEngineer:
    def __init__(self, dl: DataLoader):
        self.dl = dl
        self._airline_map = self._build_airline_map()

    # ── Airline encoding ─────────────────────────────────────────────────
    def _build_airline_map(self) -> dict:
        """Map tên hãng bay → index số (sort alphabetical để stable)."""
        airlines = sorted(self.dl.flights["airline"].unique())
        n = len(airlines)
        return {a: i / max(n - 1, 1) for i, a in enumerate(airlines)}
        # Kết quả: {'AirAsia': 0.0, 'Air_India': 0.2, ..., 'Vistara': 1.0}

    # ── A. Flight features ────────────────────────────────────────────────
    def get_flight_features(self, flight: pd.Series) -> np.ndarray:
        """
        Trích xuất 6 flight features từ 1 row của flights DataFrame.
        Tất cả giá trị trong [0, 1].
        """
        return np.array([
            float(flight["price_norm"]),
            float(flight["duration_norm"]),
            float(flight["stops_num"]) / 2.0,           # 0→0, 1→0.5, 2→1
            float(flight["dep_slot"]) / 5.0,            # 0–5 → 0–1
            float(flight["is_business"]),
            self._airline_map.get(flight["airline"], 0.5),
        ], dtype=np.float32)

    # ── B. User features ──────────────────────────────────────────────────
    def get_user_features(self, user_id: str) -> np.ndarray:
        """
        Trả về preference vector 6 chiều của user.
        Lấy từ DataLoader (Phase 1: ground truth, Phase 2: learned vector).
        """
        return self.dl.get_user_preference_vector(user_id).astype(np.float32)

    # ── C. Interaction features ───────────────────────────────────────────
    def get_interaction_features(
        self,
        flight: pd.Series,
        user_vec: np.ndarray,
        preferred_airline: str = "",
    ) -> np.ndarray:
        """
        Tính 5 interaction features — mức độ khớp giữa flight và user.
        Đây là phần quan trọng nhất: model sẽ học trọng số cho từng interaction.
        """
        (price_sens, dur_pref, stop_tol,
         airline_loy, morning_pref, biz_pref) = user_vec

        # 1. Price match: user nhạy cảm giá → thích chuyến rẻ
        #    Ideal price_norm cho user = 1 - price_sensitivity
        ideal_price = 1.0 - price_sens
        price_match = 1.0 - abs(float(flight["price_norm"]) - ideal_price)

        # 2. Duration match: user thích bay ngắn → ideal duration_norm thấp
        ideal_dur = 1.0 - dur_pref
        duration_match = 1.0 - abs(float(flight["duration_norm"]) - ideal_dur)

        # 3. Stop match: stop_tolerance cao → chấp nhận nhiều điểm dừng
        #    stops_num_norm: 0→0, 1→0.5, 2→1
        stops_norm = float(flight["stops_num"]) / 2.0
        stop_match = 1.0 - abs(stops_norm - stop_tol)

        # 4. Airline match: loyalty × (1 nếu đúng hãng, else 0.1)
        is_preferred = (
            flight["airline"] == preferred_airline
            if preferred_airline else False
        )
        airline_match = airline_loy * (1.0 if is_preferred else 0.1)

        # 5. Time slot match
        dep_slot = int(flight.get("dep_slot", 2))
        is_morning = 1.0 if dep_slot in [0, 1] else 0.0
        # Score cao khi: (morning_pref cao VÀ chuyến sáng) HOẶC
        #                (morning_pref thấp VÀ chuyến không sáng)
        timeslot_match = (
            morning_pref * is_morning +
            (1.0 - morning_pref) * (1.0 - is_morning)
        )

        return np.array([
            np.clip(price_match,    0, 1),
            np.clip(duration_match, 0, 1),
            np.clip(stop_match,     0, 1),
            np.clip(airline_match,  0, 1),
            np.clip(timeslot_match, 0, 1),
        ], dtype=np.float32)

    # ── Full feature vector cho 1 (user, flight) pair ─────────────────────
    def build_feature_vector(
        self,
        flight: pd.Series,
        user_id: str,
        preferred_airline: str = "",
    ) -> np.ndarray:
        """
        Kết hợp 3 nhóm feature thành 1 vector 17 chiều.
        Dùng khi serving (inference thời gian thực).
        """
        f_feat  = self.get_flight_features(flight)
        u_feat  = self.get_user_features(user_id)
        ia_feat = self.get_interaction_features(flight, u_feat, preferred_airline)
        return np.concatenate([f_feat, u_feat, ia_feat])  # shape: (17,)

    # ── Build training matrix từ history ──────────────────────────────────
    def build_training_matrix(self) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Tạo toàn bộ training data cho LightGBM Ranker.

        LightGBM Ranker cần:
            X      : (N, 17) — feature matrix
            y      : (N,)    — relevance label (0/1/2)
            groups : (Q,)    — số item trong mỗi query (session)
                               VD: [8, 12, 6, ...] — session 1 có 8 items, v.v.

        Returns:
            X, y, groups
        """
        print("[Feature Engineering] Đang build training matrix...")

        history  = self.dl.history
        flights  = self.dl.flights.set_index("flight_id")
        users    = self.dl.users.set_index("user_id")

        X_rows   = []
        y_rows   = []
        groups   = []

        sessions = history.groupby("session_id", sort=False)
        n_sessions = len(sessions)

        for i, (session_id, session_df) in enumerate(sessions):
            if i % 500 == 0:
                print(f"  Session {i:,}/{n_sessions:,}...", end="\r")

            user_id = session_df["user_id"].iloc[0]

            # Lấy preferred_airline của user (nếu có)
            pref_airline = ""
            if user_id in users.index and "preferred_airline" in users.columns:
                pref_airline = users.loc[user_id, "preferred_airline"]

            # User feature vector (dùng chung cho cả session)
            u_feat = self.get_user_features(user_id)

            session_rows = 0
            for _, row in session_df.iterrows():
                fid = row["flight_id"]
                if fid not in flights.index:
                    continue

                flight  = flights.loc[fid]
                f_feat  = self.get_flight_features(flight)
                ia_feat = self.get_interaction_features(flight, u_feat, pref_airline)
                x       = np.concatenate([f_feat, u_feat, ia_feat])

                X_rows.append(x)
                y_rows.append(int(row["relevance"]))
                session_rows += 1

            if session_rows > 0:
                groups.append(session_rows)

        print(f"\n  → {len(X_rows):,} training pairs từ {len(groups):,} sessions")

        X      = np.array(X_rows,  dtype=np.float32)
        y      = np.array(y_rows,  dtype=np.int32)
        groups = np.array(groups,  dtype=np.int32)

        return X, y, groups

    # ── Serving: rank candidates cho 1 query ──────────────────────────────
    def build_candidate_matrix(
        self,
        candidates: pd.DataFrame,
        user_id: str,
    ) -> np.ndarray:
        """
        Tạo feature matrix cho tập candidates khi serving.
        Dùng trong FastAPI khi có query thực tế.

        Args:
            candidates: output của DataLoader.get_candidates()
            user_id:    user đang query

        Returns:
            X: (len(candidates), 17) — sẵn sàng cho model.predict()
        """
        users = self.dl.users.set_index("user_id")
        pref_airline = ""
        if user_id in users.index and "preferred_airline" in users.columns:
            pref_airline = users.loc[user_id, "preferred_airline"]

        u_feat = self.get_user_features(user_id)

        rows = []
        for _, flight in candidates.iterrows():
            f_feat  = self.get_flight_features(flight)
            ia_feat = self.get_interaction_features(flight, u_feat, pref_airline)
            rows.append(np.concatenate([f_feat, u_feat, ia_feat]))

        return np.array(rows, dtype=np.float32)


# ── Main: build + lưu training data ──────────────────────────────────────────
def main():
    os.makedirs(BASE_DIR / "data/processed", exist_ok=True)

    dl = DataLoader()
    fe = FeatureEngineer(dl)

    # In thông tin feature
    print(f"\n── Feature breakdown ({'─'*30})")
    print(f"  [A] Flight features     ({len(FLIGHT_FEATURE_NAMES)}): {FLIGHT_FEATURE_NAMES}")
    print(f"  [B] User features       ({len(USER_FEATURE_NAMES)}): {USER_FEATURE_NAMES}")
    print(f"  [C] Interaction features({len(INTERACTION_FEATURE_NAMES)}): {INTERACTION_FEATURE_NAMES}")
    print(f"  Total: {len(ALL_FEATURE_NAMES)} features\n")

    # Build training matrix
    X, y, groups = fe.build_training_matrix()

    # Lưu
    with open(FEATURES_OUT, "wb") as f:
        pickle.dump({"X": X, "y": y, "groups": groups}, f)

    with open(FEATURE_NAMES_OUT, "w") as f:
        f.write("\n".join(ALL_FEATURE_NAMES))

    # Thống kê
    print(f"\n✓ Đã lưu training data → {FEATURES_OUT}")
    print(f"\n── Thống kê training data ──────────────────────")
    print(f"  Shape X     : {X.shape}")
    print(f"  Shape y     : {y.shape}")
    print(f"  Num sessions: {len(groups)}")
    print(f"  Label dist  : 0={( y==0).sum():,}  1={(y==1).sum():,}  2={(y==2).sum():,}")
    print(f"\n── Sample feature vector (item đầu tiên) ───────")
    for name, val in zip(ALL_FEATURE_NAMES, X[0]):
        bar = "█" * int(val * 15) + "░" * (15 - int(val * 15))
        print(f"  {name:<28} {bar} {val:.3f}")

    # Quick sanity check: interaction features có ý nghĩa không?
    print(f"\n── Sanity check: avg interaction score theo label ─")
    df_check = pd.DataFrame(X[:, 12:17], columns=INTERACTION_FEATURE_NAMES)
    df_check["label"] = y
    print(df_check.groupby("label").mean().round(3).to_string())
    print("\n  (Kỳ vọng: label=2 có interaction score cao hơn label=0)")


if __name__ == "__main__":
    main()