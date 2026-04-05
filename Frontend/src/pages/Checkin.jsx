import React, { useState, useCallback } from 'react';
import { bookingService } from '../services/booking.service';
import '../style/Checkin.css';

// ── Seat Map per class ────────────────────────────────────────
const SEAT_ROWS = {
  first:    { rows: 2, cols: ['A','C','D','F'],       label: 'Hạng nhất',       color: '#b7791f' },
  business: { rows: 4, cols: ['A','C','D','F'],       label: 'Thương gia',      color: '#2b6cb0' },
  economy:  { rows: 14, cols: ['A','B','C','D','E','F'], label: 'Phổ thông',    color: '#276749' },
};

const CLASS_MAP = {
  first: 'first', business: 'business',
  eco: 'economy', economy: 'economy', premium: 'economy',
};

const SeatMap = ({ cls, assignedSeat }) => {
  const key    = CLASS_MAP[cls] || 'economy';
  const config = SEAT_ROWS[key];
  const [hovered, setHovered]       = useState(null);
  const [selectedSeat, setSelected] = useState(assignedSeat || null);

  const takenSeats = React.useMemo(() => {
    const taken = new Set();
    Array.from({ length: config.rows }, (_, ri) => {
      config.cols.forEach(col => {
        const seatId = `${ri + 1}${col}`;
        if (seatId !== assignedSeat && Math.random() < 0.35) taken.add(seatId);
      });
    });
    return taken;
  }, [key]);

  return (
    <div className="seatmap-wrap">
      <div className="seatmap-legend">
        {[
          { color: config.color,  label: 'Ghế của bạn' },
          { color: '#e2e8f0',     label: 'Trống' },
          { color: '#fc8181',     label: 'Đã đặt' },
        ].map(l => (
          <div className="legend-item" key={l.label}>
            <div className="legend-dot" style={{ background: l.color }} />
            <span>{l.label}</span>
          </div>
        ))}
      </div>

      <div className="seatmap-plane">
        <div className="plane-nose" />
        <div className="seatmap-cols-header">
          {config.cols.map((c, i) => (
            <React.Fragment key={c}>
              {config.cols.length === 6 && i === 3 && <div className="aisle-spacer" />}
              {config.cols.length === 4 && i === 2 && <div className="aisle-spacer" />}
              <div className="col-label">{c}</div>
            </React.Fragment>
          ))}
        </div>

        <div className="seatmap-rows">
          {Array.from({ length: config.rows }, (_, ri) => {
            const rowNum = ri + 1;
            return (
              <div className="seat-row" key={rowNum}>
                <div className="row-num">{rowNum}</div>
                {config.cols.map((col, ci) => {
                  const seatId = `${rowNum}${col}`;
                  const isYours   = selectedSeat === seatId;
                  const isTaken   = !isYours && takenSeats.has(seatId);
                  const isHovered = hovered === seatId && !isTaken;
                  return (
                    <React.Fragment key={col}>
                      {config.cols.length === 6 && ci === 3 && <div className="aisle-spacer" />}
                      {config.cols.length === 4 && ci === 2 && <div className="aisle-spacer" />}
                      <div
                        className={`seat ${isYours ? 'seat-yours' : isTaken ? 'seat-taken' : 'seat-free'} ${isHovered ? 'seat-hover' : ''}`}
                        style={isYours ? { background: config.color } : {}}
                        onMouseEnter={() => !isTaken && setHovered(seatId)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => !isTaken && setSelected(seatId)}
                        title={isTaken ? `${seatId} - Đã đặt` : `${seatId} - Nhấn để chọn`}
                      >
                        {isYours && <i className="fas fa-user" style={{ fontSize: 8 }} />}
                      </div>
                    </React.Fragment>
                  );
                })}
                <div className="row-num">{rowNum}</div>
              </div>
            );
          })}
        </div>
        <div className="plane-tail" />
      </div>

      {selectedSeat && (
        <div className="seat-yours-label">
          <i className="fas fa-check-circle" style={{color:'var(--green)'}} /> Ghế đã chọn: <strong>{selectedSeat}</strong>
        </div>
      )}
      {!selectedSeat && (
        <div className="seat-yours-label" style={{ color: '#64748b' }}>
          <i className="fas fa-hand-pointer" /> Nhấn vào ghế trống để chọn chỗ ngồi
        </div>
      )}
    </div>
  );
};

// ── Safety Rules ──────────────────────────────────────────────
const SAFETY_RULES = [
  { id: 's1', text: 'Tôi đồng ý tuân thủ quy định về hành lý xách tay (tối đa 7kg, kích thước 56×36×23cm)' },
  { id: 's2', text: 'Tôi cam kết không mang theo chất lỏng vượt quá 100ml, chất cháy nổ, vật sắc nhọn' },
  { id: 's3', text: 'Tôi đồng ý tắt hoặc chuyển máy bay sang chế độ máy bay khi được yêu cầu' },
  { id: 's4', text: 'Tôi xác nhận thông tin hành khách trên vé khớp với giấy tờ tùy thân' },
  { id: 's5', text: 'Tôi đã đọc và đồng ý với điều khoản vận chuyển của SkyBooker Airlines' },
];

// ── Main Component ────────────────────────────────────────────
const Checkin = () => {
  const [form,    setForm]    = useState({ booking_ref: '' });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [result,  setResult]  = useState(null);
  const [checked, setChecked] = useState({});
  const [confirmed, setConfirmed] = useState(false);

  const allChecked = SAFETY_RULES.every(r => checked[r.id]);

  const handleSubmit = useCallback(async () => {
    if (!form.booking_ref) { setError('Vui lòng nhập mã đặt chỗ'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await bookingService.checkin({ booking_ref: form.booking_ref.toUpperCase() });
      setResult(res.data?.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Không tìm thấy thông tin đặt vé');
    } finally { setLoading(false); }
  }, [form]);

  const handleReset = useCallback(() => {
    setForm({ booking_ref: '' });
    setResult(null); setError('');
    setChecked({}); setConfirmed(false);
  }, []);

  const toggleCheck = (id) => setChecked(p => ({ ...p, [id]: !p[id] }));

  const cls = result ? (CLASS_MAP[result.class] || 'economy') : 'economy';
  const clsLabel = result ? (SEAT_ROWS[cls]?.label || result.class) : '';

  return (
    <div className="checkin-page">
      <div className="checkin-hero">
        <h1><i className="fas fa-plane-departure" /> Online Check-in</h1>
        <p>Hoàn tất thủ tục check-in trực tuyến trước chuyến bay của bạn</p>
      </div>

      <div className="checkin-container">
        {!result ? (
          /* ── Search form ── */
          <div className="checkin-form-card">
            <h2>Nhập thông tin đặt vé</h2>
            <div className="ci-form-group">
              <label>MÃ ĐẶT CHỖ *</label>
              <input
                type="text"
                placeholder="VD: BK-XY82A"
                value={form.booking_ref}
                onChange={(e) => { setError(''); setForm({ booking_ref: e.target.value }); }}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </div>
            {error && <div className="ci-error"><i className="fas fa-exclamation-circle" /> {error}</div>}
            <button className="btn-checkin" onClick={handleSubmit} disabled={loading}>
              {loading ? <><i className="fas fa-spinner fa-spin" /> Đang kiểm tra...</> : <><i className="fas fa-search" /> Tìm kiếm</>}
            </button>
          </div>
        ) : !confirmed ? (
          /* ── Safety check ── */
          <div className="safety-card">
            <div className="safety-header">
              <i className="fas fa-shield-alt" />
              <div>
                <h2>Xác nhận an toàn bay</h2>
                <p>Vui lòng đọc và xác nhận tất cả quy định trước khi hoàn tất check-in</p>
              </div>
            </div>

            {/* Basic info preview */}
            <div className="flight-preview">
              <div className="fp-item"><i className="fas fa-ticket-alt" /><span>Mã vé</span><strong>{result.booking_ref}</strong></div>
              <div className="fp-item"><i className="fas fa-plane" /><span>Chuyến bay</span><strong>{result.flight_code}</strong></div>
              {result.airline_name && (
                <div className="fp-item"><i className="fas fa-building" /><span>Hãng bay</span><strong>{result.airline_name}</strong></div>
              )}
              <div className="fp-item"><i className="fas fa-map-marker-alt" /><span>Hành trình</span><strong>{result.origin_city} → {result.dest_city}</strong></div>
              <div className="fp-item"><i className="fas fa-calendar" /><span>Ngày bay</span><strong>{new Date(result.departure_time).toLocaleDateString('vi-VN')}</strong></div>
              <div className="fp-item"><i className="fas fa-user" /><span>Hành khách</span><strong>{result.passenger_name || '—'}</strong></div>
              <div className="fp-item"><i className="fas fa-chair" /><span>Hạng ghế</span><strong>{clsLabel}</strong></div>
            </div>

            {/* Safety checkboxes */}
            <div className="safety-rules">
              <h3><i className="fas fa-clipboard-check" /> Quy định an toàn</h3>
              <div className="safety-rules-grid">
                {SAFETY_RULES.map(rule => (
                  <label className={`safety-rule ${checked[rule.id] ? 'rule-checked' : ''}`} key={rule.id}
                    onClick={() => toggleCheck(rule.id)}>
                    <div className="rule-checkbox">
                      {checked[rule.id] && <i className="fas fa-check" />}
                    </div>
                    <span>{rule.text}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="safety-actions">
              <button className="btn-back" onClick={handleReset}>
                <i className="fas fa-arrow-left" /> Quay lại
              </button>
              <button
                className="btn-confirm"
                disabled={!allChecked}
                onClick={() => setConfirmed(true)}
              >
                <i className="fas fa-check-circle" /> Xác nhận Check-in
              </button>
            </div>
          </div>
        ) : (
          /* ── Boarding pass + seat map ── */
          <div className="checkin-result">
            {/* Success banner */}
            <div className="ci-success-banner">
              <i className="fas fa-check-circle" />
              <div>
                <h2>Check-in thành công!</h2>
                <p>Chúc bạn có chuyến bay vui vẻ</p>
              </div>
            </div>

            {/* Boarding pass */}
            <div className="boarding-pass">
              <div className="bp-header">
                <div className="bp-logo">
                  {result.airline_logo ? (
                    <img src={result.airline_logo} alt={result.airline_name}
                      style={{ height: 28, maxWidth: 100, objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
                      onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }}
                    />
                  ) : null}
                  <span style={{ display: result.airline_logo ? 'none' : 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="fas fa-plane" /> {result.airline_name || 'SkyBooker'}
                  </span>
                  {result.airline_code && (
                    <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 4 }}>{result.airline_code}</span>
                  )}
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
              <div className="bp-tear"><div className="bp-tear-dot"/></div>
              <div className="bp-details">
                {[
                  { label: 'PASSENGER',   value: result.passenger_name || '—' },
                  { label: 'AIRLINE',     value: result.airline_name || result.airline_code || '—' },
                  { label: 'FLIGHT',      value: result.flight_code },
                  { label: 'DATE',        value: new Date(result.departure_time).toLocaleDateString('vi-VN') },
                  { label: 'CLASS',       value: clsLabel },
                  { label: 'SEAT',        value: result.seat_code || 'TBD' },
                  { label: 'BOOKING REF', value: result.booking_ref },
                ].map(d => (
                  <div className="bp-detail-item" key={d.label}>
                    <span>{d.label}</span>
                    <strong>{d.value}</strong>
                  </div>
                ))}
              </div>
              <div className="bp-barcode">
                {'|'.repeat(60).split('').map((_, i) => (
                  <div key={i} className="bar" style={{ height: i % 5 === 0 ? 28 : 20, width: i % 3 === 0 ? 3 : 2 }} />
                ))}
              </div>
            </div>

            {/* Seat map */}
            <div className="seatmap-card">
              <h3><i className="fas fa-th" /> Sơ đồ ghế ngồi — {clsLabel}</h3>
              <p className="seatmap-sub">Máy bay Airbus A321 · 3 khoang · 180 ghế</p>
              <SeatMap cls={result.class} assignedSeat={result.seat_code} />
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