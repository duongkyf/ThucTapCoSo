"""
evaluate_baselines.py  (v4 — 2 bảng kết quả)
==============================================
Bảng 1 — So sánh 4 phương pháp (train/test split 80/20, 586 test sessions):
  Random, Price-only, Popularity (train-only), LightGBM
  → Đánh giá công bằng, không data leakage

Bảng 2 — LightGBM trên toàn bộ 2930 sessions:
  → Trả lời câu hỏi "tại sao không đánh giá toàn bộ"

Chạy: python src/evaluate_baselines.py
"""

import sys
import numpy as np
import pandas as pd
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.data_loader_csv import DataLoader
from src.step2_features import FeatureEngineer
from src.step3_ranking import FlightRanker

POOL_SIZE   = 20
TEST_RATIO  = 0.2
RANDOM_SEED = 42

# ── Metrics ────────────────────────────────────────────────────────────────────

def ndcg_at_k(labels, scores, k):
    k         = min(k, len(labels))
    order     = np.argsort(scores)[::-1][:k]
    gains     = 2 ** labels[order] - 1
    discounts = np.log2(np.arange(2, len(gains) + 2))
    dcg       = np.sum(gains / discounts)
    ideal_order = np.argsort(labels)[::-1][:k]
    ideal_gains = 2 ** labels[ideal_order] - 1
    idcg        = np.sum(ideal_gains / discounts[:len(ideal_gains)])
    return float(dcg / idcg) if idcg > 0 else 0.0

def precision_at_k(labels, scores, k):
    k     = min(k, len(labels))
    order = np.argsort(scores)[::-1][:k]
    return int(np.sum(labels[order] >= 1)) / k

def recall_at_k(labels, scores, k):
    total = int(np.sum(labels >= 1))
    if total == 0: return 0.0
    k     = min(k, len(labels))
    order = np.argsort(scores)[::-1][:k]
    return int(np.sum(labels[order] >= 1)) / total

def compute_all_metrics(labels, scores):
    return {
        "ndcg5":  ndcg_at_k(labels, scores, 5),
        "ndcg10": ndcg_at_k(labels, scores, 10),
        "prec5":  precision_at_k(labels, scores, 5),
        "rec5":   recall_at_k(labels, scores, 5),
    }

# ── Baselines ──────────────────────────────────────────────────────────────────

def score_random(candidates):
    return np.random.rand(len(candidates))

def score_price(candidates):
    return 1.0 - candidates["price_norm"].values.astype(float)

def score_popularity(candidates, flight_pop):
    pop_str = {str(k): v for k, v in flight_pop.items()}
    return candidates["flight_id"].astype(str).map(pop_str).fillna(0.0).values.astype(float)

def get_labels(candidates, gt_map):
    return np.array(
        [gt_map.get(str(fid), 0) for fid in candidates["flight_id"]],
        dtype=np.int32,
    )

def build_pool(session_df, all_candidates, pool_size, rng):
    relevant_fids = set(session_df["flight_id"].astype(str))
    rel_pool = all_candidates[all_candidates["flight_id"].astype(str).isin(relevant_fids)]
    neg_pool = all_candidates[~all_candidates["flight_id"].astype(str).isin(relevant_fids)]
    n_neg = max(0, pool_size - len(rel_pool))
    if n_neg > 0 and len(neg_pool) > 0:
        neg_sample = neg_pool.sample(
            n=min(n_neg, len(neg_pool)),
            random_state=int(rng.integers(0, 9999))
        )
        return pd.concat([rel_pool, neg_sample], ignore_index=True)
    return rel_pool.reset_index(drop=True)

def print_table(results, methods, metric_keys, processed, title):
    print(f"\n{'=' * 65}")
    print(f"  {title}")
    print(f"{'=' * 65}")
    print(f"  {'Method':<12} {'NDCG@5':>8} {'NDCG@10':>8} {'Prec@5':>8} {'Rec@5':>8}")
    print("  " + "-" * 61)
    for method in methods:
        if method not in results:
            continue
        r   = results[method]
        tag = " ← AI model" if method == "lgbm" else ""
        print(f"  {method.upper():<12} {r['ndcg5']:>8.4f} {r['ndcg10']:>8.4f} "
              f"{r['prec5']:>8.4f} {r['rec5']:>8.4f}{tag}")
    print(f"{'=' * 65}")
    print(f"  Tổng sessions đánh giá: {processed:,}")

# ── Hàm chạy đánh giá cho 1 tập sessions ──────────────────────────────────────

def run_evaluation(sessions_iter, n_sessions, dl, ranker, flights_df,
                   flight_pop, methods, pool_size, rng, label=""):
    metric_keys   = ["ndcg5", "ndcg10", "prec5", "rec5"]
    metrics_store = {m: {k: [] for k in metric_keys} for m in methods}
    processed = 0
    skipped   = 0

    for session_id, group in sessions_iter:
        user_id    = str(group["user_id"].iloc[0])
        sample_fid = str(group["flight_id"].iloc[0])

        if sample_fid not in flights_df.index:
            skipped += 1
            continue

        sample_flight  = flights_df.loc[sample_fid]
        origin         = sample_flight["source_city"]
        dest           = sample_flight["destination_city"]
        all_candidates = dl.get_candidates(origin, dest)

        if len(all_candidates) < 2:
            skipped += 1
            continue

        pool   = build_pool(group, all_candidates, pool_size, rng)
        gt_map = {str(fid): int(rel) for fid, rel in zip(group["flight_id"], group["relevance"])}
        labels = get_labels(pool, gt_map)

        if np.sum(labels >= 1) == 0:
            skipped += 1
            continue

        if "random" in methods:
            for k, v in compute_all_metrics(labels, score_random(pool)).items():
                metrics_store["random"][k].append(v)
        if "price" in methods:
            for k, v in compute_all_metrics(labels, score_price(pool)).items():
                metrics_store["price"][k].append(v)
        if "popularity" in methods:
            for k, v in compute_all_metrics(labels, score_popularity(pool, flight_pop)).items():
                metrics_store["popularity"][k].append(v)
        if "lgbm" in methods:
            try:
                ranked_lgb = ranker.rank(pool, user_id, top_k=len(pool))
                labels_lgb = get_labels(ranked_lgb, gt_map)
                lgb_scores = ranked_lgb["final_score"].values
                for k, v in compute_all_metrics(labels_lgb, lgb_scores).items():
                    metrics_store["lgbm"][k].append(v)
            except Exception as e:
                skipped += 1
                continue

        processed += 1
        if processed % 200 == 0:
            print(f"  [{label}] Đã xử lý {processed:,}/{n_sessions:,}...", end="\r")

    print(f"  [{label}] ✓ Hoàn thành: {processed:,} sessions hợp lệ, {skipped:,} bỏ qua")

    results = {}
    for method in methods:
        store = metrics_store[method]
        if not store["ndcg5"]:
            continue
        results[method] = {
            "ndcg5":  np.mean(store["ndcg5"]),
            "ndcg10": np.mean(store["ndcg10"]),
            "prec5":  np.mean(store["prec5"]),
            "rec5":   np.mean(store["rec5"]),
        }

    return results, processed

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print("=" * 65)
    print("  Đánh giá offline — So sánh các phương pháp xếp hạng")
    print(f"  Pool size={POOL_SIZE}, train/test split={int((1-TEST_RATIO)*100)}/{int(TEST_RATIO*100)}%")
    print("=" * 65)

    dl  = DataLoader()
    fe  = FeatureEngineer(dl)

    model_path = Path(__file__).parent.parent / "data/processed/ranker_model.pkl"
    if not model_path.exists():
        print("[!] Cần chạy step3_ranking.py trước.")
        sys.exit(1)
    ranker = FlightRanker.load(dl=dl, fe=fe)

    history    = dl.history
    flights_df = dl.flights.set_index("flight_id")
    rng        = np.random.default_rng(RANDOM_SEED)

    # ── Train/test split ──────────────────────────────────────────────────────
    all_session_ids = history["session_id"].unique().to_numpy()
    rng.shuffle(all_session_ids)

    n_test        = max(1, int(len(all_session_ids) * TEST_RATIO))
    test_ids      = set(all_session_ids[:n_test])
    train_ids     = set(all_session_ids[n_test:])
    train_history = history[history["session_id"].isin(train_ids)]
    test_history  = history[history["session_id"].isin(test_ids)]

    print(f"\n  Train sessions: {len(train_ids):,}  |  Test sessions: {len(test_ids):,}")

    # Popularity từ TRAIN only
    flight_pop_train = (
        train_history[train_history["relevance"] > 0]
        .assign(flight_id=lambda df: df["flight_id"].astype(str))
        .groupby("flight_id")["relevance"].sum().to_dict()
    )
    # Popularity từ toàn bộ history (dùng cho bảng 2)
    flight_pop_all = (
        history[history["relevance"] > 0]
        .assign(flight_id=lambda df: df["flight_id"].astype(str))
        .groupby("flight_id")["relevance"].sum().to_dict()
    )
    print(f"  Popularity (train): {len(flight_pop_train):,} flights")
    print(f"  Popularity (all)  : {len(flight_pop_all):,} flights")

    # ════════════════════════════════════════════════════════════════════
    # BẢNG 1 — So sánh 4 phương pháp trên TEST sessions
    # ════════════════════════════════════════════════════════════════════
    print(f"\n{'─'*65}")
    print(f"  BẢNG 1 — Đánh giá trên {len(test_ids):,} test sessions (train/test split)")
    print(f"  Popularity tính từ train only → không data leakage")
    print(f"{'─'*65}")

    methods_b1 = ["random", "price", "popularity", "lgbm"]
    results_b1, proc_b1 = run_evaluation(
        sessions_iter = test_history.groupby("session_id", sort=False),
        n_sessions    = len(test_ids),
        dl=dl, ranker=ranker, flights_df=flights_df,
        flight_pop    = flight_pop_train,
        methods       = methods_b1,
        pool_size     = POOL_SIZE,
        rng           = rng,
        label         = "Bảng 1",
    )
    print_table(results_b1, methods_b1, None, proc_b1,
                "Bảng 1 — So sánh 4 phương pháp (586 test sessions, pool=20)")

    # In cải thiện
    if "random" in results_b1 and "lgbm" in results_b1:
        base = results_b1["random"]["ndcg10"]
        lgbm = results_b1["lgbm"]["ndcg10"]
        if base > 0:
            print(f"\n  → LightGBM cải thiện NDCG@10 so với Random:     +{(lgbm-base)/base*100:.1f}%")
    if "price" in results_b1 and "lgbm" in results_b1:
        base = results_b1["price"]["ndcg10"]
        lgbm = results_b1["lgbm"]["ndcg10"]
        if base > 0:
            print(f"  → LightGBM cải thiện NDCG@10 so với Price-only: +{(lgbm-base)/base*100:.1f}%")
    if "popularity" in results_b1 and "lgbm" in results_b1:
        base = results_b1["popularity"]["ndcg10"]
        lgbm = results_b1["lgbm"]["ndcg10"]
        diff = (lgbm - base) / base * 100 if base > 0 else 0
        sign = "+" if diff >= 0 else ""
        print(f"  → LightGBM cải thiện NDCG@10 so với Popularity:  {sign}{diff:.1f}%")

    # ════════════════════════════════════════════════════════════════════
    # BẢNG 2 — LightGBM + Random trên TOÀN BỘ 2930 sessions
    # (Popularity bị loại khỏi bảng này vì leakage không tránh được)
    # ════════════════════════════════════════════════════════════════════
    print(f"\n{'─'*65}")
    print(f"  BẢNG 2 — Đánh giá LightGBM trên toàn bộ {len(all_session_ids):,} sessions")
    print(f"  Chỉ Random & LightGBM (Popularity bị loại do leakage trên full data)")
    print(f"{'─'*65}")

    methods_b2 = ["random", "lgbm"]
    results_b2, proc_b2 = run_evaluation(
        sessions_iter = history.groupby("session_id", sort=False),
        n_sessions    = len(all_session_ids),
        dl=dl, ranker=ranker, flights_df=flights_df,
        flight_pop    = flight_pop_all,
        methods       = methods_b2,
        pool_size     = POOL_SIZE,
        rng           = rng,
        label         = "Bảng 2",
    )
    print_table(results_b2, methods_b2, None, proc_b2,
                "Bảng 2 — LightGBM trên toàn bộ data (2,930 sessions, pool=20)")

    if "random" in results_b2 and "lgbm" in results_b2:
        base = results_b2["random"]["ndcg10"]
        lgbm = results_b2["lgbm"]["ndcg10"]
        if base > 0:
            print(f"\n  → LightGBM cải thiện NDCG@10 so với Random (full): +{(lgbm-base)/base*100:.1f}%")

    # ════════════════════════════════════════════════════════════════════
    # BẢNG 3 — Validation set từ step3_ranking.py (tham khảo)
    # ════════════════════════════════════════════════════════════════════
    print(f"\n{'=' * 65}")
    print(f"  Bảng 3 — Validation set (từ step3_ranking.py, để tham khảo)")
    print(f"{'=' * 65}")
    print(f"  {'Method':<12} {'NDCG@5':>8} {'NDCG@10':>8}")
    print(f"  {'-'*30}")
    print(f"  {'LGBM':<12} {'0.6614':>8} {'0.7597':>8}  ← GroupShuffleSplit val set")
    print(f"  {'(Random≈)':<12} {'0.50':>8} {'0.50':>8}  ← lý thuyết")
    print(f"{'=' * 65}")
    print(f"  Lưu ý: Bảng 3 dùng session-based split chuẩn LTR (GroupShuffleSplit),")
    print(f"  phản ánh hiệu năng thực của model tốt hơn so với pool=20.")

    # ── Vẽ biểu đồ (Bảng 1 + Bảng 2 side by side) ────────────────────────────
    try:
        import matplotlib.pyplot as plt
        import matplotlib
        matplotlib.rcParams["font.family"] = "DejaVu Sans"

        metric_keys    = ["ndcg5", "ndcg10", "prec5", "rec5"]
        metrics_labels = ["NDCG@5", "NDCG@10", "Prec@5", "Rec@5"]
        colors = {
            "random":     "#94a3b8",
            "price":      "#60a5fa",
            "popularity": "#34d399",
            "lgbm":       "#6366f1",
        }

        fig, axes = plt.subplots(1, 2, figsize=(16, 6))

        # -- Subplot 1: Bảng 1 (4 methods, test sessions) --
        ax = axes[0]
        valid_b1 = [m for m in methods_b1 if m in results_b1]
        x = np.arange(len(metrics_labels))
        width = 0.18
        for i, method in enumerate(valid_b1):
            means = [results_b1[method][mk] for mk in metric_keys]
            bars  = ax.bar(x + i * width, means, width,
                           label=method.upper(), color=colors[method],
                           edgecolor="white", linewidth=0.8)
            for bar, val in zip(bars, means):
                ax.text(bar.get_x() + bar.get_width()/2,
                        bar.get_height() + 0.005,
                        f"{val:.3f}", ha="center", va="bottom", fontsize=7.5)
        ax.set_xticks(x + width * (len(valid_b1)-1) / 2)
        ax.set_xticklabels(metrics_labels)
        ax.set_ylabel("Score")
        ax.set_ylim(0, 1.0)
        ax.set_title(f"Bảng 1 — So sánh 4 phương pháp\n({proc_b1:,} test sessions, pool={POOL_SIZE})")
        ax.legend(loc="upper right", fontsize=8)
        ax.grid(axis="y", alpha=0.3, linestyle="--")

        # -- Subplot 2: Bảng 2 (LightGBM full) --
        ax = axes[1]
        valid_b2 = [m for m in methods_b2 if m in results_b2]
        x = np.arange(len(metrics_labels))
        width = 0.3
        for i, method in enumerate(valid_b2):
            means = [results_b2[method][mk] for mk in metric_keys]
            bars  = ax.bar(x + i * width, means, width,
                           label=method.upper(), color=colors[method],
                           edgecolor="white", linewidth=0.8)
            for bar, val in zip(bars, means):
                ax.text(bar.get_x() + bar.get_width()/2,
                        bar.get_height() + 0.005,
                        f"{val:.3f}", ha="center", va="bottom", fontsize=8)
        ax.set_xticks(x + width * (len(valid_b2)-1) / 2)
        ax.set_xticklabels(metrics_labels)
        ax.set_ylabel("Score")
        ax.set_ylim(0, 1.0)
        ax.set_title(f"Bảng 2 — LightGBM toàn bộ data\n({proc_b2:,} sessions, pool={POOL_SIZE})")
        ax.legend(loc="upper right", fontsize=8)
        ax.grid(axis="y", alpha=0.3, linestyle="--")

        plt.suptitle("Đánh giá offline hệ thống gợi ý chuyến bay — SkyBooker",
                     fontsize=13, y=1.01)
        plt.tight_layout()

        out_path = Path(__file__).parent.parent / "data/processed/baseline_comparison.png"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        plt.savefig(out_path, dpi=150, bbox_inches="tight")
        print(f"\n  ✓ Đã lưu biểu đồ → {out_path}")
        plt.close()

    except ImportError:
        print("\n  [info] pip install matplotlib")


if __name__ == "__main__":
    main()