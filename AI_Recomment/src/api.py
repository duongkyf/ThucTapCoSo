"""
STEP 4 — FastAPI Backend (updated)
===================================
Thêm endpoint /search-by-vector nhận preference_vector trực tiếp
từ Node.js — không cần user_id, không đụng users.csv.

Vị trí file: AI_Recomment/src/api.py
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
import sys
from pathlib import Path
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.data_loader import DataLoader, PREFERENCE_DIMS
from src.step2_features import FeatureEngineer
from src.step3_ranking import FlightRanker
from src.step3b_explainer import Explainer

# ── App ───────────────────────────────────────────────────────
app = FastAPI(
    title="Flight Recommendation API",
    description="Hệ thống gợi ý chuyến bay cá nhân hóa (ML + Explainable AI)",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:5000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Load pipeline ─────────────────────────────────────────────
print("[API] Đang khởi tạo pipeline...")
dl        = DataLoader()
fe        = FeatureEngineer(dl)
ranker    = FlightRanker.load(dl=dl, fe=fe)
explainer = Explainer(dl=dl, fe=fe)
print("[API] Sẵn sàng.\n")


# ── Schemas ───────────────────────────────────────────────────
class SearchRequest(BaseModel):
    user_id:     str           = Field(...,  example="U00001")
    origin:      str           = Field(...,  example="Delhi")
    destination: str           = Field(...,  example="Mumbai")
    seat_class:  Optional[str] = Field(None, example="Economy")
    max_stops:   Optional[int] = Field(None, example=1)
    top_k:       int           = Field(10,   example=10, ge=1, le=50)


class SearchByVectorRequest(BaseModel):
    preference_vector: list[float] = Field(
        ...,
        description=(
            "6 dims theo thứ tự: price_sensitivity, duration_preference, "
            "stop_tolerance, airline_loyalty, morning_preference, business_class_pref. "
            "Mỗi giá trị trong [0, 1]."
        )
    )
    preferred_airline: str           = Field("",   example="Vietjet Air")
    origin:            str           = Field(...,  example="Ho Chi Minh City")
    destination:       str           = Field(...,  example="Hanoi")
    seat_class:        Optional[str] = Field(None, example="Economy")
    max_stops:         Optional[int] = Field(None, example=1)
    top_k:             int           = Field(10,   ge=1, le=50)


class FeedbackRequest(BaseModel):
    user_id:   str = Field(..., example="U00001")
    flight_id: str = Field(..., example="FL004235")
    action:    str = Field(..., example="book")


# ── Helpers ───────────────────────────────────────────────────
def _flight_to_dict(row) -> dict:
    return {
        "flight_id":   row.get("flight_id", ""),
        "airline":     row.get("airline", ""),
        "origin":      row.get("source_city", ""),
        "destination": row.get("destination_city", ""),
        "departure":   row.get("departure_time", ""),
        "arrival":     row.get("arrival_time", ""),
        "duration_h":  round(float(row.get("duration", 0)), 2),
        "stops":       int(row.get("stops_num", 0)),
        "seat_class":  row.get("seat_class", ""),
        "price":       int(row.get("price", 0)),
        "rank_score":  round(float(row.get("rank_score", 0)), 4),
        "final_score": round(float(row.get("final_score", 0)), 4),
    }


def _deduplicate(df, cols=("airline", "price", "duration_norm", "stops_num", "dep_slot", "is_business")):
    existing_cols = [c for c in cols if c in df.columns]
    if not existing_cols:
        return df
    return (
        df.sort_values("final_score", ascending=False)
          .drop_duplicates(subset=existing_cols, keep="first")
          .reset_index(drop=True)
    )


def _rank_candidates(candidates: pd.DataFrame, pref_vec: np.ndarray, preferred_airline: str, top_k: int):
    """Dùng chung cho cả /search và /search-by-vector."""
    rows = []
    for _, flight in candidates.iterrows():
        f_feat  = fe.get_flight_features(flight)
        ia_feat = fe.get_interaction_features(flight, pref_vec, preferred_airline)
        rows.append(np.concatenate([f_feat, pref_vec, ia_feat]))
    X = np.array(rows, dtype=np.float32)

    scores = ranker.model.predict(X)
    ranked = candidates.copy()
    ranked["rank_score"]  = scores
    ranked["final_score"] = (
        0.7 * ranked["rank_score"] +
        0.2 * (1.0 - ranked["price_norm"]) +
        0.1 * (1.0 - ranked["duration_norm"])
    )
    ranked = ranked.sort_values("final_score", ascending=False)
    ranked = _deduplicate(ranked)
    return ranked.head(top_k).reset_index(drop=True)


def _explain_with_temp_user(ranked: pd.DataFrame, pref_vec: np.ndarray, preferred_airline: str):
    """
    Tạo temp user để explainer hoạt động mà không cần user_id thật.
    Luôn restore trạng thái dl dù có lỗi.
    """
    TEMP_ID = "__vector_user__"
    dl._user_pref_cache[TEMP_ID] = pref_vec

    temp_row = pd.DataFrame([{
        "user_id":             TEMP_ID,
        "price_sensitivity":   float(pref_vec[0]),
        "duration_preference": float(pref_vec[1]),
        "stop_tolerance":      float(pref_vec[2]),
        "airline_loyalty":     float(pref_vec[3]),
        "morning_preference":  float(pref_vec[4]),
        "business_class_pref": float(pref_vec[5]),
        "archetype":           "real_user",
        "preferred_airline":   preferred_airline,
    }])
    original_users = dl._users.copy()
    dl._users = pd.concat([dl._users, temp_row], ignore_index=True)

    try:
        explanations = explainer.explain_results(ranked, TEMP_ID)
    finally:
        dl._users = original_users
        dl._user_pref_cache.pop(TEMP_ID, None)

    return explanations


# ── Endpoints ─────────────────────────────────────────────────

@app.get("/", tags=["Health"])
def health_check():
    return {
        "status": "ok",
        "flights": len(dl.flights),
        "users":   len(dl.users),
        "routes":  len(dl.get_available_routes()),
    }


@app.get("/routes", tags=["Data"])
def get_routes():
    routes = dl.get_available_routes()
    return {
        "routes": [{"origin": o, "destination": d} for o, d in routes],
        "total":  len(routes),
    }


@app.get("/airlines", tags=["Data"])
def get_airlines():
    return {"airlines": sorted(dl.flights["airline"].unique().tolist())}


@app.get("/user/{user_id}/profile", tags=["User"])
def get_user_profile(user_id: str):
    user_row = dl.users[dl.users["user_id"] == user_id]
    if len(user_row) == 0:
        raise HTTPException(status_code=404, detail=f"User {user_id} không tồn tại")

    pref_vec     = dl.get_user_preference_dict(user_id)
    archetype    = user_row["archetype"].iloc[0] if "archetype" in user_row.columns else "unknown"
    pref_airline = user_row["preferred_airline"].iloc[0] if "preferred_airline" in user_row.columns else ""

    return {
        "user_id":           user_id,
        "archetype":         archetype,
        "preferred_airline": pref_airline,
        "preference_vector": {k: round(float(v), 3) for k, v in pref_vec.items()},
        "preference_labels": {
            "price_sensitivity":   "Nhạy cảm về giá",
            "duration_preference": "Thích bay ngắn",
            "stop_tolerance":      "Chấp nhận điểm dừng",
            "airline_loyalty":     "Trung thành hãng bay",
            "morning_preference":  "Thích bay buổi sáng",
            "business_class_pref": "Thích Business class",
        },
    }


@app.post("/search", tags=["Recommendation"])
def search_flights(req: SearchRequest):
    """Endpoint cũ — giữ nguyên để tương thích."""
    if req.user_id not in dl.users["user_id"].values:
        raise HTTPException(status_code=404, detail=f"User {req.user_id} không tồn tại")

    candidates = dl.get_candidates(
        origin=req.origin, destination=req.destination,
        seat_class=req.seat_class, max_stops=req.max_stops,
    )
    if len(candidates) == 0:
        raise HTTPException(status_code=404, detail=f"Không có chuyến bay từ {req.origin} đến {req.destination}")

    pref_vec     = dl.get_user_preference_vector(req.user_id)
    user_row     = dl.users[dl.users["user_id"] == req.user_id].iloc[0]
    pref_airline = user_row.get("preferred_airline", "") if hasattr(user_row, "get") else ""

    ranked       = _rank_candidates(candidates, pref_vec, pref_airline, req.top_k)
    explanations = explainer.explain_results(ranked, req.user_id)

    results = []
    for i, (exp, (_, row)) in enumerate(zip(explanations, ranked.iterrows())):
        results.append({
            "rank":   i + 1,
            "flight": _flight_to_dict(row),
            "explanation": {
                "summary":       exp.summary,
                "contributions": exp.contributions,
                "radar":         exp.radar,
            },
        })

    return {
        "query":            {"user_id": req.user_id, "origin": req.origin, "destination": req.destination},
        "total_candidates": len(candidates),
        "results":          results,
    }


@app.post("/search-by-vector", tags=["Recommendation"])
def search_by_vector(req: SearchByVectorRequest):
    """
    Rank chuyến bay dùng preference vector tính từ lịch sử booking thật.
    Node.js tính vector từ SQL Server rồi gửi thẳng vào đây —
    không cần user_id, không đụng users.csv.

    preference_vector: [
        price_sensitivity,    # 0=thích đắt, 1=thích rẻ
        duration_preference,  # mặc định 0.5
        stop_tolerance,       # mặc định 0.5
        airline_loyalty,      # 0=không trung thành, 1=rất trung thành
        morning_preference,   # 0=thích bay tối, 1=thích bay sáng
        business_class_pref,  # 0=economy, 1=business/first
    ]
    """
    if len(req.preference_vector) != 6:
        raise HTTPException(status_code=400, detail="preference_vector phải có đúng 6 phần tử")
 
    pref_vec = np.clip(np.array(req.preference_vector, dtype=np.float32), 0.0, 1.0)
 
    # 1. Candidate generation
    candidates = dl.get_candidates(
        origin=req.origin, destination=req.destination,
        seat_class=req.seat_class, max_stops=req.max_stops,
    )
    if len(candidates) == 0:
        raise HTTPException(
            status_code=404,
            detail=f"Không có chuyến bay từ {req.origin} đến {req.destination}"
        )
 
    # 2. Rank
    ranked = _rank_candidates(candidates, pref_vec, req.preferred_airline, req.top_k)
 
    # 3. Explain
    explanations = _explain_with_temp_user(ranked, pref_vec, req.preferred_airline)
 
    # 4. Build response
    results = []
    for i, (exp, (_, row)) in enumerate(zip(explanations, ranked.iterrows())):
        results.append({
            "rank":  i + 1,
            "flight": _flight_to_dict(row),
            "explanation": {
                "summary":       exp.summary,
                "contributions": exp.contributions,
                "radar":         exp.radar,
            },
        })
 
    return {
        "query": {
            "origin":            req.origin,
            "destination":       req.destination,
            "seat_class":        req.seat_class,
            "preferred_airline": req.preferred_airline,
        },
        # Chỉ trả về 4 chiều có dữ liệu thật — bỏ duration và stops
        "preference_used": {
            "price_sensitivity":   round(float(pref_vec[0]), 3),
            "airline_loyalty":     round(float(pref_vec[3]), 3),
            "morning_preference":  round(float(pref_vec[4]), 3),
            "business_class_pref": round(float(pref_vec[5]), 3),
        },
        "total_candidates": len(candidates),
        "results":          results,
    }


@app.post("/feedback", tags=["Personalization"])
def submit_feedback(req: FeedbackRequest):
    if req.action not in ("click", "book", "ignore"):
        raise HTTPException(status_code=400, detail="action phải là 'click', 'book', hoặc 'ignore'")

    pref_before = dl.get_user_preference_dict(req.user_id).copy()
    dl.update_user_preference(user_id=req.user_id, flight_id=req.flight_id, action=req.action)
    pref_after  = dl.get_user_preference_dict(req.user_id)

    delta = {k: round(float(pref_after[k]) - float(pref_before[k]), 4) for k in PREFERENCE_DIMS}

    return {
        "status":           "updated",
        "user_id":          req.user_id,
        "flight_id":        req.flight_id,
        "action":           req.action,
        "preference_delta": delta,
        "preference_now":   {k: round(float(v), 3) for k, v in pref_after.items()},
    }

@app.on_event("startup")
def debug_routes():
    print("\n[DEBUG] Các routes đã đăng ký:")
    for route in app.routes:
        print(f"  {route.methods} {route.path}")