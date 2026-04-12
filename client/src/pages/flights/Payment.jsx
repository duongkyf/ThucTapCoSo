import React, { useState, useEffect, useCallback } from 'react';
import '../../style/PassengerForm.css';
import '../../style/Payment.css';

const formatMoney = (amount) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

const MY_QR_MOMO  = '/qr-momo.jpg';   // đặt file vào client/public/qr-momo.png
const MY_QR_BANK  = '/qr-bank.jpg';   // đặt file vào client/public/qr-bank.png
const QR_FALLBACK = 'https://upload.wikimedia.org/wikipedia/commons/d/d0/QR_code_for_mobile_English_Wikipedia.svg';

const PAYMENT_METHODS = [
  { id: 'momo',   name: 'Ví MoMo',                icon: 'fas fa-wallet',      desc: 'Quét mã QR qua ứng dụng MoMo',           color: '#ae2070' },
  { id: 'vnpay',  name: 'VNPay / Ngân hàng',       icon: 'fas fa-qrcode',      desc: 'Quét QR qua ứng dụng ngân hàng bất kỳ',  color: '#005baa' },
  { id: 'card',   name: 'Thẻ Tín dụng / Ghi nợ',   icon: 'fas fa-credit-card', desc: 'Visa, Mastercard, JCB',                  color: '#1d4ed8' },
  { id: 'atm',    name: 'Thẻ ATM Nội địa',          icon: 'fas fa-university',  desc: 'Napas — tất cả ngân hàng Việt Nam',      color: '#0e7490' },
];

const sumSelections = (obj = {}) => Object.values(obj).reduce((a, b) => a + b, 0);

// ── Countdown ──────────────────────────────────────────────────────────────
const Countdown = ({ seconds: initSec }) => {
  const [sec, setSec] = useState(initSec);
  useEffect(() => {
    setSec(initSec);
    const t = setInterval(() => setSec((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [initSec]);
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return (
    <div className={`qr-countdown${sec <= 30 ? ' urgent' : ''}`}>
      <i className="fas fa-clock" /> Mã QR hết hạn sau: <strong>{m}:{s}</strong>
    </div>
  );
};

// ── QR Payment ─────────────────────────────────────────────────────────────
const QrPayment = ({ method, total }) => {
  const qrSrc = method === 'momo' ? MY_QR_MOMO : MY_QR_BANK;
  const appName = method === 'momo' ? 'MoMo' : 'ứng dụng ngân hàng';
  const [imgErr, setImgErr] = useState(false);
  useEffect(() => { setImgErr(false); }, [method]);

  return (
    <div className="qr-payment-area">
      <div className="qr-steps">
        {['Mở ứng dụng', 'Quét mã QR', 'Xác nhận'].map((s, i) => (
          <div className="qr-step" key={s}>
            <div className="qr-step-num">{i + 1}</div>
            <span>{s}</span>
          </div>
        ))}
      </div>
      <div className="qr-box">
        <img
          src={imgErr ? QR_FALLBACK : qrSrc}
          alt="QR Code thanh toán"
          onError={() => setImgErr(true)}
        />
      </div>
      <div className="qr-amount">
        <span>Số tiền cần thanh toán:</span>
        <strong>{formatMoney(total)}</strong>
      </div>
      <p className="qr-hint">
        Vui lòng mở <strong>{appName}</strong> và quét mã QR bên trên để hoàn tất.
      </p>
      <Countdown seconds={10 * 60} />
      {imgErr && (
        <p className="qr-upload-hint">
          <i className="fas fa-info-circle" /> Để dùng QR của bạn: đặt file ảnh vào{' '}
          <code>client/public/{method === 'momo' ? 'qr-momo.jpg' : 'qr-bank.jpg'}</code>
        </p>
      )}
    </div>
  );
};

// ── Card Form ──────────────────────────────────────────────────────────────
const CardForm = ({ data, onChange }) => {
  const f = (field) => (e) => onChange(field, e.target.value);
  return (
    <div className="card-form">
      <div className="card-logos">
        <img src="https://upload.wikimedia.org/wikipedia/commons/0/04/Visa.svg" alt="Visa" />
        <img src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg" alt="Mastercard" />
      </div>
      <div className="pax-form-grid">
        <div className="form-group full-width">
          <label>Số thẻ *</label>
          <input className="form-input" placeholder="0000 0000 0000 0000" value={data.cardNumber}
            onChange={f('cardNumber')} maxLength={19} />
        </div>
        <div className="form-group full-width">
          <label>Tên in trên thẻ *</label>
          <input className="form-input" placeholder="NGUYEN VAN A" value={data.cardName}
            onChange={f('cardName')} />
        </div>
        <div className="form-group">
          <label>Ngày hết hạn *</label>
          <input className="form-input" placeholder="MM/YY" value={data.expiry}
            onChange={f('expiry')} maxLength={5} />
        </div>
        <div className="form-group">
          <label>Mã CVV *</label>
          <input type="password" className="form-input" placeholder="•••" value={data.cvv}
            onChange={f('cvv')} maxLength={4} />
        </div>
      </div>
    </div>
  );
};

// ── ATM ────────────────────────────────────────────────────────────────────
const AtmPayment = () => (
  <div className="atm-payment-area">
    <i className="fas fa-external-link-alt" style={{ fontSize: 28, marginBottom: 12 }} />
    <p>Hệ thống sẽ chuyển hướng đến cổng thanh toán <strong>Napas</strong> để nhập thông tin thẻ ATM sau khi bấm "Thanh toán".</p>
  </div>
);

// ── Main ───────────────────────────────────────────────────────────────────
const Payment = ({ flight, passengers = [], services = {}, onConfirm, onBack }) => {
  const [method, setMethod] = useState('momo');
  const [cardData, setCardData] = useState({ cardNumber: '', cardName: '', expiry: '', cvv: '' });

  const cls       = flight?.selectedClass || {};
  const pax       = flight?.pax || { adult: 1, child: 0, infant: 0 };
  const basePrice = Number(cls.price) || 0;
  const flightTotal  = (basePrice * (pax.adult || 1) + basePrice * 0.8 * (pax.child || 0)) * 1.1;
  const serviceTotal = sumSelections(services.baggage) + sumSelections(services.oversized) + sumSelections(services.meal);
  const grandTotal   = flightTotal + serviceTotal;

  const handleConfirm = useCallback(() => {
    onConfirm({ method, cardData });
  }, [method, cardData, onConfirm]);

  return (
    <div className="passenger-page">
      <h2 className="page-title">Thanh toán an toàn</h2>
      <div className="layout-with-sidebar">

        {/* ── Left ── */}
        <div className="form-sections">
          <div className="payment-container">
            <div className="payment-title">
              <i className="fas fa-lock" style={{ color: '#10b981', marginRight: 8 }} />
              Chọn phương thức thanh toán
            </div>

            <div className="payment-methods-grid">
              {PAYMENT_METHODS.map((m) => (
                <div
                  key={m.id}
                  className={`payment-method-box${method === m.id ? ' active' : ''}`}
                  onClick={() => setMethod(m.id)}
                  style={method === m.id ? { borderColor: m.color, boxShadow: `0 0 0 1px ${m.color}` } : {}}
                >
                  <div className="pm-icon" style={{ color: method === m.id ? m.color : '#94a3b8' }}>
                    <i className={m.icon} />
                  </div>
                  <div className="pm-info">
                    <strong>{m.name}</strong>
                    <span>{m.desc}</span>
                  </div>
                  <div className="pm-radio">
                    <div
                      className={`radio-circle${method === m.id ? ' checked' : ''}`}
                      style={method === m.id ? { borderColor: m.color } : {}}
                    >
                      {method === m.id && <span style={{ background: m.color }} />}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="payment-details-area">
              {(method === 'momo' || method === 'vnpay') && <QrPayment method={method} total={grandTotal} />}
              {method === 'card' && <CardForm data={cardData} onChange={(f, v) => setCardData((p) => ({ ...p, [f]: v }))} />}
              {method === 'atm'  && <AtmPayment />}
            </div>
          </div>

          <div className="action-buttons">
            <button className="btn-back" onClick={onBack}>Quay lại</button>
            <button className="btn-pay" onClick={handleConfirm}>
              <i className="fas fa-lock" /> Thanh toán {formatMoney(grandTotal)}
            </button>
          </div>
        </div>

        {/* ── Right: order summary ── */}
        <div className="flight-summary-sidebar">
          <div className="summary-header"><i className="fas fa-shopping-cart" /> Tóm tắt đơn hàng</div>
          <div className="summary-body">
            <div className="flight-route-section">
              <div className="route-badge">Chiều đi</div>
              <div className="route-info">
                <div className="route-point"><h3>{flight?.fromCity || flight?.from}</h3><strong>{flight?.time}</strong></div>
                <div className="route-icon"><i className="fas fa-plane" /></div>
                <div className="route-point right"><h3>{flight?.toCity || flight?.to}</h3></div>
              </div>
            </div>
            <div className="divider" />

            {/* Passengers list */}
            {passengers.length > 0 && (
              <div className="pax-summary-list">
                {passengers.map((p, i) => (
                  <div className="summary-row" key={i}>
                    <span><i className="far fa-user" /> {p.passenger_name || `HK ${i + 1}`}</span>
                    <span>{formatMoney(basePrice)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="divider" />
            <div className="summary-row"><span>Hạng vé:</span><span className="badge-class">{cls.name}</span></div>
            <div className="divider" />

            <div className="price-breakdown">
              <div className="summary-row"><span>Giá vé + Thuế (10%)</span><span>{formatMoney(flightTotal)}</span></div>
              {serviceTotal > 0 && (
                <div className="summary-row" style={{ color: '#d97706', fontWeight: 'bold' }}>
                  <span>Dịch vụ bổ sung</span><span>+{formatMoney(serviceTotal)}</span>
                </div>
              )}
              <div className="summary-row total-price">
                <span>TỔNG THANH TOÁN</span>
                <span className="text-primary">{formatMoney(grandTotal)}</span>
              </div>
            </div>

            <div className="secure-badge">
              <i className="fas fa-shield-alt" /> 
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Payment;