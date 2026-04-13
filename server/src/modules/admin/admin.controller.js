const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../../config/db');

// ── Helper: kiểm tra role ─────────────────────────────────────
const isSuperAdmin    = (req) => req.user?.role === 'SUPER_ADMIN';
const isAirlineAdmin  = (req) => req.user?.role === 'AIRLINE_ADMIN';

// ── Stats ─────────────────────────────────────────────────────
const getStats = async (req, res) => {
  try {
    const pool = await getPool();

    // AIRLINE_ADMIN chỉ thấy stats của hãng mình
    if (isAirlineAdmin(req)) {
      const airlineId = req.user.airline_id;
      const result = await pool.request()
        .input('airline_id', sql.Int, airlineId)
        .query(`
          SELECT
            (SELECT COUNT(*) FROM dbo.Flights WHERE airline_id = @airline_id AND status != 'Cancelled') AS total_flights,
            (SELECT COUNT(*) FROM dbo.Bookings b
             JOIN dbo.Tickets t ON t.booking_id = b.booking_id
             JOIN dbo.Flights f ON t.flight_id  = f.flight_id
             WHERE f.airline_id = @airline_id) AS total_bookings,
            (SELECT COUNT(*) FROM dbo.Bookings b
             JOIN dbo.Tickets t ON t.booking_id = b.booking_id
             JOIN dbo.Flights f ON t.flight_id  = f.flight_id
             WHERE f.airline_id = @airline_id AND b.status = N'Thành công') AS success_bookings,
            (SELECT COUNT(*) FROM dbo.Bookings b
             JOIN dbo.Tickets t ON t.booking_id = b.booking_id
             JOIN dbo.Flights f ON t.flight_id  = f.flight_id
             WHERE f.airline_id = @airline_id AND b.status = N'Chờ xử lý') AS pending_bookings,
            (SELECT COUNT(*) FROM dbo.Bookings b
             JOIN dbo.Tickets t ON t.booking_id = b.booking_id
             JOIN dbo.Flights f ON t.flight_id  = f.flight_id
             WHERE f.airline_id = @airline_id AND b.status = N'Đã hủy') AS canceled_bookings,
            (SELECT ISNULL(SUM(b.total_amount), 0)
             FROM dbo.Bookings b
             JOIN dbo.Tickets t ON t.booking_id = b.booking_id
             JOIN dbo.Flights f ON t.flight_id  = f.flight_id
             WHERE f.airline_id = @airline_id AND b.status = N'Thành công') AS total_revenue
        `);
      const d = result.recordset[0];
      return res.json({ success: true, data: {
        revenue:  { total: d.total_revenue },
        users:    { total: 0, active: 0 },   // AIRLINE_ADMIN không xem users
        bookings: {
          total:    d.total_bookings,
          success:  d.success_bookings,
          pending:  d.pending_bookings,
          canceled: d.canceled_bookings,
        },
      }});
    }

    // SUPER_ADMIN: xem tất cả (giữ nguyên logic cũ)
    const result = await pool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM dbo.Users    WHERE role = 'USER') AS total_customers,
        (SELECT COUNT(*) FROM dbo.Flights  WHERE status != 'Cancelled') AS total_flights,
        (SELECT COUNT(*) FROM dbo.Bookings) AS total_bookings,
        (SELECT COUNT(*) FROM dbo.Bookings WHERE status = N'Thành công') AS success_bookings,
        (SELECT COUNT(*) FROM dbo.Bookings WHERE status = N'Chờ xử lý')  AS pending_bookings,
        (SELECT COUNT(*) FROM dbo.Bookings WHERE status = N'Chờ hủy')    AS canceling_bookings,
        (SELECT COUNT(*) FROM dbo.Bookings WHERE status = N'Đã hủy')     AS canceled_bookings,
        (SELECT ISNULL(SUM(total_amount), 0) FROM dbo.Bookings WHERE status = N'Thành công') AS total_revenue
    `);
    const d = result.recordset[0];
    res.json({ success: true, data: {
      revenue:  { total: d.total_revenue },
      users:    { total: d.total_customers, active: d.total_customers },
      bookings: {
        total:     d.total_bookings,
        success:   d.success_bookings,
        pending:   d.pending_bookings,
        canceling: d.canceling_bookings,
        canceled:  d.canceled_bookings,
      },
    }});
  } catch (err) {
    console.error('getStats error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Flights ───────────────────────────────────────────────────
const getFlights = async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();

    // AIRLINE_ADMIN chỉ thấy chuyến bay của hãng mình
    let whereClause = '';
    if (isAirlineAdmin(req)) {
      request.input('airline_id', sql.Int, req.user.airline_id);
      whereClause = 'WHERE f.airline_id = @airline_id';
    }

    const result = await request.query(`
      SELECT f.*, a.model_name,
        src.city AS origin_city, src.airport_id AS origin_iata,
        dst.city AS dest_city,   dst.airport_id AS dest_iata,
        al.airline_name, al.airline_code, al.logo_url AS airline_logo
      FROM dbo.Flights f
      JOIN dbo.Aircrafts a   ON f.aircraft_id            = a.aircraft_id
      JOIN dbo.Airports src  ON f.source_airport_id      = src.airport_id
      JOIN dbo.Airports dst  ON f.destination_airport_id = dst.airport_id
      LEFT JOIN dbo.Airlines al ON f.airline_id = al.airline_id
      ${whereClause}
      ORDER BY f.departure_time DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('getFlights error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const createFlight = async (req, res) => {
  try {
    const pool = await getPool();
    let { flight_code, aircraft_id, source_airport_id, destination_airport_id,
          departure_time, arrival_time, base_price, status, airline_id, is_recurring } = req.body;

    // AIRLINE_ADMIN chỉ được tạo chuyến bay cho hãng mình
    if (isAirlineAdmin(req)) {
      airline_id = req.user.airline_id;
    }

    const result = await pool.request()
      .input('flight_code',           sql.NVarChar, flight_code)
      .input('aircraft_id',           sql.Int,      aircraft_id)
      .input('source_airport_id',     sql.Char,     source_airport_id)
      .input('destination_airport_id',sql.Char,     destination_airport_id)
      .input('departure_time',        sql.DateTime, new Date(departure_time))
      .input('arrival_time',          sql.DateTime, new Date(arrival_time))
      .input('base_price',            sql.Decimal,  base_price)
      .input('status',                sql.NVarChar, status || 'On Time')
      .input('airline_id',            sql.Int,      airline_id || null)
      .input('is_recurring',          sql.Bit,      is_recurring ? 1 : 0)
      .query(`
        INSERT INTO dbo.Flights
          (flight_code, aircraft_id, source_airport_id, destination_airport_id,
           departure_time, arrival_time, base_price, status, airline_id, is_recurring)
        OUTPUT INSERTED.*
        VALUES (@flight_code, @aircraft_id, @source_airport_id, @destination_airport_id,
                @departure_time, @arrival_time, @base_price, @status, @airline_id, @is_recurring)
      `);
    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (err) {
    console.error('createFlight error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const updateFlight = async (req, res) => {
  try {
    const pool = await getPool();

    // Kiểm tra AIRLINE_ADMIN chỉ sửa chuyến bay của hãng mình
    if (isAirlineAdmin(req)) {
      const check = await pool.request()
        .input('id',         sql.Int, req.params.id)
        .input('airline_id', sql.Int, req.user.airline_id)
        .query(`SELECT 1 FROM dbo.Flights WHERE flight_id = @id AND airline_id = @airline_id`);
      if (check.recordset.length === 0)
        return res.status(403).json({ success: false, message: 'Bạn không có quyền sửa chuyến bay này' });
    }

    let { flight_code, aircraft_id, source_airport_id, destination_airport_id,
          departure_time, arrival_time, base_price, status, airline_id, is_recurring } = req.body;

    if (isAirlineAdmin(req)) airline_id = req.user.airline_id;

    await pool.request()
      .input('id',                    sql.Int,      req.params.id)
      .input('flight_code',           sql.NVarChar, flight_code)
      .input('aircraft_id',           sql.Int,      aircraft_id)
      .input('source_airport_id',     sql.Char,     source_airport_id)
      .input('destination_airport_id',sql.Char,     destination_airport_id)
      .input('departure_time',        sql.DateTime, new Date(departure_time))
      .input('arrival_time',          sql.DateTime, new Date(arrival_time))
      .input('base_price',            sql.Decimal,  base_price)
      .input('status',                sql.NVarChar, status)
      .input('airline_id',            sql.Int,      airline_id || null)
      .input('is_recurring',          sql.Bit,      is_recurring ? 1 : 0)
      .query(`
        UPDATE dbo.Flights SET
          flight_code = @flight_code, aircraft_id = @aircraft_id,
          source_airport_id = @source_airport_id, destination_airport_id = @destination_airport_id,
          departure_time = @departure_time, arrival_time = @arrival_time,
          base_price = @base_price, status = @status,
          airline_id = @airline_id, is_recurring = @is_recurring
        WHERE flight_id = @id
      `);
    res.json({ success: true, message: 'Cập nhật chuyến bay thành công' });
  } catch (err) {
    console.error('updateFlight error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const deleteFlight = async (req, res) => {
  try {
    const pool = await getPool();

    // AIRLINE_ADMIN chỉ hủy chuyến bay của hãng mình
    if (isAirlineAdmin(req)) {
      const check = await pool.request()
        .input('id',         sql.Int, req.params.id)
        .input('airline_id', sql.Int, req.user.airline_id)
        .query(`SELECT 1 FROM dbo.Flights WHERE flight_id = @id AND airline_id = @airline_id`);
      if (check.recordset.length === 0)
        return res.status(403).json({ success: false, message: 'Bạn không có quyền hủy chuyến bay này' });
    }

    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`UPDATE dbo.Flights SET status = 'Cancelled' WHERE flight_id = @id`);
    res.json({ success: true, message: 'Đã hủy chuyến bay' });
  } catch (err) {
    console.error('deleteFlight error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Aircrafts ─────────────────────────────────────────────────
const getAircrafts = async (req, res) => {
  try {
    const pool    = await getPool();
    const request = pool.request();

    let whereClause = '';
    if (isAirlineAdmin(req)) {
      request.input('airline_id', sql.Int, req.user.airline_id);
      whereClause = 'WHERE ac.airline_id = @airline_id';
    }

    const result = await request.query(`
      SELECT ac.*, al.airline_name, al.airline_code, al.logo_url AS airline_logo
      FROM dbo.Aircrafts ac
      LEFT JOIN dbo.Airlines al ON ac.airline_id = al.airline_id
      ${whereClause}
      ORDER BY ac.model_name
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('getAircrafts error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const createAircraft = async (req, res) => {
  try {
    const pool = await getPool();
    let { model_name, manufacturer, total_seats, airline_id, status } = req.body;

    if (isAirlineAdmin(req)) airline_id = req.user.airline_id;

    const result = await pool.request()
      .input('model_name',   sql.NVarChar, model_name)
      .input('manufacturer', sql.NVarChar, manufacturer)
      .input('total_seats',  sql.Int,      total_seats)
      .input('airline_id',   sql.Int,      airline_id || null)
      .input('status',       sql.NVarChar, status || 'Đang hoạt động')
      .query(`
        INSERT INTO dbo.Aircrafts (airline_id, model_name, manufacturer, total_seats, status)
        OUTPUT INSERTED.*
        VALUES (@airline_id, @model_name, @manufacturer, @total_seats, @status)
      `);
    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (err) {
    console.error('createAircraft error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const updateAircraft = async (req, res) => {
  try {
    const pool = await getPool();

    if (isAirlineAdmin(req)) {
      const check = await pool.request()
        .input('id',         sql.Int, req.params.id)
        .input('airline_id', sql.Int, req.user.airline_id)
        .query(`SELECT 1 FROM dbo.Aircrafts WHERE aircraft_id = @id AND airline_id = @airline_id`);
      if (check.recordset.length === 0)
        return res.status(403).json({ success: false, message: 'Bạn không có quyền sửa máy bay này' });
    }

    let { model_name, manufacturer, total_seats, airline_id, status } = req.body;
    if (isAirlineAdmin(req)) airline_id = req.user.airline_id;

    await pool.request()
      .input('id',           sql.Int,      req.params.id)
      .input('model_name',   sql.NVarChar, model_name)
      .input('manufacturer', sql.NVarChar, manufacturer)
      .input('total_seats',  sql.Int,      total_seats)
      .input('airline_id',   sql.Int,      airline_id || null)
      .input('status',       sql.NVarChar, status || 'Đang hoạt động')
      .query(`
        UPDATE dbo.Aircrafts
        SET model_name=@model_name, manufacturer=@manufacturer,
            total_seats=@total_seats, airline_id=@airline_id, status=@status
        WHERE aircraft_id=@id
      `);
    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (err) {
    console.error('updateAircraft error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const deleteAircraft = async (req, res) => {
  try {
    const pool = await getPool();

    if (isAirlineAdmin(req)) {
      const check = await pool.request()
        .input('id',         sql.Int, req.params.id)
        .input('airline_id', sql.Int, req.user.airline_id)
        .query(`SELECT 1 FROM dbo.Aircrafts WHERE aircraft_id = @id AND airline_id = @airline_id`);
      if (check.recordset.length === 0)
        return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa máy bay này' });
    }

    const checkFlights = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`SELECT COUNT(*) AS cnt FROM dbo.Flights WHERE aircraft_id = @id AND status != 'Cancelled'`);
    if (checkFlights.recordset[0].cnt > 0)
      return res.status(400).json({ success: false, message: 'Không thể xóa: máy bay đang được sử dụng trong các chuyến bay' });

    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`UPDATE dbo.Aircrafts SET status = N'Ngừng hoạt động' WHERE aircraft_id = @id`);
    res.json({ success: true, message: 'Đã ngừng hoạt động máy bay' });
  } catch (err) {
    console.error('deleteAircraft error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Airports ──────────────────────────────────────────────────
// Chỉ SUPER_ADMIN dùng (đã chặn ở routes), giữ nguyên
const getAirports = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`SELECT * FROM dbo.Airports ORDER BY city`);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const createAirport = async (req, res) => {
  try {
    const { airport_id, name, city, country } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('airport_id', sql.Char,     airport_id.toUpperCase())
      .input('name',       sql.NVarChar, name)
      .input('city',       sql.NVarChar, city)
      .input('country',    sql.NVarChar, country)
      .query(`INSERT INTO dbo.Airports (airport_id, name, city, country) OUTPUT INSERTED.* VALUES (@airport_id, @name, @city, @country)`);
    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const updateAirport = async (req, res) => {
  try {
    const { name, city, country } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('id',      sql.Char,     req.params.id)
      .input('name',    sql.NVarChar, name)
      .input('city',    sql.NVarChar, city)
      .input('country', sql.NVarChar, country)
      .query(`UPDATE dbo.Airports SET name=@name, city=@city, country=@country WHERE airport_id=@id`);
    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const deleteAirport = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Char, req.params.id)
      .query(`DELETE FROM dbo.Airports WHERE airport_id=@id`);
    res.json({ success: true, message: 'Đã xóa' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Services ──────────────────────────────────────────────────
const getServices = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`SELECT * FROM dbo.Services ORDER BY type, service_name`);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const createService = async (req, res) => {
  try {
    const { service_name, type, price, status } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('service_name', sql.NVarChar, service_name)
      .input('type',         sql.NVarChar, type)
      .input('price',        sql.Decimal,  price)
      .input('status',       sql.NVarChar, status || 'Active')
      .query(`INSERT INTO dbo.Services (service_name, type, price, status) OUTPUT INSERTED.* VALUES (@service_name, @type, @price, @status)`);
    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const updateService = async (req, res) => {
  try {
    const { service_name, type, price, status } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('id',           sql.Int,      req.params.id)
      .input('service_name', sql.NVarChar, service_name)
      .input('type',         sql.NVarChar, type)
      .input('price',        sql.Decimal,  price)
      .input('status',       sql.NVarChar, status)
      .query(`UPDATE dbo.Services SET service_name=@service_name, type=@type, price=@price, status=@status WHERE service_id=@id`);
    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const deleteService = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, req.params.id)
      .query(`DELETE FROM dbo.Services WHERE service_id=@id`);
    res.json({ success: true, message: 'Đã xóa' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Bookings ──────────────────────────────────────────────────
const getBookings = async (req, res) => {
  try {
    const pool    = await getPool();
    const request = pool.request();

    // AIRLINE_ADMIN chỉ thấy booking có ticket thuộc chuyến bay của hãng mình
    let whereClause = '';
    if (isAirlineAdmin(req)) {
      request.input('airline_id', sql.Int, req.user.airline_id);
      whereClause = 'WHERE f.airline_id = @airline_id';
    }

    const result = await request.query(`
      SELECT
        b.booking_id, b.user_id, b.booking_ref, b.booking_date,
        b.total_amount, b.status, b.cancel_reason,
        b.contact_name, b.contact_email, b.contact_phone,
        u.username, u.email,
        COUNT(t.ticket_id) AS passenger_count
      FROM dbo.Bookings b
      JOIN dbo.Users u   ON b.user_id    = u.user_id
      JOIN dbo.Tickets t ON t.booking_id = b.booking_id
      JOIN dbo.Flights f ON t.flight_id  = f.flight_id
      ${whereClause}
      GROUP BY b.booking_id, b.user_id, b.booking_ref, b.booking_date,
               b.total_amount, b.status, b.cancel_reason,
               b.contact_name, b.contact_email, b.contact_phone,
               u.username, u.email
      ORDER BY b.booking_date DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('getBookings error:', err.message);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const approveCancel = async (req, res) => {
  try {
    const pool = await getPool();

    // AIRLINE_ADMIN: chỉ duyệt hủy booking của chuyến bay hãng mình
    if (isAirlineAdmin(req)) {
      const check = await pool.request()
        .input('booking_id', sql.Int, req.params.id)
        .input('airline_id', sql.Int, req.user.airline_id)
        .query(`
          SELECT 1 FROM dbo.Tickets t
          JOIN dbo.Flights f ON t.flight_id = f.flight_id
          WHERE t.booking_id = @booking_id AND f.airline_id = @airline_id
        `);
      if (check.recordset.length === 0)
        return res.status(403).json({ success: false, message: 'Bạn không có quyền duyệt booking này' });
    }

    const r = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`UPDATE dbo.Bookings SET status = N'Đã hủy' WHERE booking_id = @id AND status = N'Chờ hủy'`);
    if (r.rowsAffected[0] === 0)
      return res.status(400).json({ success: false, message: 'Không tìm thấy yêu cầu hủy hoặc vé không ở trạng thái chờ hủy' });
    res.json({ success: true, message: 'Đã duyệt hủy vé' });
  } catch (err) {
    console.error('approveCancel error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const rejectCancel = async (req, res) => {
  try {
    const pool = await getPool();

    if (isAirlineAdmin(req)) {
      const check = await pool.request()
        .input('booking_id', sql.Int, req.params.id)
        .input('airline_id', sql.Int, req.user.airline_id)
        .query(`
          SELECT 1 FROM dbo.Tickets t
          JOIN dbo.Flights f ON t.flight_id = f.flight_id
          WHERE t.booking_id = @booking_id AND f.airline_id = @airline_id
        `);
      if (check.recordset.length === 0)
        return res.status(403).json({ success: false, message: 'Bạn không có quyền từ chối booking này' });
    }

    const r = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        UPDATE dbo.Bookings
        SET status = N'Chờ xử lý', cancel_reason = NULL
        WHERE booking_id = @id AND status = N'Chờ hủy'
      `);
    if (r.rowsAffected[0] === 0)
      return res.status(400).json({ success: false, message: 'Không tìm thấy yêu cầu hủy hoặc vé không ở trạng thái chờ hủy' });
    res.json({ success: true, message: 'Đã từ chối yêu cầu hủy vé' });
  } catch (err) {
    console.error('rejectCancel error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const deleteBooking = async (req, res) => {
  // Chỉ SUPER_ADMIN (đã chặn ở routes)
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`UPDATE dbo.Bookings SET is_deleted = 1 WHERE booking_id = @id`);
    if (r.rowsAffected[0] === 0)
      return res.status(400).json({ success: false, message: 'Không tìm thấy đặt vé' });
    res.json({ success: true, message: 'Đã xóa đặt vé' });
  } catch (err) {
    console.error('deleteBooking error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Airlines ──────────────────────────────────────────────────
// Tạo/sửa/xóa chỉ SUPER_ADMIN (đã chặn ở routes), giữ nguyên logic
const getAirlines = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`SELECT * FROM dbo.Airlines ORDER BY airline_name`);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const createAirline = async (req, res) => {
  try {
    const { airline_name, airline_code, country, logo_url, status } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('airline_name', sql.NVarChar, airline_name)
      .input('airline_code', sql.NVarChar, airline_code)
      .input('country',      sql.NVarChar, country || 'Việt Nam')
      .input('logo_url',     sql.NVarChar, logo_url || null)
      .input('status',       sql.NVarChar, status || 'active')
      .query(`
        INSERT INTO dbo.Airlines (airline_name, airline_code, country, logo_url, status)
        OUTPUT INSERTED.*
        VALUES (@airline_name, @airline_code, @country, @logo_url, @status)
      `);
    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (err) {
    console.error('createAirline error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const updateAirline = async (req, res) => {
  try {
    const { airline_name, airline_code, country, logo_url, status } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('id',           sql.Int,      req.params.id)
      .input('airline_name', sql.NVarChar, airline_name)
      .input('airline_code', sql.NVarChar, airline_code)
      .input('country',      sql.NVarChar, country || 'Việt Nam')
      .input('logo_url',     sql.NVarChar, logo_url || null)
      .input('status',       sql.NVarChar, status || 'active')
      .query(`
        UPDATE dbo.Airlines
        SET airline_name=@airline_name, airline_code=@airline_code,
            country=@country, logo_url=@logo_url, status=@status
        WHERE airline_id=@id
      `);
    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (err) {
    console.error('updateAirline error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const deleteAirline = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, req.params.id)
      .query(`DELETE FROM dbo.Airlines WHERE airline_id=@id`);
    res.json({ success: true, message: 'Đã xóa' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Customers ─────────────────────────────────────────────────
// Chỉ SUPER_ADMIN (đã chặn ở routes), giữ nguyên
const getCustomers = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT user_id, username, email, phone_number, role, airline_id, status, created_at
      FROM dbo.Users WHERE role = 'USER' ORDER BY created_at DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const banCustomer = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, req.params.id)
      .query(`UPDATE dbo.Users SET status = 'banned' WHERE user_id = @id`);
    res.json({ success: true, message: 'Đã khóa tài khoản' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const unbanCustomer = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, req.params.id)
      .query(`UPDATE dbo.Users SET status = 'active' WHERE user_id = @id`);
    res.json({ success: true, message: 'Đã mở khóa tài khoản' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

module.exports = {
  getStats,
  getFlights, createFlight, updateFlight, deleteFlight,
  getAircrafts, createAircraft, updateAircraft, deleteAircraft,
  getAirports, createAirport, updateAirport, deleteAirport,
  getServices, createService, updateService, deleteService,
  getBookings, approveCancel, rejectCancel, deleteBooking,
  getAirlines, createAirline, updateAirline, deleteAirline,
  getCustomers, banCustomer, unbanCustomer,
};