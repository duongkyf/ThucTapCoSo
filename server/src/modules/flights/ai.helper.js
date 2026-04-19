/**
 * ai.helper.js
 * ─────────────────────────────────────────────────────────────
 * Preference vector 6 chiều — chỉ 4 chiều có dữ liệu thật:
 *   [0] price_sensitivity   ← từ base_price booking thật
 *   [1] duration_preference ← MẶC ĐỊNH 0.5 (không đủ variation)
 *   [2] stop_tolerance      ← MẶC ĐỊNH 0.5 (tất cả direct flight)
 *   [3] airline_loyalty     ← từ airline_code booking thật
 *   [4] morning_preference  ← từ departure_time booking thật
 *   [5] business_class_pref ← từ Tickets.class booking thật
 */

const { sql, getPool } = require('../../config/db');

const AI_BASE_URL = process.env.AI_BASE_URL || 'http://localhost:8000';
const PRICE_MIN   = 500_000;
const PRICE_MAX   = 9_000_000;

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
const norm  = (v, min, max) => clamp((v - min) / (max - min));

async function computePreferenceVector(userId) {
  const pool   = await getPool();
  const result = await pool.request()
    .input('userId', sql.Int, userId)
    .query(`
      SELECT
        f.base_price                     AS price,
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
    return { vector: [0.6, 0.5, 0.5, 0.5, 0.5, 0.5], preferredAirline: '', isNewUser: true, bookingCount: 0 };
  }

  const n = history.length;

  // [0] price_sensitivity
  const avgPriceNorm     = history.reduce((s, r) => s + norm(r.price, PRICE_MIN, PRICE_MAX), 0) / n;
  const priceSensitivity = clamp(1 - avgPriceNorm);

  // [1] duration_preference — không đủ variation, giữ neutral
  const durationPreference = 0.5;

  // [2] stop_tolerance — tất cả direct, giữ neutral
  const stopTolerance = 0.5;

  // [3] airline_loyalty
  const airlineCount = {};
  history.forEach(r => { airlineCount[r.airline_code] = (airlineCount[r.airline_code] || 0) + 1; });
  const maxCount       = Math.max(...Object.values(airlineCount));
  const airlineLoyalty = clamp(maxCount / n);
  const preferredCode  = Object.entries(airlineCount).sort((a, b) => b[1] - a[1])[0][0];
  const preferredAirline = AIRLINE_NAME_MAP[preferredCode] || '';

  // [4] morning_preference
  const morningPreference = clamp(history.filter(r => r.dep_hour < 10).length / n);

  // [5] business_class_pref
  const businessClassPref = clamp(
    history.filter(r => ['business', 'first'].includes(r.seat_class)).length / n
  );

  return {
    vector: [priceSensitivity, durationPreference, stopTolerance, airlineLoyalty, morningPreference, businessClassPref],
    preferredAirline,
    isNewUser:    false,
    bookingCount: n,
  };
}

async function callAIRanker({ prefVector, preferredAirline, origin, destination, seatClass, topK = 20 }) {
  const originCity = IATA_TO_CITY[origin?.toUpperCase()];
  const destCity   = IATA_TO_CITY[destination?.toUpperCase()];
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
    const matchKey  = Object.keys(sqlByAirline).find(k => k.includes(aiAirline) || aiAirline.includes(k));
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
  return flights.reduce((b, f) => Math.abs(new Date(f.departure_time).getHours()-h) < Math.abs(new Date(b.departure_time).getHours()-h) ? f : b);
}

module.exports = { computePreferenceVector, callAIRanker, mergeAIWithSQL, IATA_TO_CITY };