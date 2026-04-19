import React from 'react';

// ── 4 chiều có data thật ──────────────────────────────────────
const LABEL_TO_KEY = {
  'Giá vé tốt':       'price',
  'Hãng bay phù hợp': 'airline',
  'Giờ bay hợp lý':   'time',
  'Hạng ghế phù hợp': 'class',
  'Giá rẻ':           'price',
  'Hãng bay':         'airline',
  'Giờ bay':          'time',
  'Hạng ghế':         'class',
};

const EXCLUDED_PHRASES = [
  'thời gian bay ngắn', 'bay ngắn', 'thời gian ngắn',
  'ít điểm dừng', 'không dừng', 'bay thẳng không dừng',
  'ít điểm quá cảnh', 'quá cảnh',
];

const FACTOR_META = {
  price:   { label: 'Giá vé',   icon: 'fa-tag',    color: '#6366f1' },
  airline: { label: 'Hãng bay', icon: 'fa-heart',   color: '#f59e0b' },
  time:    { label: 'Giờ bay',  icon: 'fa-sun',     color: '#22c55e' },
  class:   { label: 'Hạng ghế', icon: 'fa-crown',   color: '#ec4899' },
};

// Trọng số mặc định (khớp với computeMatchScore gốc)
const DEFAULT_WEIGHTS = { price: 0.35, airline: 0.30, time: 0.20, class: 0.15 };

// ── Helpers ────────────────────────────────────────────────────

/** Lọc 4 chiều + re-normalize tổng = 100% */
const normalize4 = (contributions) => {
  if (!contributions) return [];
  const kept = Object.entries(contributions).filter(([label]) => LABEL_TO_KEY[label]);
  const total = kept.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return [];
  return kept
    .map(([label, raw]) => ({ key: LABEL_TO_KEY[label], label, pct: (raw / total) * 100 }))
    .sort((a, b) => b.pct - a.pct);
};

/**
 * Lấy radar score [0,1] của 4 chiều thật từ exp.radar.
 * Trả về object { price, airline, time, class } mỗi chiều ∈ [0,1].
 */
const extractRadarScores = (radar) => {
  if (!radar) return { price: 0.5, airline: 0.5, time: 0.5, class: 0.5 };
  return {
    price:   Math.min(1, Math.max(0, radar.price   ?? radar.price_sensitivity   ?? 0.5)),
    airline: Math.min(1, Math.max(0, radar.airline ?? radar.airline_loyalty     ?? 0.5)),
    time:    Math.min(1, Math.max(0, radar.time    ?? radar.morning_preference  ?? 0.5)),
    class:   Math.min(1, Math.max(0, radar.class   ?? radar.business_class_pref ?? 0.5)),
  };
};

/**
 * Tính % phù hợp tổng từ radar scores + trọng số.
 * Nếu có customVector (user tùy chỉnh) → dùng trọng số từ đó.
 * customVector là vector 6 chiều: [price, dur, stop, airline, morning, business]
 * Map sang 4 chiều: price=v[0], airline=v[3], time=v[4], class=v[5]
 */
const computeMatchScore = (radar, customVector) => {
  const scores = extractRadarScores(radar);
  let weights;

  if (customVector && customVector.length === 6) {
    const raw = {
      price:   customVector[0],
      airline: customVector[3],
      time:    customVector[4],
      class:   customVector[5],
    };
    const total = Object.values(raw).reduce((s, v) => s + v, 0) || 1;
    weights = { price: raw.price/total, airline: raw.airline/total, time: raw.time/total, class: raw.class/total };
  } else {
    weights = DEFAULT_WEIGHTS;
  }

  const score = scores.price * weights.price
    + scores.airline * weights.airline
    + scores.time    * weights.time
    + scores.class   * weights.class;

  return Math.round(score * 100);
};

/** Xóa lý do duration/stops khỏi summary */
const cleanSummary = (summary) => {
  if (!summary) return '';
  let s = summary;
  EXCLUDED_PHRASES.forEach(phrase => {
    s = s.replace(new RegExp(`(\\s*(và|vì|,)\\s*)?${phrase}(\\s*(và|,)\\s*)?`, 'gi'), ' ');
  });
  return s.replace(/\s{2,}/g, ' ').replace(/(vì|và|,)\s*$/, '').trim();
};

// ── Pie chart donut SVG ────────────────────────────────────────
const PieChart = ({ slices }) => {
  if (!slices || slices.length === 0) return null;
  const cx = 80; const cy = 80; const r = 66;
  let angle = -Math.PI / 2;

  const paths = slices.map((s) => {
    const sweep = (s.pct / 100) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    angle += sweep;
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    const mid = angle - sweep / 2;
    return {
      d: `M${cx} ${cy} L${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}Z`,
      color: s.color, pct: s.pct,
      lx: cx + r * 0.63 * Math.cos(mid),
      ly: cy + r * 0.63 * Math.sin(mid),
      show: s.pct >= 11,
    };
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '28px', flexWrap: 'wrap', justifyContent: 'center' }}>
      <svg viewBox="0 0 160 160" width="160" height="160" style={{ flexShrink: 0 }}>
        {paths.map((p, i) => (
          <g key={i}>
            <path d={p.d} fill={p.color} />
            {p.show && (
              <text x={p.lx.toFixed(1)} y={p.ly.toFixed(1)}
                textAnchor="middle" dominantBaseline="central"
                style={{ fontSize: '11px', fill: '#fff', fontWeight: 700, fontFamily: 'Be Vietnam Pro,sans-serif' }}>
                {Math.round(p.pct)}%
              </text>
            )}
          </g>
        ))}
        <circle cx={cx} cy={cy} r="28" fill="#ffffff" />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
          style={{ fontSize: '8.5px', fill: '#94a3b8', fontFamily: 'Be Vietnam Pro,sans-serif', fontWeight: 600 }}>
          đóng góp
        </text>
      </svg>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '145px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: '13px', color: '#334155', fontWeight: 600, flex: 1 }}>{s.label}</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: s.color }}>{Math.round(s.pct)}%</span>
          </div>
        ))}
        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Tổng: 100%</div>
      </div>
    </div>
  );
};

// ── Score bar (điểm /1.0) ─────────────────────────────────────
const ScoreBar = ({ score, color }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
    <div style={{ flex: 1, height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.5s ease' }} />
    </div>
    <span style={{ fontSize: '13px', fontWeight: 700, color, minWidth: '36px', textAlign: 'right' }}>
      {score.toFixed(2)}<span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 400 }}>/1.0</span>
    </span>
  </div>
);

// ── Main Modal ────────────────────────────────────────────────
const AIExplanationModal = ({ flight, onClose }) => {
  const exp          = flight?.explanation;
  const meta         = flight?.aiMeta;
  const customVector = meta?.customVector ?? null; // vector tùy chỉnh nếu có

  if (!exp) return null;

  const normalized4    = normalize4(exp.contributions);
  const radarScores    = extractRadarScores(exp.radar);
  const matchScore     = computeMatchScore(exp.radar, customVector);
  const cleanedSummary = cleanSummary(exp.summary || '');

  // Chỉ hiển thị summary nếu có nội dung thật sau khi clean VÀ không phải new user
  const showSummary = cleanedSummary.length > 10 && !meta?.isNewUser;

  const pieSlices = normalized4.map(item => ({
    ...item, color: FACTOR_META[item.key]?.color || '#6366f1',
  }));

  const scoreBg    = matchScore >= 70 ? '#dcfce7' : matchScore >= 45 ? '#fef9c3' : '#fee2e2';
  const scoreColor = matchScore >= 70 ? '#166534' : matchScore >= 45 ? '#854d0e' : '#991b1b';

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(15,23,42,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px', backdropFilter: 'blur(2px)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#ffffff', borderRadius: '20px',
        padding: '28px 28px 24px', maxWidth: '500px', width: '100%',
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(15,23,42,0.25)',
        border: '1.5px solid #e2e8f0',
        fontFamily: "'Be Vietnam Pro', sans-serif", color: '#0f172a',
      }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ background: '#6366f1', color: '#fff', borderRadius: '8px', padding: '4px 12px', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                <i className="fas fa-robot" style={{ fontSize: '11px' }} />
                AI Gợi ý #{flight.ai_rank ?? '—'}
              </span>
              <span style={{ background: scoreBg, color: scoreColor, borderRadius: '8px', padding: '4px 12px', fontSize: '12px', fontWeight: 700 }}>
                Phù hợp {matchScore}%
              </span>
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700 }}>
              {flight.airline}
              <span style={{ color: '#64748b', fontWeight: 500 }}> · {flight.flightCode}</span>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: '#f1f5f9', border: 'none', cursor: 'pointer',
            width: '32px', height: '32px', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '14px', color: '#64748b', flexShrink: 0, marginLeft: '12px',
          }}
            onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
            onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
          >
            <i className="fas fa-times" />
          </button>
        </div>

        {/* ── Summary — chỉ hiện khi có nội dung thật ── */}
        {showSummary && (
          <div style={{
            background: '#f0f0ff', border: '1px solid #c7d2fe',
            borderLeft: '4px solid #6366f1', borderRadius: '10px',
            padding: '12px 16px', marginBottom: '20px',
            fontSize: '14px', color: '#3730a3', fontWeight: 500, lineHeight: 1.5,
          }}>
            <i className="fas fa-lightbulb" style={{ marginRight: '8px', color: '#6366f1' }} />
            {cleanedSummary}
          </div>
        )}

        {/* ── Pie chart — tỷ trọng đóng góp ── */}
        {pieSlices.length > 0 && (
          <div style={{ marginBottom: '22px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '16px' }}>
              Tỷ trọng đóng góp vào gợi ý
            </div>
            <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
              <PieChart slices={pieSlices} />
            </div>
          </div>
        )}

        {/* ── Điểm số từng tiêu chí /1.0 ── */}
        <div style={{ marginBottom: '22px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '14px' }}>
            Điểm số từng tiêu chí
          </div>
          {Object.entries(FACTOR_META).map(([key, m]) => (
            <div key={key} style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px' }}>
                <span style={{ width: '22px', height: '22px', borderRadius: '6px', background: `${m.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className={`fas ${m.icon}`} style={{ fontSize: '10px', color: m.color }} />
                </span>
                <span style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>{m.label}</span>
              </div>
              <ScoreBar score={radarScores[key]} color={m.color} />
            </div>
          ))}
        </div>

        <div style={{ height: '1px', background: '#f1f5f9', margin: '0 0 20px' }} />

        {/* ── User meta ── */}
        {meta && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '7px' }}>
              <i className="fas fa-user-circle" style={{ color: '#6366f1' }} />
              Dựa trên hồ sơ của bạn
            </div>
            {meta.isNewUser ? (
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.6, fontStyle: 'italic' }}>
                Bạn chưa có lịch sử đặt vé — AI đang dùng gợi ý cân bằng.
                Đặt thêm vé để nhận gợi ý cá nhân hóa hơn!
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', color: '#475569' }}>
                <span>
                  Dựa trên <strong style={{ color: '#0f172a' }}>{meta.bookingCount}</strong> lần đặt vé trước đây
                </span>
                {meta.preferredAirline && (
                  <span>Hãng bay ưa thích: <strong style={{ color: '#0f172a' }}>{meta.preferredAirline}</strong></span>
                )}
                {customVector && (
                  <span style={{ color: '#6366f1', fontSize: '12px', marginTop: '2px' }}>
                    <i className="fas fa-sliders-h" style={{ marginRight: '4px' }} />
                    Đang dùng sở thích tùy chỉnh của bạn
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AIExplanationModal;