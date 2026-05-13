import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { flightService } from '../../services/flight.service';
import '../../style/Pages/PassengerForm.css';
import '../../style/Pages/Services.css';

const formatMoney = (n) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
const sumValues = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
const emptySelections = () => ({ baggage: {}, oversized: {}, meal: {} });

// ── ServiceCard ───────────────────────────────────────────────
const ServiceCard = ({ opt, active, onClick, zeroLabel }) => (
  <div className={`meal-card-h${active ? ' selected' : ''}`} onClick={onClick}>
    <div className="meal-body-h">
      <span className="meal-name-h">{opt.label}</span>
      <div className="meal-price-h">{opt.price === 0 ? zeroLabel : `+${formatMoney(opt.price)}`}</div>
    </div>
    {active && <div className="meal-check-h"><i className="fas fa-check" /></div>}
  </div>
);

const isActive = (map, id, price) => map[id] === price || (map[id] === undefined && price === 0);

const BlockHeader = ({ iconClass, color, label, desc }) => (
  <div className="service-block-header">
    <div className={`srv-icon ${color}`}><i className={`fas ${iconClass}`} /></div>
    <div><div className="srv-label">{label}</div><p className="srv-desc">{desc}</p></div>
  </div>
);

// ── BaggageTab ────────────────────────────────────────────────
const BaggageTab = ({ passengers, selections, onSelect, baggageOptions, oversizedOptions }) => (
  <div>
    <div className="service-block">
      <BlockHeader iconClass="fa-suitcase-rolling" color="blue" label="Hành lý ký gửi" desc="Tiết kiệm đến 40% so với tại sân bay." />
      {passengers.map((p) => (
        <div className="meal-pax-section" key={`bag_${p.id}`}>
          <div className="meal-pax-label"><i className="far fa-user" />{p.label}</div>
          <div className="meal-scroll-row">
            {baggageOptions.map((opt) => (
              <ServiceCard key={opt.label} opt={opt} zeroLabel="Miễn phí"
                active={isActive(selections.baggage, p.id, opt.price)}
                onClick={() => onSelect('baggage', p.id, opt.price)} />
            ))}
          </div>
        </div>
      ))}
    </div>
    {oversizedOptions[0] && (
      <div className="service-block">
        <BlockHeader iconClass="fa-box-open" color="purple" label="Hành lý quá khổ / Đặc biệt" desc="Gậy golf, xe đạp, nhạc cụ lớn..." />
        {passengers.map((p) => {
          const item = oversizedOptions[0];
          const isChecked = selections.oversized[p.id] === item.price;
          return (
            <div className="oversized-pax-row" key={`over_${p.id}`}>
              <div className="oversized-pax-name"><i className="far fa-user" />{p.label}</div>
              <div className="oversized-toggle">
                {isChecked && <span className="oversized-added visible"><i className="fas fa-check" /> Đã thêm</span>}
                <span className="oversized-price">+{formatMoney(item.price)}</span>
                <label className="toggle-switch">
                  <input type="checkbox" checked={isChecked}
                    onChange={(e) => onSelect('oversized', p.id, e.target.checked ? item.price : 0)} />
                  <div className="toggle-track"><div className="toggle-thumb" /></div>
                </label>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
);

// ── MealTab ───────────────────────────────────────────────────
const MealTab = ({ passengers, selections, onSelect, mealOptions }) => (
  <div className="service-block">
    <BlockHeader iconClass="fa-utensils" color="orange" label="Suất ăn trên máy bay" desc="Đặt trước để đảm bảo suất ăn." />
    {passengers.map((p) => (
      <div className="meal-pax-section" key={`meal_${p.id}`}>
        <div className="meal-pax-label"><i className="far fa-user" />{p.label}</div>
        <div className="meal-scroll-row">
          {mealOptions.map((opt) => (
            <ServiceCard key={opt.label} opt={opt} zeroLabel="Không chọn"
              active={isActive(selections.meal, p.id, opt.price)}
              onClick={() => onSelect('meal', p.id, opt.price)} />
          ))}
        </div>
      </div>
    ))}
  </div>
);

// ── LegServices — Hành lý + Suất ăn cho 1 chiều ─────────────
const LegServices = ({ passengers, selections, onSelect, opts, loading }) => {
  const [activeTab, setActiveTab] = useState('baggage');
  return (
    <>
      <div className="service-tabs" style={{ marginBottom: 16 }}>
        <button className={`service-tab-btn${activeTab === 'baggage' ? ' active' : ''}`}
          onClick={() => setActiveTab('baggage')}>
          <i className="fas fa-suitcase-rolling" /> Hành lý
        </button>
        <button className={`service-tab-btn${activeTab === 'meal' ? ' active' : ''}`}
          onClick={() => setActiveTab('meal')}>
          <i className="fas fa-utensils" /> Suất ăn
        </button>
      </div>
      {loading
        ? <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: 24 }} />
            <p style={{ marginTop: 10 }}>Đang tải dịch vụ...</p>
          </div>
        : <>
            {activeTab === 'baggage' && <BaggageTab passengers={passengers} selections={selections} onSelect={onSelect} baggageOptions={opts.baggage} oversizedOptions={opts.oversized} />}
            {activeTab === 'meal'    && <MealTab    passengers={passengers} selections={selections} onSelect={onSelect} mealOptions={opts.meal} />}
          </>
      }
    </>
  );
};

// ── Sidebar ───────────────────────────────────────────────────
const FlightSidebar = ({ flight, returnFlight, cls, returnCls, pax, totals }) => (
  <div className="flight-summary-sidebar">
    <div className="summary-header"><i className="fas fa-plane" /> Thông tin chuyến bay</div>
    <div className="summary-body">
      <div className="flight-route-section">
        <div className="route-badge">Chiều đi</div>
        <div className="route-info">
          <div className="route-point"><h3>{flight?.fromCity || flight?.from}</h3><strong>{flight?.time}</strong></div>
          <div className="route-icon"><i className="fas fa-plane" /></div>
          <div className="route-point right"><h3>{flight?.toCity || flight?.to}</h3></div>
        </div>
        {flight?.flightCode && <div style={{ fontSize: 12, color: '#64748b' }}>Mã chuyến: <strong>{flight.flightCode}</strong></div>}
      </div>

      {returnFlight && <>
        <div className="divider" />
        <div className="flight-route-section">
          <div className="route-badge" style={{ background: '#7c3aed' }}>Chiều về</div>
          <div className="route-info">
            <div className="route-point"><h3>{returnFlight?.fromCity || returnFlight?.from}</h3><strong>{returnFlight?.time}</strong></div>
            <div className="route-icon"><i className="fas fa-plane" style={{ transform: 'scaleX(-1)' }} /></div>
            <div className="route-point right"><h3>{returnFlight?.toCity || returnFlight?.to}</h3></div>
          </div>
          {returnFlight?.flightCode && <div style={{ fontSize: 12, color: '#64748b' }}>Mã chuyến: <strong>{returnFlight.flightCode}</strong></div>}
        </div>
      </>}

      <div className="divider" />
      <div className="summary-row"><span>Hành khách:</span>
        <span>
          {(pax?.adult  || 1) > 0 && <span><i className="far fa-user"  /> {pax?.adult  || 1} NL </span>}
          {(pax?.child  || 0) > 0 && <span><i className="fas fa-child" /> {pax?.child}       TE </span>}
          {(pax?.infant || 0) > 0 && <span><i className="fas fa-baby"  /> {pax?.infant}      EB</span>}
        </span>
      </div>
      <div className="divider" />
      <div className="summary-row"><span>Tiền vé</span><span>{formatMoney(totals.flightTotal)}</span></div>
      {totals.svcOutbound > 0 && (
        <div className="summary-row" style={{ color: '#d97706' }}>
          <span>Dịch vụ chiều đi</span><span>+{formatMoney(totals.svcOutbound)}</span>
        </div>
      )}
      {totals.svcReturn > 0 && (
        <div className="summary-row" style={{ color: '#7c3aed' }}>
          <span>Dịch vụ chiều về</span><span>+{formatMoney(totals.svcReturn)}</span>
        </div>
      )}
      <div className="summary-row total-price">
        <span>TỔNG TIỀN</span><span className="text-primary">{formatMoney(totals.grandTotal)}</span>
      </div>
    </div>
  </div>
);

// ── Main ──────────────────────────────────────────────────────
const Services = ({ flight, returnFlight, onBack, onNext }) => {
  const pax        = flight?.pax          || { adult: 1, child: 0, infant: 0 };
  const cls        = flight?.selectedClass || {};
  const returnCls  = returnFlight?.selectedClass || {};
  const isRoundTrip = !!returnFlight;

  // Tab chiều đi / chiều về (chỉ khi khứ hồi)
  const [activeLeg, setActiveLeg] = useState('outbound');

  // Selections riêng cho từng chiều
  const [outboundSel, setOutboundSel] = useState(emptySelections());
  const [returnSel,   setReturnSel]   = useState(emptySelections());

  const [loading, setLoading] = useState(true);
  const [opts, setOpts] = useState({
    baggage:   [{ label: '0 kg (7kg xách tay)', price: 0 }],
    oversized: [],
    meal:      [{ label: 'Không chọn', price: 0 }],
  });
  {/*Fetch giá từ API */}
  useEffect(() => {
    flightService.getServices()
      .then((res) => {
        const all = res.data?.data || [];
        const pick = (type) => all.filter(s => s.type === type).map(s => ({ label: s.service_name, price: Number(s.price) }));
        const baggage   = pick('baggage');
        const oversized = pick('oversized');
        const meals     = pick('meal');
        setOpts({
          baggage:   baggage.length  ? [{ label: '0 kg (7kg xách tay)', price: 0 }, ...baggage] : opts.baggage,
          oversized,
          meal:      meals.length    ? [{ label: 'Không chọn', price: 0 }, ...meals]            : opts.meal,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const passengers = useMemo(() => [
    ...Array.from({ length: Number(pax.adult  || 1) }, (_, i) => ({ id: `adult_${i}`,  label: `Người lớn ${i + 1}` })),
    ...Array.from({ length: Number(pax.child  || 0) }, (_, i) => ({ id: `child_${i}`,  label: `Trẻ em ${i + 1}` })),
    ...Array.from({ length: Number(pax.infant || 0) }, (_, i) => ({ id: `infant_${i}`, label: `Em bé ${i + 1}` })),
  ], [pax.adult, pax.child, pax.infant]);

  const handleOutboundSelect = useCallback((type, paxId, price) =>
    setOutboundSel(prev => ({ ...prev, [type]: { ...prev[type], [paxId]: price } })), []);

  const handleReturnSelect = useCallback((type, paxId, price) =>
    setReturnSel(prev => ({ ...prev, [type]: { ...prev[type], [paxId]: price } })), []);

  {/* Tính tổng tiền vé + dịch vụ cho cả 2 chiều (nếu có) */}
  const totals = useMemo(() => {
    const base        = Number(cls.price) || 0;
    const returnBase  = Number(returnCls.price) || 0;
    const outboundFlight = (base * (pax.adult || 1) + base * 0.8 * (pax.child || 0) + base * 0.1 * (pax.infant || 0)) * 1.1;
    const returnFlightAmt = isRoundTrip
      ? (returnBase * (pax.adult || 1) + returnBase * 0.8 * (pax.child || 0) + returnBase * 0.1 * (pax.infant || 0)) * 1.1
      : 0;
    const flightTotal = outboundFlight + returnFlightAmt;
    const svcOutbound = sumValues(outboundSel.baggage) + sumValues(outboundSel.oversized) + sumValues(outboundSel.meal);
    const svcReturn   = isRoundTrip ? sumValues(returnSel.baggage) + sumValues(returnSel.oversized) + sumValues(returnSel.meal) : 0;
    return { flightTotal, svcOutbound, svcReturn, grandTotal: flightTotal + svcOutbound + svcReturn };
  }, [cls.price, returnCls.price, pax, outboundSel, returnSel, isRoundTrip]);

  const handleNext = () => {
    // Truyền outbound và return selections riêng để Home tạo 2 booking đúng
    onNext(isRoundTrip
      ? { outbound: outboundSel, return: returnSel }
      : outboundSel
    );
  };

  return (
    <div className="passenger-page">
      <h2 className="page-title">Dịch vụ bổ sung</h2>
      <div className="layout-with-sidebar">
        <div className="form-sections">

          {/* ── Tab chiều đi / chiều về (chỉ khi khứ hồi) ── */}
          {isRoundTrip && (
            <div className="service-tabs" style={{ marginBottom: 20 }}>
              <button
                className={`service-tab-btn${activeLeg === 'outbound' ? ' active' : ''}`}
                onClick={() => setActiveLeg('outbound')}
              >
                <i className="fas fa-plane-departure" /> Chiều đi
                <span style={{ marginLeft: 8, fontSize: 11, background: '#10b981', color: '#fff', borderRadius: 99, padding: '1px 7px' }}>
                  {flight?.from} → {flight?.to}
                </span>
              </button>
              <button
                className={`service-tab-btn${activeLeg === 'return' ? ' active' : ''}`}
                onClick={() => setActiveLeg('return')}
              >
                <i className="fas fa-plane-arrival" /> Chiều về
                <span style={{ marginLeft: 8, fontSize: 11, background: '#7c3aed', color: '#fff', borderRadius: 99, padding: '1px 7px' }}>
                  {returnFlight?.from} → {returnFlight?.to}
                </span>
              </button>
            </div>
          )}

          {/* ── Nội dung dịch vụ theo leg ── */}
          {(!isRoundTrip || activeLeg === 'outbound') && (
            <LegServices
              passengers={passengers}
              selections={outboundSel}
              onSelect={handleOutboundSelect}
              opts={opts}
              loading={loading}
            />
          )}
          {isRoundTrip && activeLeg === 'return' && (
            <LegServices
              passengers={passengers}
              selections={returnSel}
              onSelect={handleReturnSelect}
              opts={opts}
              loading={loading}
            />
          )}

          <div className="action-buttons">
            <button className="btn-back"     onClick={onBack}>Quay lại</button>
            <button className="btn-continue" onClick={handleNext}>Tiếp tục: Thanh toán</button>
          </div>
        </div>

        <FlightSidebar
          flight={flight}
          returnFlight={returnFlight}
          cls={cls}
          returnCls={returnCls}
          pax={pax}
          totals={totals}
        />
      </div>
    </div>
  );
};

export default Services;