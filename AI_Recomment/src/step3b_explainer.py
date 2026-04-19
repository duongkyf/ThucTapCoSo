"""
STEP 3B — Explainability (chỉ 4 yếu tố: giá, hãng, giờ, hạng)
==============================================================
Giải thích lý do gợi ý chuyến bay, chỉ dùng 4 thuộc tính có dữ liệu thật.
"""

import numpy as np
import pandas as pd
import sys
from pathlib import Path
from dataclasses import dataclass, field

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
    flight_id:    str
    airline:      str
    price:        float
    final_score:  float
    contributions: dict   # chỉ 4 keys, tổng = 100
    radar:        dict    # 4 keys, giá trị [0,1]
    summary:      str = ""

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
        Trả về match score [0,1] cho 4 yếu tố: price, airline, time, class
        """
        (price_sens, dur_pref, stop_tol,
         airline_loy, morning_pref, biz_pref) = user_vec

        # 1. Price
        ideal_price = 1.0 - price_sens
        price_score = 1.0 - abs(float(flight["price_norm"]) - ideal_price)
        if price_sens > 0.7 and float(flight["price_norm"]) < 0.3:
            price_score = min(1.0, price_score * 1.2)

        # 2. Airline
        is_preferred = (preferred_airline != "" and flight["airline"] == preferred_airline)
        if is_preferred:
            airline_score = 0.5 + airline_loy * 0.5
        else:
            airline_score = (1.0 - airline_loy) * 0.4

        # 3. Time slot
        dep_slot = int(flight.get("dep_slot", 2))
        is_morning = dep_slot in [0, 1]
        if is_morning:
            timeslot_score = morning_pref
        else:
            timeslot_score = 1.0 - morning_pref
        timeslot_score = 0.2 + timeslot_score * 0.8

        # 4. Class
        is_biz = float(flight["is_business"]) == 1.0
        if is_biz:
            class_score = biz_pref
        else:
            class_score = 1.0 - biz_pref
        class_score = 0.2 + class_score * 0.8

        return {
            "price":   float(np.clip(price_score,   0, 1)),
            "airline": float(np.clip(airline_score, 0, 1)),
            "time":    float(np.clip(timeslot_score,0, 1)),
            "class":   float(np.clip(class_score,   0, 1)),
        }

    # ── Tính % contribution (chỉ 4 yếu tố, tổng = 100) ────────────────────
    def _compute_contributions(self, factor_scores: dict) -> dict[str, float]:
        raw = {k: factor_scores[k] * BASE_WEIGHTS[k] for k in factor_scores}
        total = sum(raw.values())
        if total == 0:
            return {k: 25.0 for k in raw}
        return {k: v / total * 100 for k, v in raw.items()}

    # ── Tạo câu summary từ 4 yếu tố ───────────────────────────────────────
    def _generate_summary(
        self,
        contributions: dict,
        factor_scores: dict,
        preferred_airline: str = "",
        airline: str = "",
    ) -> str:
        top2 = sorted(contributions.items(), key=lambda x: x[1], reverse=True)[:2]
        parts = []
        for factor, pct in top2:
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

    # ── Explain 1 chuyến bay ──────────────────────────────────────────────
    def explain(
        self,
        flight: pd.Series,
        user_id: str,
        final_score: float = 0.0,
    ) -> FlightExplanation:
        u_vec = self.fe.get_user_features(user_id)

        user_row = self.dl.users[self.dl.users["user_id"] == user_id]
        pref_airline = ""
        if len(user_row) > 0 and "preferred_airline" in user_row.columns:
            pref_airline = user_row["preferred_airline"].iloc[0]

        factor_scores = self._compute_factor_scores(flight, u_vec, pref_airline)
        contributions = self._compute_contributions(factor_scores)
        summary = self._generate_summary(
            contributions, factor_scores, pref_airline, flight.get("airline", "")
        )

        # Đổi key nội bộ → label hiển thị
        labeled_contributions = {FACTOR_LABELS[k]: v for k, v in contributions.items()}

        return FlightExplanation(
            flight_id    = flight.get("flight_id", ""),
            airline      = flight.get("airline", ""),
            price        = float(flight.get("price", 0)),
            final_score  = final_score,
            contributions= labeled_contributions,
            radar        = factor_scores,   # raw scores [0,1] cho radar chart
            summary      = summary,
        )

    # ── Explain toàn bộ top-k ─────────────────────────────────────────────
    def explain_results(
        self,
        ranked_df: pd.DataFrame,
        user_id: str,
    ) -> list[FlightExplanation]:
        explanations = []
        for _, row in ranked_df.iterrows():
            score = float(row.get("final_score", 0.0))
            explanations.append(self.explain(row, user_id, final_score=score))
        return explanations

    # ── Format text (debug) ───────────────────────────────────────────────
    def format_text(self, exp: FlightExplanation) -> str:
        lines = [
            f"  Flight: {exp.flight_id} ({exp.airline})",
            f"  Giá   : {exp.price:,.0f}",
            f"  Score : {exp.final_score:.4f}",
            f"  Tóm tắt: {exp.summary}",
            f"  Đóng góp:",
        ]
        for label, pct in sorted(exp.contributions.items(), key=lambda x: x[1], reverse=True):
            bar = "█" * int(pct / 3) + "░" * (34 - int(pct / 3))
            lines.append(f"    {label:<22} {bar[:20]} {pct:5.1f}%")
        lines.append(f"  Radar: {exp.radar}")
        return "\n".join(lines)


# ── Main demo ──────────────────────────────────────────────────────────────
def main():
    from src.step3_ranking import FlightRanker
    dl = DataLoader()
    fe = FeatureEngineer(dl)
    model_path = Path(__file__).parent.parent / "data/processed/ranker_model.pkl"
    if not model_path.exists():
        print("[!] Cần chạy step3_ranking.py trước")
        sys.exit(1)
    ranker = FlightRanker.load(dl=dl, fe=fe)
    explainer = Explainer(dl=dl, fe=fe)

    for user_id in ["U00000", "U00001"]:
        user_row = dl.users[dl.users["user_id"] == user_id]
        archetype = user_row["archetype"].iloc[0] if len(user_row) > 0 else "?"
        print(f"\nUser {user_id} ({archetype})")
        candidates = dl.get_candidates("Ho Chi Minh City", "Hanoi")
        top = ranker.rank(candidates, user_id, top_k=3)
        exps = explainer.explain_results(top, user_id)
        for exp in exps:
            print(explainer.format_text(exp))


if __name__ == "__main__":
    main()