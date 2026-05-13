import React, { memo } from 'react';
import "../../style/Pages/Success.css";

const formatMoney = (amount) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

const AIRLINE_COLORS = { VN: '#003087', VJ: '#e8192c', QH: '#1b5e20', BL: '#1565c0' };

const AirlineBadge = ({ logo, name, code }) => {
  const [err, setErr] = React.useState(false);
  const color = AIRLINE_COLORS[code] || '#1a56db';
  if (logo && !err) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <img src={logo} alt={name}
          style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 6,
            border: '1px solid #e2e8f0', padding: 3, background: '#fff' }}
          onError={() => setErr(true)}
        />
        <strong>{name}</strong>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 26, height: 26, borderRadius: 6, background: color,
        color: '#fff', fontSize: 10, fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{code}</div>
      <strong>{name || code}</strong>
    </div>
  );
};

// ── FlightLeg — hiển thị 1 chiều bay ───────────────────────
const FlightLeg = ({ label, icon, booking, flight }) => {
  const cls         = flight?.selectedClass || {};
  const airline     = flight?.airline     || flight?.raw?.airline_name || '';
  const airlineCode = flight?.airlineCode || flight?.raw?.airline_code || '';
  const airlineLogo = flight?.logo        || flight?.raw?.airline_logo || '';
  return (
    <div className="success-leg">
      <div className="success-leg-title">
        <i className={`fas ${icon}`} /> {label}
      </div>
      <div className="success-info-box">
        <div className="success-row">
          <span>Mã đặt vé:</span>
          <strong className="pnr-code">{booking?.booking_ref || '—'}</strong>
        </div>
        {(airline || airlineCode) && (
          <div className="success-row">
            <span>Hãng bay:</span>
            <AirlineBadge logo={airlineLogo} name={airline} code={airlineCode} />
          </div>
        )}
        <div className="success-row">
          <span>Chuyến bay:</span>
          <strong>{flight?.flightCode || '—'}</strong>
        </div>
        <div className="success-row">
          <span>Hành trình:</span>
          <strong>{flight?.fromCity || flight?.from} → {flight?.toCity || flight?.to}</strong>
        </div>
        <div className="success-row">
          <span>Khởi hành:</span>
          <strong>{flight?.time || '—'}</strong>
        </div>
        <div className="success-row">
          <span>Hạng vé:</span>
          <strong>{cls.name || '—'}</strong>
        </div>
        {(booking?.total_amount > 0) && (
          <div className="success-row total">
            <span>Tổng thanh toán:</span>
            <strong className="text-primary">{formatMoney(booking.total_amount)}</strong>
          </div>
        )}
      </div>
    </div>
  );
};

const Success = memo(({ booking, returnBooking, flight, returnFlight, onReset }) => {
  const isRoundTrip = !!returnBooking;
  const grandTotal  = (booking?.total_amount || 0) + (returnBooking?.total_amount || 0);

  return (
    <div className="success-page">
      <div className="success-card">
        {/* Icon */}
        <div className="success-icon-wrap">
          <div className="success-icon"><i className="fas fa-check" /></div>
        </div>

        <h2>Đặt vé thành công!</h2>
        <p className="success-sub">
          {isRoundTrip ? 'Vé khứ hồi đã được đặt. ' : ''}
          Thông tin vé đã được gửi đến email của bạn.
        </p>

        {/* Booking info */}
        {isRoundTrip ? (
          <div className="success-legs">
            <FlightLeg label="Chiều đi"  icon="fa-plane-departure" booking={booking}       flight={flight} />
            <FlightLeg label="Chiều về"  icon="fa-plane-arrival"   booking={returnBooking} flight={returnFlight} />
            {grandTotal > 0 && (
              <div className="success-grand-total">
                <span>Tổng cộng cả 2 chiều:</span>
                <strong className="text-primary">{formatMoney(grandTotal)}</strong>
              </div>
            )}
          </div>
        ) : (
          <FlightLeg label="" icon="fa-plane" booking={booking} flight={flight} />
        )}

        {/* Steps */}
        <div className="success-steps">
          {[
            { icon: 'fa-envelope',  text: 'Kiểm tra email để nhận vé điện tử' },
            { icon: 'fa-id-card',   text: 'Mang CCCD / Hộ chiếu khi check-in' },
            { icon: 'fa-clock',     text: 'Có mặt tại sân bay trước 60 phút' },
            ...(isRoundTrip ? [{ icon: 'fa-ticket-alt', text: 'Dùng mã chiều về để check-in chuyến về' }] : []),
          ].map((s) => (
            <div className="success-step" key={s.icon}>
              <i className={`fas ${s.icon}`} />
              <span>{s.text}</span>
            </div>
          ))}
        </div>

        <button className="btn-home" onClick={onReset}>
          <i className="fas fa-home" /> Về trang chủ
        </button>
      </div>
    </div>
  );
});

export default Success;