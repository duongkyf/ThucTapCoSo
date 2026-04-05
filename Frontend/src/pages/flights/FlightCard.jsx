import React from 'react';
import '../../style/FlightCard.css';

const formatMoney = (n) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);

// ── Airline logo với fallback ──────────────────────────────
const AirlineLogo = ({ logo, name, code }) => {
  const [err, setErr] = React.useState(false);
  const initials = code || (name || '').slice(0, 2).toUpperCase();

  if (logo && !err) {
    return <img src={logo} alt={name} className="fc-airline-logo" onError={() => setErr(true)} />;
  }
  return <div className="fc-airline-logo-fallback">{initials}</div>;
};

// ── Class ticket card ──────────────────────────────────────
const CLASS_CONFIG = {
  eco:      { accent: '#475569', label: 'Phổ thông',           icon: 'fa-ticket-alt' },
  premium:  { accent: '#0ea5e9', label: 'Phổ thông+',          icon: 'fa-star-half-alt' },
  business: { accent: '#d97706', label: 'Thương gia',           icon: 'fa-crown' },
  first:    { accent: '#7c3aed', label: 'Hạng nhất',            icon: 'fa-star' },
};

const TicketCard = ({ cls, flight, onSelect }) => {
  const cfg = CLASS_CONFIG[cls.type] || CLASS_CONFIG.eco;
  return (
    <div className={`fc-ticket ${cls.type}`} style={{ '--accent': cfg.accent }}>
      {cls.isPopular && <span className="fc-popular">Phổ biến</span>}
      <div className="fc-ticket-top">
        <div className="fc-ticket-class">
          <i className={`fas ${cfg.icon}`} />
          {cls.name}
        </div>
        <div className="fc-ticket-price">{formatMoney(cls.price)}</div>
      </div>
      <ul className="fc-benefits">
        {cls.benefits.map(b => (
          <li key={b}><i className="fas fa-check" />{b}</li>
        ))}
      </ul>
      <button className="fc-select-btn" onClick={() => onSelect(flight, cls)}>
        Chọn <i className="fas fa-arrow-right" />
      </button>
    </div>
  );
};

// ── Main FlightCard ────────────────────────────────────────
const FlightCard = ({ flight, onSelect }) => (
  <div className="fc-card">
    {/* ── Top row: airline + route ── */}
    <div className="fc-top">
      {/* Airline */}
      <div className="fc-airline">
        <AirlineLogo logo={flight.logo} name={flight.airline} code={flight.airlineCode} />
        <div className="fc-airline-info">
          <span className="fc-airline-name">{flight.airline}</span>
          <span className="fc-flight-meta">
            <span className="fc-code-badge">{flight.flightCode}</span>
            <span className="fc-dot" />
            {flight.aircraft}
          </span>
        </div>
      </div>

      {/* Route */}
      <div className="fc-route">
        <div className="fc-point">
          <div className="fc-time">{flight.time}</div>
          <div className="fc-iata">{flight.from}</div>
          <div className="fc-city">{flight.fromCity}</div>
        </div>

        <div className="fc-line">
          <div className="fc-duration">{flight.duration}</div>
          <div className="fc-line-bar">
            <span /><i className="fas fa-plane" /><span />
          </div>
          <div className="fc-type">{flight.type}</div>
        </div>

        <div className="fc-point right">
          <div className="fc-time">{flight.arrTime}</div>
          <div className="fc-iata">{flight.to}</div>
          <div className="fc-city">{flight.toCity}</div>
        </div>
      </div>

      {/* Seats */}
      <div className="fc-seats">
        <i className="fas fa-chair" />
        <span>{flight.available_seats ?? '—'}</span>
        <small>ghế trống</small>
      </div>
    </div>

    {/* ── Class cards ── */}
    <div className="fc-classes">
      {flight.classes.map(cls => (
        <TicketCard key={cls.type} cls={cls} flight={flight} onSelect={onSelect} />
      ))}
    </div>
  </div>
);

export default FlightCard;