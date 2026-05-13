"""
retrieval.py — CandidateRetriever (binary: book=1 / ignore=0)
=============================================================
Stage 1 của 2-stage pipeline: lọc top_k candidates từ toàn bộ
chuyến bay cùng tuyến, dựa trên user preference.

Fix so với bản cũ:
- relevance == 1 (book) thay vì == 2
- force_include_gt luôn hoạt động đúng
- Scoring dùng price_norm đã được chuẩn hóa đúng
"""

import numpy as np
import pandas as pd
from src.data_loader import DataLoader


class CandidateRetriever:
    def __init__(self, dl: DataLoader):
        self.dl = dl
        self.global_price_mean = dl.flights["price_norm"].mean()
        self.global_dur_mean   = dl.flights["duration_norm"].mean()

    def retrieve(self, origin: str, dest: str, user_id: str,
                 top_k: int = 300,
                 force_include_gt_flight_ids: list = None) -> pd.DataFrame:

        candidates = self.dl.get_candidates(origin, dest)
        if len(candidates) == 0:
            return candidates

        # ── User profile ──────────────────────────────────────────────────────
        users = self.dl.users.set_index("user_id")
        if user_id not in users.index:
            user = pd.Series({
                "preferred_airline": "", "price_sensitivity": 0.6,
                "duration_preference": 0.5, "stop_tolerance": 0.5,
                "morning_preference": 0.5, "business_class_pref": 0.1,
                "airline_loyalty": 0.5,
            })
        else:
            user = users.loc[user_id]

        # ── Lịch sử booking của user (binary: relevance=1) ────────────────────
        history = self.dl.get_user_history(user_id)
        booked  = history[history["relevance"] == 1]   # ← FIX: 1 thay vì 2

        scores = np.zeros(len(candidates), dtype=np.float32)

        # ── 1. Giá ───────────────────────────────────────────────────────────
        price_sens = float(user.get("price_sensitivity", 0.5))
        if len(booked) > 0:
            flights_idx = self.dl.flights.set_index("flight_id")
            valid_fids  = [f for f in booked["flight_id"] if f in flights_idx.index]
            if valid_fids:
                avg_p = flights_idx.loc[valid_fids, "price_norm"].mean()
            else:
                avg_p = self.global_price_mean
        else:
            avg_p = self.global_price_mean

        price_dev = np.abs(candidates["price_norm"].values - avg_p)
        scores   += (1.0 - price_dev) * (1.0 + price_sens)   # user nhạy giá → weight cao hơn

        # ── 2. Hãng ưa thích ──────────────────────────────────────────────────
        preferred    = str(user.get("preferred_airline", "") or "")
        airline_loy  = float(user.get("airline_loyalty", 0.5))
        if preferred:
            is_pref  = (candidates["airline"] == preferred).values.astype(float)
            scores  += is_pref * (1.5 + airline_loy)

        # ── 3. Khung giờ ──────────────────────────────────────────────────────
        morning_pref = float(user.get("morning_preference", 0.5))
        dep_slot     = candidates["dep_slot"].values
        is_morning   = ((dep_slot == 0) | (dep_slot == 1)).astype(float)
        timeslot_score = morning_pref * is_morning + (1.0 - morning_pref) * (1.0 - is_morning)
        scores += timeslot_score * 1.0

        # ── 4. Số điểm dừng ───────────────────────────────────────────────────
        stop_tol = float(user.get("stop_tolerance", 0.5))
        scores  += (candidates["stops_num"] == 0).astype(float) * (2.0 - stop_tol)
        scores  += (candidates["stops_num"] == 1).astype(float) * 0.5

        # ── 5. Hạng ghế ───────────────────────────────────────────────────────
        biz_pref = float(user.get("business_class_pref", 0.1))
        is_biz   = candidates["is_business"].values.astype(float)
        seat_score = biz_pref * is_biz + (1.0 - biz_pref) * (1.0 - is_biz)
        scores  += seat_score * 0.8

        # ── 6. Duration ───────────────────────────────────────────────────────
        dur_pref = float(user.get("duration_preference", 0.5))
        # dur_pref cao → thích bay ngắn
        dur_score = 1.0 - candidates["duration_norm"].values
        scores   += dur_score * dur_pref * 0.8

        # ── Force include ground truth ─────────────────────────────────────────
        if force_include_gt_flight_ids:
            for gt_str in force_include_gt_flight_ids:
                gt_mask = candidates["flight_id"].astype(str) == gt_str
                if gt_mask.any():
                    scores[gt_mask.values] = scores.max() + 100.0

        # ── Lấy top_k ────────────────────────────────────────────────────────
        k           = min(top_k, len(candidates))
        top_indices = np.argsort(scores)[::-1][:k]
        retrieved   = candidates.iloc[top_indices].reset_index(drop=True)

        # Safety check: nếu GT vẫn không có mặt (edge case) → thêm vào
        if force_include_gt_flight_ids:
            for gt_str in force_include_gt_flight_ids:
                if not (retrieved["flight_id"].astype(str) == gt_str).any():
                    gt_row = candidates[candidates["flight_id"].astype(str) == gt_str]
                    if not gt_row.empty:
                        retrieved = pd.concat([gt_row, retrieved], ignore_index=True).head(k)

        return retrieved