import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import "../../style/Pages/FlightSearch.css";

// ─── Constants ────────────────────────────────────────────────
const TODAY = new Date().toISOString().split('T')[0];

const PAX_CONFIG = [
  { key: 'adult',  label: 'Người lớn', desc: 'Từ 12 tuổi',  min: 1 },
  { key: 'child',  label: 'Trẻ em',    desc: '2 - 11 tuổi', min: 0 },
  { key: 'infant', label: 'Em bé',     desc: 'Dưới 2 tuổi', min: 0 },
];
const PAX_LABELS = { adult: 'Người lớn', child: 'Trẻ em', infant: 'Em bé' };

// ─── Sub-components ───────────────────────────────────────────
const PaxDropdown = ({ pax, onChange }) => (
  <div className="pax-dropdown show">
    {PAX_CONFIG.map(({ key, label, desc, min }) => (
      <div className="pax-row" key={key}>
        <div className="pax-label"><b>{label}</b><span>{desc}</span></div>
        <div className="pax-ctrl">
          <button onClick={() => onChange(key, -1)} disabled={pax[key] <= min}>-</button>
          <span className="pax-count">{pax[key]}</span>
          <button onClick={() => onChange(key, 1)}>+</button>
        </div>
      </div>
    ))}
  </div>
);

// ─── Main Component ───────────────────────────────────────────
const FlightSearch = ({ airports, onSearch, onOpenSlider, initialValues }) => {
  const [tripType,    setTripType]    = useState('roundtrip');
  const [fromLoc,     setFromLoc]     = useState('SGN');
  const [toLoc,       setToLoc]       = useState('HAN');
  const [departDate,  setDepartDate]  = useState(TODAY);
  const [returnDate,  setReturnDate]  = useState('');
  const [isPaxOpen,   setIsPaxOpen]   = useState(false);
  const [pax,         setPax]         = useState({ adult: 1, child: 0, infant: 0 });
  const [returnError, setReturnError] = useState('');
  const [isPreFilled, setIsPreFilled] = useState(false);

  const paxRef = useRef(null);

  // Đóng dropdown khi click ngoài
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (paxRef.current && !paxRef.current.contains(e.target)) setIsPaxOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Xóa lỗi ngày về khi user chọn ngày
  useEffect(() => { if (returnDate) setReturnError(''); }, [returnDate]);

  // Áp dụng initialValues khi click dest card từ Home
  useEffect(() => {
    if (!initialValues?.toLoc) return;
    setToLoc(initialValues.toLoc);
    if (initialValues.departDate) setDepartDate(initialValues.departDate);
    if (initialValues.tripType)   setTripType(initialValues.tripType);
    setIsPreFilled(true);
  }, [initialValues]);

  const handleSwap = useCallback(() => {
    setFromLoc(f => { setToLoc(f); return toLoc; });
    setIsPreFilled(false);
  }, [toLoc]);

  const handlePaxChange = useCallback((type, delta) => {
    const config = PAX_CONFIG.find(c => c.key === type);
    setPax(prev => {
      const next = prev[type] + delta;
      return next < config.min ? prev : { ...prev, [type]: next };
    });
  }, []);

  const paxSummary = useMemo(() =>
    Object.entries(pax).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${PAX_LABELS[k]}`).join(', ')
  , [pax]);

  const handleSearch = useCallback(() => {
    if (tripType === 'roundtrip' && !returnDate) {
      setReturnError('Vui lòng nhập ngày về hoặc chuyển sang vé một chiều');
      return;
    }
    setReturnError('');
    setIsPreFilled(false);
    onSearch({ fromLoc, toLoc, departDate, returnDate, pax, tripType });
  }, [fromLoc, toLoc, departDate, returnDate, pax, tripType, onSearch]);

  const switchToOneway = useCallback(() => { setTripType('oneway'); setReturnError(''); }, []);

  return (
    <div className="hero-container">
      <div className="hero-section">
        <h1>Khám phá thế giới cùng chúng tôi</h1>
        <p>Đặt ngay chuyến đi tiếp theo của bạn</p>

        <div className="search-card">
          <div className="trip-type-tabs">
            {[{ id: 'roundtrip', label: 'Khứ hồi' }, { id: 'oneway', label: 'Một chiều' }].map(({ id, label }) => (
              <div key={id} className={`trip-tab ${tripType === id ? 'active' : ''}`}
                onClick={() => { setTripType(id); setReturnError(''); }}>
                {label}
              </div>
            ))}
          </div>

          <div className="search-grid">
            {/* From */}
            <div className="input-group">
              <label>Từ</label>
              <div className="input-with-icon">
                <i className="fas fa-map-marker-alt" />
                <select value={fromLoc} onChange={e => setFromLoc(e.target.value)}>
                  {airports.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
                </select>
              </div>
            </div>

            <div className="swap-icon" onClick={handleSwap} title="Đổi chiều">
              <i className="fas fa-exchange-alt" />
            </div>

            {/* To — highlight khi được prefill từ dest card */}
            <div className="input-group">
              <label>Đến</label>
              <div className={`input-with-icon${isPreFilled ? ' prefilled' : ''}`}>
                <i className="fas fa-map-marker-alt" />
                <select value={toLoc} onChange={e => { setToLoc(e.target.value); setIsPreFilled(false); }}>
                  {airports.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
                </select>
              </div>
            </div>

            {/* Ngày đi */}
            <div className="input-group">
              <label>Ngày đi</label>
              <div className="input-with-icon">
                <input type="date" className="date-picker-input" min={TODAY}
                  value={departDate} onChange={e => setDepartDate(e.target.value)} />
              </div>
            </div>

            {/* Ngày về — mờ khi oneway, đỏ viền khi có lỗi */}
            <div className="input-group" style={{ opacity: tripType === 'roundtrip' ? 1 : 0.5 }}>
              <label>Ngày về</label>
              <div className={`input-with-icon${returnError ? ' input-error' : ''}`}>
                <input type="date" className="date-picker-input"
                  disabled={tripType === 'oneway'}
                  min={departDate}
                  value={returnDate}
                  onChange={e => setReturnDate(e.target.value)} />
              </div>
            </div>

            {/* Hành khách */}
            <div className="input-group pax-group" ref={paxRef}>
              <label>Hành khách</label>
              <div className="input-with-icon" onClick={() => setIsPaxOpen(v => !v)}>
                <i className="far fa-user" />
                <span>{paxSummary}</span>
                <i className="fas fa-chevron-down" style={{ fontSize: 12, color: '#aaa', marginLeft: 10 }} />
              </div>
              {isPaxOpen && <PaxDropdown pax={pax} onChange={handlePaxChange} />}
            </div>
          </div>

          {/* Thông báo lỗi ngày về + nút chuyển sang một chiều */}
          {returnError && (
            <div className="return-date-error">
              <i className="fas fa-exclamation-circle" />
              <span>{returnError}</span>
              <button className="rde-switch-btn" onClick={switchToOneway}>Chuyển sang một chiều</button>
            </div>
          )}

          <div className="search-action" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button className="btn-search-orange" onClick={handleSearch}>TÌM CHUYẾN BAY</button>
            <button className="btn-ai-slider" onClick={() => onOpenSlider?.()} title="Tùy chỉnh ưu tiên gợi ý AI"
              style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 12, padding: '0 16px', height: 48, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 500, color: '#334155' }}>
              <i className="fas fa-sliders-h" /><span>Tùy chỉnh</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlightSearch;