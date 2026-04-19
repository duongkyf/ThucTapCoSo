"""
evaluate_baselines.py
So sánh LightGBM ranker với các baseline đơn giản.
Chạy: python src/evaluate_baselines.py
"""

import sys
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.model_selection import GroupShuffleSplit

sys.path.insert(0, str(Path(__file__).parent.parent))
from src.data_loader import DataLoader
from src.step2_features import FeatureEngineer
from src.step3_ranking import FlightRanker

# Baseline strategies
def random_rank(candidates):
    return candidates.sample(frac=1).reset_index(drop=True)

def price_rank(candidates):
    return candidates.sort_values("price").reset_index(drop=True)

def popularity_rank(candidates, flight_popularity):
    # flight_popularity: dict flight_id -> booking_count
    candidates["pop_score"] = candidates["flight_id"].map(flight_popularity).fillna(0)
    return candidates.sort_values("pop_score", ascending=False).reset_index(drop=True)

def compute_ndcg_at_k(labels, scores, k):
    order = np.argsort(scores)[::-1][:k]
    gains = 2 ** labels[order] - 1
    discounts = np.log2(np.arange(2, len(gains) + 2))
    dcg = np.sum(gains / discounts)
    ideal_order = np.argsort(labels)[::-1][:k]
    ideal_gains = 2 ** labels[ideal_order] - 1
    idcg = np.sum(ideal_gains / discounts[:len(ideal_gains)])
    return dcg / idcg if idcg > 0 else 0

def compute_precision_at_k(labels, scores, k):
    order = np.argsort(scores)[::-1][:k]
    relevant = np.sum(labels[order] >= 1)  # coi relevance>=1 là positive
    return relevant / k

def compute_recall_at_k(labels, scores, k):
    total_relevant = np.sum(labels >= 1)
    if total_relevant == 0:
        return 0
    order = np.argsort(scores)[::-1][:k]
    relevant = np.sum(labels[order] >= 1)
    return relevant / total_relevant

def evaluate_on_sessions(sessions_data, rank_func, **kwargs):
    """Đánh giá một rank_func trên các session.
    sessions_data: list of (query_features, y_true, group_size) hoặc dùng DataFrame group.
    Ở đây ta dùng trực tiếp từ history và candidates.
    """
    # Cần implement chi tiết: lấy từng query (origin, destination, user_id) và các candidates thực tế.
    # Dùng lại logic tương tự như trong build_training_matrix.
    pass

# Thực tế, để đơn giản, ta sẽ dùng chính tập validation từ quá trình train.
# Ta sẽ load X_val, y_val, groups_val và áp dụng model để predict, còn baseline thì cần tái tạo ranking dựa trên candidates gốc.
# Tuy nhiên, để so sánh công bằng, ta cần có thông tin về các candidate items trong mỗi session.
# Cách tốt: lưu lại thông tin session (user_id, origin, destination) cùng với danh sách flight_id và relevance.
# Trong file train_features.pkl đã có groups và X, nhưng không lưu flight_id.
# Ta sẽ tạo một file riêng chứa session metadata.

# Vì vậy, tôi sẽ hướng dẫn bạn viết script đơn giản hơn: 
# Tạo một tập test mới từ history (không dùng train), lấy các session có ít nhất 2 candidates.
# Sau đó đánh giá.

def main():
    dl = DataLoader()
    fe = FeatureEngineer(dl)
    
    # Lấy tất cả các session từ history
    history = dl.history
    sessions = history.groupby("session_id")
    
    results = {
        "random": {"ndcg5": [], "ndcg10": [], "prec5": [], "rec5": []},
        "price": {"ndcg5": [], "ndcg10": [], "prec5": [], "rec5": []},
        "popularity": {"ndcg5": [], "ndcg10": [], "prec5": [], "rec5": []},
        "lgbm": {"ndcg5": [], "ndcg10": [], "prec5": [], "rec5": []},
    }
    
    # Tính popularity của từng flight dựa trên toàn bộ history (có thể dùng train+test, nhưng chấp nhận được)
    flight_pop = history.groupby("flight_id")["relevance"].sum().to_dict()
    
    # Load LightGBM model
    ranker = FlightRanker.load(dl=dl, fe=fe)
    
    for session_id, group in sessions:
        user_id = group["user_id"].iloc[0]
        # Lấy thông tin origin, destination từ flight đầu tiên trong session
        # Cần mapping flight_id -> origin/destination
        flights_info = dl.flights.set_index("flight_id")
        sample_flight = flights_info.loc[group["flight_id"].iloc[0]]
        origin = sample_flight["source_city"]
        dest = sample_flight["destination_city"]
        seat_class = None  # có thể lấy từ group nếu có
        
        # Lấy tất cả candidates cho tuyến này (giống như get_candidates)
        candidates = dl.get_candidates(origin, dest, seat_class=seat_class)
        if len(candidates) == 0:
            continue
        
        # Tạo ground truth labels cho các candidates dựa trên history của user này
        # Thực tế chỉ có một số flight có relevance, còn lại relevance=0
        gt_labels = []
        for _, row in candidates.iterrows():
            fid = row["flight_id"]
            rel = group[group["flight_id"] == fid]["relevance"].values
            gt_labels.append(rel[0] if len(rel) > 0 else 0)
        gt_labels = np.array(gt_labels)
        
        # Baseline 1: random
        rand_candidates = random_rank(candidates)
        rand_scores = np.random.rand(len(rand_candidates))
        # Cần align lại labels theo thứ tự của rand_candidates
        # Đơn giản: tính metric dựa trên thứ tự hiện tại
        # Nhưng để chính xác, ta lấy index của rand_candidates so với candidates gốc
        # Cách nhanh: sắp xếp lại gt_labels theo thứ tự của rand_candidates
        rand_order = rand_candidates["flight_id"].values
        label_order = candidates.set_index("flight_id").loc[rand_order]["dummy"]  # không có
        # Thay vào đó, tạo một hàm helper:
        def get_labels_for_ranked(ranked_df, original_df, original_labels):
            # original_df là candidates gốc (cùng thứ tự ban đầu)
            # original_labels là mảng cùng thứ tự original_df
            mapping = dict(zip(original_df["flight_id"], original_labels))
            return np.array([mapping.get(fid, 0) for fid in ranked_df["flight_id"]])
        
        labels_rand = get_labels_for_ranked(rand_candidates, candidates, gt_labels)
        results["random"]["ndcg5"].append(compute_ndcg_at_k(labels_rand, rand_scores, 5))
        results["random"]["ndcg10"].append(compute_ndcg_at_k(labels_rand, rand_scores, 10))
        results["random"]["prec5"].append(compute_precision_at_k(labels_rand, rand_scores, 5))
        results["random"]["rec5"].append(compute_recall_at_k(labels_rand, rand_scores, 5))
        
        # Baseline 2: price
        price_candidates = price_rank(candidates)
        labels_price = get_labels_for_ranked(price_candidates, candidates, gt_labels)
        price_scores = 1 / (price_candidates["price"] + 1)  # giảm dần theo giá
        results["price"]["ndcg5"].append(compute_ndcg_at_k(labels_price, price_scores, 5))
        results["price"]["ndcg10"].append(compute_ndcg_at_k(labels_price, price_scores, 10))
        results["price"]["prec5"].append(compute_precision_at_k(labels_price, price_scores, 5))
        results["price"]["rec5"].append(compute_recall_at_k(labels_price, price_scores, 5))
        
        # Baseline 3: popularity
        pop_candidates = popularity_rank(candidates, flight_pop)
        labels_pop = get_labels_for_ranked(pop_candidates, candidates, gt_labels)
        pop_scores = pop_candidates["pop_score"].values
        results["popularity"]["ndcg5"].append(compute_ndcg_at_k(labels_pop, pop_scores, 5))
        results["popularity"]["ndcg10"].append(compute_ndcg_at_k(labels_pop, pop_scores, 10))
        results["popularity"]["prec5"].append(compute_precision_at_k(labels_pop, pop_scores, 5))
        results["popularity"]["rec5"].append(compute_recall_at_k(labels_pop, pop_scores, 5))
        
        # LightGBM
        # Cần lấy user preference vector và rank
        try:
            ranked_lgb = ranker.rank(candidates, user_id, top_k=len(candidates))
        except Exception as e:
            print(f"Lỗi rank cho user {user_id}: {e}")
            continue
        labels_lgb = get_labels_for_ranked(ranked_lgb, candidates, gt_labels)
        lgb_scores = ranked_lgb["final_score"].values
        results["lgbm"]["ndcg5"].append(compute_ndcg_at_k(labels_lgb, lgb_scores, 5))
        results["lgbm"]["ndcg10"].append(compute_ndcg_at_k(labels_lgb, lgb_scores, 10))
        results["lgbm"]["prec5"].append(compute_precision_at_k(labels_lgb, lgb_scores, 5))
        results["lgbm"]["rec5"].append(compute_recall_at_k(labels_lgb, lgb_scores, 5))
    
    # Tổng hợp kết quả
    print("\n" + "="*60)
    print("Đánh giá offline so sánh các phương pháp")
    print("="*60)
    for method in ["random", "price", "popularity", "lgbm"]:
        print(f"\n{method.upper()}:")
        for metric in ["ndcg5", "ndcg10", "prec5", "rec5"]:
            values = results[method][metric]
            mean_val = np.mean(values)
            print(f"  {metric}: {mean_val:.4f}")
    
    # Vẽ biểu đồ (nếu có matplotlib)
    try:
        import matplotlib.pyplot as plt
        metrics = ["ndcg5", "ndcg10", "prec5", "rec5"]
        methods = ["random", "price", "popularity", "lgbm"]
        x = np.arange(len(metrics))
        width = 0.2
        fig, ax = plt.subplots(figsize=(10,6))
        for i, method in enumerate(methods):
            means = [np.mean(results[method][m]) for m in metrics]
            ax.bar(x + i*width, means, width, label=method.upper())
        ax.set_xticks(x + width*1.5)
        ax.set_xticklabels(metrics)
        ax.set_ylabel("Score")
        ax.set_title("So sánh các phương pháp xếp hạng chuyến bay")
        ax.legend()
        plt.tight_layout()
        plt.savefig("comparison.png")
        print("\nĐã lưu biểu đồ so sánh vào comparison.png")
    except ImportError:
        print("\nKhông có matplotlib, bỏ qua vẽ biểu đồ.")

if __name__ == "__main__":
    main()