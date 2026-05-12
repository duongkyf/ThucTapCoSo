import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
import pandas as pd
from src.data_loader_csv import DataLoader

dl      = DataLoader()
history = dl.history[dl.history["relevance"] == 1]
flights = dl.flights.set_index("flight_id")

for sid in history["session_id"].unique()[:5]:
    sdf  = history[history["session_id"] == sid]
    uid  = str(sdf["user_id"].iloc[0])
    fid  = str(sdf["flight_id"].iloc[0])
    if fid not in flights.index: continue
    fl   = flights.loc[fid]
    cands = dl.get_candidates(fl["source_city"], fl["destination_city"])
    if len(cands) == 0: continue

    users_idx = dl.users.set_index("user_id")
    user      = users_idx.loc[uid]
    pref_vec  = dl.get_user_preference_vector(uid)
    price_sens, dur_pref, stop_tol, airline_loy, morning_pref, biz_pref = pref_vec

    scores = np.zeros(len(cands), dtype=np.float64)
    scores += (1.0 - cands["price_norm"].values) * price_sens * 2.5
    preferred = str(user.get("preferred_airline", "") or "")
    if preferred:
        scores += (cands["airline"] == preferred).values.astype(float) * airline_loy * 2.0
    dep_slot   = cands["dep_slot"].values.astype(float)
    ideal_slot = (1.0 - morning_pref) * 4.0
    scores    += (1.0 - np.abs(dep_slot - ideal_slot) / 4.0) * (abs(morning_pref - 0.5) * 2.0) * 1.5
    stops_norm = cands["stops_num"].values / 2.0
    scores    += (1.0 - np.abs(stops_norm - stop_tol)) * 1.2
    is_biz     = cands["is_business"].values.astype(float)
    scores    += (biz_pref * is_biz + (1.0 - biz_pref) * (1.0 - is_biz)) * (abs(biz_pref - 0.5) * 2.0) * 1.5

    rank_arr = np.argsort(scores)[::-1]
    gt_pos   = cands[cands["flight_id"].astype(str) == fid].index
    if len(gt_pos) == 0: continue
    gt_iloc  = cands.index.get_loc(gt_pos[0])
    gt_rank  = int(np.where(rank_arr == gt_iloc)[0][0]) + 1
    gt_row   = cands.iloc[gt_iloc]
    score_300 = scores[rank_arr[min(299, len(rank_arr)-1)]]

    print(f"\n{sid} uid={uid} pref_airline={preferred}")
    print(f"  pref: price_sens={price_sens:.2f} stop_tol={stop_tol:.2f} morning={morning_pref:.2f} airline_loy={airline_loy:.2f}")
    print(f"  booked: {fid} airline={gt_row['airline']} price_norm={gt_row['price_norm']:.4f} stops={gt_row['stops_num']} slot={gt_row['dep_slot']}")
    print(f"  rank={gt_rank}/{len(cands)}  score_booked={scores[gt_iloc]:.4f}  score@300={score_300:.4f}  gap={scores[gt_iloc]-score_300:+.4f}")
    top5 = cands.iloc[rank_arr[:5]][["airline","price_norm","stops_num","dep_slot","is_business"]]
    top5["score"] = scores[rank_arr[:5]]
    print(f"  top-5:\n{top5.to_string(index=False)}")