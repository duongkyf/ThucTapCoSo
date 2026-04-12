-- ═══════════════════════════════════════════════════════════
--  SkyBooker — SQL Server Schema (T-SQL)
--  Updated: Airlines table added
-- ═══════════════════════════════════════════════════════════

USE master;
GO

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'skybooker')
  CREATE DATABASE skybooker COLLATE Vietnamese_CI_AS;
GO

USE skybooker;
GO

-- ── Drop tables (theo thứ tự phụ thuộc) ──────────────────────
IF OBJECT_ID('dbo.Ticket_Services','U') IS NOT NULL DROP TABLE dbo.Ticket_Services;
IF OBJECT_ID('dbo.Tickets',        'U') IS NOT NULL DROP TABLE dbo.Tickets;
IF OBJECT_ID('dbo.Bookings',       'U') IS NOT NULL DROP TABLE dbo.Bookings;
IF OBJECT_ID('dbo.SeatMaps',       'U') IS NOT NULL DROP TABLE dbo.SeatMaps;
IF OBJECT_ID('dbo.Services',       'U') IS NOT NULL DROP TABLE dbo.Services;
IF OBJECT_ID('dbo.Flights',        'U') IS NOT NULL DROP TABLE dbo.Flights;
IF OBJECT_ID('dbo.Aircrafts',      'U') IS NOT NULL DROP TABLE dbo.Aircrafts;
IF OBJECT_ID('dbo.Airlines',       'U') IS NOT NULL DROP TABLE dbo.Airlines;
IF OBJECT_ID('dbo.Airports',       'U') IS NOT NULL DROP TABLE dbo.Airports;
IF OBJECT_ID('dbo.Users',          'U') IS NOT NULL DROP TABLE dbo.Users;
GO

-- ═══════════════════════════════════════════════════════════
--  TABLES
-- ═══════════════════════════════════════════════════════════

-- ── Users ─────────────────────────────────────────────────────
CREATE TABLE dbo.Users (
  user_id       INT            IDENTITY(1,1) PRIMARY KEY,
  username      NVARCHAR(100)  NOT NULL,
  password_hash NVARCHAR(255)  NOT NULL,
  email         NVARCHAR(255)  NOT NULL UNIQUE,
  phone_number  NVARCHAR(20),
  id_number     NVARCHAR(20),
  role          NVARCHAR(10)   NOT NULL DEFAULT 'user'
                               CHECK (role IN ('user', 'admin')),
  status        NVARCHAR(10)   NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'banned')),
  created_at    DATETIME2      DEFAULT GETDATE(),
  updated_at    DATETIME2      DEFAULT GETDATE()
);
GO

-- ── Airports ──────────────────────────────────────────────────
CREATE TABLE dbo.Airports (
  airport_id CHAR(3)        NOT NULL PRIMARY KEY,
  name       NVARCHAR(100)  NOT NULL,
  city       NVARCHAR(100)  NOT NULL,
  country    NVARCHAR(100)  NOT NULL DEFAULT N'Việt Nam'
);
GO

-- ── Airlines ──────────────────────────────────────────────────
CREATE TABLE dbo.Airlines (
  airline_id   INT           IDENTITY(1,1) PRIMARY KEY,
  airline_code CHAR(2)       NOT NULL UNIQUE,   -- IATA: VN, VJ, QH, BL...
  airline_name NVARCHAR(100) NOT NULL,
  country      NVARCHAR(100) NOT NULL DEFAULT N'Việt Nam',
  logo_url     NVARCHAR(255),
  status       NVARCHAR(10)  NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'inactive'))
);
GO

-- ── Aircrafts ─────────────────────────────────────────────────
CREATE TABLE dbo.Aircrafts (
  aircraft_id  INT           IDENTITY(1,1) PRIMARY KEY,
  airline_id   INT           NOT NULL REFERENCES dbo.Airlines(airline_id),
  model_name   NVARCHAR(100) NOT NULL,
  manufacturer NVARCHAR(100) NOT NULL,
  total_seats  INT           NOT NULL,
  status       NVARCHAR(20)  NOT NULL DEFAULT N'Đang hoạt động'
               CHECK (status IN (N'Đang hoạt động', N'Bảo trì', N'Ngừng hoạt động'))
);
GO

-- ── SeatMaps ──────────────────────────────────────────────────
CREATE TABLE dbo.SeatMaps (
  seat_id     INT           IDENTITY(1,1) PRIMARY KEY,
  aircraft_id INT           NOT NULL REFERENCES dbo.Aircrafts(aircraft_id),
  seat_code   NVARCHAR(5)   NOT NULL,
  seat_class  NVARCHAR(10)  NOT NULL DEFAULT 'economy'
              CHECK (seat_class IN ('economy', 'business', 'first')),
  is_exit_row BIT           NOT NULL DEFAULT 0,
  surcharge   DECIMAL(10,2) NOT NULL DEFAULT 0,
  UNIQUE (aircraft_id, seat_code)
);
GO

-- ── Flights ───────────────────────────────────────────────────
CREATE TABLE dbo.Flights (
  flight_id              INT           IDENTITY(1,1) PRIMARY KEY,
  flight_code            NVARCHAR(10)  NOT NULL UNIQUE,
  airline_id             INT           NOT NULL REFERENCES dbo.Airlines(airline_id),
  aircraft_id            INT           NOT NULL REFERENCES dbo.Aircrafts(aircraft_id),
  source_airport_id      CHAR(3)       NOT NULL REFERENCES dbo.Airports(airport_id),
  destination_airport_id CHAR(3)       NOT NULL REFERENCES dbo.Airports(airport_id),
  departure_time         DATETIME2     NOT NULL,
  arrival_time           DATETIME2     NOT NULL,
  base_price             DECIMAL(10,2) NOT NULL DEFAULT 0,
  status                 NVARCHAR(15)  NOT NULL DEFAULT 'On Time'
                         CHECK (status IN ('On Time', 'Delayed', 'Cancelled')),
  is_recurring           BIT           NOT NULL DEFAULT 0
);
GO

-- ── Services ──────────────────────────────────────────────────
CREATE TABLE dbo.Services (
  service_id   INT           IDENTITY(1,1) PRIMARY KEY,
  service_name NVARCHAR(100) NOT NULL,
  type         NVARCHAR(20)  NOT NULL
               CHECK (type IN ('meal', 'baggage', 'oversized')),
  price        DECIMAL(10,2) NOT NULL DEFAULT 0,
  description  NVARCHAR(255),
  status       NVARCHAR(10)  NOT NULL DEFAULT 'Active'
               CHECK (status IN ('Active', 'Inactive'))
);
GO

-- ── Bookings ──────────────────────────────────────────────────
CREATE TABLE dbo.Bookings (
  booking_id    INT           IDENTITY(1,1) PRIMARY KEY,
  user_id       INT           NOT NULL REFERENCES dbo.Users(user_id),
  booking_ref   NVARCHAR(10)  NOT NULL UNIQUE,
  booking_date  DATETIME2     NOT NULL DEFAULT GETDATE(),
  total_amount  DECIMAL(12,2) NOT NULL DEFAULT 0,
  status        NVARCHAR(15)  NOT NULL DEFAULT N'Chờ xử lý'
                CHECK (status IN (N'Chờ xử lý', N'Thành công', N'Đã hủy')),
  contact_name  NVARCHAR(100),
  contact_email NVARCHAR(255),
  contact_phone NVARCHAR(20)
);
GO

-- ── Tickets ───────────────────────────────────────────────────
CREATE TABLE dbo.Tickets (
  ticket_id      INT           IDENTITY(1,1) PRIMARY KEY,
  booking_id     INT           NOT NULL REFERENCES dbo.Bookings(booking_id) ON DELETE CASCADE,
  flight_id      INT           NOT NULL REFERENCES dbo.Flights(flight_id),
  seat_id        INT               NULL REFERENCES dbo.SeatMaps(seat_id),
  passenger_name NVARCHAR(200) NOT NULL,
  passenger_type NVARCHAR(10)  NOT NULL DEFAULT 'adult'
                 CHECK (passenger_type IN ('adult', 'child', 'infant')),
  identity_card  NVARCHAR(50),
  ticket_price   DECIMAL(10,2) NOT NULL DEFAULT 0,
  class          NVARCHAR(10)  NOT NULL DEFAULT 'economy'
                 CHECK (class IN ('economy', 'business', 'first')),
  status         NVARCHAR(15)  NOT NULL DEFAULT N'Chờ xử lý'
                 CHECK (status IN (N'Chờ xử lý', N'Đã xác nhận', N'Đã hủy', N'Đã check-in'))
);
GO

-- ── Ticket_Services ───────────────────────────────────────────
CREATE TABLE dbo.Ticket_Services (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  ticket_id  INT NOT NULL REFERENCES dbo.Tickets(ticket_id)  ON DELETE CASCADE,
  service_id INT NOT NULL REFERENCES dbo.Services(service_id),
  quantity   INT NOT NULL DEFAULT 1 CHECK (quantity > 0)
);
GO

-- ═══════════════════════════════════════════════════════════
--  INDEXES
-- ═══════════════════════════════════════════════════════════
CREATE INDEX IX_Flights_departure ON dbo.Flights(departure_time);
CREATE INDEX IX_Flights_route     ON dbo.Flights(source_airport_id, destination_airport_id);
CREATE INDEX IX_Flights_recurring ON dbo.Flights(is_recurring);
CREATE INDEX IX_Flights_airline   ON dbo.Flights(airline_id);
CREATE INDEX IX_Aircrafts_airline ON dbo.Aircrafts(airline_id);
CREATE INDEX IX_Bookings_user     ON dbo.Bookings(user_id);
CREATE INDEX IX_Tickets_booking   ON dbo.Tickets(booking_id);
GO

-- ═══════════════════════════════════════════════════════════
--  SEED DATA
-- ═══════════════════════════════════════════════════════════

-- ── Admin ─────────────────────────────────────────────────────
INSERT INTO dbo.Users (username, password_hash, email, role) VALUES
(N'Quản trị viên',
 '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
 'admin@sky.com', 'admin');

-- ── Airports ──────────────────────────────────────────────────
INSERT INTO dbo.Airports (airport_id, name, city, country) VALUES
('HAN', N'Nội Bài',       N'Hà Nội',          N'Việt Nam'),
('SGN', N'Tân Sơn Nhất',  N'TP. Hồ Chí Minh', N'Việt Nam'),
('DAD', N'Đà Nẵng',       N'Đà Nẵng',         N'Việt Nam'),
('PQC', N'Phú Quốc',      N'Phú Quốc',        N'Việt Nam'),
('HPH', N'Cát Bi',        N'Hải Phòng',       N'Việt Nam'),
('BKK', N'Suvarnabhumi',  N'Bangkok',          N'Thái Lan'),
('SIN', N'Changi',        N'Singapore',        N'Singapore'),
('ICN', N'Incheon',       N'Seoul',            N'Hàn Quốc'),
('NRT', N'Narita',        N'Tokyo',            N'Nhật Bản'),
('KUL', N'KLIA',          N'Kuala Lumpur',     N'Malaysia');

-- ── Airlines ──────────────────────────────────────────────────
-- airline_id 1: Vietnam Airlines
-- airline_id 2: Vietjet Air
-- airline_id 3: Bamboo Airways
-- airline_id 4: Pacific Airlines
INSERT INTO dbo.Airlines (airline_code, airline_name, country, logo_url) VALUES
('VN', N'Vietnam Airlines',  N'Việt Nam', 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Vietnam_Airlines_logo.svg/250px-Vietnam_Airlines_logo.svg.png'),
('VJ', N'Vietjet Air',       N'Việt Nam', 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Vietjet_Air_Logo.svg/250px-Vietjet_Air_Logo.svg.png'),
('QH', N'Bamboo Airways',    N'Việt Nam', 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Bamboo_airways_logo.svg/250px-Bamboo_airways_logo.svg.png'),
('BL', N'Pacific Airlines',  N'Việt Nam', 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Pacific_Airlines_logo.svg/250px-Pacific_Airlines_logo.svg.png');

-- ── Aircrafts (airline_id: 1=VN, 2=VJ, 3=QH, 4=BL) ──────────
INSERT INTO dbo.Aircrafts (airline_id, model_name, manufacturer, total_seats) VALUES
(1, N'Airbus A321',  N'Airbus', 220),  -- id 1  VN
(1, N'Airbus A350',  N'Airbus', 300),  -- id 2  VN
(1, N'Boeing 787',   N'Boeing', 240),  -- id 3  VN
(2, N'Airbus A320',  N'Airbus', 180),  -- id 4  VJ
(2, N'Airbus A321',  N'Airbus', 220),  -- id 5  VJ
(3, N'Boeing 737',   N'Boeing', 162),  -- id 6  QH
(3, N'Airbus A319',  N'Airbus', 120),  -- id 7  QH
(4, N'Airbus A320',  N'Airbus', 180);  -- id 8  BL

-- ── SeatMaps (aircraft_id 1 – VN A321) ───────────────────────
INSERT INTO dbo.SeatMaps (aircraft_id, seat_code, seat_class, is_exit_row, surcharge) VALUES
-- First (hàng 1-2, 4 ghế AB/EF)
(1,'1A','first',0,1500000),(1,'1B','first',0,1500000),(1,'1E','first',0,1500000),(1,'1F','first',0,1500000),
(1,'2A','first',0,1500000),(1,'2B','first',0,1500000),(1,'2E','first',0,1500000),(1,'2F','first',0,1500000),
-- Business (hàng 3-6, 4 ghế AB/EF)
(1,'3A','business',0,800000),(1,'3B','business',0,800000),(1,'3E','business',0,800000),(1,'3F','business',0,800000),
(1,'4A','business',0,800000),(1,'4B','business',0,800000),(1,'4E','business',0,800000),(1,'4F','business',0,800000),
(1,'5A','business',0,800000),(1,'5B','business',0,800000),(1,'5E','business',0,800000),(1,'5F','business',0,800000),
(1,'6A','business',0,800000),(1,'6B','business',0,800000),(1,'6E','business',0,800000),(1,'6F','business',0,800000),
-- Economy (hàng 10-25)
(1,'10A','economy',0,0),(1,'10B','economy',0,0),(1,'10C','economy',0,0),(1,'10D','economy',0,0),(1,'10E','economy',0,0),(1,'10F','economy',0,0),
(1,'11A','economy',0,0),(1,'11B','economy',0,0),(1,'11C','economy',0,0),(1,'11D','economy',0,0),(1,'11E','economy',0,0),(1,'11F','economy',0,0),
(1,'12A','economy',1,0),(1,'12B','economy',1,0),(1,'12C','economy',1,0),(1,'12D','economy',1,0),(1,'12E','economy',1,0),(1,'12F','economy',1,0),
(1,'13A','economy',0,0),(1,'13B','economy',0,0),(1,'13C','economy',0,0),(1,'13D','economy',0,0),(1,'13E','economy',0,0),(1,'13F','economy',0,0),
(1,'14A','economy',0,0),(1,'14B','economy',0,0),(1,'14C','economy',0,0),(1,'14D','economy',0,0),(1,'14E','economy',0,0),(1,'14F','economy',0,0),
(1,'15A','economy',0,0),(1,'15B','economy',0,0),(1,'15C','economy',0,0),(1,'15D','economy',0,0),(1,'15E','economy',0,0),(1,'15F','economy',0,0),
(1,'16A','economy',0,0),(1,'16B','economy',0,0),(1,'16C','economy',0,0),(1,'16D','economy',0,0),(1,'16E','economy',0,0),(1,'16F','economy',0,0),
(1,'17A','economy',0,0),(1,'17B','economy',0,0),(1,'17C','economy',0,0),(1,'17D','economy',0,0),(1,'17E','economy',0,0),(1,'17F','economy',0,0),
(1,'18A','economy',0,0),(1,'18B','economy',0,0),(1,'18C','economy',0,0),(1,'18D','economy',0,0),(1,'18E','economy',0,0),(1,'18F','economy',0,0),
(1,'19A','economy',0,0),(1,'19B','economy',0,0),(1,'19C','economy',0,0),(1,'19D','economy',0,0),(1,'19E','economy',0,0),(1,'19F','economy',0,0),
(1,'20A','economy',0,0),(1,'20B','economy',0,0),(1,'20C','economy',0,0),(1,'20D','economy',0,0),(1,'20E','economy',0,0),(1,'20F','economy',0,0);

-- ── Flights ───────────────────────────────────────────────────
-- Cột: flight_code, airline_id, aircraft_id, source, dest, dep, arr, price, status, is_recurring

-- Chuyến cố định hàng ngày (is_recurring = 1)
INSERT INTO dbo.Flights (flight_code, airline_id, aircraft_id, source_airport_id, destination_airport_id, departure_time, arrival_time, base_price, status, is_recurring) VALUES
-- Vietnam Airlines: SGN ↔ HAN
('VN201', 1, 1, 'SGN', 'HAN', '2026-01-01 06:00', '2026-01-01 08:10', 1200000, 'On Time', 1),
('VN203', 1, 1, 'SGN', 'HAN', '2026-01-01 12:00', '2026-01-01 14:10', 1100000, 'On Time', 1),
('VN205', 1, 1, 'SGN', 'HAN', '2026-01-01 18:00', '2026-01-01 20:10', 1300000, 'On Time', 1),
('VN202', 1, 1, 'HAN', 'SGN', '2026-01-01 07:00', '2026-01-01 09:10', 1200000, 'On Time', 1),
('VN204', 1, 1, 'HAN', 'SGN', '2026-01-01 14:00', '2026-01-01 16:10', 1100000, 'On Time', 1),
('VN206', 1, 1, 'HAN', 'SGN', '2026-01-01 20:00', '2026-01-01 22:10', 1350000, 'On Time', 1),
-- Vietjet: SGN ↔ HAN
('VJ201', 2, 5, 'SGN', 'HAN', '2026-01-01 07:00', '2026-01-01 09:10',  890000, 'On Time', 1),
('VJ202', 2, 5, 'HAN', 'SGN', '2026-01-01 10:00', '2026-01-01 12:10',  890000, 'On Time', 1),
-- Vietnam Airlines: SGN ↔ DAD
('VN301', 1, 1, 'SGN', 'DAD', '2026-01-01 08:00', '2026-01-01 09:15',  900000, 'On Time', 1),
('VN303', 1, 1, 'SGN', 'DAD', '2026-01-01 15:00', '2026-01-01 16:15',  850000, 'On Time', 1),
('VN302', 1, 1, 'DAD', 'SGN', '2026-01-01 10:00', '2026-01-01 11:15',  900000, 'On Time', 1),
('VN304', 1, 1, 'DAD', 'SGN', '2026-01-01 17:30', '2026-01-01 18:45',  850000, 'On Time', 1),
-- Bamboo: HAN ↔ DAD
('QH401', 3, 6, 'HAN', 'DAD', '2026-01-01 09:00', '2026-01-01 10:05',  800000, 'On Time', 1),
('QH402', 3, 6, 'DAD', 'HAN', '2026-01-01 11:00', '2026-01-01 12:05',  800000, 'On Time', 1),
-- Vietjet: SGN ↔ PQC
('VJ501', 2, 4, 'SGN', 'PQC', '2026-01-01 07:30', '2026-01-01 08:40',  750000, 'On Time', 1),
('VJ503', 2, 4, 'SGN', 'PQC', '2026-01-01 14:00', '2026-01-01 15:10',  700000, 'On Time', 1),
('VJ502', 2, 4, 'PQC', 'SGN', '2026-01-01 09:30', '2026-01-01 10:40',  750000, 'On Time', 1),
('VJ504', 2, 4, 'PQC', 'SGN', '2026-01-01 16:30', '2026-01-01 17:40',  700000, 'On Time', 1),
-- Vietnam Airlines: HAN ↔ PQC
('VN601', 1, 1, 'HAN', 'PQC', '2026-01-01 08:30', '2026-01-01 10:20', 1050000, 'On Time', 1),
('VN602', 1, 1, 'PQC', 'HAN', '2026-01-01 11:30', '2026-01-01 13:20', 1050000, 'On Time', 1),
-- Pacific: SGN ↔ HPH
('BL701', 4, 8, 'SGN', 'HPH', '2026-01-01 07:00', '2026-01-01 09:00',  980000, 'On Time', 1),
('BL702', 4, 8, 'HPH', 'SGN', '2026-01-01 10:30', '2026-01-01 12:30',  980000, 'On Time', 1),
-- Vietnam Airlines: HAN ↔ HPH
('VN711', 1, 1, 'HAN', 'HPH', '2026-01-01 08:00', '2026-01-01 08:45',  550000, 'On Time', 1),
('VN712', 1, 1, 'HPH', 'HAN', '2026-01-01 10:00', '2026-01-01 10:45',  550000, 'On Time', 1),
-- Vietnam Airlines Quốc tế: SGN ↔ BKK
('VN801', 1, 2, 'SGN', 'BKK', '2026-01-01 08:00', '2026-01-01 09:50', 2500000, 'On Time', 1),
('VN802', 1, 2, 'BKK', 'SGN', '2026-01-01 11:00', '2026-01-01 12:50', 2500000, 'On Time', 1),
-- Vietnam Airlines: SGN ↔ SIN
('VN811', 1, 2, 'SGN', 'SIN', '2026-01-01 09:00', '2026-01-01 12:30', 3200000, 'On Time', 1),
('VN812', 1, 2, 'SIN', 'SGN', '2026-01-01 14:00', '2026-01-01 15:30', 3200000, 'On Time', 1),
-- Vietnam Airlines: HAN ↔ ICN
('VN821', 1, 3, 'HAN', 'ICN', '2026-01-01 07:00', '2026-01-01 14:30', 6500000, 'On Time', 1),
('VN822', 1, 3, 'ICN', 'HAN', '2026-01-01 16:00', '2026-01-01 19:30', 6500000, 'On Time', 1),
-- Vietnam Airlines: HAN ↔ NRT
('VN831', 1, 3, 'HAN', 'NRT', '2026-01-01 08:00', '2026-01-01 16:00', 8500000, 'On Time', 1),
('VN832', 1, 3, 'NRT', 'HAN', '2026-01-01 17:30', '2026-01-01 21:30', 8500000, 'On Time', 1),
-- Vietjet: SGN ↔ KUL
('VJ841', 2, 5, 'SGN', 'KUL', '2026-01-01 10:00', '2026-01-01 13:20', 2800000, 'On Time', 1),
('VJ842', 2, 5, 'KUL', 'SGN', '2026-01-01 14:30', '2026-01-01 15:50', 2800000, 'On Time', 1),
-- Bamboo: HAN ↔ BKK
('QH861', 3, 6, 'HAN', 'BKK', '2026-01-01 10:00', '2026-01-01 13:00', 2900000, 'On Time', 1),
('QH862', 3, 6, 'BKK', 'HAN', '2026-01-01 14:30', '2026-01-01 17:30', 2900000, 'On Time', 1),
-- Vietnam Airlines: SGN ↔ ICN
('VN851', 1, 3, 'SGN', 'ICN', '2026-01-01 23:00', '2026-01-02 07:00', 7200000, 'On Time', 1),
('VN852', 1, 3, 'ICN', 'SGN', '2026-01-01 09:00', '2026-01-01 14:00', 7200000, 'On Time', 1);

-- Chuyến cụ thể (is_recurring = 0)
INSERT INTO dbo.Flights (flight_code, airline_id, aircraft_id, source_airport_id, destination_airport_id, departure_time, arrival_time, base_price, is_recurring) VALUES
('VN101', 1, 1, 'SGN', 'HAN', '2026-04-01 08:00', '2026-04-01 10:10', 1299000, 0),
('VN102', 1, 1, 'HAN', 'SGN', '2026-04-01 11:00', '2026-04-01 13:10', 1199000, 0),
('VJ208', 2, 4, 'SGN', 'DAD', '2026-04-02 07:00', '2026-04-02 08:20',  899000, 0),
('VJ301', 2, 4, 'SGN', 'PQC', '2026-04-03 14:00', '2026-04-03 15:10',  799000, 0),
('QH300', 3, 6, 'HAN', 'DAD', '2026-04-04 09:00', '2026-04-04 10:30',  950000, 0);

-- ── Services ──────────────────────────────────────────────────
INSERT INTO dbo.Services (service_name, type, price, description) VALUES
(N'Cơm Gà Hải Nam',   'meal',      150000, N'Suất ăn nóng trên chuyến bay'),
(N'Mì Ý Bò Bằm',      'meal',      120000, N'Suất ăn nóng trên chuyến bay'),
(N'Bánh Mì Sandwich',  'meal',       80000, N'Ăn nhẹ'),
(N'Hành lý 20kg',      'baggage',   250000, N'Hành lý ký gửi 20kg'),
(N'Hành lý 30kg',      'baggage',   350000, N'Hành lý ký gửi 30kg'),
(N'Hành lý quá khổ',   'oversized', 500000, N'Xe đạp, ván surf, gậy golf...');
GO

-- Thêm cột status vào Airports nếu chưa có
IF NOT EXISTS (SELECT 1 FROM sys.columns 
               WHERE object_id=OBJECT_ID('dbo.Airports') AND name='status')
  ALTER TABLE dbo.Airports ADD status NVARCHAR(20) NOT NULL DEFAULT 'active';
GO

USE skybooker;

-- Xem tất cả bookings
SELECT * FROM dbo.Bookings;

-- Xem tất cả tickets
SELECT * FROM dbo.Tickets;

-- Xem bookings có ticket không
SELECT b.booking_id, b.booking_ref, b.status, COUNT(t.ticket_id) AS ticket_count
FROM dbo.Bookings b
LEFT JOIN dbo.Tickets t ON t.booking_id = b.booking_id
GROUP BY b.booking_id, b.booking_ref, b.status;