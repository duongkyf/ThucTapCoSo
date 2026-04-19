/**
 * ai.helper.js
 * ─────────────────────────────────────────────────────────────
 * Preference vector 6 chiều — chỉ 4 chiều có dữ liệu thật.
 * Hỗ trợ online learning: cập nhật vector real-time sau booking.
 */

const { sql, getPool } = require('../../config/db');

const AI_BASE_URL = process.env.AI_BASE_URL || 'http://localhost:8000';
const PRICE_MIN = 500_000;
const PRICE_MAX = 9_000_000;
const DUR_MIN = 30;
const DUR_MAX = 600;

const AIRLINE_NAME_MAP = {
  VN: 'Vietnam Airlines',
  VJ: 'Vietjet Air',
  QH: 'Bamboo Airways',
  BL: 'Pacific Airlines',
};

const IATA_TO_CITY = {
  SGN: 'Ho Chi Minh City',
  HAN: 'Hanoi',
  DAD: 'Da Nang',
  PQC: 'Phu Quoc',
  HPH: 'Hai Phong',
  BKK: 'Bangkok',
  SIN: 'Singapore',
  ICN: 'Seoul',
  NRT: 'Tokyo',
  KUL: 'Kuala Lumpur',
};

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const norm = (v, min, max) => clamp((v - min) / (max - min));

// ─────────────────────────────────────────────────────────────
// 1. Lấy vector từ database (đã lưu) hoặc tính từ lịch sử
// ─────────────────────────────────────────────────────────────
async function getUserPreferenceVectorFromDB(userId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('userId', sql.Int, userId)
    .query('SELECT preference_vector FROM dbo.Users WHERE user_id = @userId');
  if (result.recordset[0]?.preference_vector) {
    try {
      const parsed = JSON.parse(result.recordset[0].preference_vector);
      if (Array.isArray(parsed) && parsed.length === 6) return parsed;
    } catch (e) { }
  }
  return null;
}

async function saveUserPreferenceVectorToDB(userId, vector) {
  const pool = await getPool();
  await pool.request()
    .input('userId', sql.Int, userId)
    .input('vec', sql.NVarChar, JSON.stringify(vector))
    .query(`UPDATE dbo.Users SET preference_vector = @vec WHERE user_id = @userId`);
}

// ─────────────────────────────────────────────────────────────
// 2. Tính preference vector từ lịch sử (full compute)
// ─────────────────────────────────────────────────────────────
async function computePreferenceVector(userId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('userId', sql.Int, userId)
    .query(`
      SELECT
        f.base_price                     AS price,
        DATEDIFF(MINUTE, f.departure_time, f.arrival_time) AS duration_minutes,
        0                                AS stops_num,
        DATEPART(HOUR, f.departure_time) AS dep_hour,
        t.class                          AS seat_class,
        al.airline_code,
        al.airline_name
      FROM dbo.Bookings  b
      JOIN dbo.Tickets   t  ON t.booking_id = b.booking_id
      JOIN dbo.Flights   f  ON t.flight_id  = f.flight_id
      JOIN dbo.Airlines  al ON f.airline_id = al.airline_id
      WHERE b.user_id = @userId
        AND b.status  = N'Thành công'
        AND t.status != N'Đã hủy'
    `);

  const history = result.recordset;

  if (!history || history.length === 0) {
    const defaultVec = [0.6, 0.5, 0.5, 0.5, 0.5, 0.5];
    await saveUserPreferenceVectorToDB(userId, defaultVec);
    return { vector: defaultVec, preferredAirline: '', isNewUser: true, bookingCount: 0 };
  }

  const n = history.length;

  // [0] price_sensitivity
  const avgPriceNorm = history.reduce((s, r) => s + norm(r.price, PRICE_MIN, PRICE_MAX), 0) / n;
  const priceSensitivity = clamp(1 - avgPriceNorm);

  // [1] duration_preference
  const avgDurationNorm = history.reduce((s, r) => s + norm(r.duration_minutes, DUR_MIN, DUR_MAX), 0) / n;
  const durationPreference = clamp(1 - avgDurationNorm);

  // [2] stop_tolerance (giả định all direct)
  const stopTolerance = 0.5;

  // [3] airline_loyalty
  const airlineCount = {};
  history.forEach(r => { airlineCount[r.airline_code] = (airlineCount[r.airline_code] || 0) + 1; });
  const maxCount = Math.max(...Object.values(airlineCount));
  const airlineLoyalty = clamp(maxCount / n);
  const preferredCode = Object.entries(airlineCount).sort((a, b) => b[1] - a[1])[0][0];
  const preferredAirline = AIRLINE_NAME_MAP[preferredCode] || '';

  // [4] morning_preference
  const morningPreference = clamp(history.filter(r => r.dep_hour < 10).length / n);

  // [5] business_class_pref
  const businessClassPref = clamp(
    history.filter(r => ['business', 'first'].includes(r.seat_class)).length / n
  );

  const vector = [priceSensitivity, durationPreference, stopTolerance, airlineLoyalty, morningPreference, businessClassPref];
  await saveUserPreferenceVectorToDB(userId, vector);

  return {
    vector,
    preferredAirline,
    isNewUser: false,
    bookingCount: n,
  };
}

// ─────────────────────────────────────────────────────────────
// 3. Online learning: cập nhật vector sau mỗi hành động (booking/cancel)
// ─────────────────────────────────────────────────────────────
function computeSignalFromFlight(flight, preferredAirline = '') {
  const priceNorm = clamp((flight.price - PRICE_MIN) / (PRICE_MAX - PRICE_MIN));
  const priceSignal = 1 - priceNorm;
  const durationNorm = clamp((flight.duration_minutes - DUR_MIN) / (DUR_MAX - DUR_MIN));
  const durationSignal = 1 - durationNorm;
  const stopSignal = (flight.stops_num || 0) / 2;
  const airlineSignal = (preferredAirline && flight.airline_name === preferredAirline) ? 1.0 : 0.2;
  const morningSignal = (flight.dep_hour < 10) ? 1.0 : 0.0;
  const businessSignal = flight.is_business ? 1.0 : 0.0;
  return [priceSignal, durationSignal, stopSignal, airlineSignal, morningSignal, businessSignal];
}

/**
 * Cập nhật preference vector online (EMA)
 * @param {number} userId
 * @param {Object} flight - thông tin chuyến bay (price, duration_minutes, dep_hour, airline_name, is_business)
 * @param {string} action - 'book' hoặc 'cancel'
 * @param {number} alpha - hệ số học (0.1 cho book, 0.05 cho cancel)
 */
async function updateUserPreferenceOnline(userId, flight, action = 'book', alpha = 0.1) {
  // Lấy vector hiện tại từ DB (hoặc tính mới)
  let currentVec = await getUserPreferenceVectorFromDB(userId);
  if (!currentVec) {
    const computed = await computePreferenceVector(userId);
    currentVec = computed.vector;
  }

  // Lấy preferredAirline hiện tại (từ compute hoặc từ user)
  let preferredAirline = '';
  const pool = await getPool();
  const airlineRes = await pool.request()
    .input('userId', sql.Int, userId)
    .query('SELECT preferred_airline FROM dbo.Users WHERE user_id = @userId');
  if (airlineRes.recordset[0]?.preferred_airline) {
    preferredAirline = airlineRes.recordset[0].preferred_airline;
  } else {
    const computed = await computePreferenceVector(userId);
    preferredAirline = computed.preferredAirline;
  }

  const signal = computeSignalFromFlight(flight, preferredAirline);
  const sign = action === 'book' ? 1 : (action === 'cancel' ? -0.5 : 0);
  if (sign === 0) return;

  const newVec = currentVec.map((v, idx) => {
    let newVal = v + sign * alpha * (signal[idx] - v);
    return clamp(newVal);
  });

  await saveUserPreferenceVectorToDB(userId, newVec);
  console.log(`[OnlineUpdate] User ${userId} ${action} flight ${flight.flight_id}, new vector:`, newVec);
}

// ─────────────────────────────────────────────────────────────
// 4. Gọi AI ranker
// ─────────────────────────────────────────────────────────────
async function callAIRanker({ prefVector, preferredAirline, origin, destination, seatClass, topK = 20 }) {
  const originCity = IATA_TO_CITY[origin?.toUpperCase()];
  const destCity = IATA_TO_CITY[destination?.toUpperCase()];
  if (!originCity || !destCity) throw new Error(`Không có city mapping cho: ${origin} → ${destination}`);

  const body = { preference_vector: prefVector, preferred_airline: preferredAirline || '', origin: originCity, destination: destCity, top_k: topK };
  if (seatClass) body.seat_class = seatClass;

  const resp = await fetch(`${AI_BASE_URL}/search-by-vector`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`FastAPI ${resp.status}: ${await resp.text()}`);
  return (await resp.json()).results || [];
}

function mergeAIWithSQL(aiResults, sqlFlights) {
  if (!aiResults || aiResults.length === 0) return sqlFlights;
  const usedIds = new Set(); const merged = []; const sqlByAirline = {};
  sqlFlights.forEach(f => {
    const key = (f.airline_name || '').toLowerCase();
    if (!sqlByAirline[key]) sqlByAirline[key] = [];
    sqlByAirline[key].push(f);
  });
  for (const aiItem of aiResults) {
    const aiAirline = (aiItem.flight?.airline || '').toLowerCase();
    const matchKey = Object.keys(sqlByAirline).find(k => k.includes(aiAirline) || aiAirline.includes(k));
    if (matchKey) {
      const available = sqlByAirline[matchKey].filter(f => !usedIds.has(f.flight_id));
      if (available.length > 0) {
        const best = pickBestMatch(available, parseDepHour(aiItem.flight?.departure));
        usedIds.add(best.flight_id);
        merged.push({ ...best, ai_rank: aiItem.rank, ai_score: aiItem.flight?.final_score ?? 0, explanation: aiItem.explanation ?? null });
        continue;
      }
    }
  }
  sqlFlights.forEach(f => { if (!usedIds.has(f.flight_id)) merged.push({ ...f, ai_rank: null, ai_score: 0, explanation: null }); });
  return merged;
}

function parseDepHour(t) { if (!t) return 12; const m = String(t).match(/(\d{1,2}):/); return m ? parseInt(m[1]) : 12; }
function pickBestMatch(flights, h) {
  return flights.reduce((b, f) => Math.abs(new Date(f.departure_time).getHours() - h) < Math.abs(new Date(b.departure_time).getHours() - h) ? f : b);
}

// Hàm lấy thông tin chi tiết của một flight (phục vụ online learning)
async function getFlightDetails(flightId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('fid', sql.Int, flightId)
    .query(`
      SELECT
        f.base_price AS price,
        DATEDIFF(MINUTE, f.departure_time, f.arrival_time) AS duration_minutes,
        0 AS stops_num,
        DATEPART(HOUR, f.departure_time) AS dep_hour,
        al.airline_name,
        0 AS is_business   -- cần xác định từ class của ticket, tạm để 0
      FROM dbo.Flights f
      JOIN dbo.Airlines al ON f.airline_id = al.airline_id
      WHERE f.flight_id = @fid
    `);
  return result.recordset[0] || null;
}

async function getUserPreferenceVectorFromDB(userId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('uid', sql.Int, userId)
    .query(`SELECT preference_vector FROM dbo.Users WHERE user_id = @uid`);
  if (!result.recordset[0] || !result.recordset[0].preference_vector) return null;
  try {
    const vec = JSON.parse(result.recordset[0].preference_vector);
    if (Array.isArray(vec) && vec.length === 6) return vec;
  } catch (e) { }
  return null;
}

async function updateUserPreferenceVectorInDB(userId, newVector) {
  const pool = await getPool();
  const vecJson = JSON.stringify(newVector);
  await pool.request()
    .input('uid', sql.Int, userId)
    .input('vec', sql.NVarChar, vecJson)
    .query(`
      UPDATE dbo.Users
      SET preference_vector = @vec, updated_at = GETDATE()
      WHERE user_id = @uid
    `);
}

module.exports = {
  computePreferenceVector,
  callAIRanker,
  mergeAIWithSQL,
  IATA_TO_CITY,
  updateUserPreferenceOnline,
  getFlightDetails,
  getUserPreferenceVectorFromDB,
  saveUserPreferenceVectorToDB,
};