"""
STEP 3B — Explainability (chỉ 4 yếu tố: giá, hãng, giờ, hạng)
==============================================================
Giải thích lý do gợi ý chuyến bay, chỉ dùng 4 thuộc tính có dữ liệu thật.

Fix so với phiên bản cũ:
  - _compute_factor_scores(): airline_score khi is_preferred=False
    Logic cũ: (1.0 - airline_loy) * 0.4
      → User KHÔNG trung thành (airline_loy=0.1) gặp sai hãng → score 0.36  ✗
      → User RẤT trung thành  (airline_loy=0.9) gặp sai hãng → score 0.04  ✗
    Logic mới: base_score + (1 - airline_loy) * bonus
      → User không trung thành: điểm cao (không quan tâm hãng nào cũng ổn)
      → User rất trung thành: điểm thấp (gặp sai hãng là bất lợi)
"""

import numpy as np
import pandas as pd
import sys
from pathlib import Path
from dataclasses import dataclass

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.data_loader import DataLoader, PREFERENCE_DIMS
from src.step2_features import FeatureEngineer

# ── Tên hiển thị (4 yếu tố) ────────────────────────────────────────────────
FACTOR_LABELS = {
    "price":   "Giá vé tốt",
    "airline": "Hãng bay phù hợp",
    "time":    "Giờ bay hợp lý",
    "class":   "Hạng ghế phù hợp",
}

# Trọng số cho 4 yếu tố (tỷ lệ ưu tiên khi tính %)
BASE_WEIGHTS = {
    "price":   1.5,
    "airline": 1.2,
    "time":    0.9,
    "class":   0.8,
}


@dataclass
class FlightExplanation:
    flight_id:     str
    airline:       str
    price:         float
    final_score:   float
    contributions: dict   # 4 keys, tổng = 100
    radar:         dict   # 4 keys, giá trị [0,1]
    summary:       str = ""

    def to_dict(self) -> dict:
        return {
            "flight_id":     self.flight_id,
            "airline":       self.airline,
            "price":         self.price,
            "final_score":   round(self.final_score, 4),
            "contributions": {k: round(v, 1) for k, v in self.contributions.items()},
            "radar":         {k: round(v, 3) for k, v in self.radar.items()},
            "summary":       self.summary,
        }


class Explainer:
    def __init__(self, dl: DataLoader, fe: FeatureEngineer):
        self.dl = dl
        self.fe = fe

    # ── Tính match score cho 4 yếu tố ─────────────────────────────────────
    def _compute_factor_scores(
        self,
        flight: pd.Series,
        user_vec: np.ndarray,
        preferred_airline: str = "",
    ) -> dict[str, float]:
        """
        Trả về match score [0,1] cho 4 yếu tố: price, airline, time, class.

        Nguyên tắc chung: score cao = chuyến bay phù hợp với preference của user.
        """
        (price_sens, dur_pref, stop_tol,
         airline_loy, morning_pref, biz_pref) = user_vec

        # ── 1. Price ────────────────────────────────────────────────────────
        # User nhạy cảm giá cao (price_sens → 1) → thích chuyến rẻ (price_norm thấp)
        # Ideal price_norm = 1 - price_sensitivity
        ideal_price = 1.0 - float(price_sens)
        price_score = 1.0 - abs(float(flight["price_norm"]) - ideal_price)
        # Bonus nhỏ khi user rất nhạy cảm giá VÀ chuyến thực sự rẻ
        if float(price_sens) > 0.7 and float(flight["price_norm"]) < 0.3:
            price_score = min(1.0, price_score * 1.2)

        # ── 2. Airline ──────────────────────────────────────────────────────
        # FIX (lỗi 7): Logic cũ tính ngược — user không trung thành lại bị
        # penalize khi gặp sai hãng, trong khi họ không quan tâm hãng nào cũng ổn.
        #
        # Logic mới:
        #   is_preferred=True:
        #     → score = 0.5 + airline_loy × 0.5  (0.5 đến 1.0)
        #     → User rất trung thành + đúng hãng = score cao nhất (1.0)
        #     → User không trung thành + đúng hãng = score trung bình (0.5)
        #
        #   is_preferred=False:
        #     → score = 0.3 + (1 - airline_loy) × 0.4  (0.3 đến 0.7)
        #     → User không trung thành + sai hãng = score khá ổn (0.7) — không quan tâm
        #     → User rất trung thành  + sai hãng = score thấp  (0.3) — bất lợi
        #
        # Dải [0.3, 1.0] đảm bảo airline luôn đóng góp dương vào score tổng,
        # chỉ là mức cao/thấp khác nhau tuỳ mức độ loyalty và hãng có phù hợp không.
        is_preferred = (
            preferred_airline != "" and
            str(flight.get("airline", "")) == preferred_airline
        )
        if is_preferred:
            airline_score = 0.5 + float(airline_loy) * 0.5
        else:
            airline_score = 0.3 + (1.0 - float(airline_loy)) * 0.4

        # ── 3. Time slot ────────────────────────────────────────────────────
        # dep_slot: 0=Early Morning, 1=Morning, 2=Afternoon, 3=Evening, 4=Night
        dep_slot   = int(flight.get("dep_slot", 2))
        is_morning = dep_slot in [0, 1]
        if is_morning:
            timeslot_score = float(morning_pref)
        else:
            timeslot_score = 1.0 - float(morning_pref)
        # Scale lên [0.2, 1.0] — tránh score = 0 khi perfect mismatch
        timeslot_score = 0.2 + timeslot_score * 0.8

        # ── 4. Seat class ────────────────────────────────────────────────────
        is_biz = float(flight.get("is_business", 0)) == 1.0
        if is_biz:
            class_score = float(biz_pref)
        else:
            class_score = 1.0 - float(biz_pref)
        # Scale lên [0.2, 1.0]
        class_score = 0.2 + class_score * 0.8

        return {
            "price":   float(np.clip(price_score,    0.0, 1.0)),
            "airline": float(np.clip(airline_score,  0.0, 1.0)),
            "time":    float(np.clip(timeslot_score, 0.0, 1.0)),
            "class":   float(np.clip(class_score,    0.0, 1.0)),
        }

    # ── Tính % contribution (4 yếu tố, tổng = 100%) ────────────────────────
    def _compute_contributions(self, factor_scores: dict) -> dict[str, float]:
        """
        Tính phần trăm đóng góp của từng yếu tố.
        = (score × weight) / tổng(score × weight) × 100
        """
        raw = {k: factor_scores[k] * BASE_WEIGHTS[k] for k in factor_scores}
        total = sum(raw.values())
        if total == 0:
            return {k: 25.0 for k in raw}
        return {k: v / total * 100 for k, v in raw.items()}

    # ── Tạo câu summary ─────────────────────────────────────────────────────
    def _generate_summary(
        self,
        contributions: dict,
        factor_scores: dict,
        preferred_airline: str = "",
        airline: str = "",
    ) -> str:
        """Tạo câu giải thích ngắn gọn từ 2 yếu tố đóng góp nhiều nhất."""
        top2  = sorted(contributions.items(), key=lambda x: x[1], reverse=True)[:2]
        parts = []
        for factor, _ in top2:
            score = factor_scores[factor]
            if factor == "price":
                parts.append("giá vé rất tốt" if score > 0.75 else "giá vé hợp lý")
            elif factor == "airline":
                if preferred_airline and airline == preferred_airline:
                    parts.append(f"đúng hãng {airline} bạn thường dùng")
                else:
                    parts.append("hãng bay phù hợp")
            elif factor == "time":
                parts.append("giờ bay đúng lịch thường")
            elif factor == "class":
                parts.append("hạng ghế phù hợp")

        if not parts:
            return "Phù hợp với lịch sử đặt vé của bạn"
        return "Phù hợp với bạn vì " + " và ".join(parts)

    # ── Explain 1 chuyến bay ─────────────────────────────────────────────────
    def explain(
        self,
        flight: pd.Series,
        user_id: str,
        final_score: float = 0.0,
    ) -> FlightExplanation:
        """
        Tạo giải thích cho 1 chuyến bay với 1 user cụ thể.

        Args:
            flight:      1 row từ flights DataFrame (hoặc ranked DataFrame)
            user_id:     ID user (dùng để lấy preference vector)
            final_score: score tổng từ ranker (để hiển thị)

        Returns:
            FlightExplanation với contributions (%) và radar scores ([0,1])
        """
        u_vec = self.fe.get_user_features(user_id)

        user_row     = self.dl.users[self.dl.users["user_id"] == user_id]
        pref_airline = ""
        if len(user_row) > 0 and "preferred_airline" in user_row.columns:
            pref_airline = str(user_row.iloc[0]["preferred_airline"])

        factor_scores = self._compute_factor_scores(flight, u_vec, pref_airline)
        contributions = self._compute_contributions(factor_scores)
        summary       = self._generate_summary(
            contributions, factor_scores,
            pref_airline, str(flight.get("airline", ""))
        )

        # Đổi key nội bộ → label hiển thị cho frontend
        labeled_contributions = {
            FACTOR_LABELS[k]: v for k, v in contributions.items()
        }

        return FlightExplanation(
            flight_id     = str(flight.get("flight_id", "")),
            airline       = str(flight.get("airline", "")),
            price         = float(flight.get("price", 0)),
            final_score   = final_score,
            contributions = labeled_contributions,
            radar         = factor_scores,   # raw [0,1] cho radar/bar chart
            summary       = summary,
        )

    # ── Explain toàn bộ top-k ────────────────────────────────────────────────
    def explain_results(
        self,
        ranked_df: pd.DataFrame,
        user_id: str,
    ) -> list[FlightExplanation]:
        """
        Tạo giải thích cho toàn bộ kết quả ranked.
        Được gọi từ FastAPI sau khi _rank_candidates() hoàn thành.
        """
        explanations = []
        for _, row in ranked_df.iterrows():
            score = float(row.get("final_score", 0.0))
            explanations.append(self.explain(row, user_id, final_score=score))
        return explanations

    # ── Format text (debug / báo cáo) ────────────────────────────────────────
    def format_text(self, exp: FlightExplanation) -> str:
        lines = [
            f"  Flight : {exp.flight_id} ({exp.airline})",
            f"  Giá    : {exp.price:,.0f}",
            f"  Score  : {exp.final_score:.4f}",
            f"  Tóm tắt: {exp.summary}",
            f"  Đóng góp (%):",
        ]
        for label, pct in sorted(exp.contributions.items(), key=lambda x: x[1], reverse=True):
            bar = "█" * int(pct / 3) + "░" * max(0, 34 - int(pct / 3))
            lines.append(f"    {label:<25} {bar[:20]} {pct:5.1f}%")
        lines.append(f"  Radar  : {exp.radar}")
        return "\n".join(lines)


# ── Main demo ──────────────────────────────────────────────────────────────────
def main():
    from src.step3_ranking import FlightRanker

    dl = DataLoader()
    fe = FeatureEngineer(dl)

    model_path = Path(__file__).parent.parent / "data/processed/ranker_model.pkl"
    if not model_path.exists():
        print("[!] Cần chạy step3_ranking.py trước để có ranker_model.pkl")
        sys.exit(1)

    ranker    = FlightRanker.load(dl=dl, fe=fe)
    explainer = Explainer(dl=dl, fe=fe)

    # Lấy 2 user có archetype khác nhau để demo
    sample_users = dl.users.groupby("archetype")["user_id"].first().tolist()
    demo_users   = sample_users[:2] if len(sample_users) >= 2 else dl.users["user_id"].head(2).tolist()

    routes = dl.get_available_routes()
    if not routes:
        print("[!] Không có tuyến bay trong dataset")
        sys.exit(1)

    origin, dest = routes[0]

    for user_id in demo_users:
        user_row  = dl.users[dl.users["user_id"] == user_id]
        archetype = user_row["archetype"].iloc[0] if len(user_row) > 0 else "?"
        pref_vec  = dl.get_user_preference_vector(user_id)

        print(f"\n{'='*60}")
        print(f"User {user_id} ({archetype})")
        print(f"Preference: {dict(zip(PREFERENCE_DIMS, pref_vec.round(3)))}")
        print(f"Tuyến: {origin} → {dest}")
        print(f"{'='*60}")

        candidates = dl.get_candidates(origin, dest)
        if len(candidates) == 0:
            print(f"  Không có chuyến bay")
            continue

        top      = ranker.rank(candidates, user_id, top_k=3)
        exps     = explainer.explain_results(top, user_id)

        for i, exp in enumerate(exps, 1):
            print(f"\n  ── Gợi ý #{i} ──────────────────────────────")
            print(explainer.format_text(exp))

    # Kiểm tra fix airline logic
    print(f"\n{'='*60}")
    print("  Kiểm tra fix airline_score (lỗi 7):")
    print(f"{'='*60}")
    dummy_flight = pd.Series({
        "flight_id": "TEST", "airline": "Vistara",
        "price_norm": 0.3, "duration_norm": 0.4,
        "stops_num": 0, "is_business": 0, "dep_slot": 1,
    })
    # User rất trung thành nhưng gặp sai hãng → phải thấp
    loyal_vec  = np.array([0.5, 0.5, 0.5, 0.9, 0.5, 0.3], dtype=np.float32)
    # User không trung thành gặp sai hãng → phải cao hơn
    casual_vec = np.array([0.5, 0.5, 0.5, 0.1, 0.5, 0.3], dtype=np.float32)

    exp_inst = Explainer(dl=dl, fe=fe)
    loyal_score  = exp_inst._compute_factor_scores(dummy_flight, loyal_vec,  "IndiGo")["airline"]
    casual_score = exp_inst._compute_factor_scores(dummy_flight, casual_vec, "IndiGo")["airline"]

    print(f"  User rất trung thành (0.9) + sai hãng  → airline_score = {loyal_score:.3f}  (kỳ vọng thấp ≈ 0.3)")
    print(f"  User không trung thành (0.1) + sai hãng → airline_score = {casual_score:.3f}  (kỳ vọng cao ≈ 0.7)")
    assert casual_score > loyal_score, "FIX THẤT BẠI: casual phải cao hơn loyal khi sai hãng"
    print("  ✓ Logic airline_score đúng sau khi fix")


if __name__ == "__main__":
    main()