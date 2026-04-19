"""
STEP 1B — Synthetic user & history generator
=============================================
Tạo dữ liệu giả lập người dùng và lịch sử hành vi đặt vé.

Logic:
  - Mỗi user có một "preference profile" ẩn (ground truth)
  - Simulate hành vi: user xem 5-15 chuyến/lần tìm kiếm
    → click 1-3 chuyến (relevance = 1)
    → book 0-1 chuyến (relevance = 2)
    → bỏ qua phần còn lại (relevance = 0)
  - Xác suất click/book phụ thuộc vào mức độ khớp
    giữa chuyến bay và preference của user

Cách dùng:
    python src/step1b_generate_users.py
    (Cần chạy step1_clean_flights.py trước)

Output:
    data/processed/users.csv
    data/processed/history.csv
"""

import pandas as pd
import numpy as np
import os
import random
import json

# ── Config ──────────────────────────────────────────────────────────────────
FLIGHTS_PATH = "data/processed/flights.csv"
USERS_OUT    = "data/processed/users.csv"
HISTORY_OUT  = "data/processed/history.csv"

N_USERS          = 300    # số user giả lập
SESSIONS_PER_USER = (5, 15)  # mỗi user có bao nhiêu phiên tìm kiếm
FLIGHTS_PER_SESSION = (5, 15)  # mỗi phiên xem bao nhiêu chuyến

RANDOM_SEED = 42

# ── Định nghĩa kiểu user ─────────────────────────────────────────────────────
# Mỗi archetype = phân phối xác suất cho từng preference dimension
USER_ARCHETYPES = {
    "budget_traveler": {
        "price_sensitivity":   (0.85, 0.08),   # (mean, std) — cao = thích rẻ
        "duration_preference": (0.45, 0.15),   # cao = thích bay ngắn
        "stop_tolerance":      (0.65, 0.15),   # cao = chấp nhận nhiều điểm dừng
        "airline_loyalty":     (0.20, 0.15),   # cao = trung thành hãng bay
        "morning_preference":  (0.40, 0.20),   # cao = thích bay sáng
        "business_class_pref": (0.05, 0.05),   # cao = thích business
    },
    "business_traveler": {
        "price_sensitivity":   (0.25, 0.15),
        "duration_preference": (0.80, 0.10),
        "stop_tolerance":      (0.15, 0.10),
        "airline_loyalty":     (0.75, 0.15),
        "morning_preference":  (0.70, 0.15),
        "business_class_pref": (0.75, 0.15),
    },
    "flexible_traveler": {
        "price_sensitivity":   (0.55, 0.20),
        "duration_preference": (0.55, 0.20),
        "stop_tolerance":      (0.50, 0.20),
        "airline_loyalty":     (0.45, 0.20),
        "morning_preference":  (0.50, 0.25),
        "business_class_pref": (0.30, 0.20),
    },
    "comfort_seeker": {
        "price_sensitivity":   (0.30, 0.15),
        "duration_preference": (0.70, 0.15),
        "stop_tolerance":      (0.20, 0.10),
        "airline_loyalty":     (0.60, 0.20),
        "morning_preference":  (0.55, 0.20),
        "business_class_pref": (0.60, 0.20),
    },
}

PREFERENCE_DIMS = list(list(USER_ARCHETYPES.values())[0].keys())


def clip01(x):
    return float(np.clip(x, 0.0, 1.0))


# ── 1. Tạo user profiles ─────────────────────────────────────────────────────
def generate_users(n: int, rng: np.random.Generator) -> pd.DataFrame:
    archetypes = list(USER_ARCHETYPES.keys())
    weights    = [0.35, 0.25, 0.25, 0.15]   # budget chiếm nhiều nhất

    records = []
    for i in range(n):
        archetype = rng.choice(archetypes, p=weights)
        params    = USER_ARCHETYPES[archetype]

        user = {"user_id": f"U{i:05d}", "archetype": archetype}
        # Preferred airline — pick ngẫu nhiên, dùng khi tính airline_affinity
        user["preferred_airline"] = rng.choice(
            ["IndiGo", "Air India", "Vistara", "GO_FIRST",
             "AirAsia", "SpiceJet"]
        )
        for dim, (mean, std) in params.items():
            user[dim] = clip01(rng.normal(mean, std))

        records.append(user)

    return pd.DataFrame(records)


# ── 2. Tính utility score (ground truth ẩn) ──────────────────────────────────
def compute_utility(flight: pd.Series, user: pd.Series) -> float:
    """
    Tính mức độ phù hợp thực sự giữa 1 chuyến bay và 1 user.
    Score ∈ [0, 1] — dùng để quyết định xác suất click/book.
    """
    score = 0.0
    weights_total = 0.0

    # 1. Giá — user nhạy cảm giá thích chuyến rẻ
    w = user["price_sensitivity"] * 1.5
    score += w * (1.0 - flight["price_norm"])
    weights_total += w

    # 2. Thời gian bay — thích bay ngắn
    w = user["duration_preference"] * 1.2
    score += w * (1.0 - flight["duration_norm"])
    weights_total += w

    # 3. Số điểm dừng — stop_tolerance thấp = ghét điểm dừng
    w = (1.0 - user["stop_tolerance"]) * 1.0
    stop_score = {0: 1.0, 1: 0.5, 2: 0.1}.get(int(flight["stops_num"]), 0.3)
    score += w * stop_score
    weights_total += w

    # 4. Hãng bay — airline loyalty
    w = user["airline_loyalty"] * 1.0
    airline_match = 1.0 if flight["airline"] == user["preferred_airline"] else 0.2
    score += w * airline_match
    weights_total += w

    # 5. Giờ bay — morning preference
    w = 0.6
    dep_slot = int(flight.get("dep_slot", 2))
    # slot 0 (Early Morning) và 1 (Morning) là "sáng"
    is_morning = 1.0 if dep_slot in [0, 1] else 0.2
    morning_score = user["morning_preference"] * is_morning + (1 - user["morning_preference"]) * (1 - is_morning)
    score += w * morning_score
    weights_total += w

    # 6. Hạng ghế
    w = 0.8
    if flight["is_business"] == 1:
        seat_score = user["business_class_pref"]
    else:
        seat_score = 1.0 - user["business_class_pref"]
    score += w * seat_score
    weights_total += w

    return score / weights_total if weights_total > 0 else 0.5


# ── 3. Simulate hành vi từng phiên ───────────────────────────────────────────
def simulate_sessions(
    users: pd.DataFrame,
    flights: pd.DataFrame,
    rng: np.random.Generator,
) -> pd.DataFrame:

    # Lấy các cặp tuyến bay có trong dataset
    routes = (
        flights[["source_city", "destination_city"]]
        .drop_duplicates()
        .values.tolist()
    )

    records = []
    session_id = 0

    for _, user in users.iterrows():
        n_sessions = int(rng.integers(*SESSIONS_PER_USER))

        for _ in range(n_sessions):
            # Chọn 1 tuyến ngẫu nhiên cho phiên này
            origin, dest = routes[rng.integers(len(routes))]

            # Lấy pool chuyến cho tuyến này
            pool = flights[
                (flights["source_city"] == origin) &
                (flights["destination_city"] == dest)
            ]
            if len(pool) == 0:
                continue

            # Sample các chuyến được hiển thị cho user
            n_shown = min(int(rng.integers(*FLIGHTS_PER_SESSION)), len(pool))
            shown = pool.sample(n=n_shown, random_state=int(rng.integers(9999)))

            # Với mỗi chuyến: tính utility → quyết định hành vi
            utilities = shown.apply(lambda f: compute_utility(f, user), axis=1).values

            # Xác suất click = sigmoid(utility × 6 - 3)  → cao khi utility > 0.5
            prob_click = 1 / (1 + np.exp(-(utilities * 6 - 3)))

            booked_one = False
            for idx, (fid, util, p_click) in enumerate(
                zip(shown["flight_id"], utilities, prob_click)
            ):
                rand_val = rng.random()

                if rand_val < p_click:
                    # Click xảy ra
                    # Booking: xác suất = p_click × 0.3 (chỉ book 1 chuyến/session)
                    if not booked_one and rng.random() < p_click * 0.35:
                        action    = "book"
                        relevance = 2
                        booked_one = True
                    else:
                        action    = "click"
                        relevance = 1
                else:
                    action    = "ignore"
                    relevance = 0

                records.append({
                    "session_id":       f"S{session_id:08d}",
                    "user_id":          user["user_id"],
                    "flight_id":        fid,
                    "origin":           origin,
                    "destination":      dest,
                    "action":           action,
                    "relevance":        relevance,
                    "utility_gt":       round(float(util), 4),   # ground truth (chỉ dùng để debug)
                    "position_shown":   idx,                      # thứ tự hiển thị
                })

            session_id += 1

    return pd.DataFrame(records)


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    rng = np.random.default_rng(RANDOM_SEED)
    random.seed(RANDOM_SEED)

    os.makedirs("data/processed", exist_ok=True)

    # Load flights
    if not os.path.exists(FLIGHTS_PATH):
        print(f"[!] Cần chạy step1_clean_flights.py trước để có {FLIGHTS_PATH}")
        return

    print(f"[1/3] Load flight data...")
    flights = pd.read_csv(FLIGHTS_PATH)
    print(f"      → {len(flights):,} chuyến bay")

    # Generate users
    print(f"[2/3] Generate {N_USERS} synthetic users...")
    users = generate_users(N_USERS, rng)
    users.to_csv(USERS_OUT, index=False)
    print(f"      → Lưu {USERS_OUT}")
    print(f"      Phân bổ archetype: {users['archetype'].value_counts().to_dict()}")

    # Simulate history
    print(f"[3/3] Simulate hành vi người dùng...")
    history = simulate_sessions(users, flights, rng)
    history.to_csv(HISTORY_OUT, index=False)

    # Thống kê
    total    = len(history)
    clicks   = (history["action"] == "click").sum()
    bookings = (history["action"] == "book").sum()
    ignores  = (history["action"] == "ignore").sum()

    print(f"\n✓ Đã lưu {HISTORY_OUT}")
    print(f"\n── Thống kê history ────────────────────────────")
    print(f"  Tổng interactions : {total:,}")
    print(f"  Book              : {bookings:,}  ({bookings/total*100:.1f}%)")
    print(f"  Click             : {clicks:,}  ({clicks/total*100:.1f}%)")
    print(f"  Ignore            : {ignores:,}  ({ignores/total*100:.1f}%)")
    print(f"  Số sessions       : {history['session_id'].nunique():,}")
    print(f"  Avg interactions/user: {total / N_USERS:.0f}")


if __name__ == "__main__":
    main()