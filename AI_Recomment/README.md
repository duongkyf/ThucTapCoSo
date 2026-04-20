# Flight Recommendation System

## Setup (Trong lần đầu tiên)

Trong database, thêm thuộc tính vào bảng người dùng như sau: ALTER TABLE dbo.Users ADD preference_vector NVARCHAR(MAX) NULL;

```bash
# Di chuyển vào thư mục AI_Recomment
cd AI_Recomment

# Cài đặt (tạo) môi trường ảo để chạy FAST API
python -m venv .venv

# Cài thư viện cần thiết (bên trong venv)
pip install -r requirements.txt

```

## Run (Mỗi khi run Project)

Chạy cái này đầu tiên, xong mới tới server và frontend

```bash
# Di chuyển vào thư mục AI_Recoment
cd AI_Recomment

# Chạy môi trường ảo
.venv\Scripts\Activate

# Chạy
python -m uvicorn src.api:app --reload --port 8000

```