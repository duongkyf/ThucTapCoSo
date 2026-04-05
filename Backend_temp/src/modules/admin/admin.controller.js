const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../../config/db');

// ── Stats ─────────────────────────────────────────────────────
const getStats = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM dbo.Users    WHERE role != 'admin') AS total_customers,
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
    const { q, status, from, to, date } = req.query;
    const pool = await getPool();
    const request = pool.request();

    let where = 'WHERE 1=1';
    if (q) {
      request.input('q', sql.NVarChar, `%${q}%`);
      where += ` AND (f.flight_code LIKE @q OR src.city LIKE @q OR dst.city LIKE @q)`;
    }
    if (status) {
      request.input('status', sql.NVarChar, status);
      where += ` AND f.status = @status`;
    }
    if (from) {
      request.input('from', sql.Char, from.toUpperCase());
      where += ` AND f.source_airport_id = @from`;
    }
    if (to) {
      request.input('to', sql.Char, to.toUpperCase());
      where += ` AND f.destination_airport_id = @to`;
    }
    if (date) {
      request.input('date', sql.NVarChar, date);
      where += ` AND CAST(f.departure_time AS DATE) = CAST(@date AS DATE)`;
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
      ${where}
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
    const {
      flight_code, airline_id, aircraft_id,
      source_airport_id, destination_airport_id,
      departure_time, arrival_time,
      base_price, status
    } = req.body;

    console.log('Body nhận được:', req.body);

    const pool = await getPool();

    // Kiểm tra airline_id có tồn tại không
    const airlineCheck = await pool.request()
      .input('airline_id', sql.Int, Number(airline_id))
      .query('SELECT airline_id FROM dbo.Airlines WHERE airline_id = @airline_id');

    if (!airlineCheck.recordset[0]) {
      return res.status(400).json({
        success: false,
        message: `Hãng hàng không ID=${airline_id} không tồn tại`
      });
    }

    // Kiểm tra aircraft_id có tồn tại không
    const aircraftCheck = await pool.request()
      .input('aircraft_id', sql.Int, Number(aircraft_id))
      .query('SELECT aircraft_id FROM dbo.Aircrafts WHERE aircraft_id = @aircraft_id');

    if (!aircraftCheck.recordset[0]) {
      return res.status(400).json({
        success: false,
        message: `Máy bay ID=${aircraft_id} không tồn tại`
      });
    }

    await pool.request()
      .input('flight_code',            sql.NVarChar, flight_code)
      .input('airline_id',             sql.Int,      Number(airline_id))
      .input('aircraft_id',            sql.Int,      Number(aircraft_id))
      .input('source_airport_id',      sql.Char,     source_airport_id)
      .input('destination_airport_id', sql.Char,     destination_airport_id)
      .input('departure_time',         sql.DateTime, new Date(departure_time))
      .input('arrival_time',           sql.DateTime, new Date(arrival_time))
      .input('base_price',             sql.Decimal,  Number(base_price))
      .input('status',                 sql.NVarChar, status || 'On Time')
      .query(`
        INSERT INTO dbo.Flights
          (flight_code, airline_id, aircraft_id, source_airport_id,
           destination_airport_id, departure_time, arrival_time, base_price, status)
        VALUES
          (@flight_code, @airline_id, @aircraft_id, @source_airport_id,
           @destination_airport_id, @departure_time, @arrival_time, @base_price, @status)
      `);

    res.json({ success: true, message: 'Thêm chuyến bay thành công' });
  } catch (err) {
    console.error('createFlight error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateFlight = async (req, res) => {
  try {
    const { flight_code, aircraft_id, source_airport_id, destination_airport_id,
            departure_time, arrival_time, base_price, status, airline_id, is_recurring } = req.body;
    const pool = await getPool();
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
    const { q } = req.query;
    const pool = await getPool();
    const request = pool.request();
    let where = '';
    if (q) {
      request.input('q', sql.NVarChar, `%${q}%`);
      where = `WHERE ac.model_name LIKE @q OR al.airline_name LIKE @q`;
    }
    const result = await request.query(`
      SELECT ac.*, al.airline_name, al.airline_code, al.logo_url AS airline_logo
      FROM dbo.Aircrafts ac
      LEFT JOIN dbo.Airlines al ON ac.airline_id = al.airline_id
      ${where}
      ORDER BY ac.model_name
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const createAircraft = async (req, res) => {
  try {
    console.log('Body nhận được:', req.body);
    const { model_name, manufacturer, total_seats, status, airline_id } = req.body;

    const pool = await getPool();
    await pool.request()
      .input('airline_id',   sql.Int,      Number(airline_id))
      .input('model_name',   sql.NVarChar, model_name)
      .input('manufacturer', sql.NVarChar, manufacturer)
      .input('total_seats',  sql.Int,      Number(total_seats))
      .input('status',       sql.NVarChar, status || 'Active')
      .query(`
        INSERT INTO dbo.Aircrafts (airline_id, model_name, manufacturer, total_seats, status)
        VALUES (@airline_id, @model_name, @manufacturer, @total_seats, @status)
      `);

    res.json({ success: true, message: 'Thêm máy bay thành công' });
  } catch (err) {
    console.error('createAircraft error:', err); // log lỗi đầy đủ
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateAircraft = async (req, res) => {
  try {
    const { model_name, total_seats, airline_id } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('id',          sql.Int,      req.params.id)
      .input('model_name',  sql.NVarChar, model_name)
      .input('total_seats', sql.Int,      total_seats)
      .input('airline_id',  sql.Int,      airline_id || null)
      .query(`UPDATE dbo.Aircrafts SET model_name=@model_name, total_seats=@total_seats, airline_id=@airline_id WHERE aircraft_id=@id`);
    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const deleteAircraft = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, req.params.id).query(`DELETE FROM dbo.Aircrafts WHERE aircraft_id=@id`);
    res.json({ success: true, message: 'Đã xóa' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Airports ──────────────────────────────────────────────────
const getAirports = async (req, res) => {
  try {
    const { q } = req.query;
    const pool = await getPool();
    const request = pool.request();
    let where = '';
    if (q) {
      request.input('q', sql.NVarChar, `%${q}%`);
      where = `WHERE airport_id LIKE @q OR name LIKE @q OR city LIKE @q OR country LIKE @q`;
    }
    const result = await request.query(`SELECT * FROM dbo.Airports ${where} ORDER BY city`);
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
    await pool.request().input('id', sql.Char, req.params.id).query(`DELETE FROM dbo.Airports WHERE airport_id=@id`);
    res.json({ success: true, message: 'Đã xóa' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Services ──────────────────────────────────────────────────
const getServices = async (req, res) => {
  try {
    const { q, type, status } = req.query;
    const pool = await getPool();
    const request = pool.request();
    let where = 'WHERE 1=1';
    if (q) {
      request.input('q', sql.NVarChar, `%${q}%`);
      where += ` AND service_name LIKE @q`;
    }
    if (type) {
      request.input('type', sql.NVarChar, type);
      where += ` AND type = @type`;
    }
    if (status) {
      request.input('status', sql.NVarChar, status);
      where += ` AND status = @status`;
    }
    const result = await request.query(`SELECT * FROM dbo.Services ${where} ORDER BY type, service_name`);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const createService = async (req, res) => {
  try {
    const { service_name, type, price, description, status } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('service_name', sql.NVarChar, service_name)
      .input('type',         sql.NVarChar, type)
      .input('price',        sql.Decimal,  Number(price))   // ép kiểu số tại controller
      .input('description',  sql.NVarChar, description || null)
      .input('status',       sql.NVarChar, status || 'Active')
      .query(`
        INSERT INTO dbo.Services (service_name, type, price, description, status)
        OUTPUT INSERTED.*
        VALUES (@service_name, @type, @price, @description, @status)
      `);
    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (err) {
    console.error('createService error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateService = async (req, res) => {
  try {
    const { service_name, type, price, description, status } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('id',           sql.Int,      req.params.id)
      .input('service_name', sql.NVarChar, service_name)
      .input('type',         sql.NVarChar, type)
      .input('price',        sql.Decimal,  Number(price))
      .input('description',  sql.NVarChar, description || null)
      .input('status',       sql.NVarChar, status)
      .query(`
        UPDATE dbo.Services
        SET service_name=@service_name, type=@type,
            price=@price, description=@description, status=@status
        WHERE service_id=@id
      `);
    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (err) {
    console.error('updateService error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteService = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, req.params.id).query(`DELETE FROM dbo.Services WHERE service_id=@id`);
    res.json({ success: true, message: 'Đã xóa' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Bookings ──────────────────────────────────────────────────
const getBookings = async (req, res) => {
  try {
    const { q, status } = req.query;
    const pool = await getPool();
    const request = pool.request();
    let where = 'WHERE 1=1';
    if (q) {
      request.input('q', sql.NVarChar, `%${q}%`);
      where += ` AND (b.booking_ref LIKE @q OR u.username LIKE @q OR u.email LIKE @q OR b.contact_name LIKE @q OR b.contact_email LIKE @q)`;
    }
    if (status) {
      request.input('status', sql.NVarChar, status);
      where += ` AND b.status = @status`;
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
      ${where}
      GROUP BY b.booking_id, b.user_id, b.booking_ref, b.booking_date,
               b.total_amount, b.status, b.cancel_reason,
               b.contact_name, b.contact_email, b.contact_phone,
               u.username, u.email
      ORDER BY b.booking_date DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const approveBooking = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, req.params.id)
      .query(`UPDATE dbo.Bookings SET status = N'Đã xác nhận' WHERE booking_id = @id`);
    res.json({ success: true, message: 'Đã xác nhận đặt vé' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const rejectBooking = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, req.params.id)
      .query(`UPDATE dbo.Bookings SET status = N'Từ chối' WHERE booking_id = @id`);
    res.json({ success: true, message: 'Đã từ chối đặt vé' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const cancelBooking = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, req.params.id)
      .query(`UPDATE dbo.Bookings SET status = N'Đã hủy' WHERE booking_id = @id`);
    res.json({ success: true, message: 'Đã hủy đặt vé' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const deleteBooking = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, req.params.id)
      .query(`DELETE FROM dbo.Bookings WHERE booking_id = @id`);
    res.json({ success: true, message: 'Đã xóa đặt vé' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Airlines ──────────────────────────────────────────────────
const getAirlines = async (req, res) => {
  try {
    const { q } = req.query;
    const pool = await getPool();
    const request = pool.request();
    let where = '';
    if (q) {
      request.input('q', sql.NVarChar, `%${q}%`);
      where = `WHERE airline_name LIKE @q OR airline_code LIKE @q`;
    }
    const result = await request.query(`SELECT * FROM dbo.Airlines ${where} ORDER BY airline_name`);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const createAirline = async (req, res) => {
  try {
    const { airline_name, airline_code, logo_url } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('airline_name', sql.NVarChar, airline_name)
      .input('airline_code', sql.NVarChar, airline_code)
      .input('logo_url',     sql.NVarChar, logo_url || null)
      .query(`INSERT INTO dbo.Airlines (airline_name, airline_code, logo_url) OUTPUT INSERTED.* VALUES (@airline_name, @airline_code, @logo_url)`);
    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const updateAirline = async (req, res) => {
  try {
    const { airline_name, airline_code, logo_url } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('id',           sql.Int,      req.params.id)
      .input('airline_name', sql.NVarChar, airline_name)
      .input('airline_code', sql.NVarChar, airline_code)
      .input('logo_url',     sql.NVarChar, logo_url || null)
      .query(`UPDATE dbo.Airlines SET airline_name=@airline_name, airline_code=@airline_code, logo_url=@logo_url WHERE airline_id=@id`);
    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

const deleteAirline = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, req.params.id).query(`DELETE FROM dbo.Airlines WHERE airline_id=@id`);
    res.json({ success: true, message: 'Đã xóa' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Customers ─────────────────────────────────────────────────
const getCustomers = async (req, res) => {
  try {
    const { q, status } = req.query;
    const pool = await getPool();
    const request = pool.request();
    let where = `WHERE role != 'admin'`;
    if (q) {
      request.input('q', sql.NVarChar, `%${q}%`);
      where += ` AND (username LIKE @q OR email LIKE @q OR phone_number LIKE @q)`;
    }
    if (status) {
      request.input('status', sql.NVarChar, status);
      where += ` AND status = @status`;
    }
    const result = await request.query(`
      SELECT user_id, username, email, phone_number, role, status, created_at
      FROM dbo.Users ${where} ORDER BY created_at DESC
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


// ── Approve cancel request ────────────────────────────────────
const approveCancel = async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`UPDATE dbo.Bookings SET status = N'Đã hủy' WHERE booking_id = @id AND status = N'Chờ hủy'`);

    if (r.rowsAffected[0] === 0)
      return res.status(400).json({ success: false, message: 'Không tìm thấy yêu cầu hủy' });

    res.json({ success: true, message: 'Đã duyệt hủy vé' });
  } catch (err) {
    console.error('approveCancel error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Reject cancel request (trả về Chờ xử lý) ─────────────────
const rejectCancel = async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        UPDATE dbo.Bookings
        SET status = N'Chờ xử lý', cancel_reason = NULL
        WHERE booking_id = @id AND status = N'Chờ hủy'
      `);

    if (r.rowsAffected[0] === 0)
      return res.status(400).json({ success: false, message: 'Không tìm thấy yêu cầu hủy' });

    res.json({ success: true, message: 'Đã từ chối yêu cầu hủy vé' });
  } catch (err) {
    console.error('rejectCancel error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

module.exports = {
  getStats,
  getFlights, createFlight, updateFlight, deleteFlight,
  getAircrafts, createAircraft, updateAircraft, deleteAircraft,
  getAirports, createAirport, updateAirport, deleteAirport,
  getServices, createService, updateService, deleteService,
  getBookings, approveBooking, rejectBooking, cancelBooking, deleteBooking,
  getAirlines, createAirline, updateAirline, deleteAirline,
  getCustomers, banCustomer, unbanCustomer,
  approveCancel, rejectCancel,
};