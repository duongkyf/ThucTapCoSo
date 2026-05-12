"""
quick_eval.py — Đánh giá nhanh (~10-30s) để tinh chỉnh hyperparameters
Usage: python src/quick_eval.py [--n 150] [--debug]
"""

import sys, argparse, time
import numpy as np
import pandas as pd
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.data_loader_csv import DataLoader
from src.step2_features  import FeatureEngineer
from src.step3_ranking   import FlightRanker

N_QUICK   = 150
POOL_SIZE = 20

def ndcg(labels, scores, k):
    k = min(k, len(labels))
    order = np.argsort(scores)[::-1][:k]
    gains = 2 ** labels[order] - 1
    disc  = np.log2(np.arange(2, len(gains) + 2))
    dcg   = (gains / disc).sum()
    ig    = 2 ** np.sort(labels)[::-1][:k] - 1
    idcg  = (ig / disc[:len(ig)]).sum()
    return float(dcg / idcg) if idcg > 0 else 0.0

def mrr(labels, scores):
    for rank, i in enumerate(np.argsort(scores)[::-1], 1):
        if labels[i] >= 1: return 1.0 / rank
    return 0.0

def build_pool(sdf, cands, size, rng):
    rel = set(sdf["flight_id"].astype(str))
    rp  = cands[cands["flight_id"].astype(str).isin(rel)]
    np_ = cands[~cands["flight_id"].astype(str).isin(rel)]
    n   = max(0, size - len(rp))
    if n > 0 and len(np_) > 0:
        ns = np_.sample(n=min(n, len(np_)), random_state=int(rng.integers(9999)))
        return pd.concat([rp, ns], ignore_index=True)
    return rp.reset_index(drop=True)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--n",     type=int,  default=N_QUICK)
    parser.add_argument("--seed",  type=int,  default=42)
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    t0  = time.time()
    rng = np.random.default_rng(args.seed)

    print("── Quick Eval ──────────────────────────────────")
    dl     = DataLoader()
    fe     = FeatureEngineer(dl)
    ranker = FlightRanker.load(dl=dl, fe=fe)

    history    = dl.history[dl.history["relevance"].isin([0, 1])].copy()
    flights_df = dl.flights.set_index("flight_id")

    # ── [A] Feature importance ────────────────────────────────────────────────
    print("\n[A] Feature Importance (top 10) ───────────────")
    imp   = ranker.model.feature_importance(importance_type="gain")
    total = max(imp.sum(), 1e-9)
    pairs = sorted(zip(ranker.feature_names, imp), key=lambda x: x[1], reverse=True)
    for name, v in pairs[:10]:
        pct = v / total * 100
        bar = "█" * int(pct / 4)
        print(f"  {name:<28} {bar:<12} {pct:5.1f}%")
    price_imp = dict(pairs).get("price_norm", 0) / total * 100
    if price_imp < 0.5:
        print(f"  ⚠️  price_norm = {price_imp:.1f}% — xem [D]")

    # ── [B] Pool=20 nhanh ────────────────────────────────────────────────────
    print(f"\n[B] Pool={POOL_SIZE}, {args.n} sessions ──────────────────")
    all_sess = history["session_id"].unique()
    rng2     = np.random.default_rng(args.seed + 1)
    chosen   = set(rng2.choice(all_sess, size=min(args.n, len(all_sess)), replace=False))
    sub      = history[history["session_id"].isin(chosen)]

    m_lgbm = {"ndcg5":[], "ndcg10":[], "mrr":[]}
    m_rand = {"ndcg5":[], "ndcg10":[], "mrr":[]}
    ok = skip_cand = skip_label = skip_err = 0
    skip_log = []

    for sid, sdf in sub.groupby("session_id", sort=False):
        uid  = str(sdf["user_id"].iloc[0])
        fid0 = str(sdf["flight_id"].iloc[0])
        if fid0 not in flights_df.index:
            skip_cand += 1
            skip_log.append((sid, "flight_not_found", fid0)); continue
        fl    = flights_df.loc[fid0]
        cands = dl.get_candidates(fl["source_city"], fl["destination_city"])
        if len(cands) < 2:
            skip_cand += 1
            skip_log.append((sid, "too_few_candidates", len(cands))); continue
        pool  = build_pool(sdf, cands, POOL_SIZE, rng)
        gt    = {str(f): int(r) for f, r in zip(sdf["flight_id"], sdf["relevance"])}
        labs  = np.array([gt.get(str(f), 0) for f in pool["flight_id"]], dtype=np.int32)
        if labs.sum() == 0:
            skip_label += 1
            skip_log.append((sid, "no_positive_in_pool", int(labs.sum()))); continue
        try:
            ranked = ranker.rank(pool, uid, top_k=len(pool))
            ll     = np.array([gt.get(str(f), 0) for f in ranked["flight_id"]], dtype=np.int32)
            m_lgbm["ndcg5"].append(ndcg(ll, ranked["final_score"].values, 5))
            m_lgbm["ndcg10"].append(ndcg(ll, ranked["final_score"].values, 10))
            m_lgbm["mrr"].append(mrr(ll, ranked["final_score"].values))
            rand_s = rng.random(len(labs))
            m_rand["ndcg5"].append(ndcg(labs, rand_s, 5))
            m_rand["ndcg10"].append(ndcg(labs, rand_s, 10))
            m_rand["mrr"].append(mrr(labs, rand_s))
            ok += 1
        except Exception as e:
            skip_err += 1
            skip_log.append((sid, "error", str(e))); continue

    print(f"  OK={ok}  skip(no_cand={skip_cand}, no_label={skip_label}, err={skip_err})")
    if ok > 0:
        print(f"\n  {'Method':<10} {'NDCG@5':>7} {'NDCG@10':>8} {'MRR':>7}")
        print(f"  {'-'*36}")
        for name, m in [("RANDOM", m_rand), ("LGBM", m_lgbm)]:
            print(f"  {name:<10} {np.mean(m['ndcg5']):>7.4f} {np.mean(m['ndcg10']):>8.4f} {np.mean(m['mrr']):>7.4f}")
        delta = ((np.mean(m_lgbm["ndcg10"]) - np.mean(m_rand["ndcg10"]))
                 / max(np.mean(m_rand["ndcg10"]), 1e-9) * 100)
        print(f"\n  LGBM vs Random NDCG@10: {delta:+.1f}%")

    # ── [D] Debug price_norm ──────────────────────────────────────────────────
    if args.debug or price_imp < 0.5:
        print(f"\n[D] Debug price_norm ───────────────────────────")
        prices = dl.flights["price"]
        pnorm  = dl.flights["price_norm"]
        print(f"  price (raw)  : min={prices.min():.0f}  max={prices.max():.0f}  mean={prices.mean():.0f}")
        print(f"  price_norm   : min={pnorm.min():.4f}  max={pnorm.max():.4f}  mean={pnorm.mean():.4f}")

        if pnorm.max() < 0.01:
            print(f"\n  ⚠️  NGUYÊN NHÂN: PRICE_MIN/MAX không khớp data!")
            print(f"     data_loader dùng: PRICE_MIN={500_000:,}  PRICE_MAX={9_000_000:,}")
            print(f"     Giá thực tế     : {int(prices.min())}  –  {int(prices.max())}")
            print(f"\n  ✅ FIX: Sửa data_loader_csv.py:")
            print(f"     PRICE_MIN = {int(prices.min() * 0.95)}")
            print(f"     PRICE_MAX = {int(prices.max() * 1.05)}")

        print(f"\n  Price variance trong pool (5 sessions mẫu):")
        for sid in history["session_id"].unique()[:5]:
            sdf  = history[history["session_id"] == sid]
            fid0 = str(sdf["flight_id"].iloc[0])
            if fid0 not in flights_df.index: continue
            fl    = flights_df.loc[fid0]
            cands = dl.get_candidates(fl["source_city"], fl["destination_city"])
            pool  = build_pool(sdf, cands, POOL_SIZE, rng)
            raw_p = pool["price"].values if "price" in pool.columns else np.array([])
            pn    = pool["price_norm"].values
            booked_fids = sdf[sdf["relevance"] == 1]["flight_id"].values
            bp = next((flights_df.loc[f, "price"] for f in booked_fids if f in flights_df.index), None)
            bp_str = f"{bp:.0f}" if bp is not None else "N/A"
            print(f"    {sid}: price_raw std={np.std(raw_p):.0f}  "
                  f"price_norm std={pn.std():.4f}  booked_price={bp_str}")

    # ── [E] Debug skip ────────────────────────────────────────────────────────
    if args.debug and skip_log:
        print(f"\n[E] Skip reasons (top 10) ──────────────────────")
        for sid, reason, detail in skip_log[:10]:
            print(f"  {sid}: {reason} ({detail})")

    print(f"\n── Done: {time.time()-t0:.1f}s ─────────────────────────────")

if __name__ == "__main__":
    main()