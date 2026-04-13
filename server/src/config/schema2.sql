-- ═══════════════════════════════════════════════════════════
--  MIGRATION: Refactor roles → SUPER_ADMIN / AIRLINE_ADMIN / USER
--  Chạy trên database skybooker đang có sẵn (KHÔNG xóa data) - Nghĩa là chỉ UPDATE role cũ, không DROP/CREATE lại bảng
-- ═══════════════════════════════════════════════════════════

USE skybooker;
GO

ALTER TABLE Users
ALTER COLUMN role NVARCHAR(15) NOT NULL;

-- ── 1. Xóa CHECK constraint cũ trên cột role ─────────────────
-- Tìm tên constraint động (tránh hardcode)
DECLARE @constraintName NVARCHAR(200);
SELECT @constraintName = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE c.object_id = OBJECT_ID('dbo.Users') AND c.name = 'role';

IF @constraintName IS NOT NULL
BEGIN
  EXEC('ALTER TABLE dbo.Users DROP CONSTRAINT ' + @constraintName);
  PRINT 'Dropped DEFAULT constraint: ' + @constraintName;
END

-- Xóa CHECK constraint trên role
DECLARE @checkName NVARCHAR(200);
SELECT @checkName = cc.name
FROM sys.check_constraints cc
JOIN sys.columns c ON cc.parent_object_id = c.object_id AND cc.parent_column_id = c.column_id
WHERE c.object_id = OBJECT_ID('dbo.Users') AND c.name = 'role';

IF @checkName IS NOT NULL
BEGIN
  EXEC('ALTER TABLE dbo.Users DROP CONSTRAINT ' + @checkName);
  PRINT 'Dropped CHECK constraint: ' + @checkName;
END
GO

-- ── 2. Migrate data cũ: 'admin' → 'SUPER_ADMIN', 'user' → 'USER' ──
UPDATE dbo.Users SET role = 'SUPER_ADMIN' WHERE role = 'admin';
UPDATE dbo.Users SET role = 'USER'        WHERE role = 'user';
GO

-- ── 3. Thêm CHECK constraint + DEFAULT mới ───────────────────
ALTER TABLE dbo.Users
  ADD CONSTRAINT CK_Users_role
  CHECK (role IN ('USER', 'AIRLINE_ADMIN', 'SUPER_ADMIN'));
GO

ALTER TABLE dbo.Users
  ADD CONSTRAINT DF_Users_role
  DEFAULT 'USER' FOR role;
GO

-- ── 4. Thêm cột airline_id vào Users (nullable, chỉ dùng cho AIRLINE_ADMIN) ──
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'airline_id'
)
BEGIN
  ALTER TABLE dbo.Users
    ADD airline_id INT NULL
    CONSTRAINT FK_Users_Airlines FOREIGN KEY REFERENCES dbo.Airlines(airline_id);
  PRINT 'Added airline_id column to Users';
END
GO

-- ── 5. Index hỗ trợ query theo airline ───────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Users_airline' AND object_id = OBJECT_ID('dbo.Users'))
  CREATE INDEX IX_Users_airline ON dbo.Users(airline_id);
GO

-- ── 6. Xác nhận kết quả ──────────────────────────────────────
SELECT user_id, username, email, role, airline_id, status
FROM dbo.Users
ORDER BY role, user_id;
GO

PRINT '✅ Migration hoàn tất!';
GO

-- ── 7. (Tùy chọn) Tạo tài khoản AIRLINE_ADMIN mẫu ────────────
-- Chạy thủ công sau khi có airline_id thực tế:
--
-- INSERT INTO dbo.Users (username, password_hash, email, role, airline_id)
-- VALUES (
--   N'Admin Vietnam Airlines',
--   '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',  -- password: password
--   'vn-admin@sky.com',
--   'AIRLINE_ADMIN',
--   1   -- airline_id = 1 (Vietnam Airlines)
-- );