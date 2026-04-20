/**
 * ai.helper.js
 * ─────────────────────────────────────────────────────────────
 * Preference vector 6 chiều:
 *   [0] price_sensitivity   ← từ base_price booking thật
 *   [1] duration_preference ← tính từ duration_minutes thật
 *   [2] stop_tolerance      ← mặc định 0.5 (all direct)
 *   [3] airline_loyalty     ← tỷ lệ % hãng ưa thích (không phải 0/1)
 *   [4] morning_preference  ← từ departure_time
 *   [5] business_class_pref ← WTP-based score
 */

const { sql, getPool } = require('../../config/db');

const AI_BASE_URL = process.env.AI_BASE_URL || 'http://localhost:8000';
const PRICE_MIN   = 500_000;
const PRICE_MAX   = 9_000_000;
const DUR_MIN     = 30;
const DUR_MAX     = 600;

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

const CLASS_MULTIPLIERS = {
  economy:  1.0,
  premium:  1.5,
  business: 2.5,
  first:    4.0,
};

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const norm  = (v, min, max) => clamp((v - min) / (max - min));

// ─────────────────────────────────────────────────────────────
// 1. DB helpers — preference_vector column
// ─────────────────────────────────────────────────────────────

async function getUserPreferenceVectorFromDB(userId) {
  const pool   = await getPool();
  const result = await pool.request()
    .input('userId', sql.Int, userId)
    .query(`SELECT preference_vector FROM dbo.Users WHERE user_id = @userId`);
  const raw = result.recordset[0]?.preference_vector;
  if (!raw) return null;
  try {
    const vec = JSON.parse(raw);
    if (Array.isArray(vec) && vec.length === 6) return vec;
  } catch (e) { /* invalid JSON */ }
  return null;
}

async function saveUserPreferenceVectorToDB(userId, vector) {
  const pool = await getPool();
  await pool.request()
    .input('userId', sql.Int,      userId)
    .input('vec',    sql.NVarChar, JSON.stringify(vector))
    .query(`
      UPDATE dbo.Users
      SET preference_vector = @vec, updated_at = GETDATE()
      WHERE user_id = @userId
    `);
}

// ─────────────────────────────────────────────────────────────
// 2. WTP score cho hạng ghế
// ─────────────────────────────────────────────────────────────

/**
 * score(c) = max(0, 1 - (price_current - avg_price_paid) / avg_price_paid)
 * Nếu giá hiện tại <= avg → hấp dẫn (score cao)
 * Nếu giá hiện tại >= 2×avg → score = 0
 * Lấy max của tất cả hạng có lịch sử.
 */
function computeWTPScore(basePrice, avgPricesByClass) {
  const scores = [];
  for (const [cls, multiplier] of Object.entries(CLASS_MULTIPLIERS)) {
    const avgPaid = avgPricesByClass[cls];
    if (!avgPaid || avgPaid <= 0) continue;
    const currentPrice = basePrice * multiplier;
    const raw = 1 - (currentPrice - avgPaid) / avgPaid;
    scores.push(clamp(raw));
  }
  return scores.length > 0 ? Math.max(...scores) : 0.5;
}

// ─────────────────────────────────────────────────────────────
// 3. Tính preference vector từ lịch sử booking thật
// ─────────────────────────────────────────────────────────────

async function computePreferenceVector(userId) {
  const pool   = await getPool();
  const result = await pool.request()
    .input('userId', sql.Int, userId)
    .query(`
      SELECT
        f.base_price                                        AS price,
        t.ticket_price                                      AS price_paid,
        DATEDIFF(MINUTE, f.departure_time, f.arrival_time) AS duration_minutes,
        DATEPART(HOUR, f.departure_time)                   AS dep_hour,
        t.class                                            AS seat_class,
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
    const defaultVec = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    await saveUserPreferenceVectorToDB(userId, defaultVec);
    return {
      vector:          defaultVec,
      preferredAirline: '',
      airlineRatios:   {},
      avgPricesByClass: {},
      isNewUser:        true,
      bookingCount:     0,
    };
  }

  const n = history.length;

  // [0] price_sensitivity — hay mua rẻ → cao
  const avgPriceNorm     = history.reduce((s, r) => s + norm(r.price, PRICE_MIN, PRICE_MAX), 0) / n;
  const priceSensitivity = clamp(1 - avgPriceNorm);

  // [1] duration_preference — hay chọn ngắn → cao
  const avgDurNorm         = history.reduce((s, r) => s + norm(r.duration_minutes, DUR_MIN, DUR_MAX), 0) / n;
  const durationPreference = clamp(1 - avgDurNorm);

  // [2] stop_tolerance — tất cả direct flight
  const stopTolerance = 0.5;

  // [3] airline_loyalty — tỷ lệ % (không phải 0/1)
  // VD: 3 lần VJ, 2 lần VN → airlineRatios = { 'Vietjet Air': 0.6, 'Vietnam Airlines': 0.4 }
  // airlineLoyalty = tỷ lệ của hãng phổ biến nhất (0.6, không phải 1.0)
  const airlineCount = {};
  history.forEach(r => {
    const name = AIRLINE_NAME_MAP[r.airline_code] || r.airline_name || r.airline_code;
    airlineCount[name] = (airlineCount[name] || 0) + 1;
  });
  const airlineRatios = {};
  Object.entries(airlineCount).forEach(([name, count]) => {
    airlineRatios[name] = count / n;
  });
  const sortedAirlines   = Object.entries(airlineRatios).sort((a, b) => b[1] - a[1]);
  const preferredAirline = sortedAirlines[0][0];
  const airlineLoyalty   = sortedAirlines[0][1]; // VD: 0.6 thay vì 1.0

  // [4] morning_preference — tỷ lệ chuyến trước 10h
  const morningPreference = clamp(history.filter(r => r.dep_hour < 10).length / n);

  // [5] business_class_pref — WTP score
  const pricesByClass = { economy: [], premium: [], business: [], first: [] };
  history.forEach(r => {
    const cls = r.seat_class?.toLowerCase();
    if (pricesByClass[cls]) pricesByClass[cls].push(r.price_paid || r.price);
  });
  const avgPricesByClass = {};
  Object.entries(pricesByClass).forEach(([cls, prices]) => {
    if (prices.length > 0)
      avgPricesByClass[cls] = prices.reduce((s, v) => s + v, 0) / prices.length;
  });
  const avgBasePrice     = history.reduce((s, r) => s + r.price, 0) / n;
  const businessClassPref = computeWTPScore(avgBasePrice, avgPricesByClass);

  const vector = [
    priceSensitivity,    // [0]
    durationPreference,  // [1]
    stopTolerance,       // [2]
    airlineLoyalty,      // [3] tỷ lệ % thực
    morningPreference,   // [4]
    businessClassPref,   // [5] WTP
  ];

  await saveUserPreferenceVectorToDB(userId, vector);

  return {
    vector,
    preferredAirline,
    airlineRatios,
    avgPricesByClass,
    isNewUser:    false,
    bookingCount: n,
  };
}

// ─────────────────────────────────────────────────────────────
// 4. Online learning — EMA update sau booking/cancel
// ─────────────────────────────────────────────────────────────

function computeSignalFromFlight(flight, preferredAirline = '') {
  const priceNorm    = clamp((flight.price - PRICE_MIN) / (PRICE_MAX - PRICE_MIN));
  const durationNorm = clamp((flight.duration_minutes - DUR_MIN) / (DUR_MAX - DUR_MIN));
  return [
    1 - priceNorm,                                                            // [0] price signal
    1 - durationNorm,                                                         // [1] duration signal
    (flight.stops_num || 0) / 2,                                              // [2] stop signal
    (preferredAirline && flight.airline_name === preferredAirline) ? 1.0 : 0.2, // [3] airline signal
    (flight.dep_hour < 10) ? 1.0 : 0.0,                                      // [4] morning signal
    flight.is_business ? 1.0 : 0.0,                                          // [5] business signal
  ];
}

async function updateUserPreferenceOnline(userId, flight, action = 'book', alpha = 0.1) {
  let currentVec = await getUserPreferenceVectorFromDB(userId);
  if (!currentVec) {
    const computed = await computePreferenceVector(userId);
    currentVec = computed.vector;
  }

  const pool         = await getPool();
  const airlineRes   = await pool.request()
    .input('userId', sql.Int, userId)
    .query(`SELECT preferred_airline FROM dbo.Users WHERE user_id = @userId`);
  const preferredAirline = airlineRes.recordset[0]?.preferred_airline || '';

  const signal = computeSignalFromFlight(flight, preferredAirline);
  const sign   = action === 'book' ? 1 : action === 'cancel' ? -0.5 : 0;
  if (sign === 0) return;

  const newVec = currentVec.map((v, i) => clamp(v + sign * alpha * (signal[i] - v)));
  await saveUserPreferenceVectorToDB(userId, newVec);
  console.log(`[OnlineUpdate] User ${userId} ${action}, new vector:`, newVec);
}

// ─────────────────────────────────────────────────────────────
// 5. Gọi FastAPI POST /search-by-vector
//    FIX: nhận airlineRatios qua parameter (không dùng biến ngoài scope)
// ─────────────────────────────────────────────────────────────

async function callAIRanker({
  prefVector,
  preferredAirline,
  airlineRatios,      // { 'Vietjet Air': 0.6, 'Vietnam Airlines': 0.4 }
  origin,
  destination,
  seatClass,
  topK = 20,
}) {
  const originCity = IATA_TO_CITY[origin?.toUpperCase()];
  const destCity   = IATA_TO_CITY[destination?.toUpperCase()];
  if (!originCity || !destCity)
    throw new Error(`Không có city mapping cho: ${origin} → ${destination}`);

  const body = {
    preference_vector: prefVector,
    preferred_airline: preferredAirline || '',
    origin:            originCity,
    destination:       destCity,
    top_k:             topK,
    airline_ratios:    airlineRatios || {},
  };
  if (seatClass) body.seat_class = seatClass;

  const resp = await fetch(`${AI_BASE_URL}/search-by-vector`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`FastAPI ${resp.status}: ${await resp.text()}`);
  return (await resp.json()).results || [];
}

// ─────────────────────────────────────────────────────────────
// 6. Merge AI ranking vào SQL flights
// ─────────────────────────────────────────────────────────────

function mergeAIWithSQL(aiResults, sqlFlights) {
  if (!aiResults || aiResults.length === 0) return sqlFlights;

  const usedIds      = new Set();
  const merged       = [];
  const sqlByAirline = {};

  sqlFlights.forEach(f => {
    const key = (f.airline_name || '').toLowerCase();
    if (!sqlByAirline[key]) sqlByAirline[key] = [];
    sqlByAirline[key].push(f);
  });

  for (const aiItem of aiResults) {
    const aiAirline = (aiItem.flight?.airline || '').toLowerCase();
    const matchKey  = Object.keys(sqlByAirline).find(k =>
      k.includes(aiAirline) || aiAirline.includes(k)
    );
    if (matchKey) {
      const available = sqlByAirline[matchKey].filter(f => !usedIds.has(f.flight_id));
      if (available.length > 0) {
        const best = pickBestMatch(available, parseDepHour(aiItem.flight?.departure));
        usedIds.add(best.flight_id);
        merged.push({
          ...best,
          ai_rank:     aiItem.rank,
          ai_score:    aiItem.flight?.final_score ?? 0,
          explanation: aiItem.explanation ?? null,
        });
        continue;
      }
    }
  }

  sqlFlights.forEach(f => {
    if (!usedIds.has(f.flight_id))
      merged.push({ ...f, ai_rank: null, ai_score: 0, explanation: null });
  });

  return merged;
}

// ─────────────────────────────────────────────────────────────
// 7. Lấy thông tin flight để dùng trong online learning
// ─────────────────────────────────────────────────────────────

async function getFlightDetails(flightId) {
  const pool   = await getPool();
  const result = await pool.request()
    .input('fid', sql.Int, flightId)
    .query(`
      SELECT
        f.base_price                                        AS price,
        DATEDIFF(MINUTE, f.departure_time, f.arrival_time) AS duration_minutes,
        0                                                   AS stops_num,
        DATEPART(HOUR, f.departure_time)                   AS dep_hour,
        al.airline_name,
        0                                                   AS is_business
      FROM dbo.Flights  f
      JOIN dbo.Airlines al ON f.airline_id = al.airline_id
      WHERE f.flight_id = @fid
    `);
  return result.recordset[0] || null;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function parseDepHour(t) {
  if (!t) return 12;
  const m = String(t).match(/(\d{1,2}):/);
  return m ? parseInt(m[1]) : 12;
}

function pickBestMatch(flights, h) {
  return flights.reduce((b, f) =>
    Math.abs(new Date(f.departure_time).getHours() - h) <
    Math.abs(new Date(b.departure_time).getHours() - h) ? f : b
  );
}

module.exports = {
  computePreferenceVector,
  callAIRanker,
  mergeAIWithSQL,
  computeWTPScore,
  updateUserPreferenceOnline,
  getFlightDetails,
  getUserPreferenceVectorFromDB,
  saveUserPreferenceVectorToDB,
  IATA_TO_CITY,
};