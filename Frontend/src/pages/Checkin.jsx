import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { bookingService } from '../services/booking.service';
import api from '../services/api';
import { fmtDate } from '../utils/dateUtils';
import '../style/Pages/Checkin.css';

// Module-level cache ghế đã check-in trong session
const localOccupiedCache = {};
const addToCache = (flightId, seatCode) => {
  if (!flightId || !seatCode) return;
  if (!localOccupiedCache[flightId]) localOccupiedCache[flightId] = new Set();
  localOccupiedCache[flightId].add(seatCode.toUpperCase());
};
const getCached = (flightId) => localOccupiedCache[flightId] || new Set();

const SEAT_ROWS = {
  first:    { rows: 2,  cols: ['A','B','C','D'],         label: 'Hạng nhất',  color: '#b7791f' },
  business: { rows: 4,  cols: ['A','B','C','D'],         label: 'Thương gia', color: '#2b6cb0' },
  economy:  { rows: 16, cols: ['A','B','C','D','E','F'], label: 'Phổ thông',  color: '#276749' },
};
const CLASS_MAP = { first: 'first', business: 'business', eco: 'economy', economy: 'economy', premium: 'economy' };
const parseSeat = (code = '') => {
  const m = code.match(/^(\d+)([A-F]+)$/i);
  return m ? { row: parseInt(m[1]), col: m[2].toUpperCase() } : null;
};

const SAFETY_RULES = [
  'Hành lý xách tay tối đa 7kg, kích thước 56×36×23cm',
  'Không mang chất lỏng vượt quá 100ml, chất cháy nổ hoặc vật sắc nhọn',
  'Tắt thiết bị điện tử hoặc bật chế độ máy bay khi được yêu cầu',
  'Thông tin hành khách phải khớp với giấy tờ tùy thân khi check-in',
  'Đồng ý với điều khoản vận chuyển của SkyBooker Airlines',
];

// ── Seat Map ──────────────────────────────────────────────────
const SeatMap = ({ cls, flightId, seats, seatsLoading, selectedSeat, onSelect }) => {
  const key    = CLASS_MAP[cls] || 'economy';
  const config = SEAT_ROWS[key];
  const aisleAt = config.cols.length === 6 ? 3 : config.cols.length === 4 ? 2 : null;

  const occupiedSet = useMemo(() => {
    const s = new Set(getCached(flightId));
    (seats || []).forEach(seat => {
      if (!seat.is_occupied) return;
      const p  = parseSeat(seat.seat_code);
      const sc = CLASS_MAP[seat.seat_class] || seat.seat_class;
      if (p && sc === key) s.add(seat.seat_code.toUpperCase());
    });
    return s;
  }, [seats, key, flightId]);

  const seatLookup = useMemo(() => {
    const map = {};
    (seats || []).forEach(seat => {
      const sc = CLASS_MAP[seat.seat_class] || seat.seat_class;
      const p  = parseSeat(seat.seat_code);
      if (p && sc === key) map[`${p.row}${p.col}`] = seat;
    });
    return map;
  }, [seats, key]);

  const actualRows = useMemo(() => {
    if (!seats?.length) return Array.from({ length: config.rows }, (_, i) => i + 1);
    const rowSet = new Set();
    seats.forEach(seat => {
      const sc = CLASS_MAP[seat.seat_class] || seat.seat_class;
      const p  = parseSeat(seat.seat_code);
      if (p && sc === key) rowSet.add(p.row);
    });
    return rowSet.size > 0
      ? [...rowSet].sort((a, b) => a - b)
      : Array.from({ length: config.rows }, (_, i) => i + 1);
  }, [seats, key, config.rows]);

  if (seatsLoading) return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
      <i className="fas fa-spinner fa-spin" style={{ fontSize: 24 }} />
      <p style={{ marginTop: 10, fontSize: 14 }}>Đang tải sơ đồ ghế...</p>
    </div>
  );

  return (
    <div className="seatmap-wrap">
      <div className="seatmap-legend">
        {[
          { bg: config.color,  label: 'Ghế của bạn' },
          { bg: '#e2e8f0',     label: 'Trống'        },
          { bg: '#fc8181',     label: 'Đã đặt'       },
        ].map(l => (
          <div className="legend-item" key={l.label}>
            <div className="legend-dot" style={{ background: l.bg }} /><span>{l.label}</span>
          </div>
        ))}
      </div>

      <div className="seatmap-plane">
        <div className="plane-nose" />
        <div className="seatmap-rows">

          {/* Header hàng cột — row-num ẩn để căn đều với seat-row */}
          <div className="seatmap-cols-header">
            <div className="row-num" style={{ opacity: 0 }} aria-hidden="true">0</div>
            {config.cols.map((c, i) => (
              <React.Fragment key={c}>
                {aisleAt && i === aisleAt && <div className="aisle-spacer" />}
                <div className="col-label">{c}</div>
              </React.Fragment>
            ))}
            <div className="row-num" style={{ opacity: 0 }} aria-hidden="true">0</div>
          </div>

          {actualRows.map((rowNum) => (
            <div className="seat-row" key={rowNum}>
              <div className="row-num">{rowNum}</div>
              {config.cols.map((col, ci) => {
                const posKey     = `${rowNum}${col}`;
                const seatObj    = seatLookup[posKey];
                const seatCode   = seatObj ? seatObj.seat_code : posKey;
                const isYours    = selectedSeat === seatCode;
                const isOccupied = !isYours && occupiedSet.has(seatCode.toUpperCase());
                return (
                  <React.Fragment key={col}>
                    {aisleAt && ci === aisleAt && <div className="aisle-spacer" />}
                    <div
                      className={`seat ${isYours ? 'seat-yours' : isOccupied ? 'seat-taken' : 'seat-free'}`}
                      style={isYours ? { background: config.color, borderColor: config.color } : {}}
                      onClick={() => !isOccupied && onSelect(seatCode)}
                      title={isYours ? `${seatCode} — Đã chọn` : isOccupied ? `${seatCode} — Đã được đặt` : `${seatCode} — Nhấn để chọn`}
                    >
                      {isYours && <i className="fas fa-user" style={{ fontSize: 8, pointerEvents: 'none' }} />}
                    </div>
                  </React.Fragment>
                );
              })}
              <div className="row-num">{rowNum}</div>
            </div>
          ))}

        </div>
        <div className="plane-tail" />
      </div>

      <div className="seat-yours-label">
        {selectedSeat
          ? <><i className="fas fa-check-circle" style={{ color: config.color }} /> Ghế đã chọn: <strong>{selectedSeat}</strong></>
          : <><i className="fas fa-hand-pointer" /> Chọn ghế hạng <strong>{config.label}</strong> (ghế sáng màu)</>
        }
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────
const Checkin = () => {
  const [form,         setForm]         = useState({ booking_ref: '' });
  const [loading,      setLoading]      = useState(false);
  const [seatsLoading, setSeatsLoading] = useState(false);
  const [error,        setError]        = useState('');
  const [result,       setResult]       = useState(null);   // dữ liệu booking (chưa checkin)
  const [seats,        setSeats]        = useState([]);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [agreed,       setAgreed]       = useState(false);
  const [rulesOpen,    setRulesOpen]    = useState(false);
  const [confirmed,    setConfirmed]    = useState(false);

  const canConfirm = agreed && !!selectedSeat;

  // Load danh sách ghế sau khi tìm thấy booking
  useEffect(() => {
    if (!result?.flight_id) return;
    setSeatsLoading(true);
    // Truyền departure_date để scope ghế đúng ngày (recurring flights)
    const date = result.departure_time
      ? new Date(result.departure_time).toISOString().slice(0, 10)
      : '';
    const query = date ? `?date=${date}` : '';
    api.get(`/flights/${result.flight_id}/seats${query}`)
      .then(res => setSeats(res.data?.data || []))
      .catch(() => setSeats([]))
      .finally(() => setSeatsLoading(false));
  }, [result?.flight_id]);

  // ── Bước 1: Tra cứu — KHÔNG cập nhật DB ─────────────────────
  const handleSearch = useCallback(async () => {
    if (!form.booking_ref.trim()) { setError('Vui lòng nhập mã đặt chỗ'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const res  = await bookingService.lookup(form.booking_ref.toUpperCase());
      const data = res.data?.data;
      if (!data) throw new Error('Không tìm thấy thông tin đặt vé');
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Không tìm thấy thông tin đặt vé');
    } finally { setLoading(false); }
  }, [form]);

  // ── Bước 2: Xác nhận → mới gọi checkin, cập nhật DB ─────────
  const handleConfirm = useCallback(async () => {
    if (!canConfirm) return;
    setLoading(true); setError('');
    try {
      await bookingService.checkin({ booking_ref: result.booking_ref });
      addToCache(result.flight_id, selectedSeat);
      setConfirmed(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Xác nhận check-in thất bại, vui lòng thử lại');
    } finally { setLoading(false); }
  }, [canConfirm, result, selectedSeat]);

  const handleReset = useCallback(() => {
    setForm({ booking_ref: '' }); setResult(null); setSeats([]);
    setSelectedSeat(null); setAgreed(false); setRulesOpen(false);
    setConfirmed(false); setError('');
  }, []);

  const cls      = CLASS_MAP[result?.class] || 'economy';
  const clsLabel = SEAT_ROWS[cls]?.label || result?.class || '';

  const flightItems = result ? [
    { icon: 'fa-ticket-alt',     label: 'Mã vé',      value: result.booking_ref },
    { icon: 'fa-plane',          label: 'Chuyến bay',  value: `${result.flight_code}${result.airline_name ? ' · ' + result.airline_name : ''}` },
    { icon: 'fa-map-marker-alt', label: 'Hành trình',  value: `${result.origin_city} → ${result.dest_city}` },
    { icon: 'fa-calendar',       label: 'Ngày bay',    value: fmtDate(result.departure_time) },
    { icon: 'fa-user',           label: 'Hành khách',  value: result.passenger_name || '—' },
    { icon: 'fa-chair',          label: 'Hạng ghế',    value: clsLabel },
  ] : [];

  const bpDetails = result ? [
    { label: 'PASSENGER',   value: result.passenger_name || '—' },
    { label: 'AIRLINE',     value: result.airline_name || result.airline_code || '—' },
    { label: 'FLIGHT',      value: result.flight_code },
    { label: 'DATE',        value: fmtDate(result.departure_time) },
    { label: 'CLASS',       value: clsLabel },
    { label: 'SEAT',        value: selectedSeat || result.seat_code || 'TBD' },
    { label: 'BOOKING REF', value: result.booking_ref },
  ] : [];

  return (
    <div className="checkin-page">
      <div className="checkin-hero">
        <h1><i className="fas fa-plane-departure" /> Online Check-in</h1>
        <p>Hoàn tất thủ tục check-in trực tuyến trước chuyến bay của bạn</p>
      </div>

      <div className="checkin-container">

        {/* ── Bước 1: Tìm kiếm ── */}
        {!result && (
          <div className="checkin-form-card">
            <h2>Nhập thông tin đặt vé</h2>
            <div className="ci-form-group">
              <label>MÃ ĐẶT CHỖ *</label>
              <input
                type="text"
                placeholder="VD: BK-XY82A"
                value={form.booking_ref}
                onChange={(e) => { setError(''); setForm({ booking_ref: e.target.value }); }}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            {error && <div className="ci-error"><i className="fas fa-exclamation-circle" /> {error}</div>}
            <button className="btn-checkin" onClick={handleSearch} disabled={loading}>
              {loading
                ? <><i className="fas fa-spinner fa-spin" /> Đang kiểm tra...</>
                : <><i className="fas fa-search" /> Tìm kiếm</>}
            </button>
          </div>
        )}

        {/* ── Bước 2: Chọn ghế + xác nhận ── */}
        {result && !confirmed && (
          <div className="safety-card">
            <div className="safety-header">
              <i className="fas fa-shield-alt" />
              <div>
                <h2>Xác nhận check-in</h2>
                <p>Chọn ghế ngồi và xác nhận quy định an toàn trước khi hoàn tất</p>
              </div>
            </div>

            <div className="flight-preview">
              {flightItems.map(item => (
                <div className="fp-item" key={item.label}>
                  <i className={`fas ${item.icon}`} />
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>

            <div className="seatmap-card">
              <h3><i className="fas fa-th" /> Chọn ghế ngồi — {clsLabel}</h3>
              <p className="seatmap-sub">Ghế đỏ đã có người đặt · Nhấn ghế trống để chọn chỗ ngồi</p>
              <SeatMap
                cls={result.class}
                flightId={result.flight_id}
                seats={seats}
                seatsLoading={seatsLoading}
                selectedSeat={selectedSeat}
                onSelect={setSelectedSeat}
              />
            </div>

            <div className={`safety-accordion${agreed ? ' agreed' : ''}`}>
              <div className="sa-row">
                <label className="sa-checkbox" onClick={() => setAgreed(a => !a)}>
                  <div className={`rule-checkbox${agreed ? ' checked' : ''}`}>
                    {agreed && <i className="fas fa-check" />}
                  </div>
                  <span>Tôi đã đọc và đồng ý với tất cả quy định an toàn bay</span>
                </label>
                <button className="sa-toggle" onClick={() => setRulesOpen(o => !o)} title={rulesOpen ? 'Thu gọn' : 'Xem chi tiết'}>
                  <i className={`fas fa-chevron-${rulesOpen ? 'up' : 'down'}`} />
                </button>
              </div>
              {rulesOpen && (
                <ul className="sa-list">
                  {SAFETY_RULES.map((r, i) => <li key={i}><i className="fas fa-check-circle" />{r}</li>)}
                </ul>
              )}
            </div>

            {(!selectedSeat || !agreed) && (selectedSeat || agreed) && (
              <div className="ci-hint">
                <i className="fas fa-info-circle" />
                {!selectedSeat ? 'Vui lòng chọn ghế ngồi để tiếp tục' : 'Vui lòng xác nhận quy định an toàn'}
              </div>
            )}
            {error && <div className="ci-error"><i className="fas fa-exclamation-circle" /> {error}</div>}

            <div className="safety-actions">
              <button className="btn-back" onClick={handleReset}>
                <i className="fas fa-arrow-left" /> Quay lại
              </button>
              <button className="btn-confirm" disabled={!canConfirm || loading} onClick={handleConfirm}>
                {loading
                  ? <><i className="fas fa-spinner fa-spin" /> Đang xử lý...</>
                  : <><i className="fas fa-check-circle" /> {canConfirm ? `Xác nhận Check-in — Ghế ${selectedSeat}` : 'Xác nhận Check-in'}</>}
              </button>
            </div>
          </div>
        )}

        {/* ── Bước 3: Boarding pass ── */}
        {result && confirmed && (
          <div className="checkin-result">
            <div className="ci-success-banner">
              <i className="fas fa-check-circle" />
              <div>
                <h2>Check-in thành công!</h2>
                <p>Ghế <strong>{selectedSeat || result.seat_code || 'TBD'}</strong> · Chúc bạn có chuyến bay vui vẻ</p>
              </div>
            </div>

            <div className="boarding-pass">
              <div className="bp-header">
                <div className="bp-logo">
                  {result.airline_logo
                    ? <img src={result.airline_logo} alt={result.airline_name}
                        style={{ height: 28, maxWidth: 100, objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
                        onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                      />
                    : null}
                  <span style={{ display: result.airline_logo ? 'none' : 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="fas fa-plane" /> {result.airline_name || 'SkyBooker'}
                  </span>
                  {result.airline_code && <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 4 }}>{result.airline_code}</span>}
                </div>
                <div className="bp-title">BOARDING PASS</div>
              </div>

              <div className="bp-route">
                <div className="bp-point">
                  <div className="bp-iata">{result.origin_iata || result.origin_city?.substring(0,3).toUpperCase()}</div>
                  <div className="bp-city">{result.origin_city}</div>
                </div>
                <div className="bp-arrow"><i className="fas fa-plane" /></div>
                <div className="bp-point right">
                  <div className="bp-iata">{result.dest_iata || result.dest_city?.substring(0,3).toUpperCase()}</div>
                  <div className="bp-city">{result.dest_city}</div>
                </div>
              </div>

              <div className="bp-tear"><div className="bp-tear-dot" /></div>

              <div className="bp-details">
                {bpDetails.map(d => (
                  <div className="bp-detail-item" key={d.label}>
                    <span>{d.label}</span><strong>{d.value}</strong>
                  </div>
                ))}
              </div>

              <div className="bp-barcode">
                {'|'.repeat(60).split('').map((_, i) => (
                  <div key={i} className="bar" style={{ height: i % 5 === 0 ? 28 : 20, width: i % 3 === 0 ? 3 : 2 }} />
                ))}
              </div>
            </div>

            <div className="checkin-result-actions">
              <button className="btn-action outlined" onClick={handleReset}>
                <i className="fas fa-redo" /> Check-in chuyến khác
              </button>
              <button className="btn-action filled" onClick={() => window.location.href = '/'}>
                <i className="fas fa-home" /> Về trang chủ
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default Checkin;