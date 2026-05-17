const { sql, getPool } = require('../../config/db');

// ── IATA → tên thành phố (khớp với data_loader.py) ──────────
const IATA_MAP = {
  'SGN': 'Ho Chi Minh City',
  'HAN': 'Hanoi',
  'DAD': 'Da Nang',
  'PQC': 'Phu Quoc',
  'HPH': 'Hai Phong',
  'BKK': 'Bangkok',
  'SIN': 'Singapore',
  'ICN': 'Seoul',
  'NRT': 'Tokyo',
  'KUL': 'Kuala Lumpur',
};

const AI_SERVICE_URL = 'http://localhost:8000';

// ── Tính preference vector từ lịch sử đặt vé ─────────────────
function computePreferenceVector(history) {
  if (!history || history.length === 0) {
    return {
      vector: [0.6, 0.5, 0.5, 0.5, 0.5, 0.2],
      preferredAirline: '',
    };
  }

  // price_sensitivity: giá trung bình thấp → nhạy cảm giá cao
  const avg = history.reduce((s, h) => s + (h.total_amount || 0), 0) / history.length;
  const priceSens = avg < 2_000_000 ? 0.8 : avg < 5_000_000 ? 0.5 : 0.2;

  // airline_loyalty + preferred_airline
  const cnt = {};
  history.forEach(h => {
    if (h.airline_name) cnt[h.airline_name] = (cnt[h.airline_name] || 0) + 1;
  });
  const sorted      = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
  const topAirline  = sorted[0]?.[0] ?? '';
  const loyalty     = sorted[0] ? sorted[0][1] / history.length : 0.5;

  // morning_preference
  const morningPref = history.filter(
    h => h.depart_hour >= 6 && h.depart_hour < 12
  ).length / history.length;

  // business_class_pref
  const bizPref = history.filter(
    h => h.seat_class === 'Business'
  ).length / history.length;

  return {
    vector: [
      parseFloat(priceSens.toFixed(3)),
      0.5,
      0.5,
      parseFloat(loyalty.toFixed(3)),
      parseFloat(morningPref.toFixed(3)),
      parseFloat(bizPref.toFixed(3)),
    ],
    preferredAirline: topAirline,
  };
}

// ── Shared: lấy danh sách chuyến bay theo điều kiện ──────────
const fetchFlights = async (from, to, date) => {
  const pool = getPool();
  
  // Tạo request và bind sẵn các tham số bắt buộc (Đến và Ngày bay)
  const request = pool.request()
    .input('to',   sql.Char,     to.toUpperCase())
    .input('date', sql.NVarChar, date);

  // Câu query gốc chứa các điều kiện chung
  let sqlQuery = `
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
      al.airline_name, al.logo_url, al.airline_code,
      src.name AS origin_name, src.city AS origin_city, f.source_airport_id AS origin_iata,
      dst.name AS dest_name,   dst.city AS dest_city,   f.destination_airport_id AS dest_iata,
      ABS(DATEDIFF(MINUTE, f.departure_time, f.arrival_time)) AS duration_minutes,
      (a.total_seats -
        (SELECT COUNT(*) FROM dbo.Tickets t2
         JOIN dbo.Bookings b2 ON t2.booking_id = b2.booking_id
         WHERE t2.flight_id = f.flight_id AND b2.status != N'Đã hủy')
      ) AS available_seats
    FROM dbo.Flights f
    JOIN dbo.Aircrafts a  ON f.aircraft_id            = a.aircraft_id
    JOIN dbo.Airlines  al ON f.airline_id             = al.airline_id
    JOIN dbo.Airports src ON f.source_airport_id      = src.airport_id
    JOIN dbo.Airports dst ON f.destination_airport_id = dst.airport_id
    WHERE f.destination_airport_id = @to
      AND f.status != 'Cancelled'
      AND (
        (f.is_recurring = 0 AND CAST(f.departure_time AS DATE) = CAST(@date AS DATE))
        OR f.is_recurring = 1
      )
  `;

  // KIỂM TRA ĐỘNG: Nếu có điểm khởi hành truyền vào thì mới nối điều kiện lọc source_airport_id
  if (from && from.trim() !== '') {
    request.input('from', sql.Char, from.toUpperCase());
    sqlQuery += ` AND f.source_airport_id = @from`;
  }

  sqlQuery += ` ORDER BY departure_time`;

  const result = await request.query(sqlQuery);
  return result.recordset;
};

// ── Search flights ────────────────────────────────────────────
const search = async (req, res) => {
  try {
    const { from, to, date } = req.query;
    
    // Đã bỏ kiểm tra bắt buộc đối với 'from'. Chỉ cần kiểm tra 'to' và 'date'
    if (!to || !date)
      return res.status(400).json({ success: false, message: 'Thiếu thông tin điểm đến hoặc ngày bay' });

    const flights = await fetchFlights(from, to, date);
    res.json({ success: true, data: flights });
  } catch (err) {
    console.error('search error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── AI Search — gọi Python AI service ────────────────────────
const aiSearch = async (req, res) => {
  try {
    const { from, to, date, passengers = 1, userId } = req.body;
    console.log('>>> userId nhận được:', userId);
    
    // Luồng AI search yêu cầu điền đầy đủ cả điểm đi để chấm điểm vector chính xác
    if (!from || !to || !date)
      return res.status(400).json({ success: false, message: 'Thiếu thông tin tìm kiếm' });

    // 1. Lấy chuyến bay từ SQL
    const flights = await fetchFlights(from, to, date);
    if (flights.length === 0)
      return res.json({ success: true, data: [], aiEnabled: false, meta: {} });

    // 2. Lấy lịch sử đặt vé của user
    let history = [];
    if (userId) {
      try {
        const pool = getPool();
        const r = await pool.request()
          .input('uid', sql.Int, userId)
          .query(`
            SELECT TOP 30
              b.total_amount, al.airline_name,
              t.class AS seat_class,
              DATEPART(HOUR, f.departure_time) AS depart_hour
            FROM dbo.Bookings b
            JOIN dbo.Tickets  t  ON t.booking_id = b.booking_id
            JOIN dbo.Flights  f  ON t.flight_id  = f.flight_id
            JOIN dbo.Airlines al ON f.airline_id = al.airline_id
            WHERE b.user_id = @uid AND b.status != N'Đã hủy'
            ORDER BY b.booking_date DESC
          `);
        history = r.recordset;
      } catch (e) {
        console.warn('Không lấy được lịch sử user:', e.message);
      }
    }

    const isNewUser    = history.length === 0;
    const bookingCount = history.length;

    // 3. Tính preference vector
    const pref = computePreferenceVector(history);

    // 4. Map IATA → tên thành phố
    const origin      = IATA_MAP[from] ?? from;
    const destination = IATA_MAP[to]   ?? to;

    // 5. Gọi Python AI service
    let aiEnabled = false;
    let aiResults = [];
    let meta      = {};

    try {
      const aiRes = await fetch(`${AI_SERVICE_URL}/search-by-vector`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preference_vector: pref.vector,
          preferred_airline: pref.preferredAirline,
          origin,
          destination,
          top_k: 10,
        }),
      });

      if (!aiRes.ok) throw new Error(`AI service HTTP ${aiRes.status}`);

      const aiData = await aiRes.json();
      aiResults = aiData.results || [];
      meta      = aiData.preference_used || {};
      aiEnabled = aiResults.length > 0;
    } catch (e) {
      console.warn('AI service không khả dụng, fallback về danh sách thường:', e.message);
    }

    // 6. Gắn AI ranking vào danh sách chuyến bay từ SQL
    let enriched;

    if (aiEnabled) {
      const aiMap = {};
      aiResults.forEach(r => {
        const fid = String(r.flight?.flight_id ?? '');
        if (fid) aiMap[fid] = r;
      });

      enriched = flights.map((f, i) => {
        const fid    = String(f.flight_id);
        const aiItem = aiMap[fid];
        return {
          ...f,
          aiEnabled: true,
          ai_rank:     aiItem?.rank  ?? (i + 1),
          ai_score:    aiItem?.flight?.final_score ?? 0,
          explanation: aiItem?.explanation ?? null,
        };
      });
    } else {
      enriched = flights.map((f, i) => ({
        ...f,
        aiEnabled: false,
        ai_rank:     i + 1,
        ai_score:    0,
        explanation: null,
      }));
    }

    res.json({
      success:   true,
      data:      enriched,
      aiEnabled,
      meta: {
        ...meta,
        isNewUser,
        bookingCount,
        preferredAirline: pref.preferredAirline,
      },
    });
  } catch (err) {
    console.error('aiSearch error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Get flight by ID ──────────────────────────────────────────
const getById = async (req, res) => {
  try {
    const pool   = getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT f.*, a.model_name, a.total_seats,
          src.name AS origin_name, src.city AS origin_city,
          dst.name AS dest_name,   dst.city AS dest_city
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

// ── Get seats ─────────────────────────────────────────────────
const getSeats = async (req, res) => {
  try {
    const { date } = req.query;
    const pool = getPool();
    const r    = pool.request().input('id', sql.Int, req.params.id);
    if (date) r.input('date', sql.NVarChar, date);
    const dateFilter = date
      ? `AND (f.is_recurring = 0 OR CAST(t.flight_date AS DATE) = CAST(@date AS DATE))`
      : '';
    const result = await r.query(`
      SELECT sm.seat_id, sm.seat_code, sm.seat_class, sm.is_exit_row, sm.surcharge,
        CASE WHEN t.seat_id IS NOT NULL THEN 1 ELSE 0 END AS is_occupied
      FROM dbo.Flights f
      JOIN dbo.Aircrafts a  ON f.aircraft_id = a.aircraft_id
      JOIN dbo.SeatMaps sm  ON sm.aircraft_id = a.aircraft_id
      LEFT JOIN dbo.Tickets t
        ON t.seat_id = sm.seat_id AND t.flight_id = f.flight_id
        AND t.status != N'Đã hủy' ${dateFilter}
      WHERE f.flight_id = @id
      ORDER BY sm.seat_code
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('getSeats error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Get services ──────────────────────────────────────────────
const getServices = async (req, res) => {
  try {
    const pool   = getPool();
    const result = await pool.request()
      .query(`SELECT * FROM dbo.Services WHERE status = 'Active' ORDER BY type, service_name`);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('getServices error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ── Get airports ──────────────────────────────────────────────
const getAirports = async (req, res) => {
  try {
    const pool   = getPool();
    const result = await pool.request()
      .query(`SELECT * FROM dbo.Airports ORDER BY city`);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('getAirports error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

module.exports = { search, aiSearch, getById, getSeats, getServices, getAirports };