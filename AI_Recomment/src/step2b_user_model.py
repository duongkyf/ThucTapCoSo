"""
STEP 2B — User Modeling
========================
Học preference vector của từng user từ lịch sử hành vi.

Phase 1 dùng ground truth vector (từ generator).
Phase 2 này học lại từ history — gần với thực tế hơn.

3 phương pháp, tăng dần độ phức tạp:
  [1] AggregationModel  — weighted average của flight features theo relevance
                          Đơn giản, không cần train, baseline tốt
  [2] OnlineLearner     — EMA update theo từng feedback (đã có trong DataLoader)
                          Simulate real-time personalization
  [3] HybridModel       — kết hợp: 70% Aggregation + 30% cold-start prior
                          Xử lý cold-start cho user mới

Với scope demo môn học, dùng AggregationModel là đủ.

Cách dùng:
    python src/step2b_user_model.py

    Hoặc import:
        from src.step2b_user_model import UserModelAggregation
        um = UserModelAggregation(data_loader)
        vec = um.get_learned_vector("U00001")
        um.update_all()   # học lại toàn bộ user từ history
"""

import pandas as pd
import numpy as np
import sys
import os
import pickle
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.data_loader import DataLoader, PREFERENCE_DIMS

BASE_DIR       = Path(__file__).parent.parent
USER_MODEL_OUT = BASE_DIR / "data/processed/user_vectors.pkl"

# Trọng số theo loại hành vi
RELEVANCE_WEIGHTS = {2: 3.0, 1: 1.0, 0: -0.3}   # book=3x, click=1x, ignore=-0.3x


class UserModelAggregation:
    """
    Học preference vector bằng weighted aggregation:
    
    Với mỗi user, duyệt toàn bộ history:
      - Book (rel=2):   cộng flight_signal × 3.0
      - Click (rel=1):  cộng flight_signal × 1.0
      - Ignore (rel=0): trừ flight_signal × 0.3
    
    Sau đó normalize về [0, 1].
    
    flight_signal là vector 6 chiều biểu diễn đặc trưng
    của chuyến bay trên không gian preference:
      [price_signal, duration_signal, stop_signal,
       airline_signal, morning_signal, business_signal]
    """

    def __init__(self, dl: DataLoader):
        self.dl = dl
        self._learned_vectors: dict[str, np.ndarray] = {}
        self._global_prior = self._compute_global_prior()

    # ── Prior cho cold-start ──────────────────────────────────────────────
    def _compute_global_prior(self) -> np.ndarray:
        """
        Prior = average preference vector của tất cả user đã biết.
        Dùng cho user mới chưa có history.
        """
        return self.dl.users[PREFERENCE_DIMS].mean().values.astype(np.float32)

    # ── Chuyển 1 flight → signal vector trên không gian preference ────────
    def _flight_to_signal(
        self,
        flight: pd.Series,
        preferred_airline: str = "",
    ) -> np.ndarray:
        """
        Map đặc trưng của chuyến bay sang không gian preference.
        
        Ý nghĩa: nếu user thích chuyến này,
        preference của họ nên gần với vector này.
        """
        # price_signal cao → user quan tâm giá (chuyến rẻ)
        price_signal = 1.0 - float(flight["price_norm"])

        # duration_signal cao → user thích bay ngắn
        duration_signal = 1.0 - float(flight["duration_norm"])

        # stop_signal cao → user chấp nhận nhiều điểm dừng
        stop_signal = float(flight["stops_num"]) / 2.0

        # airline_signal: 1.0 nếu đúng hãng ưa thích
        airline_signal = (
            1.0 if (preferred_airline and
                    flight["airline"] == preferred_airline)
            else 0.2
        )

        # morning_signal: 1.0 nếu chuyến sáng
        morning_signal = 1.0 if int(flight.get("dep_slot", 2)) in [0, 1] else 0.0

        # business_signal: 1.0 nếu business class
        business_signal = float(flight["is_business"])

        return np.array([
            price_signal, duration_signal, stop_signal,
            airline_signal, morning_signal, business_signal,
        ], dtype=np.float32)

    # ── Học vector cho 1 user ─────────────────────────────────────────────
    def learn_user_vector(self, user_id: str) -> np.ndarray:
        """
        Học preference vector cho 1 user từ history của họ.
        
        Returns:
            np.ndarray shape (6,) ∈ [0, 1]
        """
        user_history = self.dl.get_user_history(user_id)

        if len(user_history) == 0:
            # Cold-start: không có history → dùng global prior
            return self._global_prior.copy()

        flights_idx = self.dl.flights.set_index("flight_id")

        # Lấy preferred_airline của user (nếu có)
        user_row = self.dl.users[self.dl.users["user_id"] == user_id]
        pref_airline = ""
        if len(user_row) > 0 and "preferred_airline" in user_row.columns:
            pref_airline = user_row["preferred_airline"].iloc[0]

        # Weighted accumulation
        accum  = np.zeros(6, dtype=np.float64)
        weight_sum = 0.0

        for _, row in user_history.iterrows():
            fid = row["flight_id"]
            if fid not in flights_idx.index:
                continue

            relevance = int(row["relevance"])
            w = RELEVANCE_WEIGHTS.get(relevance, 0.0)
            if w == 0.0:
                continue

            signal = self._flight_to_signal(flights_idx.loc[fid], pref_airline)
            accum      += w * signal
            weight_sum += abs(w)

        if weight_sum == 0:
            return self._global_prior.copy()

        raw_vec = accum / weight_sum

        # Blend với prior để tránh vector cực đoan (đặc biệt khi ít data)
        n_interactions = len(user_history)
        # Càng nhiều data → càng tin vào learned vector
        trust = min(1.0, n_interactions / 20.0)   # full trust sau 20 interactions
        blended = trust * raw_vec + (1 - trust) * self._global_prior

        return np.clip(blended, 0.0, 1.0).astype(np.float32)

    # ── Học toàn bộ users ─────────────────────────────────────────────────
    def update_all(self, verbose: bool = True) -> dict[str, np.ndarray]:
        """
        Học preference vector cho tất cả user có trong history.
        Kết quả được cache trong self._learned_vectors.
        """
        user_ids = self.dl.history["user_id"].unique()
        n = len(user_ids)
        if verbose:
            print(f"[UserModel] Học vector cho {n} users...")

        for i, uid in enumerate(user_ids):
            self._learned_vectors[uid] = self.learn_user_vector(uid)
            if verbose and i % 50 == 0:
                print(f"  {i}/{n}...", end="\r")

        if verbose:
            print(f"  ✓ Done — {n} users\n")

        return self._learned_vectors

    def get_learned_vector(self, user_id: str) -> np.ndarray:
        """Trả về learned vector (học từ history, không phải ground truth)."""
        if user_id not in self._learned_vectors:
            self._learned_vectors[user_id] = self.learn_user_vector(user_id)
        return self._learned_vectors[user_id]

    def save(self, path: str = USER_MODEL_OUT):
        """Lưu tất cả learned vectors ra file."""
        with open(path, "wb") as f:
            pickle.dump(self._learned_vectors, f)
        print(f"✓ Đã lưu {len(self._learned_vectors)} user vectors → {path}")

    @classmethod
    def load(cls, dl: DataLoader, path: str = USER_MODEL_OUT) -> "UserModelAggregation":
        """Load user vectors đã học từ file."""
        um = cls(dl)
        with open(path, "rb") as f:
            um._learned_vectors = pickle.load(f)
        print(f"✓ Đã load {len(um._learned_vectors)} user vectors từ {path}")
        return um


# ── Main: học + đánh giá chất lượng user vectors ─────────────────────────────
def main():
    os.makedirs(BASE_DIR / "data/processed", exist_ok=True)

    dl = DataLoader()
    um = UserModelAggregation(dl)

    print("── Học preference vectors từ history ───────────────")
    um.update_all()
    um.save()

    # So sánh learned vector vs ground truth
    print("\n── So sánh: Learned vector vs Ground truth ─────────")
    print("  (Kỳ vọng: tương đồng cao — học được đúng preference)\n")

    users_gt = dl.users.set_index("user_id")
    errors = []

    sample_users = list(um._learned_vectors.keys())[:5]
    for uid in sample_users:
        learned = um.get_learned_vector(uid)
        if uid not in users_gt.index:
            continue
        gt = users_gt.loc[uid, PREFERENCE_DIMS].values.astype(float)
        mae = np.mean(np.abs(learned - gt))
        errors.append(mae)

        archetype = users_gt.loc[uid, "archetype"] if "archetype" in users_gt.columns else "?"
        print(f"  User {uid} ({archetype})")
        print(f"  {'Dimension':<25} {'Ground truth':>13}  {'Learned':>8}  {'Diff':>6}")
        print(f"  {'─'*58}")
        for dim, g, l in zip(PREFERENCE_DIMS, gt, learned):
            diff  = l - g
            sign  = "▲" if diff > 0.02 else ("▼" if diff < -0.02 else "─")
            print(f"  {dim:<25} {g:>13.3f}  {l:>8.3f}  {sign}{abs(diff):.3f}")
        print(f"  MAE: {mae:.4f}\n")

    # MAE trên toàn bộ users
    all_errors = []
    for uid, learned in um._learned_vectors.items():
        if uid not in users_gt.index:
            continue
        gt  = users_gt.loc[uid, PREFERENCE_DIMS].values.astype(float)
        all_errors.append(np.mean(np.abs(learned - gt)))

    if all_errors:
        print(f"── MAE tổng thể ────────────────────────────────────")
        print(f"  Mean MAE : {np.mean(all_errors):.4f}")
        print(f"  Median   : {np.median(all_errors):.4f}")
        print(f"  Max      : {np.max(all_errors):.4f}")
        print(f"\n  (MAE < 0.15 là tốt cho dữ liệu synthetic)")


if __name__ == "__main__":
    main()