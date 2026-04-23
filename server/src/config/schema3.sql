-- ═══════════════════════════════════════════════════════════
--  SEED DATA — Demo AI Ranking
--  Chạy trên database skybooker
--  Tạo: 4 users với thói quen khác nhau + booking history thật
-- ═══════════════════════════════════════════════════════════

USE skybooker;
GO

ALTER TABLE Users
ADD preferred_airline NVARCHAR(100) NULL;

-- ── 1. Thêm users demo ───────────────────────────────────────
-- Password mặc định: "123456" (bcrypt hash)
-- user_id sẽ tự tăng tiếp theo sau các user hiện có

INSERT INTO dbo.Users (username, password_hash, email, phone_number, role, status) VALUES

-- User 3: Hay mua vé rẻ VietJet, economy, bay sáng sớm
(N'Trần Thị Budget',
 '$2b$10$2qmhjdmXPJo8p.QMLzGejewKZhxSoQPBV7ouOGhax5EHjsMkw8xOy',
 'budget@demo.com', '0901111111', 'user', 'active'),

-- User 4: Hay đi Business, Vietnam Airlines, không quan tâm giá
(N'Lê Văn Business',
 '$2b$10$2qmhjdmXPJo8p.QMLzGejewKZhxSoQPBV7ouOGhax5EHjsMkw8xOy',
 'business@demo.com', '0902222222', 'user', 'active'),

-- User 5: Bay đêm, Bamboo Airways, economy
(N'Phạm Thị Night',
 '$2b$10$2qmhjdmXPJo8p.QMLzGejewKZhxSoQPBV7ouOGhax5EHjsMkw8xOy',
 'night@demo.com', '0903333333', 'user', 'active'),

-- User 6: Hay bay Vietjet, economy, chiều tối
(N'Hoàng Văn Flexible',
 '$2b$10$2qmhjdmXPJo8p.QMLzGejewKZhxSoQPBV7ouOGhax5EHjsMkw8xOy',
 'flexible@demo.com', '0904444444', 'user', 'active');
GO

-- ── 2. Xác nhận user_id vừa tạo ─────────────────────────────
SELECT user_id, username, email FROM dbo.Users WHERE email IN (
  'budget@demo.com','business@demo.com','night@demo.com','flexible@demo.com'
);
GO

-- ═══════════════════════════════════════════════════════════
--  BOOKING HISTORY
--  Dùng flight_id thực tế từ DB:
--  VJ201 (SGN→HAN 07:00, 890k)  → flight_id cần kiểm tra
--  VN201 (SGN→HAN 06:00, 1.2tr) → flight_id=1 (đã biết)
--  VN203 (SGN→HAN 12:00, 1.1tr)
--  VN205 (SGN→HAN 18:00, 1.3tr)
--  QH401 (HAN→DAD 09:00, 800k)
--  VN801 (SGN→BKK 08:00, 2.5tr)
-- ═══════════════════════════════════════════════════════════

-- Lấy flight_id thực tế để dùng bên dưới
-- (Chạy query này trước để xác nhận, rồi dùng ID đúng)
SELECT flight_id, flight_code, source_airport_id, destination_airport_id,
       departure_time, base_price
FROM dbo.Flights
WHERE flight_code IN ('VJ201','VJ202','VJ501','VJ503','VN201','VN203','VN205',
                      'VN301','VN303','QH401','QH861','VN801','VN811','VN821',
                      'VN831','VN851','BL701')
ORDER BY flight_code;
GO

-- ═══════════════════════════════════════════════════════════
--  NOTE: Thay thế @uid3, @uid4, @uid5, @uid6 bằng user_id thực tế
--  sau khi chạy block INSERT Users ở trên.
--  Thông thường sẽ là 3, 4, 5, 6 nếu chỉ có admin(1) + user(2) hiện tại.
--
--  Thay thế flight_id bằng kết quả query ở trên.
--  Schema hiện tại: VJ201=7, VN201=1, VN203=2, VN205=3... (tùy DB của bạn)
-- ═══════════════════════════════════════════════════════════

-- ── 3. Helper: tạo booking_ref ngắn ─────────────────────────
-- Dùng NEWID() để tạo ref unique

-- ─────────────────────────────────────────────────────────────
-- USER 3 (budget@demo.com) — Hay mua vé rẻ VietJet, sáng sớm
-- Profile mong đợi: price_sensitivity CAO, airline_loyalty VJ, morning_pref CAO
-- Thay 3 → user_id thực tế của budget@demo.com
-- ─────────────────────────────────────────────────────────────

-- Booking 1: VJ201 SGN→HAN 07:00 economy 890k
INSERT INTO dbo.Bookings (user_id, booking_ref, booking_date, total_amount, status, contact_name, contact_email, contact_phone)
VALUES (3, 'BK-DM001', '2026-01-10 08:00:00', 890000, N'Thành công', N'Trần Thị Budget', 'budget@demo.com', '0901111111');

INSERT INTO dbo.Tickets (booking_id, flight_id, passenger_name, passenger_type, identity_card, ticket_price, class, status)
VALUES (
  (SELECT booking_id FROM dbo.Bookings WHERE booking_ref='BK-DM001'),
  (SELECT flight_id  FROM dbo.Flights  WHERE flight_code='VJ201'),
  N'Trần Thị Budget', 'adult', '012345001', 890000, 'economy', N'Đã xác nhận'
);

-- Booking 2: VJ202 HAN→SGN 10:00 economy 890k
INSERT INTO dbo.Bookings (user_id, booking_ref, booking_date, total_amount, status, contact_name, contact_email, contact_phone)
VALUES (3, 'BK-DM002', '2026-01-20 09:00:00', 890000, N'Thành công', N'Trần Thị Budget', 'budget@demo.com', '0901111111');

INSERT INTO dbo.Tickets (booking_id, flight_id, passenger_name, passenger_type, identity_card, ticket_price, class, status)
VALUES (
  (SELECT booking_id FROM dbo.Bookings WHERE booking_ref='BK-DM002'),
  (SELECT flight_id  FROM dbo.Flights  WHERE flight_code='VJ202'),
  N'Trần Thị Budget', 'adult', '012345001', 890000, 'economy', N'Đã xác nhận'
);

-- Booking 3: VJ501 SGN→PQC 07:30 economy 750k
INSERT INTO dbo.Bookings (user_id, booking_ref, booking_date, total_amount, status, contact_name, contact_email, contact_phone)
VALUES (3, 'BK-DM003', '2026-02-05 07:00:00', 750000, N'Thành công', N'Trần Thị Budget', 'budget@demo.com', '0901111111');

INSERT INTO dbo.Tickets (booking_id, flight_id, passenger_name, passenger_type, identity_card, ticket_price, class, status)
VALUES (
  (SELECT booking_id FROM dbo.Bookings WHERE booking_ref='BK-DM003'),
  (SELECT flight_id  FROM dbo.Flights  WHERE flight_code='VJ501'),
  N'Trần Thị Budget', 'adult', '012345001', 750000, 'economy', N'Đã xác nhận'
);

-- Booking 4: VJ503 SGN→PQC 14:00 economy 700k
INSERT INTO dbo.Bookings (user_id, booking_ref, booking_date, total_amount, status, contact_name, contact_email, contact_phone)
VALUES (3, 'BK-DM004', '2026-02-20 13:00:00', 700000, N'Thành công', N'Trần Thị Budget', 'budget@demo.com', '0901111111');

INSERT INTO dbo.Tickets (booking_id, flight_id, passenger_name, passenger_type, identity_card, ticket_price, class, status)
VALUES (
  (SELECT booking_id FROM dbo.Bookings WHERE booking_ref='BK-DM004'),
  (SELECT flight_id  FROM dbo.Flights  WHERE flight_code='VJ503'),
  N'Trần Thị Budget', 'adult', '012345001', 700000, 'economy', N'Đã xác nhận'
);

-- Booking 5: VJ201 lần 2
INSERT INTO dbo.Bookings (user_id, booking_ref, booking_date, total_amount, status, contact_name, contact_email, contact_phone)
VALUES (3, 'BK-DM005', '2026-03-08 08:00:00', 890000, N'Thành công', N'Trần Thị Budget', 'budget@demo.com', '0901111111');

INSERT INTO dbo.Tickets (booking_id, flight_id, passenger_name, passenger_type, identity_card, ticket_price, class, status)
VALUES (
  (SELECT booking_id FROM dbo.Bookings WHERE booking_ref='BK-DM005'),
  (SELECT flight_id  FROM dbo.Flights  WHERE flight_code='VJ201'),
  N'Trần Thị Budget', 'adult', '012345001', 890000, 'economy', N'Đã xác nhận'
);
GO

-- ─────────────────────────────────────────────────────────────
-- USER 4 (business@demo.com) — Business class, Vietnam Airlines, sáng sớm
-- Profile mong đợi: business_class_pref CAO, airline_loyalty VN, price_sensitivity THẤP
-- Thay 4 → user_id thực tế của business@demo.com
-- ─────────────────────────────────────────────────────────────

-- Booking 6: VN201 SGN→HAN 06:00 business (giá cao)
INSERT INTO dbo.Bookings (user_id, booking_ref, booking_date, total_amount, status, contact_name, contact_email, contact_phone)
VALUES (4, 'BK-DM006', '2026-01-12 05:00:00', 3000000, N'Thành công', N'Lê Văn Business', 'business@demo.com', '0902222222');

INSERT INTO dbo.Tickets (booking_id, flight_id, passenger_name, passenger_type, identity_card, ticket_price, class, status)
VALUES (
  (SELECT booking_id FROM dbo.Bookings WHERE booking_ref='BK-DM006'),
  (SELECT flight_id  FROM dbo.Flights  WHERE flight_code='VN201'),
  N'Lê Văn Business', 'adult', '012345002', 3000000, 'business', N'Đã xác nhận'
);

-- Booking 7: VN203 SGN→HAN 12:00 business
INSERT INTO dbo.Bookings (user_id, booking_ref, booking_date, total_amount, status, contact_name, contact_email, contact_phone)
VALUES (4, 'BK-DM007', '2026-01-25 11:00:00', 2750000, N'Thành công', N'Lê Văn Business', 'business@demo.com', '0902222222');

INSERT INTO dbo.Tickets (booking_id, flight_id, passenger_name, passenger_type, identity_card, ticket_price, class, status)
VALUES (
  (SELECT booking_id FROM dbo.Bookings WHERE booking_ref='BK-DM007'),
  (SELECT flight_id  FROM dbo.Flights  WHERE flight_code='VN203'),
  N'Lê Văn Business', 'adult', '012345002', 2750000, 'business', N'Đã xác nhận'
);

-- Booking 8: VN801 SGN→BKK 08:00 business (quốc tế)
INSERT INTO dbo.Bookings (user_id, booking_ref, booking_date, total_amount, status, contact_name, contact_email, contact_phone)
VALUES (4, 'BK-DM008', '2026-02-10 07:00:00', 6250000, N'Thành công', N'Lê Văn Business', 'business@demo.com', '0902222222');

INSERT INTO dbo.Tickets (booking_id, flight_id, passenger_name, passenger_type, identity_card, ticket_price, class, status)
VALUES (
  (SELECT booking_id FROM dbo.Bookings WHERE booking_ref='BK-DM008'),
  (SELECT flight_id  FROM dbo.Flights  WHERE flight_code='VN801'),
  N'Lê Văn Business', 'adult', '012345002', 6250000, 'business', N'Đã xác nhận'
);

-- Booking 9: VN821 HAN→ICN 07:00 business (quốc tế)
INSERT INTO dbo.Bookings (user_id, booking_ref, booking_date, total_amount, status, contact_name, contact_email, contact_phone)
VALUES (4, 'BK-DM009', '2026-03-01 06:00:00', 16250000, N'Thành công', N'Lê Văn Business', 'business@demo.com', '0902222222');

INSERT INTO dbo.Tickets (booking_id, flight_id, passenger_name, passenger_type, identity_card, ticket_price, class, status)
VALUES (
  (SELECT booking_id FROM dbo.Bookings WHERE booking_ref='BK-DM009'),
  (SELECT flight_id  FROM dbo.Flights  WHERE flight_code='VN821'),
  N'Lê Văn Business', 'adult', '012345002', 16250000, 'business', N'Đã xác nhận'
);

-- Booking 10: VN201 lần 2, business
INSERT INTO dbo.Bookings (user_id, booking_ref, booking_date, total_amount, status, contact_name, contact_email, contact_phone)
VALUES (4, 'BK-DM010', '2026-03-20 05:30:00', 3000000, N'Thành công', N'Lê Văn Business', 'business@demo.com', '0902222222');

INSERT INTO dbo.Tickets (booking_id, flight_id, passenger_name, passenger_type, identity_card, ticket_price, class, status)
VALUES (
  (SELECT booking_id FROM dbo.Bookings WHERE booking_ref='BK-DM010'),
  (SELECT flight_id  FROM dbo.Flights  WHERE flight_code='VN201'),
  N'Lê Văn Business', 'adult', '012345002', 3000000, 'business', N'Đã xác nhận'
);
GO

-- ─────────────────────────────────────────────────────────────
-- USER 5 (night@demo.com) — Bay tối, Bamboo Airways, economy
-- Profile mong đợi: morning_pref THẤP, airline_loyalty QH, price_sensitivity TRUNG BÌNH
-- Thay 5 → user_id thực tế của night@demo.com
-- ─────────────────────────────────────────────────────────────

-- Booking 11: QH401 HAN→DAD 09:00 economy 800k
INSERT INTO dbo.Bookings (user_id, booking_ref, booking_date, total_amount, status, contact_name, contact_email, contact_phone)
VALUES (5, 'BK-DM011', '2026-01-15 08:00:00', 800000, N'Thành công', N'Phạm Thị Night', 'night@demo.com', '0903333333');

INSERT INTO dbo.Tickets (booking_id, flight_id, passenger_name, passenger_type, identity_card, ticket_price, class, status)
VALUES (
  (SELECT booking_id FROM dbo.Bookings WHERE booking_ref='BK-DM011'),
  (SELECT flight_id  FROM dbo.Flights  WHERE flight_code='QH401'),
  N'Phạm Thị Night', 'adult', '012345003', 800000, 'economy', N'Đã xác nhận'
);

-- Booking 12: QH861 HAN→BKK 10:00 economy 2.9tr
INSERT INTO dbo.Bookings (user_id, booking_ref, booking_date, total_amount, status, contact_name, contact_email, contact_phone)
VALUES (5, 'BK-DM012', '2026-02-03 09:00:00', 2900000, N'Thành công', N'Phạm Thị Night', 'night@demo.com', '0903333333');

INSERT INTO dbo.Tickets (booking_id, flight_id, passenger_name, passenger_type, identity_card, ticket_price, class, status)
VALUES (
  (SELECT booking_id FROM dbo.Bookings WHERE booking_ref='BK-DM012'),
  (SELECT flight_id  FROM dbo.Flights  WHERE flight_code='QH861'),
  N'Phạm Thị Night', 'adult', '012345003', 2900000, 'economy', N'Đã xác nhận'
);

-- Booking 13: VN205 SGN→HAN 18:00 economy (bay chiều tối)
INSERT INTO dbo.Bookings (user_id, booking_ref, booking_date, total_amount, status, contact_name, contact_email, contact_phone)
VALUES (5, 'BK-DM013', '2026-02-18 17:00:00', 1300000, N'Thành công', N'Phạm Thị Night', 'night@demo.com', '0903333333');

INSERT INTO dbo.Tickets (booking_id, flight_id, passenger_name, passenger_type, identity_card, ticket_price, class, status)
VALUES (
  (SELECT booking_id FROM dbo.Bookings WHERE booking_ref='BK-DM013'),
  (SELECT flight_id  FROM dbo.Flights  WHERE flight_code='VN205'),
  N'Phạm Thị Night', 'adult', '012345003', 1300000, 'economy', N'Đã xác nhận'
);

-- Booking 14: QH402 DAD→HAN 11:00 economy
INSERT INTO dbo.Bookings (user_id, booking_ref, booking_date, total_amount, status, contact_name, contact_email, contact_phone)
VALUES (5, 'BK-DM014', '2026-03-05 10:00:00', 800000, N'Thành công', N'Phạm Thị Night', 'night@demo.com', '0903333333');

INSERT INTO dbo.Tickets (booking_id, flight_id, passenger_name, passenger_type, identity_card, ticket_price, class, status)
VALUES (
  (SELECT booking_id FROM dbo.Bookings WHERE booking_ref='BK-DM014'),
  (SELECT flight_id  FROM dbo.Flights  WHERE flight_code='QH402'),
  N'Phạm Thị Night', 'adult', '012345003', 800000, 'economy', N'Đã xác nhận'
);

-- Booking 15: VN206 HAN→SGN 20:00 economy (bay tối)
INSERT INTO dbo.Bookings (user_id, booking_ref, booking_date, total_amount, status, contact_name, contact_email, contact_phone)
VALUES (5, 'BK-DM015', '2026-03-22 19:00:00', 1350000, N'Thành công', N'Phạm Thị Night', 'night@demo.com', '0903333333');

INSERT INTO dbo.Tickets (booking_id, flight_id, passenger_name, passenger_type, identity_card, ticket_price, class, status)
VALUES (
  (SELECT booking_id FROM dbo.Bookings WHERE booking_ref='BK-DM015'),
  (SELECT flight_id  FROM dbo.Flights  WHERE flight_code='VN206'),
  N'Phạm Thị Night', 'adult', '012345003', 1350000, 'economy', N'Đã xác nhận'
);
GO

-- ─────────────────────────────────────────────────────────────
-- USER 6 (flexible@demo.com) — Mix nhiều hãng, economy, chiều tối
-- Profile mong đợi: airline_loyalty THẤP, morning_pref THẤP, price_sensitivity TRUNG BÌNH
-- Thay 6 → user_id thực tế của flexible@demo.com
-- ─────────────────────────────────────────────────────────────

-- Booking 16: VJ201 SGN→HAN economy
INSERT INTO dbo.Bookings (user_id, booking_ref, booking_date, total_amount, status, contact_name, contact_email, contact_phone)
VALUES (6, 'BK-DM016', '2026-01-08 07:00:00', 890000, N'Thành công', N'Hoàng Văn Flexible', 'flexible@demo.com', '0904444444');

INSERT INTO dbo.Tickets (booking_id, flight_id, passenger_name, passenger_type, identity_card, ticket_price, class, status)
VALUES (
  (SELECT booking_id FROM dbo.Bookings WHERE booking_ref='BK-DM016'),
  (SELECT flight_id  FROM dbo.Flights  WHERE flight_code='VJ201'),
  N'Hoàng Văn Flexible', 'adult', '012345004', 890000, 'economy', N'Đã xác nhận'
);

-- Booking 17: VN205 SGN→HAN 18:00 economy
INSERT INTO dbo.Bookings (user_id, booking_ref, booking_date, total_amount, status, contact_name, contact_email, contact_phone)
VALUES (6, 'BK-DM017', '2026-01-28 17:00:00', 1300000, N'Thành công', N'Hoàng Văn Flexible', 'flexible@demo.com', '0904444444');

INSERT INTO dbo.Tickets (booking_id, flight_id, passenger_name, passenger_type, identity_card, ticket_price, class, status)
VALUES (
  (SELECT booking_id FROM dbo.Bookings WHERE booking_ref='BK-DM017'),
  (SELECT flight_id  FROM dbo.Flights  WHERE flight_code='VN205'),
  N'Hoàng Văn Flexible', 'adult', '012345004', 1300000, 'economy', N'Đã xác nhận'
);

-- Booking 18: QH861 HAN→BKK 10:00 economy
INSERT INTO dbo.Bookings (user_id, booking_ref, booking_date, total_amount, status, contact_name, contact_email, contact_phone)
VALUES (6, 'BK-DM018', '2026-02-14 09:00:00', 2900000, N'Thành công', N'Hoàng Văn Flexible', 'flexible@demo.com', '0904444444');

INSERT INTO dbo.Tickets (booking_id, flight_id, passenger_name, passenger_type, identity_card, ticket_price, class, status)
VALUES (
  (SELECT booking_id FROM dbo.Bookings WHERE booking_ref='BK-DM018'),
  (SELECT flight_id  FROM dbo.Flights  WHERE flight_code='QH861'),
  N'Hoàng Văn Flexible', 'adult', '012345004', 2900000, 'economy', N'Đã xác nhận'
);

-- Booking 19: BL701 SGN→HPH 07:00 economy
INSERT INTO dbo.Bookings (user_id, booking_ref, booking_date, total_amount, status, contact_name, contact_email, contact_phone)
VALUES (6, 'BK-DM019', '2026-03-10 06:30:00', 980000, N'Thành công', N'Hoàng Văn Flexible', 'flexible@demo.com', '0904444444');

INSERT INTO dbo.Tickets (booking_id, flight_id, passenger_name, passenger_type, identity_card, ticket_price, class, status)
VALUES (
  (SELECT booking_id FROM dbo.Bookings WHERE booking_ref='BK-DM019'),
  (SELECT flight_id  FROM dbo.Flights  WHERE flight_code='BL701'),
  N'Hoàng Văn Flexible', 'adult', '012345004', 980000, 'economy', N'Đã xác nhận'
);

-- Booking 20: VN204 HAN→SGN 14:00 economy
INSERT INTO dbo.Bookings (user_id, booking_ref, booking_date, total_amount, status, contact_name, contact_email, contact_phone)
VALUES (6, 'BK-DM020', '2026-03-28 13:00:00', 1100000, N'Thành công', N'Hoàng Văn Flexible', 'flexible@demo.com', '0904444444');

INSERT INTO dbo.Tickets (booking_id, flight_id, passenger_name, passenger_type, identity_card, ticket_price, class, status)
VALUES (
  (SELECT booking_id FROM dbo.Bookings WHERE booking_ref='BK-DM020'),
  (SELECT flight_id  FROM dbo.Flights  WHERE flight_code='VN204'),
  N'Hoàng Văn Flexible', 'adult', '012345004', 1100000, 'economy', N'Đã xác nhận'
);
GO

-- ═══════════════════════════════════════════════════════════
--  KIỂM TRA KẾT QUẢ
-- ═══════════════════════════════════════════════════════════

-- Xem preference vector sẽ được tính như thế nào cho từng user
SELECT
  u.user_id,
  u.username,
  u.email,
  COUNT(DISTINCT b.booking_id)                                           AS total_bookings,
  -- price_sensitivity: giá thấp → cao
  ROUND(1.0 - AVG(CAST(f.base_price AS FLOAT) / 9000000), 3)            AS price_sensitivity,
  -- morning_preference: tỷ lệ chuyến trước 10h
  ROUND(CAST(SUM(CASE WHEN DATEPART(HOUR,f.departure_time)<10 THEN 1 ELSE 0 END)
        AS FLOAT) / COUNT(*), 3)                                         AS morning_preference,
  -- business_class_pref: tỷ lệ vé business/first
  ROUND(CAST(SUM(CASE WHEN t.class IN ('business','first') THEN 1 ELSE 0 END)
        AS FLOAT) / COUNT(*), 3)                                         AS business_class_pref,
  -- preferred airline (mode)
  (SELECT TOP 1 al2.airline_name
   FROM dbo.Tickets t2
   JOIN dbo.Bookings b2 ON t2.booking_id=b2.booking_id
   JOIN dbo.Flights f2  ON t2.flight_id=f2.flight_id
   JOIN dbo.Airlines al2 ON f2.airline_id=al2.airline_id
   WHERE b2.user_id=u.user_id AND b2.status=N'Thành công'
   GROUP BY al2.airline_name
   ORDER BY COUNT(*) DESC)                                               AS preferred_airline
FROM dbo.Users u
JOIN dbo.Bookings b ON b.user_id   = u.user_id AND b.status = N'Thành công'
JOIN dbo.Tickets  t ON t.booking_id = b.booking_id AND t.status != N'Đã hủy'
JOIN dbo.Flights  f ON t.flight_id  = f.flight_id
WHERE u.user_id >= 2
GROUP BY u.user_id, u.username, u.email
ORDER BY u.user_id;
GO

PRINT N'✅ Seed data demo hoàn tất!';
PRINT N'';
PRINT N'Tài khoản demo (password: password):';
PRINT N'  budget@demo.com    → hay mua VietJet giá rẻ, sáng sớm';
PRINT N'  business@demo.com  → hay đi Business Vietnam Airlines';
PRINT N'  night@demo.com     → hay bay tối, Bamboo Airways';
PRINT N'  flexible@demo.com  → mix nhiều hãng, không trung thành';
GO