const { sql, getPool } = require('../../../config/db');


// ── Flights ───────────────────────────────────────────────────
const getFlights = async (req, res) => {
  try {
    const { q, status, from, to, date } = req.query;
    const pool    = await getPool();
    const request = pool.request();

    const isStaff    = req.user?.role === 'AIRLINE_ADMIN';
    const airlineId  = req.user?.airline_id;

    let where = 'WHERE 1=1';

    // AIRLINE_ADMIN chỉ thấy chuyến bay của hãng mình
    if (isStaff && airlineId) {
      request.input('airline_id', sql.Int, airlineId);
      where += ` AND f.airline_id = @airline_id`;
    }

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
      flight_code, aircraft_id,
      source_airport_id, destination_airport_id,
      departure_time, arrival_time,
      base_price, status
    } = req.body;

    const isStaff = req.user?.role === 'AIRLINE_ADMIN';

    // AIRLINE_ADMIN chỉ được tạo chuyến bay cho hãng của mình
    const airline_id = isStaff
      ? req.user.airline_id
      : Number(req.body.airline_id);

    if (!airline_id)
      return res.status(400).json({ success: false, message: 'Thiếu airline_id' });

    const pool = await getPool();

    const airlineCheck = await pool.request()
      .input('airline_id', sql.Int, airline_id)
      .query('SELECT airline_id FROM dbo.Airlines WHERE airline_id = @airline_id');
    if (!airlineCheck.recordset[0])
      return res.status(400).json({ success: false, message: `Hãng hàng không ID=${airline_id} không tồn tại` });

    const aircraftCheck = await pool.request()
      .input('aircraft_id', sql.Int, Number(aircraft_id))
      .query('SELECT aircraft_id FROM dbo.Aircrafts WHERE aircraft_id = @aircraft_id');
    if (!aircraftCheck.recordset[0])
      return res.status(400).json({ success: false, message: `Máy bay ID=${aircraft_id} không tồn tại` });

    // Nếu là AIRLINE_ADMIN, kiểm tra máy bay có thuộc hãng của mình không
    if (isStaff) {
      const ownerCheck = await pool.request()
        .input('aircraft_id', sql.Int, Number(aircraft_id))
        .input('airline_id',  sql.Int, airline_id)
        .query('SELECT aircraft_id FROM dbo.Aircrafts WHERE aircraft_id = @aircraft_id AND airline_id = @airline_id');
      if (!ownerCheck.recordset[0])
        return res.status(403).json({ success: false, message: 'Máy bay không thuộc hãng của bạn' });
    }

    await pool.request()
      .input('flight_code',            sql.NVarChar, flight_code)
      .input('airline_id',             sql.Int,      airline_id)
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
    const {
      flight_code, aircraft_id, source_airport_id, destination_airport_id,
      departure_time, arrival_time, base_price, status, is_recurring
    } = req.body;

    const isStaff   = req.user?.role === 'AIRLINE_ADMIN';
    const airline_id = isStaff ? req.user.airline_id : (req.body.airline_id || null);

    const pool = await getPool();

    // AIRLINE_ADMIN chỉ được sửa chuyến bay của hãng mình
    if (isStaff) {
      const ownerCheck = await pool.request()
        .input('id',         sql.Int, req.params.id)
        .input('airline_id', sql.Int, airline_id)
        .query('SELECT flight_id FROM dbo.Flights WHERE flight_id = @id AND airline_id = @airline_id');
      if (!ownerCheck.recordset[0])
        return res.status(403).json({ success: false, message: 'Không có quyền sửa chuyến bay này' });
    }

    await pool.request()
      .input('id',                     sql.Int,      req.params.id)
      .input('flight_code',            sql.NVarChar, flight_code)
      .input('aircraft_id',            sql.Int,      aircraft_id)
      .input('source_airport_id',      sql.Char,     source_airport_id)
      .input('destination_airport_id', sql.Char,     destination_airport_id)
      .input('departure_time',         sql.DateTime, new Date(departure_time))
      .input('arrival_time',           sql.DateTime, new Date(arrival_time))
      .input('base_price',             sql.Decimal,  base_price)
      .input('status',                 sql.NVarChar, status)
      .input('airline_id',             sql.Int,      airline_id)
      .input('is_recurring',           sql.Bit,      is_recurring ? 1 : 0)
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
    const isStaff   = req.user?.role === 'AIRLINE_ADMIN';
    const airline_id = req.user?.airline_id;
    const pool = await getPool();

    // AIRLINE_ADMIN chỉ được xóa chuyến bay của hãng mình
    if (isStaff) {
      const ownerCheck = await pool.request()
        .input('id',         sql.Int, req.params.id)
        .input('airline_id', sql.Int, airline_id)
        .query('SELECT flight_id FROM dbo.Flights WHERE flight_id = @id AND airline_id = @airline_id');
      if (!ownerCheck.recordset[0])
        return res.status(403).json({ success: false, message: 'Không có quyền xóa chuyến bay này' });
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

module.exports = { getFlights, createFlight, updateFlight, deleteFlight };