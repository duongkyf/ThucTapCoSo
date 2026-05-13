import React, { useMemo, useState, useEffect, useCallback } from 'react';
import '../../style/Pages/PassengerForm.css';

const formatMoney = (n) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);

const NATIONALITIES = [
  { value: 'VN',    label: 'Việt Nam'     },
  { value: 'US',    label: 'Mỹ (Hoa Kỳ)' },
  { value: 'JP',    label: 'Nhật Bản'     },
  { value: 'KR',    label: 'Hàn Quốc'     },
  { value: 'CN',    label: 'Trung Quốc'   },
  { value: 'OTHER', label: 'Khác...'       },
];

const CHECKBOXES = [
  'Đăng ký nhận thông tin khuyến mãi và ưu đãi độc quyền.',
  'Tôi đồng ý tham gia khảo sát chất lượng dịch vụ sau chuyến bay.',
  'Lưu thông tin hành khách cho lần đặt vé sau.',
];

const TYPE_NOTICE = {
  child:  { icon: 'fa-child', text: <>Trẻ em: <strong>2 – 11 tuổi</strong>. Vui lòng cung cấp đầy đủ thông tin giấy tờ.</> },
  infant: { icon: 'fa-baby',  text: <>Em bé: <strong>dưới 2 tuổi</strong>. Không có ghế riêng, ngồi cùng người lớn.</> },
};

const buildPassengers = ({ adult = 1, child = 0, infant = 0 }) => [
  ...Array.from({ length: adult  }, (_, i) => ({ type: 'adult',  label: `Người lớn ${i + 1}` })),
  ...Array.from({ length: child  }, (_, i) => ({ type: 'child',  label: `Trẻ em ${i + 1}`    })),
  ...Array.from({ length: infant }, (_, i) => ({ type: 'infant', label: `Em bé ${i + 1}`      })),
];

{/* Tạo form khác nhau cho từng loại hành khách */}
const emptyForm = (type) => ({
  gender: '', lastName: '', firstName: '', nationality: 'VN', idCard: '',
  province: '', ward: '',
  ...(type === 'adult' ? { email: '', phone: '' } : { dob: '' }),
});

const validatePassenger = (form, type) => {
  const errors = {};
  if (!form.gender)            errors.gender    = 'Vui lòng chọn giới tính';
  if (!form.lastName?.trim())  errors.lastName  = 'Vui lòng nhập họ';
  if (!form.firstName?.trim()) errors.firstName = 'Vui lòng nhập tên';
  if (!form.idCard?.trim())    errors.idCard    = 'Vui lòng nhập số giấy tờ';
  if (type !== 'adult' && !form.dob) errors.dob = 'Vui lòng nhập ngày sinh';
  if (type === 'adult') {
    if (!form.email?.trim()) errors.email = 'Vui lòng nhập email';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Email không hợp lệ';
    if (!form.phone?.trim()) errors.phone = 'Vui lòng nhập số điện thoại';
    else if (!/^[0-9]{9,11}$/.test(form.phone.replace(/\s/g, ''))) errors.phone = 'Số điện thoại không hợp lệ';
  }
  return errors;
};

// ─── Shared field helpers ─────────────────────────────────────
const ErrMsg = ({ msg }) => msg ? <span className="field-error">{msg}</span> : null;

const Field = ({ label, error, children }) => (
  <div className="form-group">
    <label>{label}</label>
    {children}
    <ErrMsg msg={error} />
  </div>
);

// ─── Vietnamese Address Selector (simple text input) ───────────
const AddressSelector = ({ data, onChange }) => (
  <div className="address-selector full-width">
    <div className="address-selector-label">
      <i className="fas fa-map-marker-alt" style={{ color: '#3b82f6', marginRight: 6 }} />
      Địa chỉ hiện tại <span style={{ color: '#94a3b8', fontSize: 13 }}>(Tùy chọn)</span>
    </div>
    <input
      className="form-input"
      placeholder="Số nhà, Tên đường, Phường/Xã, Tỉnh/Thành phố..."
      value={data.address || ''}
      onChange={e => onChange('address', e.target.value)}
    />
  </div>
);

// ─── Unified PassengerFormFields ──────────────────────────────
const PassengerFormFields = ({ type, data, onChange, isFirst, user, errors = {} }) => {
  const f   = (field) => (e) => onChange(field, e.target.value);
  const cls = (field) => `form-input${errors[field] ? ' input-error' : ''}`;
  const notice  = TYPE_NOTICE[type];
  const idLabel = type === 'adult'  ? 'CCCD / Hộ chiếu *'
                : type === 'child'  ? 'CCCD / Hộ chiếu / Giấy khai sinh *'
                :                    'Hộ chiếu / Giấy khai sinh *';

  return (
    <div className="pax-form-grid">
      {notice && (
        <div className={`pax-type-notice ${type} full-width`}>
          <i className={`fas ${notice.icon}`} /><span>{notice.text}</span>
        </div>
      )}
      {isFirst && user && (
        <div className="prefill-notice full-width">
          <i className="fas fa-info-circle" /> Đã tự động điền từ tài khoản của bạn
        </div>
      )}

      <Field label="Giới tính *" error={errors.gender}>
        <select className={cls('gender')} value={data.gender} onChange={f('gender')}>
          <option value="">Chọn</option>
          <option value="Nam">Nam</option>
          <option value="Nữ">Nữ</option>
        </select>
      </Field>

      <Field label="Họ (In hoa không dấu) *" error={errors.lastName}>
        <input className={cls('lastName')} placeholder="VD: NGUYEN" value={data.lastName} onChange={f('lastName')} />
      </Field>

      <Field label="Tên đệm & Tên (In hoa không dấu) *" error={errors.firstName}>
        <input className={cls('firstName')} placeholder="VD: VAN A" value={data.firstName} onChange={f('firstName')} />
      </Field>

      {type !== 'adult' && (
        <Field label="Ngày sinh *" error={errors.dob}>
          <input type="date" className={cls('dob')} value={data.dob} onChange={f('dob')} />
        </Field>
      )}

      <Field label="Quốc tịch *">
        <select className="form-input" value={data.nationality} onChange={f('nationality')}>
          {NATIONALITIES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
      </Field>

      <Field label={idLabel} error={errors.idCard}>
        <input className={cls('idCard')} placeholder="Số giấy tờ" value={data.idCard} onChange={f('idCard')} />
      </Field>

      {type === 'adult' && <>
        <Field label="Email (Nhận vé điện tử) *" error={errors.email}>
          <input type="email" className={cls('email')} placeholder="email@example.com" value={data.email} onChange={f('email')} />
        </Field>
        <Field label="Số điện thoại *" error={errors.phone}>
          <input className={cls('phone')} placeholder="0912345678" value={data.phone} onChange={f('phone')} />
        </Field>
      </>}

      {/* ── Địa chỉ sau sáp nhập ── */}
      <AddressSelector
        data={{ province: data.province, ward: data.ward }}
        onChange={(field, val) => onChange(field, val)}
      />
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────
const PassengerForm = ({ flight, onBack, onNext, user }) => {
  const pax    = flight?.pax          || { adult: 1, child: 0, infant: 0 };
  const cls    = flight?.selectedClass || {};
  const search = flight?.search        || {};

  const adult  = Number(pax.adult  || 1);
  const child  = Number(pax.child  || 0);
  const infant = Number(pax.infant || 0);

  const passengerList = useMemo(
    () => buildPassengers({ adult, child, infant }),
    [adult, child, infant]
  );

  {/* Tạo form trống, auto-fill nếu đã đăng nhập */}
  const buildInitial = useCallback((list) =>
    list.map((p, i) => {
      if (i === 0 && p.type === 'adult' && user) {
        const parts = (user.username || '').trim().toUpperCase().split(' ');
        return {
          ...emptyForm('adult'),
          firstName: parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || '',
          lastName:  parts.length > 1 ? parts[0] : '',
          email:     user.email        || '',
          phone:     user.phone_number || '',
          idCard:    user.id_number    || '',
        };
      }
      return emptyForm(p.type);
    }), [user]);

  const [forms,     setForms]     = useState(() => buildInitial(passengerList));
  const [allErrors, setAllErrors] = useState(() => passengerList.map(() => ({})));

  useEffect(() => {
    setForms(buildInitial(passengerList));
    setAllErrors(passengerList.map(() => ({})));
  }, [adult, child, infant, user?.user_id]);

  const handleChange = (idx, field, value) => {
    setForms(prev => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f));
    setAllErrors(prev => {
      const next = [...prev];
      if (next[idx]) next[idx] = { ...next[idx], [field]: undefined };
      return next;
    });
  };

  const { totalBase, taxAndFee, grandTotal } = useMemo(() => {
    const base  = Number(cls.price) || 0;
    const total = base * adult + base * 0.8 * child + base * 0.1 * infant;
    return { totalBase: total, taxAndFee: total * 0.1, grandTotal: total * 1.1 };
  }, [cls.price, adult, child, infant]);

  const handleContinue = () => {
    const errors   = passengerList.map((p, i) => validatePassenger(forms[i], p.type));
    const hasError = errors.some(e => Object.keys(e).length > 0);
    if (hasError) {
      setAllErrors(errors);
      document.getElementById(`pax-card-${errors.findIndex(e => Object.keys(e).length > 0)}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    onNext(forms.map((f, i) => ({
      passenger_name: `${f.lastName} ${f.firstName}`.trim() || `Hành khách ${i + 1}`,
      passenger_type: passengerList[i].type,
      identity_card:  f.idCard || '',
      ticket_price:   Number(cls.price) || 0,
      class:          cls.type || 'eco',
      email:          f.email  || '',
      phone:          f.phone  || '',
      address:        [f.ward, f.province].filter(Boolean).join(', '),
    })));
  };

  return (
    <div className="passenger-page">
      <h2 className="page-title">Thông tin hành khách</h2>
      <div className="layout-with-sidebar">

        <div className="form-sections">
          {passengerList.map((p, i) => (
            <div className="passenger-card" key={`${p.type}_${i}`} id={`pax-card-${i}`}>
              <div className="pax-card-header">
                <i className="far fa-user" /> Hành khách {i + 1} <span>({p.label})</span>
                {allErrors[i] && Object.keys(allErrors[i]).some(k => allErrors[i][k]) && (
                  <span style={{ marginLeft: 'auto', color: '#ef4444', fontSize: 12 }}>
                    <i className="fas fa-exclamation-circle" /> Vui lòng điền đầy đủ thông tin
                  </span>
                )}
              </div>
              <PassengerFormFields
                type={p.type}
                data={forms[i]}
                onChange={(field, val) => handleChange(i, field, val)}
                isFirst={i === 0}
                user={user}
                errors={allErrors[i]}
              />
            </div>
          ))}

          <div className="extra-options-card">
            {CHECKBOXES.map(text => (
              <label className="checkbox-line" key={text}><input type="checkbox" /> {text}</label>
            ))}
            <div className="warning-note">
              <strong>Lưu ý:</strong> Bằng cách nhấn "Tiếp tục", Quý khách xác nhận đã đọc và đồng ý với{' '}
              <a href="#">Điều khoản vận chuyển</a> và <a href="#">Chính sách bảo mật</a>.
            </div>
          </div>

          <div className="action-buttons">
            <button className="btn-back"     onClick={onBack}>Quay lại</button>
            <button className="btn-continue" onClick={handleContinue}>Tiếp tục: Chọn dịch vụ</button>
          </div>
        </div>

        <div className="flight-summary-sidebar">
          <div className="summary-header"><i className="fas fa-plane" /> Thông tin chuyến bay</div>
          <div className="summary-body">
            <div className="flight-route-section">
              <div className="route-badge">Chiều đi</div>
              <div className="route-info">
                <div className="route-point"><h3>{flight?.fromCity || flight?.from}</h3><p>Khởi hành</p><strong>{flight?.time}</strong></div>
                <div className="route-icon"><i className="fas fa-plane" /></div>
                <div className="route-point right"><h3>{flight?.toCity || flight?.to}</h3><p>Điểm đến</p></div>
              </div>
              <div className="flight-details">
                <p><i className="far fa-calendar-alt" /> Ngày bay: <strong>{search.departDate}</strong></p>
                <p>Mã chuyến: <strong>{flight?.flightCode}</strong></p>
              </div>
            </div>
            <div className="divider" />
            <div className="summary-row"><span>Hạng vé:</span><span className="badge-class">{cls.name}</span></div>
            <div className="summary-row">
              <span>Hành khách:</span>
              <span>
                {adult  > 0 && <span><i className="far fa-user"  /> {adult}  NL </span>}
                {child  > 0 && <span><i className="fas fa-child" /> {child}  TE </span>}
                {infant > 0 && <span><i className="fas fa-baby"  /> {infant} EB</span>}
              </span>
            </div>
            <div className="divider" />
            <div className="price-breakdown">
              <div className="summary-row"><span>Giá vé cơ bản</span><span>{formatMoney(totalBase)}</span></div>
              <div className="summary-row"><span>Thuế &amp; Phí (10%)</span><span>{formatMoney(taxAndFee)}</span></div>
              <div className="summary-row total-price">
                <span>TỔNG TIỀN</span><span className="text-primary">{formatMoney(grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default PassengerForm;