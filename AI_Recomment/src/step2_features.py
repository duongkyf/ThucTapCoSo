"""
STEP 2 — Feature Engineering (binary: book=1 / ignore=0)
=========================================================
- Bỏ hoàn toàn label click (relevance=1 cũ)
- 17 features: 6 flight + 6 user + 5 interaction
- Interaction: seat_class_match thay price_match (price_norm đã có trong flight features)
"""

import pandas as pd
import numpy as np
import os
import sys
import pickle
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.data_loader_csv import DataLoader, PREFERENCE_DIMS

BASE_DIR          = Path(__file__).parent.parent
FEATURES_OUT      = BASE_DIR / "data/processed/train_features.pkl"
FEATURE_NAMES_OUT = BASE_DIR / "data/processed/feature_names.txt"

FLIGHT_FEATURE_NAMES = [
    "price_norm", "duration_norm", "stops_num_norm",
    "dep_slot_norm", "is_business", "airline_idx_norm",
]
USER_FEATURE_NAMES = [f"u_{d}" for d in PREFERENCE_DIMS]
INTERACTION_FEATURE_NAMES = [
    "seat_class_match",
    "duration_match",
    "stop_match",
    "airline_match",
    "timeslot_match",
]
ALL_FEATURE_NAMES = FLIGHT_FEATURE_NAMES + USER_FEATURE_NAMES + INTERACTION_FEATURE_NAMES


class FeatureEngineer:
    def __init__(self, dl: DataLoader):
        self.dl = dl
        self._airline_map = self._build_airline_map()

    def _build_airline_map(self) -> dict:
        airlines = sorted(self.dl.flights["airline"].unique())
        n = len(airlines)
        return {a: i / max(n - 1, 1) for i, a in enumerate(airlines)}

    def get_flight_features(self, flight: pd.Series) -> np.ndarray:
        return np.array([
            float(flight["price_norm"]),
            float(flight["duration_norm"]),
            float(flight["stops_num"]) / 2.0,
            float(flight["dep_slot"]) / 5.0,
            float(flight["is_business"]),
            self._airline_map.get(flight["airline"], 0.5),
        ], dtype=np.float32)

    def get_user_features(self, user_id: str) -> np.ndarray:
        return self.dl.get_user_preference_vector(user_id).astype(np.float32)

    def get_interaction_features(self, flight: pd.Series, user_vec: np.ndarray,
                                  preferred_airline: str = "") -> np.ndarray:
        price_sens, dur_pref, stop_tol, airline_loy, morning_pref, biz_pref = user_vec

        # seat_class_match
        seat_match = float(biz_pref) if flight["is_business"] == 1 else 1.0 - float(biz_pref)

        # duration_match: ideal = short flight khi dur_pref cao
        ideal_dur      = 1.0 - float(dur_pref)
        duration_match = 1.0 - abs(float(flight["duration_norm"]) - ideal_dur) ** 2

        # stop_match
        stops_norm = float(flight["stops_num"]) / 2.0
        stop_match = 1.0 - abs(stops_norm - float(stop_tol))

        # airline_match
        is_pref      = (preferred_airline != "" and
                        str(flight.get("airline", "")) == preferred_airline)
        airline_match = (0.5 + float(airline_loy) * 0.5 if is_pref
                         else 0.3 + (1.0 - float(airline_loy)) * 0.35)

        # timeslot_match
        dep_slot       = int(flight.get("dep_slot", 2))
        is_morning     = 1.0 if dep_slot in [0, 1] else 0.0
        timeslot_match = (float(morning_pref) * is_morning
                          + (1.0 - float(morning_pref)) * (1.0 - is_morning))

        return np.array([
            np.clip(seat_match,    0.0, 1.0),
            np.clip(duration_match,0.0, 1.0),
            np.clip(stop_match,    0.0, 1.0),
            np.clip(airline_match, 0.0, 1.0),
            np.clip(timeslot_match,0.0, 1.0),
        ], dtype=np.float32)

    def build_feature_vector(self, flight: pd.Series, user_id: str,
                              preferred_airline: str = "") -> np.ndarray:
        u = self.get_user_features(user_id)
        return np.concatenate([
            self.get_flight_features(flight),
            u,
            self.get_interaction_features(flight, u, preferred_airline),
        ])

    def build_training_matrix(self) -> tuple:
        """
        Chỉ dùng relevance=0 (ignore) và relevance=1 (book).
        Label click (relevance=1 cũ) đã bị loại ở step1b.
        """
        print("[Feature Engineering] Build training matrix (binary)...")
        history  = self.dl.history
        flights  = self.dl.flights.set_index("flight_id")
        users    = self.dl.users.set_index("user_id")

        # Lọc chỉ book / ignore (phòng trường hợp data cũ còn click)
        history = history[history["relevance"].isin([0, 1])].copy()

        X_rows, y_rows, groups = [], [], []
        sessions   = history.groupby("session_id", sort=False)
        n_sessions = len(sessions)

        for i, (sid, sdf) in enumerate(sessions):
            if i % 500 == 0:
                print(f"  Session {i:,}/{n_sessions:,}...", end="\r")
            user_id    = sdf["user_id"].iloc[0]
            pref_airline = (users.loc[user_id, "preferred_airline"]
                            if user_id in users.index and "preferred_airline" in users.columns
                            else "")
            u_feat = self.get_user_features(user_id)

            session_rows = 0
            for _, row in sdf.iterrows():
                fid = row["flight_id"]
                if fid not in flights.index:
                    continue
                flight = flights.loc[fid]
                x = np.concatenate([
                    self.get_flight_features(flight),
                    u_feat,
                    self.get_interaction_features(flight, u_feat, pref_airline),
                ])
                X_rows.append(x)
                y_rows.append(int(row["relevance"]))
                session_rows += 1
            if session_rows > 0:
                groups.append(session_rows)

        print(f"\n  → {len(X_rows):,} training pairs từ {len(groups):,} sessions")
        return (np.array(X_rows, dtype=np.float32),
                np.array(y_rows,  dtype=np.int32),
                np.array(groups,  dtype=np.int32))

    def build_candidate_matrix(self, candidates: pd.DataFrame, user_id: str) -> np.ndarray:
        users        = self.dl.users.set_index("user_id")
        pref_airline = (users.loc[user_id, "preferred_airline"]
                        if user_id in users.index and "preferred_airline" in users.columns
                        else "")
        u_feat = self.get_user_features(user_id)
        rows   = []
        for _, flight in candidates.iterrows():
            rows.append(np.concatenate([
                self.get_flight_features(flight),
                u_feat,
                self.get_interaction_features(flight, u_feat, pref_airline),
            ]))
        return np.array(rows, dtype=np.float32)


def main():
    os.makedirs(BASE_DIR / "data/processed", exist_ok=True)
    dl = DataLoader()
    fe = FeatureEngineer(dl)

    print(f"\n── Features ({len(ALL_FEATURE_NAMES)} total) ──")
    print(f"  Flight      ({len(FLIGHT_FEATURE_NAMES)}): {FLIGHT_FEATURE_NAMES}")
    print(f"  User        ({len(USER_FEATURE_NAMES)}): {USER_FEATURE_NAMES}")
    print(f"  Interaction ({len(INTERACTION_FEATURE_NAMES)}): {INTERACTION_FEATURE_NAMES}\n")

    X, y, groups = fe.build_training_matrix()

    with open(FEATURES_OUT, "wb") as f:
        pickle.dump({"X": X, "y": y, "groups": groups}, f)
    with open(FEATURE_NAMES_OUT, "w") as f:
        f.write("\n".join(ALL_FEATURE_NAMES))

    print(f"\n✓ Lưu → {FEATURES_OUT}")
    print(f"  Shape  : X={X.shape}, y={y.shape}, sessions={len(groups)}")
    print(f"  Labels : book(1)={(y==1).sum():,}  ignore(0)={(y==0).sum():,}")
    print(f"  Ratio  : 1:{(y==0).sum()//max((y==1).sum(),1)}")


if __name__ == "__main__":
    main()