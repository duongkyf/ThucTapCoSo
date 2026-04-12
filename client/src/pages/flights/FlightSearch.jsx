import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import '../../style/FlightSearch.css';

// ─── Constants ────────────────────────────────────────────────────────────────
const TODAY = new Date().toISOString().split('T')[0];

const PAX_CONFIG = [
  { key: 'adult', label: 'Người lớn', desc: 'Từ 12 tuổi', min: 1 },
  { key: 'child', label: 'Trẻ em', desc: '2 - 11 tuổi', min: 0 },
  { key: 'infant', label: 'Em bé', desc: 'Dưới 2 tuổi', min: 0 },
];

const PAX_LABELS = { adult: 'Người lớn', child: 'Trẻ em', infant: 'Em bé' };

// ─── Sub-components ───────────────────────────────────────────────────────────
const PaxDropdown = ({ pax, onChange }) => (
  <div className="pax-dropdown show">
    {PAX_CONFIG.map(({ key, label, desc, min }) => (
      <div className="pax-row" key={key}>
        <div className="pax-label">
          <b>{label}</b>
          <span>{desc}</span>
        </div>
        <div className="pax-ctrl">
          <button onClick={() => onChange(key, -1)} disabled={pax[key] <= min}>-</button>
          <span className="pax-count">{pax[key]}</span>
          <button onClick={() => onChange(key, 1)}>+</button>
        </div>
      </div>
    ))}
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────
const FlightSearch = ({ airports, onSearch }) => {
  const [tripType, setTripType] = useState('roundtrip');
  const [fromLoc, setFromLoc] = useState('SGN');
  const [toLoc, setToLoc] = useState('HAN');
  const [departDate, setDepartDate] = useState(TODAY);
  const [returnDate, setReturnDate] = useState('');
  const [isPaxOpen, setIsPaxOpen] = useState(false);
  const [pax, setPax] = useState({ adult: 1, child: 0, infant: 0 });

  const paxRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (paxRef.current && !paxRef.current.contains(e.target)) setIsPaxOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSwap = useCallback(() => {
    setFromLoc((f) => { setToLoc(f); return toLoc; });
  }, [toLoc]);

  const handlePaxChange = useCallback((type, delta) => {
    const config = PAX_CONFIG.find((c) => c.key === type);
    setPax((prev) => {
      const next = prev[type] + delta;
      if (next < config.min) return prev;
      return { ...prev, [type]: next };
    });
  }, []);

  const paxSummary = useMemo(() => {
    return Object.entries(pax)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${v} ${PAX_LABELS[k]}`)
      .join(', ');
  }, [pax]);

  const handleSearch = useCallback(() => {
    onSearch({ fromLoc, toLoc, departDate, returnDate, pax, tripType });
  }, [fromLoc, toLoc, departDate, returnDate, pax, tripType, onSearch]);

  return (
    <div className="hero-container">
      <div className="hero-section">
        <h1>Khám phá thế giới cùng chúng tôi</h1>
        <p>Đặt ngay chuyến đi tiếp theo của bạn</p>

        <div className="search-card">
          {/* Trip type tabs */}
          <div className="trip-type-tabs">
            {[{ id: 'roundtrip', label: 'Khứ hồi' }, { id: 'oneway', label: 'Một chiều' }].map(({ id, label }) => (
              <div
                key={id}
                className={`trip-tab ${tripType === id ? 'active' : ''}`}
                onClick={() => setTripType(id)}
              >
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
                <select value={fromLoc} onChange={(e) => setFromLoc(e.target.value)}>
                  {airports.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
                </select>
              </div>
            </div>

            {/* Swap */}
            <div className="swap-icon" onClick={handleSwap} title="Đổi chiều">
              <i className="fas fa-exchange-alt" />
            </div>

            {/* To */}
            <div className="input-group">
              <label>Đến</label>
              <div className="input-with-icon">
                <i className="fas fa-map-marker-alt" />
                <select value={toLoc} onChange={(e) => setToLoc(e.target.value)}>
                  {airports.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
                </select>
              </div>
            </div>

            {/* Depart date */}
            <div className="input-group">
              <label>Ngày đi</label>
              <div className="input-with-icon">
                <input
                  type="date"
                  className="date-picker-input"
                  min={TODAY}
                  value={departDate}
                  onChange={(e) => setDepartDate(e.target.value)}
                />
              </div>
            </div>

            {/* Return date */}
            <div className="input-group" style={{ opacity: tripType === 'roundtrip' ? 1 : 0.5 }}>
              <label>Ngày về</label>
              <div className="input-with-icon">
                <input
                  type="date"
                  className="date-picker-input"
                  disabled={tripType === 'oneway'}
                  min={departDate}
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                />
              </div>
            </div>

            {/* Passengers */}
            <div className="input-group pax-group" ref={paxRef}>
              <label>Hành khách</label>
              <div className="input-with-icon" onClick={() => setIsPaxOpen((v) => !v)}>
                <i className="far fa-user" />
                <span>{paxSummary}</span>
                <i className="fas fa-chevron-down" style={{ fontSize: '12px', color: '#aaa', marginLeft: '10px' }} />
              </div>
              {isPaxOpen && <PaxDropdown pax={pax} onChange={handlePaxChange} />}
            </div>
          </div>

          <div className="search-action">
            <button className="btn-search-orange" onClick={handleSearch}>
              TÌM CHUYẾN BAY
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlightSearch;