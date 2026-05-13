"""
STEP 1A — Clean & normalize flight dataset
==========================================
Dataset: Easemytrip Flight Price Prediction (Shubham Bathwal)
Link tải: https://www.kaggle.com/datasets/shubhambathwal/flight-price-prediction

Cách dùng:
    1. Tải file 'Clean_Dataset.csv' từ Kaggle về thư mục data/raw/
    2. python src/step1_clean_flights.py

Output: data/processed/flights.csv
"""

import pandas as pd
import numpy as np
import os

# ── Đường dẫn ──────────────────────────────────────────────────────────────
RAW_PATH  = "data/raw/Clean_Dataset.csv"
OUT_PATH  = "data/processed/flights.csv"

# ── Mapping giờ bay → slot số (dùng cho feature engineering sau này) ────────
TIME_SLOT_MAP = {
    "Early_Morning": 0,   # 00:00–06:00
    "Morning":       1,   # 06:00–12:00
    "Afternoon":     2,   # 12:00–16:00
    "Evening":       3,   # 16:00–20:00
    "Night":         4,   # 20:00–00:00
    "Late_Night":    5,
}

STOPS_MAP = {
    "zero":  0,
    "one":   1,
    "two_or_more": 2,
}

CLASS_MAP = {
    "Economy":  0,
    "Business": 1,
}


def load_and_clean(raw_path: str) -> pd.DataFrame:
    print(f"[1/5] Đọc file: {raw_path}")
    df = pd.read_csv(raw_path)
    print(f"      → {len(df):,} dòng, {df.shape[1]} cột")

    # ── Đổi tên cột về snake_case chuẩn ────────────────────────────────────
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

    # Kaggle dataset có thể dùng tên: airline, source_city, destination_city,
    # departure_time, stops, arrival_time, class, duration, days_left, price
    rename_map = {
        "class":            "seat_class",
        "days_left":        "days_to_dep",
    }
    df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})

    print(f"[2/5] Xử lý missing values")
    before = len(df)
    df = df.dropna(subset=["price", "airline", "source_city", "destination_city"])
    print(f"      → Bỏ {before - len(df)} dòng thiếu giá trị quan trọng")

    print(f"[3/5] Chuẩn hóa kiểu dữ liệu")
    # Stops → số nguyên
    # Dataset này luôn dùng string: "zero", "one", "two_or_more"
    # Dùng map() thay vì astype(int) để tránh lỗi
    stops_raw = df["stops"].astype(str).str.strip().str.lower()
    df["stops_num"] = stops_raw.map(STOPS_MAP)
    # Fallback: nếu giá trị nào không có trong map (vd: "1", "2"), parse trực tiếp
    mask_unmapped = df["stops_num"].isna()
    if mask_unmapped.any():
        df.loc[mask_unmapped, "stops_num"] = (
            pd.to_numeric(stops_raw[mask_unmapped], errors="coerce").fillna(1)
        )
    df["stops_num"] = df["stops_num"].astype(int)

    # Departure time → slot số
    df["dep_slot"] = df["departure_time"].map(TIME_SLOT_MAP).fillna(2).astype(int)

    # Seat class → binary
    df["is_business"] = df["seat_class"].map(CLASS_MAP).fillna(0).astype(int)

    # Duration: đảm bảo là float (giờ)
    df["duration"] = pd.to_numeric(df["duration"], errors="coerce").fillna(df["duration"].median())

    # Price: loại outlier cực đoan (> 99th percentile × 3)
    p99 = df["price"].quantile(0.99)
    before = len(df)
    df = df[df["price"] <= p99 * 3]
    print(f"      → Bỏ {before - len(df)} dòng giá bất thường (> {p99*3:,.0f})")

    # Normalize price về [0, 1] để dùng trong feature vector
    df["price_norm"] = (df["price"] - df["price"].min()) / (df["price"].max() - df["price"].min())

    # Normalize duration về [0, 1]
    df["duration_norm"] = (df["duration"] - df["duration"].min()) / (df["duration"].max() - df["duration"].min())

    print(f"[4/5] Tạo flight_id duy nhất")
    df = df.reset_index(drop=True)
    df.insert(0, "flight_id", [f"FL{i:06d}" for i in range(len(df))])

    print(f"[5/5] Chọn và sắp xếp cột output")
    keep_cols = [
        "flight_id",
        "airline",
        "flight",           # flight code (VJ123,...)
        "source_city",
        "destination_city",
        "departure_time",   # chuỗi gốc (Early_Morning, Morning,...)
        "dep_slot",         # số 0–5
        "stops",            # chuỗi gốc
        "stops_num",        # số 0/1/2
        "arrival_time",
        "seat_class",       # Economy / Business
        "is_business",      # 0 / 1
        "duration",         # giờ (float)
        "duration_norm",
        "price",            # VND / INR gốc
        "price_norm",
    ]
    # Thêm days_to_dep nếu có
    if "days_to_dep" in df.columns:
        keep_cols.append("days_to_dep")

    existing = [c for c in keep_cols if c in df.columns]
    df = df[existing]

    return df


def main():
    os.makedirs("data/processed", exist_ok=True)

    if not os.path.exists(RAW_PATH):
        print(f"\n[!] Không tìm thấy file: {RAW_PATH}")
        print("    Vui lòng tải dataset tại:")
        print("    https://www.kaggle.com/datasets/shubhambathwal/flight-price-prediction")
        print("    Đặt file 'Clean_Dataset.csv' vào thư mục data/raw/\n")
        return

    df = load_and_clean(RAW_PATH)

    df.to_csv(OUT_PATH, index=False)
    print(f"\n✓ Đã lưu {len(df):,} chuyến bay → {OUT_PATH}")
    print(f"\n── Thống kê nhanh ──────────────────────────────")
    print(f"  Airlines    : {df['airline'].nunique()} hãng  → {sorted(df['airline'].unique())}")
    print(f"  Tuyến bay   : {df['source_city'].nunique()} thành phố nguồn")
    print(f"  Giá (min)   : {df['price'].min():,.0f}")
    print(f"  Giá (max)   : {df['price'].max():,.0f}")
    print(f"  Giá (median): {df['price'].median():,.0f}")
    print(f"  Duration    : {df['duration'].min():.1f}h – {df['duration'].max():.1f}h")
    print(f"  Stops dist  : {df['stops_num'].value_counts().to_dict()}")
    print(f"  Class dist  : {df['seat_class'].value_counts().to_dict()}")


if __name__ == "__main__":
    main()