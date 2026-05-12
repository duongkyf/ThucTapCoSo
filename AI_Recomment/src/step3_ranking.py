"""
STEP 3 — Ranking Model (LightGBM LambdaRank, binary: book=1 / ignore=0)
========================================================================
- label_gain=[0,1]  (2 nhãn)
- Split train/val theo USER (không leakage)
- lr=0.05, leaves=16, rounds=500 — phù hợp với tập nhỏ hơn sau khi bỏ click
"""

import numpy as np
import pandas as pd
import pickle
import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.data_loader_csv import DataLoader
from src.step2_features import FeatureEngineer, ALL_FEATURE_NAMES

try:
    import lightgbm as lgb
except ImportError:
    print("[!] pip install lightgbm"); sys.exit(1)

BASE_DIR      = Path(__file__).parent.parent
MODEL_OUT     = BASE_DIR / "data/processed/ranker_model.pkl"
FEATURES_PATH = BASE_DIR / "data/processed/train_features.pkl"

LGBM_PARAMS = {
    "objective":                "lambdarank",
    "metric":                   "ndcg",
    "ndcg_eval_at":             [5, 10],
    "learning_rate":            0.05,
    "num_leaves":               16,
    "label_gain":               [0, 1],          # ← binary
    "lambdarank_truncation_level": 10,
    "min_child_samples":        10,
    "feature_fraction":         0.7,
    "bagging_fraction":         0.8,
    "bagging_freq":             5,
    "lambda_l1":                0.05,
    "lambda_l2":                0.05,
    "verbose":                  -1,
    "n_jobs":                   -1,
}

N_ESTIMATORS    = 500
EARLY_STOPPING  = 50
TEST_SIZE       = 0.2
RANDOM_STATE    = 42
TOP_K           = 10


class FlightRanker:
    def __init__(self, dl: DataLoader = None, fe: FeatureEngineer = None):
        self.dl           = dl
        self.fe           = fe
        self.model        = None
        self.feature_names = ALL_FEATURE_NAMES

    def train(self, X: np.ndarray, y: np.ndarray, groups: np.ndarray,
              users_df: pd.DataFrame = None):
        print("[Ranker] Split train/val by USER...")
        if users_df is None:
            users_df = self.dl.users

        from sklearn.model_selection import train_test_split
        all_users   = users_df["user_id"].unique()
        train_users, val_users = train_test_split(
            all_users, test_size=TEST_SIZE, random_state=RANDOM_STATE
        )
        print(f"  Train users: {len(train_users)} | Val users: {len(val_users)}")

        history     = self.dl.history
        # Lọc chỉ binary labels
        history     = history[history["relevance"].isin([0, 1])]
        train_idx   = history[history["user_id"].isin(train_users)].index.values
        val_idx     = history[history["user_id"].isin(val_users)].index.values

        # Reindex vào X/y (X đã build từ history đã lọc)
        # Cần align lại: lấy positional index trong filtered history
        hist_filtered = self.dl.history[self.dl.history["relevance"].isin([0, 1])].reset_index(drop=True)
        ti = hist_filtered[hist_filtered["user_id"].isin(train_users)].index.values
        vi = hist_filtered[hist_filtered["user_id"].isin(val_users)].index.values

        X_train, y_train = X[ti], y[ti]
        X_val,   y_val   = X[vi], y[vi]

        sess_ids       = hist_filtered["session_id"].values
        _, tg = np.unique(sess_ids[ti], return_counts=True)
        _, vg = np.unique(sess_ids[vi], return_counts=True)

        print(f"  Train: {len(X_train):,} items, {len(tg):,} sessions")
        print(f"  Val  : {len(X_val):,} items, {len(vg):,} sessions")
        print(f"  Train — book:{(y_train==1).sum():,}  ignore:{(y_train==0).sum():,}")
        print(f"  Val   — book:{(y_val==1).sum():,}    ignore:{(y_val==0).sum():,}")

        train_ds = lgb.Dataset(X_train, label=y_train, group=tg,
                               feature_name=self.feature_names, free_raw_data=False)
        val_ds   = lgb.Dataset(X_val,   label=y_val,   group=vg,
                               feature_name=self.feature_names, free_raw_data=False,
                               reference=train_ds)

        print(f"[Ranker] Training (rounds={N_ESTIMATORS}, lr={LGBM_PARAMS['learning_rate']}, "
              f"leaves={LGBM_PARAMS['num_leaves']})...")
        callbacks = [
            lgb.early_stopping(EARLY_STOPPING, verbose=False),
            lgb.log_evaluation(period=50),
        ]
        self.model = lgb.train(
            params        = LGBM_PARAMS,
            train_set     = train_ds,
            num_boost_round = N_ESTIMATORS,
            valid_sets    = [val_ds],
            callbacks     = callbacks,
        )
        print(f"\n✓ Best iteration: {self.model.best_iteration}")
        self._evaluate(X_val, y_val, vg)

    def _evaluate(self, X, y, groups):
        scores      = self.model.predict(X)
        n5, n10     = [], []
        ptr         = 0
        for g in groups:
            s = scores[ptr:ptr+g]; l = y[ptr:ptr+g]; ptr += g
            n5.append(self._ndcg(l, s, 5))
            n10.append(self._ndcg(l, s, 10))
        print(f"\n── Val Evaluation ──────────────────────────")
        print(f"  NDCG@5  : {np.mean(n5):.4f}")
        print(f"  NDCG@10 : {np.mean(n10):.4f}")

    @staticmethod
    def _ndcg(labels, scores, k):
        order  = np.argsort(scores)[::-1][:k]
        gains  = 2 ** labels[order] - 1
        disc   = np.log2(np.arange(2, len(gains) + 2))
        dcg    = np.sum(gains / disc)
        iorder = np.argsort(labels)[::-1][:k]
        igains = 2 ** labels[iorder] - 1
        idcg   = np.sum(igains / disc[:len(igains)])
        return dcg / idcg if idcg > 0 else 0.0

    def print_feature_importance(self):
        imp   = self.model.feature_importance(importance_type="gain")
        total = imp.sum()
        pairs = sorted(zip(self.feature_names, imp), key=lambda x: x[1], reverse=True)
        print("\n── Feature Importance (gain) ───────────────")
        for name, v in pairs:
            pct = v / total * 100
            bar = "█" * int(pct / 2) + "░" * (25 - int(pct / 2))
            print(f"  {name:<28} {bar} {pct:5.1f}%")

    def rank(self, candidates: pd.DataFrame, user_id: str,
             top_k: int = TOP_K) -> pd.DataFrame:
        if len(candidates) == 0:
            return candidates
        X      = self.fe.build_candidate_matrix(candidates, user_id)
        scores = self.model.predict(X)
        result = candidates.copy()
        result["final_score"] = scores
        mn, mx = result["final_score"].min(), result["final_score"].max()
        result["final_score"] = ((result["final_score"] - mn) / (mx - mn)
                                 if mx > mn else 1.0)
        return (result.sort_values("final_score", ascending=False)
                      .head(top_k)
                      .reset_index(drop=True))

    def save(self, path=MODEL_OUT):
        with open(path, "wb") as f:
            pickle.dump({"model": self.model, "feature_names": self.feature_names}, f)
        print(f"\n✓ Lưu model → {path}")

    @classmethod
    def load(cls, dl=None, fe=None, path=MODEL_OUT) -> "FlightRanker":
        with open(path, "rb") as f:
            p = pickle.load(f)
        r = cls(dl=dl, fe=fe)
        r.model         = p["model"]
        r.feature_names = p["feature_names"]
        return r


def main():
    os.makedirs(BASE_DIR / "data/processed", exist_ok=True)
    dl = DataLoader()
    fe = FeatureEngineer(dl)

    print(f"[1/3] Load features từ {FEATURES_PATH}...")
    with open(FEATURES_PATH, "rb") as f:
        data = pickle.load(f)
    X, y, groups = data["X"], data["y"], data["groups"]
    print(f"  X={X.shape}, y={y.shape}, sessions={len(groups)}")
    print(f"  Labels: book(1)={(y==1).sum():,}  ignore(0)={(y==0).sum():,}")

    print("\n[2/3] Train LightGBM LambdaRank (binary)...")
    ranker = FlightRanker(dl=dl, fe=fe)
    ranker.train(X, y, groups, users_df=dl.users)
    ranker.print_feature_importance()

    print("\n[3/3] Lưu model...")
    ranker.save()

    print("\n── Demo: Delhi → Mumbai cho U00001 ─")
    candidates = dl.get_candidates("Delhi", "Mumbai")
    print(f"  Candidates: {len(candidates)}")
    top = ranker.rank(candidates, "U00001", top_k=5)
    print(top[["flight_id", "airline", "price", "duration",
               "stops_num", "dep_slot", "seat_class", "final_score"]].to_string(index=False))


if __name__ == "__main__":
    main()