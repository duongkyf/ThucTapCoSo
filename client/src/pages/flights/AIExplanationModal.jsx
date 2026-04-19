import React from 'react';

// ── Map label explainer → key nội bộ (chỉ 4 chiều có data thật) ──
const LABEL_TO_KEY = {
  'Giá vé tốt':        'price',
  'Hãng bay phù hợp':  'airline',
  'Giờ bay hợp lý':    'time',
  'Hạng ghế phù hợp':  'class',
  'Giá rẻ':            'price',
  'Hãng bay':          'airline',
  'Giờ bay':           'time',
  'Hạng ghế':          'class',
};

// Từ khóa bị loại khỏi summary
const EXCLUDED_PHRASES = [
  'thời gian bay ngắn', 'bay ngắn', 'thời gian ngắn',
  'ít điểm dừng', 'không dừng', 'bay thẳng không dừng',
  'ít điểm quá cảnh', 'quá cảnh',
];

const FACTOR_META = {
  price:   { label: 'Giá vé',   icon: 'fa-tag',   color: '#6366f1' },
  airline: { label: 'Hãng bay', icon: 'fa-heart',  color: '#f59e0b' },
  time:    { label: 'Giờ bay',  icon: 'fa-sun',    color: '#22c55e' },
  class:   { label: 'Hạng ghế', icon: 'fa-crown',  color: '#ec4899' },
};

// ── Helpers ───────────────────────────────────────────────────

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
 * Tính điểm phù hợp tổng từ radar scores [0,1] của 4 chiều thật.
 * Trọng số: giá 35% · hãng 30% · giờ bay 20% · hạng ghế 15%
 * Lý do chọn cách này thay vì ai_score:
 *   ai_score = LightGBM output, không có nghĩa % với người dùng
 *   Công thức có trọng số → % có ý nghĩa thực tế hơn
 */
const computeMatchScore = (radar) => {
  if (!radar) return null;
  const p = Math.min(1, Math.max(0, radar.price   ?? radar.price_sensitivity   ?? 0.5));
  const a = Math.min(1, Math.max(0, radar.airline ?? radar.airline_loyalty     ?? 0.5));
  const t = Math.min(1, Math.max(0, radar.time    ?? radar.morning_preference  ?? 0.5));
  const c = Math.min(1, Math.max(0, radar.class   ?? radar.business_class_pref ?? 0.5));
  return Math.round((p * 0.35 + a * 0.30 + t * 0.20 + c * 0.15) * 100);
};

/** Xóa các lý do liên quan đến duration/stops khỏi câu summary */
const cleanSummary = (summary) => {
  if (!summary) return '';
  let s = summary;
  EXCLUDED_PHRASES.forEach(phrase => {
    s = s.replace(new RegExp(`(\\s*(và|vì|,)\\s*)?${phrase}(\\s*(và|,)\\s*)?`, 'gi'), ' ');
  });
  return s.replace(/\s{2,}/g, ' ').replace(/(vì|và|,)\s*$/, '').trim();
};

// ── Pie chart SVG ──────────────────────────────────────────────
const PieChart = ({ slices }) => {
  if (!slices || slices.length === 0) return null;
  const cx = 80; const cy = 80; const r = 66;
  let angle = -Math.PI / 2;

  const paths = slices.map((s) => {
    const sweep     = (s.pct / 100) * 2 * Math.PI;
    const startA    = angle;
    const endA      = angle + sweep;
    angle           = endA;
    const x1 = cx + r * Math.cos(startA);
    const y1 = cy + r * Math.sin(startA);
    const x2 = cx + r * Math.cos(endA);
    const y2 = cy + r * Math.sin(endA);
    const mid = startA + sweep / 2;
    const lx  = cx + r * 0.63 * Math.cos(mid);
    const ly  = cy + r * 0.63 * Math.sin(mid);
    return {
      d: `M${cx} ${cy} L${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}Z`,
      color: s.color, pct: s.pct, lx, ly, show: s.pct >= 11,
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
        {/* Donut hole */}
        <circle cx={cx} cy={cy} r="28" fill="#ffffff" />
        <text x={cx} y={cy - 2} textAnchor="middle" dominantBaseline="central"
          style={{ fontSize: '8.5px', fill: '#94a3b8', fontFamily: 'Be Vietnam Pro,sans-serif', fontWeight: 600 }}>
          đóng góp
        </text>
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '140px' }}>
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

// ── Main Modal ────────────────────────────────────────────────
const AIExplanationModal = ({ flight, onClose }) => {
  const exp  = flight?.explanation;
  const meta = flight?.aiMeta;
  if (!exp) return null;

  const normalized4    = normalize4(exp.contributions);
  const matchScore     = computeMatchScore(exp.radar);
  const cleanedSummary = cleanSummary(exp.summary || '');

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

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ background: '#6366f1', color: '#fff', borderRadius: '8px', padding: '4px 12px', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                <i className="fas fa-robot" style={{ fontSize: '11px' }} />
                AI Gợi ý #{flight.ai_rank ?? '—'}
              </span>
              {matchScore !== null && (
                <span style={{ background: scoreBg, color: scoreColor, borderRadius: '8px', padding: '4px 12px', fontSize: '12px', fontWeight: 700 }}>
                  Phù hợp {matchScore}%
                </span>
              )}
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

        {/* Summary */}
        {cleanedSummary && (
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

        {/* Pie chart */}
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

        {/* Bar detail */}
        {normalized4.length > 0 && (
          <div style={{ marginBottom: '22px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '14px' }}>
              Chi tiết từng tiêu chí
            </div>
            {normalized4.map(({ key, label, pct }) => {
              const m = FACTOR_META[key] || FACTOR_META.price;
              return (
                <div key={key} style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', color: '#334155', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <span style={{ width: '22px', height: '22px', borderRadius: '6px', background: `${m.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className={`fas ${m.icon}`} style={{ fontSize: '10px', color: m.color }} />
                      </span>
                      {label}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: m.color }}>{Math.round(pct)}%</span>
                  </div>
                  <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.round(pct)}%`, height: '100%', background: m.color, borderRadius: '3px', transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ height: '1px', background: '#f1f5f9', margin: '0 0 20px' }} />

        {/* User meta */}
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
                <span>Dựa trên <strong style={{ color: '#0f172a' }}>{meta.bookingCount}</strong> lần đặt vé trước đây</span>
                {meta.preferredAirline && (
                  <span>Hãng bay ưa thích: <strong style={{ color: '#0f172a' }}>{meta.preferredAirline}</strong></span>
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