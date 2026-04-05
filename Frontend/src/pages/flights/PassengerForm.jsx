import React, { useMemo, useState, useEffect } from 'react';
import '../../style/PassengerForm.css';

const formatMoney = (amount) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

const NATIONALITIES = [
  { value: 'VN', label: 'Việt Nam' },
  { value: 'US', label: 'Mỹ (Hoa Kỳ)' },
  { value: 'JP', label: 'Nhật Bản' },
  { value: 'KR', label: 'Hàn Quốc' },
  { value: 'CN', label: 'Trung Quốc' },
  { value: 'OTHER', label: 'Khác...' },
];

const CHECKBOXES = [
  'Đăng ký nhận thông tin khuyến mãi và ưu đãi độc quyền.',
  'Tôi đồng ý tham gia khảo sát chất lượng dịch vụ sau chuyến bay.',
  'Lưu thông tin hành khách cho lần đặt vé sau.',
];

const buildPassengers = ({ adult = 1, child = 0, infant = 0 }) => [
  ...Array.from({ length: adult },  (_, i) => ({ type: 'adult',  label: `Người lớn ${i + 1}` })),
  ...Array.from({ length: child },  (_, i) => ({ type: 'child',  label: `Trẻ em ${i + 1}` })),
  ...Array.from({ length: infant }, (_, i) => ({ type: 'infant', label: `Em bé ${i + 1}` })),
];

const emptyAdult  = () => ({ gender: '', lastName: '', firstName: '', nationality: 'VN', idCard: '', email: '', phone: '', address: '' });
const emptyChild  = () => ({ gender: '', lastName: '', firstName: '', dob: '', nationality: 'VN', idCard: '', address: '' });
const emptyInfant = () => ({ gender: '', lastName: '', firstName: '', dob: '', nationality: 'VN', idCard: '', address: '' });

// ─── AdultForm ───────────────────────────────────────────────────────────────
const AdultForm = ({ data, onChange, isFirst, user }) => {
  const f = (field) => (e) => onChange(field, e.target.value);
  return (
    <div className="pax-form-grid">
      {isFirst && user && (
        <div className="prefill-notice full-width">
          <i className="fas fa-info-circle" /> Đã tự động điền từ tài khoản của bạn
        </div>
      )}
      <div className="form-group">
        <label>Giới tính *</label>
        <select className="form-input" value={data.gender} onChange={f('gender')}>
          <option value="">Chọn</option>
          <option value="Nam">Nam</option>
          <option value="Nữ">Nữ</option>
        </select>
      </div>
      <div className="form-group">
        <label>Họ (In hoa không dấu) *</label>
        <input className="form-input" placeholder="VD: NGUYEN" value={data.lastName} onChange={f('lastName')} />
      </div>
      <div className="form-group">
        <label>Tên đệm & Tên (In hoa không dấu) *</label>
        <input className="form-input" placeholder="VD: VAN A" value={data.firstName} onChange={f('firstName')} />
      </div>
      <div className="form-group">
        <label>Quốc tịch *</label>
        <select className="form-input" value={data.nationality} onChange={f('nationality')}>
          {NATIONALITIES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label>CCCD / Hộ chiếu *</label>
        <input className="form-input" placeholder="Số giấy tờ tùy thân" value={data.idCard} onChange={f('idCard')} />
      </div>
      <div className="form-group">
        <label>Email (Nhận vé điện tử) *</label>
        <input type="email" className="form-input" placeholder="email@example.com" value={data.email} onChange={f('email')} />
      </div>
      <div className="form-group">
        <label>Số điện thoại *</label>
        <input className="form-input" placeholder="0912345678" value={data.phone} onChange={f('phone')} />
      </div>
      <div className="form-group full-width">
        <label>Địa chỉ hiện tại (Tùy chọn)</label>
        <input className="form-input" placeholder="Số nhà, Tên đường, Phường/Xã..." value={data.address} onChange={f('address')} />
      </div>
    </div>
  );
};

// ─── ChildForm ───────────────────────────────────────────────────────────────
const ChildForm = ({ data, onChange }) => {
  const f = (field) => (e) => onChange(field, e.target.value);
  return (
    <div className="pax-form-grid">
      <div className="pax-type-notice child full-width">
        <i className="fas fa-child" />
        <span>Trẻ em: <strong>2 – 11 tuổi</strong>. Vui lòng cung cấp đầy đủ thông tin giấy tờ.</span>
      </div>

      <div className="form-group">
        <label>Giới tính *</label>
        <select className="form-input" value={data.gender} onChange={f('gender')}>
          <option value="">Chọn</option>
          <option value="Nam">Nam</option>
          <option value="Nữ">Nữ</option>
        </select>
      </div>
      <div className="form-group">
        <label>Họ (In hoa không dấu) *</label>
        <input className="form-input" placeholder="VD: NGUYEN" value={data.lastName} onChange={f('lastName')} />
      </div>
      <div className="form-group">
        <label>Tên đệm & Tên (In hoa không dấu) *</label>
        <input className="form-input" placeholder="VD: THI B" value={data.firstName} onChange={f('firstName')} />
      </div>
      <div className="form-group">
        <label>Ngày sinh *</label>
        <input type="date" className="form-input" value={data.dob} onChange={f('dob')} />
      </div>
      <div className="form-group">
        <label>Quốc tịch *</label>
        <select className="form-input" value={data.nationality} onChange={f('nationality')}>
          {NATIONALITIES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label>CCCD / Hộ chiếu / Giấy khai sinh *</label>
        <input className="form-input" placeholder="Số giấy tờ" value={data.idCard} onChange={f('idCard')} />
      </div>
      <div className="form-group full-width">
        <label>Địa chỉ hiện tại (Tùy chọn)</label>
        <input className="form-input" placeholder="Số nhà, Tên đường, Phường/Xã..." value={data.address} onChange={f('address')} />
      </div>
    </div>
  );
};

// ─── InfantForm ──────────────────────────────────────────────────────────────
const InfantForm = ({ data, onChange }) => {
  const f = (field) => (e) => onChange(field, e.target.value);
  return (
    <div className="pax-form-grid">
      <div className="pax-type-notice infant full-width">
        <i className="fas fa-baby" />
        <span>Em bé: <strong>dưới 2 tuổi</strong>. Không có ghế riêng, ngồi cùng người lớn.</span>
      </div>

      <div className="form-group">
        <label>Giới tính *</label>
        <select className="form-input" value={data.gender} onChange={f('gender')}>
          <option value="">Chọn</option>
          <option value="Nam">Nam</option>
          <option value="Nữ">Nữ</option>
        </select>
      </div>
      <div className="form-group">
        <label>Họ (In hoa không dấu) *</label>
        <input className="form-input" placeholder="VD: NGUYEN" value={data.lastName} onChange={f('lastName')} />
      </div>
      <div className="form-group">
        <label>Tên đệm & Tên (In hoa không dấu) *</label>
        <input className="form-input" placeholder="VD: THI C" value={data.firstName} onChange={f('firstName')} />
      </div>
      <div className="form-group">
        <label>Ngày sinh *</label>
        <input type="date" className="form-input" value={data.dob} onChange={f('dob')} />
      </div>
      <div className="form-group">
        <label>Quốc tịch *</label>
        <select className="form-input" value={data.nationality} onChange={f('nationality')}>
          {NATIONALITIES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label>Hộ chiếu / Giấy khai sinh *</label>
        <input className="form-input" placeholder="Số giấy tờ" value={data.idCard} onChange={f('idCard')} />
      </div>
      <div className="form-group full-width">
        <label>Địa chỉ hiện tại (Tùy chọn)</label>
        <input className="form-input" placeholder="Số nhà, Tên đường, Phường/Xã..." value={data.address} onChange={f('address')} />
      </div>
    </div>
  );
};

// ─── Flight Route Summary ────────────────────────────────────────────────────
const FlightRouteSummary = ({ from, to, time, date, flightCode, label, isReturn }) => (
  <div className="flight-route-section">
    <div className={`route-badge${isReturn ? ' return' : ''}`}>{label}</div>
    <div className="route-info">
      <div className="route-point"><h3>{from}</h3><p>Khởi hành</p><strong>{time}</strong></div>
      <div className="route-icon"><i className={`fas fa-plane${isReturn ? ' fa-rotate-180' : ''}`} /></div>
      <div className="route-point right"><h3>{to}</h3><p>Điểm đến</p></div>
    </div>
    <div className="flight-details">
      <p><i className="far fa-calendar-alt" /> {isReturn ? 'Ngày về' : 'Ngày bay'}: <strong>{date}</strong></p>
      <p>Mã chuyến: <strong>{flightCode}</strong></p>
    </div>
  </div>
);

// ─── Main Component ──────────────────────────────────────────────────────────
const PassengerForm = ({ flight, onBack, onNext, user }) => {
  const pax    = flight?.pax    || { adult: 1, child: 0, infant: 0 };
  const cls    = flight?.selectedClass || {};
  const search = flight?.search || {};

  const adult  = Number(pax.adult  || 1);
  const child  = Number(pax.child  || 0);
  const infant = Number(pax.infant || 0);

  // DEBUG — xoá sau khi fix xong
  console.log('[PassengerForm] flight.pax =', flight?.pax, '→ adult:', adult, 'child:', child, 'infant:', infant);

  const passengerList = useMemo(
    () => buildPassengers({ adult, child, infant }),
    [adult, child, infant]
  );

  const buildInitial = () => passengerList.map((p, i) => {
    if (i === 0 && p.type === 'adult' && user) {
      const parts     = (user.username || '').trim().toUpperCase().split(' ');
      const firstName = parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || '';
      const lastName  = parts.length > 1 ? parts[0] : '';
      return { ...emptyAdult(), firstName, lastName, email: user.email || '', phone: user.phone_number || '', idCard: user.id_number || '' };
    }
    if (p.type === 'adult')  return emptyAdult();
    if (p.type === 'infant') return emptyInfant();
    return emptyChild();
  });

  const [forms, setForms] = useState(buildInitial);

  useEffect(() => {
    setForms(buildInitial());
  }, [adult, child, infant, user?.user_id]);

  const handleChange = (idx, field, value) =>
    setForms((prev) => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f));

  const { totalBase, taxAndFee, grandTotal } = useMemo(() => {
    const base  = Number(cls.price) || 0;
    const total = base * (pax.adult || 1) + base * 0.8 * (pax.child || 0) + base * 0.1 * (pax.infant || 0);
    const tax   = total * 0.1;
    return { totalBase: total, taxAndFee: tax, grandTotal: total + tax };
  }, [cls.price, pax]);

  const handleContinue = () => {
    onNext(forms.map((f, i) => ({
      passenger_name: `${f.lastName} ${f.firstName}`.trim() || `Hành khách ${i + 1}`,
      passenger_type: passengerList[i].type,
      identity_card:  f.idCard || '',
      ticket_price:   Number(cls.price) || 0,
      class:          cls.type || 'eco',
      email:          f.email || '',
      phone:          f.phone || '',
    })));
  };

  return (
    <div className="passenger-page">
      <h2 className="page-title">Thông tin hành khách</h2>
      <div className="layout-with-sidebar">

        {/* ── Left: passenger forms ── */}
        <div className="form-sections">
          {passengerList.map((p, i) => (
            <div className="passenger-card" key={`${p.type}_${i}`}>
              <div className="pax-card-header">
                <i className="far fa-user" /> Hành khách {i + 1} <span>({p.label})</span>
              </div>
              {p.type === 'adult'
                ? <AdultForm
                    data={forms[i]}
                    onChange={(field, val) => handleChange(i, field, val)}
                    isFirst={i === 0}
                    user={user}
                  />
                : p.type === 'infant'
                ? <InfantForm
                    data={forms[i]}
                    onChange={(field, val) => handleChange(i, field, val)}
                  />
                : <ChildForm
                    data={forms[i]}
                    onChange={(field, val) => handleChange(i, field, val)}
                  />
              }
            </div>
          ))}

          <div className="extra-options-card">
            {CHECKBOXES.map((text) => (
              <label className="checkbox-line" key={text}>
                <input type="checkbox" /> {text}
              </label>
            ))}
            <div className="warning-note">
              <strong>Lưu ý:</strong> Bằng cách nhấn "Tiếp tục", Quý khách xác nhận đã đọc và đồng ý với{' '}
              <a href="#">Điều khoản vận chuyển</a> và <a href="#">Chính sách bảo mật</a>.
            </div>
          </div>

          <div className="action-buttons">
            <button className="btn-back" onClick={onBack}>Quay lại</button>
            <button className="btn-continue" onClick={handleContinue}>Tiếp tục: Chọn dịch vụ</button>
          </div>
        </div>

        {/* ── Right: flight summary ── */}
        <div className="flight-summary-sidebar">
          <div className="summary-header"><i className="fas fa-plane" /> Thông tin chuyến bay</div>
          <div className="summary-body">
            <FlightRouteSummary
              label="Chiều đi"
              from={flight?.fromCity || flight?.from}
              to={flight?.toCity || flight?.to}
              time={flight?.time}
              date={search.departDate}
              flightCode={flight?.flightCode}
            />
            <div className="divider" />
            <div className="summary-row">
              <span>Hạng vé:</span>
              <span className="badge-class">{cls.name}</span>
            </div>
            <div className="summary-row">
              <span>Hành khách:</span>
              <span>
                {adult > 0 && <span><i className="far fa-user" /> {adult} NL </span>}
                {child > 0 && <span><i className="fas fa-child" /> {child} TE </span>}
                {infant > 0 && <span><i className="fas fa-baby" /> {infant} EB</span>}
              </span>
            </div>
            <div className="divider" />
            <div className="price-breakdown">
              <div className="summary-row">
                <span>Giá vé cơ bản</span><span>{formatMoney(totalBase)}</span>
              </div>
              <div className="summary-row">
                <span>Thuế &amp; Phí (10%)</span><span>{formatMoney(taxAndFee)}</span>
              </div>
              <div className="summary-row total-price">
                <span>TỔNG TIỀN</span>
                <span className="text-primary">{formatMoney(grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PassengerForm;