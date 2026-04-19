"""
STEP 3A — Ranking Model (LightGBM LambdaRank)
=============================================
Train Learning-to-Rank model trên training data từ Tuần 2.
Đánh giá bằng NDCG@5 và NDCG@10.

Cách dùng:
    python src/step3_ranking.py          # train + lưu model
    
    Hoặc import để serve:
        from src.step3_ranking import FlightRanker
        ranker = FlightRanker.load()
        results = ranker.rank(candidates_df, user_id)
"""

import numpy as np
import pandas as pd
import pickle
import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.data_loader import DataLoader
from src.step2_features import FeatureEngineer, ALL_FEATURE_NAMES

try:
    import lightgbm as lgb
except ImportError:
    print("[!] Cần cài lightgbm: pip install lightgbm")
    sys.exit(1)

from sklearn.model_selection import GroupShuffleSplit

BASE_DIR   = Path(__file__).parent.parent
MODEL_OUT  = BASE_DIR / "data/processed/ranker_model.pkl"
FEATURES_PATH = BASE_DIR / "data/processed/train_features.pkl"

# ── LightGBM config ───────────────────────────────────────────────────────────
LGBM_PARAMS = {
    "objective":        "lambdarank",
    "metric":           "ndcg",
    "ndcg_eval_at":     [5, 10],
    "learning_rate":    0.05,
    "num_leaves":       63,
    "min_child_samples": 20,
    "feature_fraction": 0.8,
    "bagging_fraction": 0.8,
    "bagging_freq":     5,
    "lambda_l1":        0.1,
    "lambda_l2":        0.1,
    "verbose":          -1,
    "n_jobs":           -1,
}
N_ESTIMATORS   = 300
EARLY_STOPPING = 30
TEST_SIZE      = 0.2
RANDOM_STATE   = 42
TOP_K          = 10   # số chuyến trả về khi serving


class FlightRanker:
    """
    Wrapper cho LightGBM LambdaRank model.
    Cung cấp interface train / evaluate / rank / explain.
    """

    def __init__(self, dl: DataLoader = None, fe: FeatureEngineer = None):
        self.dl    = dl
        self.fe    = fe
        self.model: lgb.Booster = None
        self.feature_names = ALL_FEATURE_NAMES

    # ── Train ─────────────────────────────────────────────────────────────
    def train(self, X: np.ndarray, y: np.ndarray, groups: np.ndarray):
        """
        Train LambdaRank model với train/val split theo group (session).
        
        LambdaRank tối ưu NDCG trực tiếp — phù hợp hơn cross-entropy
        cho bài toán ranking vì nó quan tâm đến thứ tự, không chỉ nhãn.
        """
        print("[Ranker] Chia train/val theo session groups...")

        # Split theo groups để tránh data leakage
        # (các item trong cùng 1 session phải cùng train hoặc cùng val)
        gss = GroupShuffleSplit(
            n_splits=1, test_size=TEST_SIZE, random_state=RANDOM_STATE
        )
        # Tạo group label cho từng item
        item_groups = np.repeat(np.arange(len(groups)), groups)
        train_idx, val_idx = next(gss.split(X, y, groups=item_groups))

        X_train, y_train = X[train_idx], y[train_idx]
        X_val,   y_val   = X[val_idx],   y[val_idx]

        # groups cho train và val
        train_item_groups = item_groups[train_idx]
        val_item_groups   = item_groups[val_idx]

        _, train_groups = np.unique(train_item_groups, return_counts=True)
        _, val_groups   = np.unique(val_item_groups,   return_counts=True)

        print(f"  Train: {len(X_train):,} items, {len(train_groups):,} sessions")
        print(f"  Val  : {len(X_val):,} items,   {len(val_groups):,} sessions")

        # Tạo LightGBM Dataset
        train_ds = lgb.Dataset(
            X_train, label=y_train,
            group=train_groups,
            feature_name=self.feature_names,
            free_raw_data=False,
        )
        val_ds = lgb.Dataset(
            X_val, label=y_val,
            group=val_groups,
            reference=train_ds,
            feature_name=self.feature_names,
            free_raw_data=False,
        )

        print(f"[Ranker] Bắt đầu training ({N_ESTIMATORS} rounds)...")
        callbacks = [
            lgb.early_stopping(EARLY_STOPPING, verbose=False),
            lgb.log_evaluation(period=50),
        ]
        self.model = lgb.train(
            params         = LGBM_PARAMS,
            train_set      = train_ds,
            num_boost_round= N_ESTIMATORS,
            valid_sets     = [val_ds],
            callbacks      = callbacks,
        )

        best_round = self.model.best_iteration
        print(f"\n✓ Training xong — best iteration: {best_round}")

        # Evaluate trên val set
        self.evaluate(X_val, y_val, val_groups)

    # ── Evaluate ──────────────────────────────────────────────────────────
    def evaluate(self, X: np.ndarray, y: np.ndarray, groups: np.ndarray):
        """Tính NDCG@5 và NDCG@10 trên tập val/test."""
        scores = self.model.predict(X)

        ndcg5_list  = []
        ndcg10_list = []
        ptr = 0

        for g in groups:
            s = scores[ptr:ptr+g]
            l = y[ptr:ptr+g]
            ptr += g

            ndcg5_list.append(self._ndcg_at_k(l, s, k=5))
            ndcg10_list.append(self._ndcg_at_k(l, s, k=10))

        print(f"\n── Evaluation ──────────────────────────────────")
        print(f"  NDCG@5  : {np.mean(ndcg5_list):.4f}")
        print(f"  NDCG@10 : {np.mean(ndcg10_list):.4f}")
        print(f"  (Baseline random ≈ 0.5, mục tiêu > 0.70)")

    @staticmethod
    def _ndcg_at_k(labels: np.ndarray, scores: np.ndarray, k: int) -> float:
        """Tính NDCG@k cho 1 query."""
        order = np.argsort(scores)[::-1][:k]
        gains = 2 ** labels[order] - 1
        discounts = np.log2(np.arange(2, len(gains) + 2))
        dcg = np.sum(gains / discounts)

        ideal_order = np.argsort(labels)[::-1][:k]
        ideal_gains = 2 ** labels[ideal_order] - 1
        idcg = np.sum(ideal_gains / discounts[:len(ideal_gains)])

        return dcg / idcg if idcg > 0 else 0.0

    # ── Feature Importance ────────────────────────────────────────────────
    def print_feature_importance(self):
        """In feature importance để hiểu model học được gì."""
        importance = self.model.feature_importance(importance_type="gain")
        total = importance.sum()
        pairs = sorted(
            zip(self.feature_names, importance),
            key=lambda x: x[1], reverse=True
        )
        print("\n── Feature Importance (gain) ───────────────────")
        for name, imp in pairs:
            pct = imp / total * 100
            bar = "█" * int(pct / 2) + "░" * (50 - int(pct / 2))
            print(f"  {name:<28} {bar[:25]} {pct:5.1f}%")

    # ── Rank candidates (serving) ─────────────────────────────────────────
    def rank(
        self,
        candidates: pd.DataFrame,
        user_id: str,
        top_k: int = TOP_K,
    ) -> pd.DataFrame:
        """
        Rank tập candidates cho 1 user.
        Đây là hàm chính được gọi từ FastAPI.

        Args:
            candidates: output của DataLoader.get_candidates()
            user_id:    user đang query
            top_k:      số kết quả trả về

        Returns:
            DataFrame top-k chuyến bay, đã sort theo score giảm dần,
            có thêm cột 'rank_score'
        """
        if len(candidates) == 0:
            return candidates

        X = self.fe.build_candidate_matrix(candidates, user_id)
        scores = self.model.predict(X)

        result = candidates.copy()
        result["rank_score"] = scores

        # Multi-objective re-rank: weighted score
        # = 0.7 × model_score + 0.2 × (1 - price_norm) + 0.1 × (1 - duration_norm)
        result["final_score"] = (
            0.70 * result["rank_score"] +
            0.20 * (1.0 - result["price_norm"]) +
            0.10 * (1.0 - result["duration_norm"])
        )
        # Normalize final_score về [0, 1]
        min_s, max_s = result["final_score"].min(), result["final_score"].max()
        if max_s > min_s:
            result["final_score"] = (result["final_score"] - min_s) / (max_s - min_s)

        result = result.sort_values("final_score", ascending=False)
        return result.head(top_k).reset_index(drop=True)

    # ── Save / Load ───────────────────────────────────────────────────────
    def save(self, path: str = MODEL_OUT):
        payload = {
            "model":         self.model,
            "feature_names": self.feature_names,
        }
        with open(path, "wb") as f:
            pickle.dump(payload, f)
        print(f"\n✓ Đã lưu model → {path}")

    @classmethod
    def load(
        cls,
        dl: DataLoader = None,
        fe: FeatureEngineer = None,
        path: str = MODEL_OUT,
    ) -> "FlightRanker":
        with open(path, "rb") as f:
            payload = pickle.load(f)
        ranker = cls(dl=dl, fe=fe)
        ranker.model         = payload["model"]
        ranker.feature_names = payload["feature_names"]
        print(f"✓ Đã load model từ {path}")
        return ranker


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    os.makedirs(BASE_DIR / "data/processed", exist_ok=True)

    # Load data
    dl = DataLoader()
    fe = FeatureEngineer(dl)

    # Load training features (từ step2)
    print(f"[1/3] Load training features từ {FEATURES_PATH}...")
    if not FEATURES_PATH.exists():
        print("[!] Cần chạy step2_features.py trước")
        sys.exit(1)

    with open(FEATURES_PATH, "rb") as f:
        data = pickle.load(f)
    X, y, groups = data["X"], data["y"], data["groups"]
    print(f"  → X={X.shape}, y={y.shape}, {len(groups)} sessions")

    # Train
    print(f"\n[2/3] Train LightGBM LambdaRank...")
    ranker = FlightRanker(dl=dl, fe=fe)
    ranker.train(X, y, groups)
    ranker.print_feature_importance()

    # Save
    print(f"\n[3/3] Lưu model...")
    ranker.save()

    # Demo ranking
    print(f"\n── Demo: rank chuyến Delhi → Mumbai cho U00001 ─")
    candidates = dl.get_candidates("Delhi", "Mumbai")
    print(f"  Candidates: {len(candidates)} chuyến")

    top = ranker.rank(candidates, "U00001", top_k=5)
    print(f"\n  Top 5 chuyến bay được gợi ý:")
    cols = ["flight_id", "airline", "price", "duration",
            "stops_num", "dep_slot", "seat_class", "final_score"]
    existing = [c for c in cols if c in top.columns]
    print(top[existing].to_string(index=False))


if __name__ == "__main__":
    main()