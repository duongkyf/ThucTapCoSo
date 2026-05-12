"""
STEP 1B — Synthetic user & history generator (binary: book / ignore)
=====================================================================
- Bỏ hoàn toàn nhãn click (relevance=1)
- Chỉ giữ: book (relevance=1) và ignore (relevance=0)
- Mỗi session: 30–50 candidates
- 1 positive duy nhất (relevance=1) — chuyến tốt nhất nếu utility > 0.6
- Hard negatives: top-5 kế tiếp bị gán ignore (utility cao nhưng không chọn)
- Còn lại: ignore theo xác suất dựa trên utility
"""

import pandas as pd
import numpy as np
import os
import random

# ── Config ───────────────────────────────────────────────────────────────────
FLIGHTS_PATH            = "data/processed/flights.csv"
USERS_OUT               = "data/processed/users.csv"
HISTORY_OUT             = "data/processed/history.csv"

N_USERS                 = 300
SESSIONS_PER_USER       = (7, 12)       # tăng nhẹ để bù mất click
CANDIDATES_PER_SESSION  = (30, 50)
N_HARD_NEGATIVES        = 5
BOOK_THRESHOLD          = 0.60          # utility tối thiểu để book
BOOK_PROB               = 0.85          # xác suất book nếu utility > threshold

RANDOM_SEED = 42

# ── User archetypes ──────────────────────────────────────────────────────────
USER_ARCHETYPES = {
    "budget_traveler": {
        "price_sensitivity":   (0.85, 0.08),
        "duration_preference": (0.45, 0.15),
        "stop_tolerance":      (0.65, 0.15),
        "airline_loyalty":     (0.20, 0.15),
        "morning_preference":  (0.40, 0.20),
        "business_class_pref": (0.05, 0.05),
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


def generate_users(n: int, rng: np.random.Generator) -> pd.DataFrame:
    archetypes = list(USER_ARCHETYPES.keys())
    weights    = [0.35, 0.25, 0.25, 0.15]
    records    = []
    for i in range(n):
        archetype = rng.choice(archetypes, p=weights)
        params    = USER_ARCHETYPES[archetype]
        user = {"user_id": f"U{i:05d}", "archetype": archetype}
        user["preferred_airline"] = rng.choice(
            ["IndiGo", "Air India", "Vistara", "GO_FIRST", "AirAsia", "SpiceJet"]
        )
        for dim, (mean, std) in params.items():
            user[dim] = clip01(rng.normal(mean, std))
        records.append(user)
    return pd.DataFrame(records)


def compute_utility(flight: pd.Series, user: pd.Series) -> float:
    score, w_total = 0.0, 0.0

    w = user["price_sensitivity"] * 1.5
    score   += w * (1.0 - flight["price_norm"]); w_total += w

    w = user["duration_preference"] * 1.2
    score   += w * (1.0 - flight["duration_norm"]); w_total += w

    w = (1.0 - user["stop_tolerance"]) * 1.0
    stop_score = {0: 1.0, 1: 0.5, 2: 0.1}.get(int(flight["stops_num"]), 0.3)
    score   += w * stop_score; w_total += w

    w = user["airline_loyalty"] * 1.0
    airline_match = 1.0 if flight["airline"] == user["preferred_airline"] else 0.2
    score   += w * airline_match; w_total += w

    w = 0.6
    dep_slot   = int(flight.get("dep_slot", 2))
    is_morning = 1.0 if dep_slot in [0, 1] else 0.2
    morning_score = (user["morning_preference"] * is_morning
                     + (1 - user["morning_preference"]) * (1 - is_morning))
    score   += w * morning_score; w_total += w

    w = 0.8
    seat_score = (user["business_class_pref"] if flight["is_business"] == 1
                  else 1.0 - user["business_class_pref"])
    score   += w * seat_score; w_total += w

    return score / w_total if w_total > 0 else 0.5


def simulate_sessions(users: pd.DataFrame, flights: pd.DataFrame,
                      rng: np.random.Generator) -> pd.DataFrame:
    routes     = flights[["source_city", "destination_city"]].drop_duplicates().values.tolist()
    records    = []
    session_id = 0

    for _, user in users.iterrows():
        n_sessions = int(rng.integers(*SESSIONS_PER_USER))
        for _ in range(n_sessions):
            origin, dest = routes[rng.integers(len(routes))]
            pool = flights[
                (flights["source_city"] == origin) &
                (flights["destination_city"] == dest)
            ]
            if len(pool) == 0:
                continue

            n_cand     = min(int(rng.integers(*CANDIDATES_PER_SESSION)), len(pool))
            candidates = pool.sample(n=n_cand, random_state=int(rng.integers(9999)))
            utilities  = candidates.apply(lambda f: compute_utility(f, user), axis=1).values

            sorted_idx = np.argsort(utilities)[::-1]
            best_idx   = sorted_idx[0]
            best_util  = utilities[best_idx]
            will_book  = (best_util > BOOK_THRESHOLD) and (rng.random() < BOOK_PROB)

            # Hard negatives: top-5 kế tiếp có utility > threshold
            hard_neg_set = set()
            for idx in sorted_idx[1: 1 + N_HARD_NEGATIVES]:
                if utilities[idx] > BOOK_THRESHOLD:
                    hard_neg_set.add(idx)

            for pos, (fid, util) in enumerate(zip(candidates["flight_id"], utilities)):
                if pos == best_idx and will_book:
                    action, relevance = "book", 1       # ← binary: book=1
                else:
                    action, relevance = "ignore", 0     # ← binary: ignore=0

                records.append({
                    "session_id":     f"S{session_id:08d}",
                    "user_id":        user["user_id"],
                    "flight_id":      fid,
                    "origin":         origin,
                    "destination":    dest,
                    "action":         action,
                    "relevance":      relevance,
                    "utility_gt":     round(float(util), 4),
                    "position_shown": pos,
                })
            session_id += 1
            if session_id % 200 == 0:
                print(f"  Generated {session_id} sessions...", end="\r")

    return pd.DataFrame(records)


def main():
    rng = np.random.default_rng(RANDOM_SEED)
    random.seed(RANDOM_SEED)
    os.makedirs("data/processed", exist_ok=True)

    if not os.path.exists(FLIGHTS_PATH):
        print(f"[!] Cần chạy step1_clean_flights.py trước.")
        return

    print("[1/4] Load flight data...")
    flights = pd.read_csv(FLIGHTS_PATH)
    print(f"      → {len(flights):,} chuyến bay")

    print(f"[2/4] Generate {N_USERS} users...")
    users = generate_users(N_USERS, rng)
    print(f"      Archetypes: {users['archetype'].value_counts().to_dict()}")

    print("[3/4] Simulate sessions (binary: book=1 / ignore=0)...")
    history = simulate_sessions(users, flights, rng)

    print("[4/4] Infer preferred_airline từ booking history...")
    flights_info = flights.set_index("flight_id")[["airline"]]
    bookings     = history[history["relevance"] == 1]
    if len(bookings) > 0:
        bwa = bookings.merge(flights_info, left_on="flight_id", right_index=True)
        top = bwa.groupby("user_id")["airline"].agg(
            lambda x: x.value_counts().index[0]
        ).to_dict()
        for uid, airline in top.items():
            users.loc[users["user_id"] == uid, "preferred_airline"] = airline
        print(f"      → Cập nhật {len(top)} users")

    users.to_csv(USERS_OUT, index=False)
    history.to_csv(HISTORY_OUT, index=False)

    total    = len(history)
    n_book   = (history["action"] == "book").sum()
    n_ignore = (history["action"] == "ignore").sum()
    n_sess   = history["session_id"].nunique()
    print(f"\n✓ Lưu {USERS_OUT} và {HISTORY_OUT}")
    print(f"\n── Thống kê ────────────────────────────────────")
    print(f"  Tổng interactions : {total:,}")
    print(f"  Book   (label=1)  : {n_book:,}  ({n_book/total*100:.1f}%)")
    print(f"  Ignore (label=0)  : {n_ignore:,}  ({n_ignore/total*100:.1f}%)")
    print(f"  Sessions          : {n_sess:,}")
    print(f"  Pos/Neg ratio     : 1:{n_ignore//max(n_book,1)}")


if __name__ == "__main__":
    main()