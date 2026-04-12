const { sql, getPool } = require('../../config/db');

// ── Search flights ────────────────────────────────────────────
const search = async (req, res) => {
  try {
    const { from, to, date, passengers = 1, class: seatClass = 'economy' } = req.query;
    if (!from || !to || !date)
      return res.status(400).json({ success: false, message: 'Thiếu thông tin tìm kiếm' });

    const pool = await getPool();
    const result = await pool.request()
      .input('from', sql.Char,     from.toUpperCase())
      .input('to',   sql.Char,     to.toUpperCase())
      .input('date', sql.NVarChar, date)
      .query(`
        SELECT
          f.flight_id, f.flight_code,
          CASE WHEN f.is_recurring = 1
            THEN DATEADD(DAY, DATEDIFF(DAY, CAST(f.departure_time AS DATE), CAST(@date AS DATE)), f.departure_time)
            ELSE f.departure_time
          END AS departure_time,
          CASE WHEN f.is_recurring = 1
            THEN DATEADD(DAY, DATEDIFF(DAY, CAST(f.arrival_time AS DATE), CAST(@date AS DATE)), f.arrival_time)
            ELSE f.arrival_time
          END AS arrival_time,
          f.base_price, f.status, f.is_recurring,
          a.model_name AS aircraft_model, a.total_seats,
          src.name AS origin_name, src.city AS origin_city, f.source_airport_id AS origin_iata,
          dst.name AS dest_name,   dst.city AS dest_city,   f.destination_airport_id AS dest_iata,
          DATEDIFF(MINUTE, f.departure_time, f.arrival_time) AS duration_minutes,
          (a.total_seats -
            (SELECT COUNT(*) FROM dbo.Tickets t2
             JOIN dbo.Bookings b2 ON t2.booking_id = b2.booking_id
             WHERE t2.flight_id = f.flight_id AND b2.status != N'Đã hủy')
          ) AS available_seats
        FROM dbo.Flights f
        JOIN dbo.Aircrafts a  ON f.aircraft_id            = a.aircraft_id
        JOIN dbo.Airports src ON f.source_airport_id      = src.airport_id
        JOIN dbo.Airports dst ON f.destination_airport_id = dst.airport_id
        WHERE f.source_airport_id      = @from
          AND f.destination_airport_id = @to
          AND f.status != 'Cancelled'
          AND (
            (f.is_recurring = 0 AND CAST(f.departure_time AS DATE) = CAST(@date AS DATE))
            OR f.is_recurring = 1
          )
        ORDER BY departure_time
      `);

    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('search error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Get flight by ID ──────────────────────────────────────────
const getById = async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT
          f.*, a.model_name, a.total_seats,
          src.name AS origin_name,  src.city AS origin_city,
          dst.name AS dest_name,    dst.city AS dest_city
        FROM dbo.Flights f
        JOIN dbo.Aircrafts a  ON f.aircraft_id            = a.aircraft_id
        JOIN dbo.Airports src ON f.source_airport_id      = src.airport_id
        JOIN dbo.Airports dst ON f.destination_airport_id = dst.airport_id
        WHERE f.flight_id = @id
      `);

    if (!result.recordset[0])
      return res.status(404).json({ success: false, message: 'Không tìm thấy chuyến bay' });

    res.json({ success: true, data: result.recordset[0] });
  } catch (err) {
    console.error('getById error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Get seats for a flight ────────────────────────────────────
const getSeats = async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT
          sm.seat_id, sm.seat_code, sm.seat_class, sm.is_exit_row, sm.surcharge,
          CASE WHEN t.seat_id IS NOT NULL THEN 1 ELSE 0 END AS is_occupied
        FROM dbo.Flights f
        JOIN dbo.Aircrafts a  ON f.aircraft_id = a.aircraft_id
        JOIN dbo.SeatMaps sm  ON sm.aircraft_id = a.aircraft_id
        LEFT JOIN dbo.Tickets t
          ON t.seat_id = sm.seat_id AND t.flight_id = f.flight_id
          AND t.status != N'Đã hủy'
        WHERE f.flight_id = @id
        ORDER BY sm.seat_code
      `);

    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('getSeats error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Get all services ──────────────────────────────────────────
const getServices = async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .query(`SELECT * FROM dbo.Services WHERE status = 'Active' ORDER BY type, service_name`);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('getServices error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Get all airports ──────────────────────────────────────────
const getAirports = async (req, res) => {
  try {
    const pool   = await getPool();
    const result = await pool.request()
      .query(`SELECT * FROM dbo.Airports ORDER BY city`);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('getAirports error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

module.exports = { search, getById, getSeats, getServices, getAirports };