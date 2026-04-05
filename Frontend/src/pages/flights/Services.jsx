import React, { useState, useMemo, useCallback } from 'react';
import '../../style/PassengerForm.css';
import '../../style/Services.css';

const formatMoney = (amount) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

const BAGGAGE_OPTIONS = [
  { label: '0 kg (7kg xách tay)', price: 0 },
  { label: '+15 kg',  price: 250000 },
  { label: '+20 kg',  price: 350000 },
  { label: '+30 kg',  price: 500000 },
];

const OVERSIZED_OPTIONS = [
  { label: 'Không mang',  price: 0 },
  { label: 'Thể thao',    price: 500000 },
  { label: 'Nhạc cụ',    price: 600000 },
  { label: 'Cồng kềnh',  price: 750000 },
];

const MEAL_OPTIONS = [
  { label: 'Không chọn',           price: 0,      img: null },
  { label: 'Cơm gà sả ớt',         price: 120000, img: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&q=80' },
  { label: 'Mì xào hải sản',       price: 135000, img: 'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=400&q=80' },
  { label: 'Sandwich thịt nướng',  price: 85000,  img: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&q=80' },
  { label: 'Phở bò',               price: 150000, img: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=400&q=80' },
  { label: 'Cơm chiên dương châu', price: 110000, img: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&q=80' },
];

const sumValues = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);

// ── Pill selector ──────────────────────────────────────────────────────────────
const PillRow = ({ options, selected, onChange }) => (
  <div className="srv-pills">
    {options.map((opt) => {
      const active = selected === opt.price || (selected === undefined && opt.price === 0);
      return (
        <button key={opt.label} className={`srv-pill${active ? ' selected' : ''}`}
          onClick={() => onChange(opt.price)}>
          {active && <i className="fas fa-check" />}
          <span>{opt.label}</span>
          {opt.price > 0 && <span className="pill-price">+{formatMoney(opt.price)}</span>}
        </button>
      );
    })}
  </div>
);

// ── Baggage Tab ────────────────────────────────────────────────────────────────
const BaggageTab = ({ passengers, selections, onSelect }) => (
  <div>
    <div className="service-block">
      <div className="service-block-header">
        <div className="srv-icon blue"><i className="fas fa-suitcase-rolling" /></div>
        <div>
          <div className="srv-label">Hành lý ký gửi</div>
          <p className="srv-desc">Tiết kiệm đến 40% so với tại sân bay.</p>
        </div>
      </div>
      <div className="srv-pax-table">
        {passengers.map((p) => (
          <div className="srv-pax-row" key={`bag_${p.id}`}>
            <div className="srv-pax-name"><i className="far fa-user" />{p.label}</div>
            <PillRow options={BAGGAGE_OPTIONS} selected={selections.baggage[p.id]}
              onChange={(v) => onSelect('baggage', p.id, v)} />
          </div>
        ))}
      </div>
    </div>

    <div className="service-block">
      <div className="service-block-header">
        <div className="srv-icon purple"><i className="fas fa-box-open" /></div>
        <div>
          <div className="srv-label">Hành lý quá khổ / Đặc biệt</div>
          <p className="srv-desc">Gậy golf, xe đạp, nhạc cụ lớn...</p>
        </div>
      </div>
      <div className="srv-pax-table">
        {passengers.map((p) => (
          <div className="srv-pax-row" key={`over_${p.id}`}>
            <div className="srv-pax-name"><i className="far fa-user" />{p.label}</div>
            <PillRow options={OVERSIZED_OPTIONS} selected={selections.oversized[p.id]}
              onChange={(v) => onSelect('oversized', p.id, v)} />
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ── Meal Tab ───────────────────────────────────────────────────────────────────
const MealTab = ({ passengers, selections, onSelect }) => (
  <div>
    <div className="service-block">
      <div className="service-block-header">
        <div className="srv-icon orange"><i className="fas fa-utensils" /></div>
        <div>
          <div className="srv-label">Suất ăn trên máy bay</div>
          <p className="srv-desc">Đặt trước để đảm bảo suất ăn.</p>
        </div>
      </div>
      {passengers.map((p) => (
        <div className="meal-pax-section" key={`meal_${p.id}`}>
          <div className="meal-pax-label"><i className="far fa-user" />{p.label}</div>
          <div className="meal-scroll-row">
            {MEAL_OPTIONS.map((opt) => {
              const active = selections.meal[p.id] === opt.price ||
                (selections.meal[p.id] === undefined && opt.price === 0);
              return (
                <div key={opt.label} className={`meal-card-h${active ? ' selected' : ''}`}
                  onClick={() => onSelect('meal', p.id, opt.price)}>
                  {opt.img
                    ? <img src={opt.img} alt={opt.label} className="meal-img-h" />
                    : <div className="meal-img-empty-h"><i className="fas fa-ban" /></div>
                  }
                  <div className="meal-body-h">
                    <span className="meal-name-h">{opt.label}</span>
                    <div className="meal-price-h">
                      {opt.price === 0 ? 'Không chọn' : `+${formatMoney(opt.price)}`}
                    </div>
                  </div>
                  {active && <div className="meal-check-h"><i className="fas fa-check" /></div>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ── Sidebar ────────────────────────────────────────────────────────────────────
const FlightSidebar = ({ flight, cls, pax, passengers, totals }) => (
  <div className="flight-summary-sidebar">
    <div className="summary-header"><i className="fas fa-plane" /> Thông tin chuyến bay</div>
    <div className="summary-body">
      <div className="flight-route-section">
        <div className="route-badge">Chiều đi</div>
        <div className="route-info">
          <div className="route-point">
            <h3>{flight?.fromCity || flight?.from}</h3>
            <strong>{flight?.time}</strong>
          </div>
          <div className="route-icon"><i className="fas fa-plane" /></div>
          <div className="route-point right">
            <h3>{flight?.toCity || flight?.to}</h3>
          </div>
        </div>
        {flight?.raw?.departure_time && (
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
            <i className="far fa-calendar-alt" style={{ marginRight: 4 }} />
            Ngày bay: {new Date(flight.raw.departure_time).toLocaleDateString('vi-VN')}
          </div>
        )}
        {flight?.flightCode && (
          <div style={{ fontSize: 12, color: '#64748b' }}>
            Mã chuyến: <strong>{flight.flightCode}</strong>
          </div>
        )}
      </div>
      <div className="divider" />
      <div className="summary-row">
        <span>Hạng vé:</span>
        <span className="badge-class">{cls?.name}</span>
      </div>
      <div className="summary-row">
        <span>Hành khách:</span>
        <span>
          {Number(pax?.adult  || 1) > 0 && <span><i className="far fa-user" /> {pax?.adult || 1} NL </span>}
          {Number(pax?.child  || 0) > 0 && <span><i className="fas fa-child" /> {pax?.child} TE </span>}
          {Number(pax?.infant || 0) > 0 && <span><i className="fas fa-baby" /> {pax?.infant} EB</span>}
        </span>
      </div>
      <div className="divider" />
      <div className="summary-row"><span>Tiền vé</span><span>{formatMoney(totals.flightTotal)}</span></div>
      {totals.svcTotal > 0 && (
        <div className="summary-row" style={{ color: '#d97706', fontWeight: 'bold' }}>
          <span>Dịch vụ bổ sung</span><span>+{formatMoney(totals.svcTotal)}</span>
        </div>
      )}
      <div className="summary-row total-price">
        <span>TỔNG TIỀN</span>
        <span className="text-primary">{formatMoney(totals.grandTotal)}</span>
      </div>
    </div>
  </div>
);

// ── Main ───────────────────────────────────────────────────────────────────────
const Services = ({ flight, onBack, onNext }) => {
  const pax = flight?.pax || { adult: 1, child: 0, infant: 0 };
  const cls = flight?.selectedClass || {};
  const [activeTab, setActiveTab] = useState('baggage');
  const [selections, setSelections] = useState({ baggage: {}, oversized: {}, meal: {} });

  const passengers = useMemo(() => [
    ...Array.from({ length: Number(pax.adult  || 1) }, (_, i) => ({ id: `adult_${i}`,  label: `Người lớn ${i + 1}` })),
    ...Array.from({ length: Number(pax.child  || 0) }, (_, i) => ({ id: `child_${i}`,  label: `Trẻ em ${i + 1}` })),
    ...Array.from({ length: Number(pax.infant || 0) }, (_, i) => ({ id: `infant_${i}`, label: `Em bé ${i + 1}` })),
  ], [pax.adult, pax.child, pax.infant]);

  const handleSelect = useCallback((type, paxId, price) => {
    setSelections((prev) => ({ ...prev, [type]: { ...prev[type], [paxId]: price } }));
  }, []);

  const totals = useMemo(() => {
    const base        = Number(cls.price) || 0;
    const flightTotal = (base * (pax.adult || 1) + base * 0.8 * (pax.child || 0) + base * 0.1 * (pax.infant || 0)) * 1.1;
    const svcTotal    = sumValues(selections.baggage) + sumValues(selections.oversized) + sumValues(selections.meal);
    return { flightTotal, svcTotal, grandTotal: flightTotal + svcTotal };
  }, [cls.price, pax, selections]);

  const TABS = [
    { key: 'baggage', label: 'Hành lý', icon: 'fa-suitcase-rolling' },
    { key: 'meal',    label: 'Suất ăn', icon: 'fa-utensils' },
  ];

  return (
    <div className="passenger-page">
      <h2 className="page-title">Dịch vụ bổ sung</h2>
      <div className="layout-with-sidebar">

        {/* ── Left ── */}
        <div className="form-sections">
          <div className="service-tabs">
            {TABS.map((tab) => (
              <button key={tab.key}
                className={`service-tab-btn${activeTab === tab.key ? ' active' : ''}`}
                onClick={() => setActiveTab(tab.key)}>
                <i className={`fas ${tab.icon}`} /> {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'baggage' && <BaggageTab passengers={passengers} selections={selections} onSelect={handleSelect} />}
          {activeTab === 'meal'    && <MealTab    passengers={passengers} selections={selections} onSelect={handleSelect} />}

          <div className="action-buttons">
            <button className="btn-back" onClick={onBack}>Quay lại</button>
            <button className="btn-continue" onClick={() => onNext(selections)}>
              Tiếp tục: Thanh toán
            </button>
          </div>
        </div>

        {/* ── Right: sidebar ── */}
        <FlightSidebar
          flight={flight}
          cls={cls}
          pax={pax}
          passengers={passengers}
          totals={totals}
        />
      </div>
    </div>
  );
};

export default Services;