import React, { useState, useCallback, useEffect, useRef } from 'react';
import FlightSearch          from '../flights/FlightSearch';
import FlightCard            from '../flights/FlightCard';
import Stepper               from '../flights/Stepper';
import PassengerForm         from '../flights/PassengerForm';
import Services              from '../flights/Services';
import Payment               from '../flights/Payment';
import Success               from '../flights/Success';
import { flightService }     from '../../services/flight.service';
import { bookingService }    from '../../services/booking.service';
import { calcTicketPrice }   from '../../utils/pricingUtils';
import "../../style/Pages/Home.css";

const POPULAR_DESTINATIONS = [
  { city: 'Đà Nẵng', country: 'Việt Nam', price: '1.299.000 VND', img: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=600',  airportCode: 'DAD' },
  { city: 'Tokyo',   country: 'Nhật Bản',  price: '8.990.000 VND', img: 'https://images.unsplash.com/photo-1549693578-d683be217e58?q=80&w=1477', airportCode: 'NRT' },
  { city: 'Paris',   country: 'Pháp',      price: '15.490.000 VND', img: 'https://images.unsplash.com/photo-1642947392578-b37fbd9a4d45?w=1080', airportCode: 'CDG' },
];

const FEATURE_SERVICES = [
  { key: 'search',  icon: 'fas fa-search',         color: '#185FA5', bg: '#E6F1FB', title: 'Tìm kiếm nhanh',  desc: 'Nhập điểm đi, điểm đến và ngày bay — kết quả hiện ngay tức thì, hỗ trợ cả vé một chiều lẫn khứ hồi.' },
  { key: 'service', icon: 'fas fa-concierge-bell',  color: '#854F0B', bg: '#FAEEDA', title: 'Dịch vụ bổ sung', desc: 'Thêm hành lý, bữa ăn và các tiện ích ngay trong lúc đặt vé, cho mọi loại hành khách.' },
  { key: 'secure',  icon: 'fas fa-shield-alt',      color: '#3B6D11', bg: '#EAF3DE', title: 'Đặt vé an toàn',  desc: 'Thông tin hành khách và thanh toán được bảo mật toàn bộ qua quy trình xác nhận nhiều bước.' },
];

const CLASS_TIERS = [
  { type: 'eco',      name: 'Phổ thông',          ratio: 1,   isPopular: true,  benefits: ['Hành lý xách tay 7kg', 'Chọn ghế tiêu chuẩn', 'Đổi vé 1 lần'] },
  { type: 'premium',  name: 'Phổ thông đặc biệt', ratio: 1.5, benefits: ['Hành lý 15kg', 'Ghế rộng hơn +5cm', 'Ưu tiên lên máy bay', 'Đổi vé miễn phí'] },
  { type: 'business', name: 'Thương gia',          ratio: 2.5, benefits: ['Hành lý 30kg', 'Ghế rộng hơn', 'Ưu tiên lên máy bay', 'Bữa ăn cao cấp'] },
  { type: 'first',    name: 'Hạng nhất',           ratio: 4,   benefits: ['Hành lý 40kg', 'Phòng chờ VIP', 'Bữa ăn Chef', 'Ghế nằm hoàn toàn'] },
];

const AI_SLIDER_CONFIG = [
  { key: 'price',   label: 'Giá vé tốt',        icon: 'fas fa-tag',           color: '#2563a8', trackColor: '#2563a8' },
  { key: 'seat',    label: 'Hạng ghế phù hợp',  icon: 'fas fa-chair',         color: '#e84393', trackColor: '#e84393' },
  { key: 'time',    label: 'Giờ bay hợp lý',     icon: 'fas fa-clock',         color: '#16a34a', trackColor: '#16a34a' },
  { key: 'airline', label: 'Hãng bay phù hợp',  icon: 'fas fa-plane-circle-check', color: '#c9973a', trackColor: '#c9973a' },
];

const DEFAULT_AI_PREFS = { price: 7, seat: 5, time: 4, airline: 2 };

// ─── Donut Chart SVG ───────────────────────────────────────────
const DonutChart = ({ prefs }) => {
  const total = Object.values(prefs).reduce((a, b) => a + b, 0) || 1;
  const colors = { price: '#2563a8', seat: '#e84393', time: '#16a34a', airline: '#c9973a' };
  const order  = ['price', 'seat', 'time', 'airline'];
  const R = 54, cx = 70, cy = 70, stroke = 22;
  const circ = 2 * Math.PI * R;

  let offset = 0;
  const slices = order.map(key => {
    const pct   = prefs[key] / total;
    const dash  = pct * circ;
    const gap   = circ - dash;
    const slice = { key, dash, gap, offset, color: colors[key], pct: Math.round(pct * 100) };
    offset += dash;
    return slice;
  });

  // find dominant slice for center label
  const dominant = order.reduce((a, b) => prefs[a] >= prefs[b] ? a : b);
  const domPct   = Math.round((prefs[dominant] / total) * 100);

  return (
    <svg width={140} height={140} viewBox="0 0 140 140">
      {/* bg ring */}
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#e8f0fb" strokeWidth={stroke} />
      {slices.map(s => (
        <circle key={s.key} cx={cx} cy={cy} r={R} fill="none"
          stroke={s.color} strokeWidth={stroke}
          strokeDasharray={`${s.dash} ${s.gap}`}
          strokeDashoffset={-s.offset + circ / 4}
          style={{ transition: 'stroke-dasharray .4s ease' }}
        />
      ))}
      {/* center label */}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="15" fontWeight="700" fill="#0b1e3d">{domPct}%</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize="9" fill="#64748b">đóng góp</text>
    </svg>
  );
};

// ─── AI Preference Slider Panel ────────────────────────────────
const AISliderPanel = ({ prefs, onChange, onClose, onApply }) => {
  const overlayRef = useRef(null);
  const total = Object.values(prefs).reduce((a, b) => a + b, 0) || 1;

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  const S = {
    overlay: {
      position: 'fixed', inset: 0,
      background: 'rgba(11,30,61,0.55)', backdropFilter: 'blur(3px)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    modal: {
      background: '#fff', borderRadius: 20, width: 460, maxHeight: '90vh',
      overflowY: 'auto', boxShadow: '0 24px 64px rgba(11,30,61,0.22)',
      position: 'relative', fontFamily: "'DM Sans', sans-serif",
    },
    header: {
      background: 'linear-gradient(135deg, #0b1e3d, #1a4080)',
      borderRadius: '20px 20px 0 0', padding: '22px 28px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    },
    body: { padding: '24px 28px 28px' },
    sectionLabel: {
      fontSize: 10, fontWeight: 700, letterSpacing: '1.2px',
      textTransform: 'uppercase', color: '#94a3b8', marginBottom: 14,
    },
  };

  return (
    <div ref={overlayRef} onClick={handleOverlayClick} style={S.overlay}>
      <div style={S.modal}>

        {/* ── Header ── */}
        <div style={S.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: 'rgba(201,151,58,0.25)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <i className="fas fa-sliders-h" style={{ color: '#c9973a', fontSize: 16 }} />
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Tùy chỉnh ưu tiên AI</div>
              <div style={{ color: 'rgba(255,255,255,.55)', fontSize: 12, marginTop: 2 }}>
                Điều chỉnh mức độ quan trọng của từng tiêu chí
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,.12)', border: 'none', borderRadius: 8,
            width: 32, height: 32, cursor: 'pointer', color: 'rgba(255,255,255,.7)',
            fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <i className="fas fa-times" />
          </button>
        </div>

        <div style={S.body}>

          {/* ── Donut + legend ── */}
          <div style={S.sectionLabel}>Tỷ trọng đóng góp vào gợi ý</div>
          <div style={{
            background: '#f8faff', border: '1px solid #e8f0fb',
            borderRadius: 14, padding: '18px 20px',
            display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24,
          }}>
            <DonutChart prefs={prefs} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {AI_SLIDER_CONFIG.map(({ key, label, color }) => {
                const pct = Math.round((prefs[key] / total) * 100);
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0, display: 'inline-block' }} />
                      <span style={{ fontSize: 13, color: '#334155' }}>{label}</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color, minWidth: 36, textAlign: 'right' }}>{pct}%</span>
                  </div>
                );
              })}
              <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 2, paddingTop: 6, fontSize: 12, color: '#94a3b8' }}>
                Tổng: 100%
              </div>
            </div>
          </div>

          {/* ── Sliders ── */}
          <div style={S.sectionLabel}>Điểm số từng tiêu chí</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {AI_SLIDER_CONFIG.map(({ key, label, icon, color }) => (
              <div key={key} style={{
                background: '#fafbff', border: '1px solid #e8f0fb',
                borderRadius: 12, padding: '14px 16px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 7,
                      background: `${color}18`, display: 'flex',
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <i className={icon} style={{ fontSize: 12, color }} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{label}</span>
                  </div>
                  <span style={{
                    background: color, color: '#fff', fontWeight: 700,
                    fontSize: 13, borderRadius: 7, padding: '3px 10px',
                    minWidth: 32, textAlign: 'center', boxShadow: `0 2px 8px ${color}44`,
                  }}>
                    {prefs[key]}
                  </span>
                </div>
                {/* Custom range track */}
                <div style={{ position: 'relative', height: 6, marginBottom: 4 }}>
                  <div style={{
                    position: 'absolute', left: 0, right: 0, top: 0, height: 6,
                    background: '#e2e8f0', borderRadius: 99,
                  }} />
                  <div style={{
                    position: 'absolute', left: 0, top: 0, height: 6,
                    width: `${((prefs[key] - 1) / 9) * 100}%`,
                    background: `linear-gradient(90deg, ${color}99, ${color})`,
                    borderRadius: 99, transition: 'width .2s ease',
                  }} />
                  <input
                    type="range" min={1} max={10} value={prefs[key]}
                    onChange={e => onChange(key, Number(e.target.value))}
                    style={{
                      position: 'absolute', inset: 0, width: '100%', height: '100%',
                      opacity: 0, cursor: 'pointer', margin: 0,
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#cbd5e1' }}>
                  <span>Ít quan trọng</span><span>Rất quan trọng</span>
                </div>
              </div>
            ))}
          </div>

          {/* ── Actions ── */}
          <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
            <button onClick={() => onChange('__reset__')} style={{
              flex: 1, padding: '11px 0', borderRadius: 10,
              border: '1.5px solid #e2e8f0', background: '#f8fafc',
              color: '#64748b', fontWeight: 600, cursor: 'pointer', fontSize: 14,
              fontFamily: "'DM Sans', sans-serif", transition: 'all .2s',
            }}
              onMouseEnter={e => { e.target.style.borderColor = '#1a4080'; e.target.style.color = '#1a4080'; }}
              onMouseLeave={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.color = '#64748b'; }}
            >
              <i className="fas fa-rotate-left" style={{ marginRight: 6 }} />Đặt lại
            </button>
            <button onClick={onApply} style={{
              flex: 2, padding: '11px 0', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #0b1e3d, #1a4080)',
              color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14,
              fontFamily: "'DM Sans', sans-serif",
              boxShadow: '0 4px 14px rgba(11,30,61,0.3)',
            }}>
              <i className="fas fa-check" style={{ marginRight: 6 }} />Áp dụng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── mapFlight ─────────────────────────────────────────────────
const mapFlight = (f) => ({
  id:          f.flight_id,
  flightCode:  f.flight_code,
  airline:     f.airline_name  || f.flight_code?.slice(0, 2),
  airlineCode: f.airline_code  || f.flight_code?.slice(0, 2),
  logo:        f.airline_logo  || '',
  from:        f.origin_iata,
  to:          f.dest_iata,
  fromCity:    f.origin_city,
  toCity:      f.dest_city,
  time:        new Date(f.departure_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
  arrTime:     new Date(f.arrival_time).toLocaleTimeString('vi-VN',   { hour: '2-digit', minute: '2-digit' }),
  duration: (() => {
    const dur = Math.abs(f.duration_minutes || 0);
    return `${Math.floor(dur / 60)}h ${dur % 60}m`;
  })(),
  type:        'Bay thẳng',
  available_seats: f.available_seats,
  aircraft:    f.aircraft_model,
  flightDate:  (() => {
    if (!f.departure_time) return null;
    const vn = new Date(new Date(f.departure_time).getTime() + 7 * 3600000);
    return vn.toISOString().split('T')[0];
  })(),
  classes: CLASS_TIERS.map(c => ({ ...c, price: Number(f.base_price) * c.ratio })),
  raw: f,
});

const STEPS = ['Chọn chuyến bay', 'Thông tin hành khách', 'Dịch vụ', 'Thanh toán'];

const fallbackAirports = [
  { code: 'SGN', name: 'Hồ Chí Minh (SGN)' },
  { code: 'HAN', name: 'Hà Nội (HAN)' },
  { code: 'DAD', name: 'Đà Nẵng (DAD)' },
  { code: 'NRT', name: 'Tokyo (NRT)' },
  { code: 'CDG', name: 'Paris (CDG)' },
];

// ─── Home ──────────────────────────────────────────────────────
const Home = ({ user, onOpenAuth }) => {
  const [airports,     setAirports]     = useState([]);
  const [step,         setStep]         = useState(0);

  const [flights,        setFlights]        = useState([]);
  const [searching,      setSearching]      = useState(false);
  const [searchError,    setSearchError]    = useState('');
  const [hasSearched,    setHasSearched]    = useState(false);
  const [searchParams,   setSearchParams]   = useState(null);
  const [selectedFlight, setSelectedFlight] = useState(null);

  const [tripType,             setTripType]             = useState('oneway');
  const [returnDate,           setReturnDate]           = useState('');
  const [returnFlights,        setReturnFlights]        = useState([]);
  const [returnSearching,      setReturnSearching]      = useState(false);
  const [selectedReturnFlight, setSelectedReturnFlight] = useState(null);
  const [showReturnSection,    setShowReturnSection]    = useState(false);
  const [activeFlightTab,      setActiveFlightTab]      = useState('outbound');

  const [passengers,    setPassengers]    = useState([]);
  const [selectedSvcs,  setSelectedSvcs]  = useState([]);
  const [bookingResult, setBookingResult] = useState(null);

  const [searchInitial, setSearchInitial] = useState(null);

  // ── AI Slider state ──
  const [showSlider,  setShowSlider]  = useState(false);
  const [aiPrefs,     setAiPrefs]     = useState(DEFAULT_AI_PREFS);
  const [pendingPrefs, setPendingPrefs] = useState(DEFAULT_AI_PREFS);

  const handleOpenSlider  = useCallback(() => { setPendingPrefs(aiPrefs); setShowSlider(true); }, [aiPrefs]);
  const handleCloseSlider = useCallback(() => setShowSlider(false), []);

  const handlePrefChange = useCallback((key, value) => {
    if (key === '__reset__') { setPendingPrefs(DEFAULT_AI_PREFS); return; }
    setPendingPrefs(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleApplyPrefs = useCallback(() => {
    setAiPrefs(pendingPrefs);
    setShowSlider(false);
    // Nếu đang có kết quả tìm kiếm tái sắp xếp theo ưu tiên mới
    setFlights(prev => [...prev].sort((a, b) => {
      const score = (f) =>
        (pendingPrefs.price   / 10) * (1 / (f.classes?.[0]?.price || 1)) * 1e7 +
        (pendingPrefs.time    / 10) * (1 / (parseInt(f.duration) || 1)) * 100 +
        (pendingPrefs.seat    / 10) * (f.available_seats || 0) * 0.1 +
        (pendingPrefs.airline / 10) * 1;
      return score(b) - score(a);
    }));
  }, [pendingPrefs]);

  useEffect(() => {
    flightService.getAirports()
      .then(res => {
        const list = (res.data?.data || []).map(a => ({ code: a.airport_id, name: `${a.city} (${a.airport_id})` }));
        setAirports(list.length ? list : fallbackAirports);
      })
      .catch(() => setAirports(fallbackAirports));
  }, []);

  const handleSearch = useCallback(async ({ fromLoc, toLoc, departDate, returnDate: rDate, pax, tripType: tt }) => {
    setSearching(true); setSearchError(''); setHasSearched(true);
    setSearchParams({ fromLoc, toLoc, departDate, pax });
    setTripType(tt); setReturnDate(rDate || '');
    setShowReturnSection(false); setActiveFlightTab('outbound');
    setSelectedFlight(null); setSelectedReturnFlight(null); setReturnFlights([]);
    try {
      const res = await flightService.searchWithAI({
        from:       fromLoc,
        to:         toLoc,
        date:       departDate,
        passengers: (pax?.adult || 1) + (pax?.child || 0),
        userId:     user?.user_id ?? null,
      });
      const rawFlights = res.data?.data      || [];
      const aiEnabled  = res.data?.aiEnabled ?? false;
      const meta       = res.data?.meta      ?? {};
      const mapped = rawFlights
        .map(f => ({
          ...mapFlight(f),
          pax,
          ai_rank:     f.ai_rank     ?? null,
          ai_score:    f.ai_score    ?? 0,
          explanation: f.explanation ?? null,
          aiEnabled,
          aiMeta: meta,
        }))
      setFlights(mapped);
    } catch {
      setSearchError('Không thể tải dữ liệu chuyến bay. Vui lòng thử lại.');
      setFlights([]);
    } finally { setSearching(false); }
  }, [user]);

  const handleSelectFlight = useCallback(async (flight, cls) => {
    const pax = flight.pax || searchParams?.pax || { adult: 1, child: 0, infant: 0 };
    setSelectedFlight({ ...flight, selectedClass: cls, pax, search: searchParams });

    if (tripType === 'roundtrip' && returnDate) {
      setShowReturnSection(true); setReturnSearching(true); setSelectedReturnFlight(null);
      try {
        const res = await flightService.search({ from: searchParams.toLoc, to: searchParams.fromLoc, date: returnDate });
        setReturnFlights((res.data?.data || []).map(f => ({ ...mapFlight(f), pax })));
        setActiveFlightTab('return');
      } catch {
        setReturnFlights([]);
      } finally { setReturnSearching(false); }
    } else {
      setStep(1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [searchParams, tripType, returnDate]);

  const handleSelectReturnFlight = useCallback((flight, cls) => {
    const pax = flight.pax || searchParams?.pax || { adult: 1, child: 0, infant: 0 };
    setSelectedReturnFlight({ ...flight, selectedClass: cls, pax });
    setStep(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [searchParams]);

  const handlePassengerNext = useCallback((paxData) => { setPassengers(paxData); setStep(2); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);
  const handleServicesNext  = useCallback((svcs)    => { setSelectedSvcs(svcs);  setStep(3); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);

  const handlePayment = useCallback(async () => {
    try {
      const contact = { name: passengers[0]?.passenger_name || '', email: passengers[0]?.email || '', phone: passengers[0]?.phone || '' };

      const buildServicesList = (svc) => [
        ...Object.entries(svc?.baggage   || {}),
        ...Object.entries(svc?.oversized || {}),
        ...Object.entries(svc?.meal      || {}),
      ].filter(([, price]) => price > 0).map(([key, price]) => ({ name: key, price: Number(price) }));

      const outboundSvc = tripType === 'roundtrip' ? (selectedSvcs?.outbound || {}) : selectedSvcs;
      const returnSvc   = tripType === 'roundtrip' ? (selectedSvcs?.return   || {}) : {};

      const buildPayload = (flight, svcList) => ({
        flight_id: flight.id,
        passengers: passengers.map(p => ({
          passenger_name: p.passenger_name,
          passenger_type: p.passenger_type || 'adult',
          identity_card:  p.identity_card  || '',
          ticket_price:   calcTicketPrice(flight.selectedClass.price, p.passenger_type || 'adult'),
          class:          flight.selectedClass.type || 'eco',
          flight_date:    flight.flightDate || null,
        })),
        services: svcList,
        contact,
      });

      const res1 = await bookingService.create(buildPayload(selectedFlight, buildServicesList(outboundSvc)));
      let res2 = null;
      if (tripType === 'roundtrip' && selectedReturnFlight)
        res2 = await bookingService.create(buildPayload(selectedReturnFlight, buildServicesList(returnSvc)));

      setBookingResult({ outbound: res1.data?.data, return: res2?.data?.data || null });
      setStep(4);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Đặt vé thất bại, vui lòng thử lại');
    }
  }, [selectedFlight, selectedReturnFlight, passengers, selectedSvcs, tripType]);

  const handleReset = useCallback(() => {
    setStep(0); setFlights([]); setHasSearched(false);
    setSelectedFlight(null); setSelectedReturnFlight(null);
    setReturnFlights([]); setShowReturnSection(false); setActiveFlightTab('outbound');
    setPassengers([]); setSelectedSvcs([]); setBookingResult(null);
    setTripType('oneway'); setReturnDate('');
    setSearchInitial(null);
  }, []);

  const handleDestinationClick = useCallback(async (dest) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const departDate = tomorrow.toISOString().split('T')[0];
    const pax = { adult: 1, child: 0, infant: 0 };

    // Truyền fromLoc là chuỗi rỗng để kích hoạt UI "Tất cả chuyến bay đến..."
    setSearchInitial({ fromLoc: '', toLoc: dest.airportCode, departDate, tripType: 'oneway' });
    setSearching(true); setSearchError(''); setHasSearched(true);
    setSearchParams({ fromLoc: '', toLoc: dest.airportCode, toCity: dest.city, departDate, pax });
    setTripType('oneway'); setReturnDate('');
    setShowReturnSection(false); setActiveFlightTab('outbound');
    setSelectedFlight(null); setSelectedReturnFlight(null); setReturnFlights([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      // SỬ DỤNG SEARCH BÌNH THƯỜNG THAY VÌ SEARCH AI
      const res = await flightService.search({
        from: '', // Gửi chuỗi rỗng để backend biết là tìm tất cả
        to: dest.airportCode,
        date: departDate,
      });
      
      const rawFlights = res.data?.data || [];
      
      const mapped = rawFlights.map(f => ({
        ...mapFlight(f),
        pax,
        // Ép các thông số AI về mặc định vì search thường không có AI
        ai_rank: null,
        ai_score: 0,
        explanation: null,
        aiEnabled: false, 
        aiMeta: {},
      }));
      
      setFlights(mapped);
    } catch {
      setSearchError('Không thể tải dữ liệu chuyến bay. Vui lòng thử lại.');
      setFlights([]);
    } finally { setSearching(false); }
  }, []);

  const handleCustomizeSearch = useCallback(() => {
    setHasSearched(false);
    setSearchInitial(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <div className="home-page">

      {/* ── AI Preference Slider Panel ── */}
      {showSlider && (
        <AISliderPanel
          prefs={pendingPrefs}
          onChange={handlePrefChange}
          onClose={handleCloseSlider}
          onApply={handleApplyPrefs}
        />
      )}

      {step === 0 && (<>
        <FlightSearch
          airports={airports}
          onSearch={handleSearch}
          initialValues={searchInitial}
          onOpenSlider={handleOpenSlider}
        />

        {hasSearched && (
          <div className="results-section">

            {/* Chuyến đi */}
            {(tripType !== 'roundtrip' || !showReturnSection || activeFlightTab === 'outbound') && (
              searching ? (
                <div className="results-loading"><i className="fas fa-spinner fa-spin" /> Đang tìm chuyến bay...</div>
              ) : searchError ? (
                <div className="results-error"><i className="fas fa-exclamation-circle" /> {searchError}</div>
              ) : flights.length === 0 ? (
                <div className="no-flights">
                  <i className="fas fa-plane-slash" />
                  <p>Không tìm thấy chuyến bay phù hợp.</p>
                  <small>Thử chọn ngày khác hoặc điểm đến khác.</small>
                </div>
              ) : (
                <div className="flights-container">
                  {/* ── Banner context khi search từ dest card ── */}
                  {!searchParams?.fromLoc && (
                    <div className="dest-context-banner">
                      <div className="dest-context-banner-left">
                        <i className="fas fa-globe-asia" />
                        <span>
                          Tất cả chuyến bay đến{' '}
                          <strong>{searchParams?.toCity || searchParams?.toLoc}</strong>
                          {' '}— ngày mai, một chiều
                        </span>
                      </div>
                      <button className="dest-context-banner-btn" onClick={handleCustomizeSearch}>
                        <i className="fas fa-sliders-h" /> Tùy chỉnh tìm kiếm
                      </button>
                    </div>
                  )}

                  <h2 className="results-title">
                    {tripType === 'roundtrip' && <><i className="fas fa-plane-departure" style={{ marginRight: 6 }} />Chuyến đi &nbsp;</>}
                    {searchParams?.fromLoc
                      ? <><strong>{searchParams.fromLoc}</strong> → <strong>{searchParams.toLoc}</strong></>
                      : <><i className="fas fa-globe-asia" style={{ marginRight: 6, color: '#3b82f6' }} />
                         Tất cả chuyến bay đến <strong>{searchParams?.toCity || searchParams?.toLoc}</strong></>
                    }
                    <span> — {flights.length} kết quả</span>
                  </h2>
                  {/* ── Badge: đang dùng ưu tiên tùy chỉnh ── */}
                  {JSON.stringify(aiPrefs) !== JSON.stringify(DEFAULT_AI_PREFS) && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      background: '#ede9fe', border: '1px solid #c4b5fd',
                      borderRadius: 10, padding: '6px 14px',
                      fontSize: 13, color: '#5b21b6', fontWeight: 500,
                      marginBottom: 16,
                    }}>
                      <i className="fas fa-sliders-h" />
                      Đang sắp xếp theo sở thích tùy chỉnh của bạn
                      <button
                        onClick={() => { setAiPrefs(DEFAULT_AI_PREFS); setPendingPrefs(DEFAULT_AI_PREFS); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', fontSize: 12, padding: '0 0 0 4px', fontWeight: 600 }}
                      >
                        Đặt lại
                      </button>
                    </div>
                  )}
                  {flights.map(f => (
                    <FlightCard key={f.id} flight={f} onSelect={handleSelectFlight} selected={selectedFlight?.id === f.id} />
                  ))}
                </div>
              )
            )}

            {/* Chuyến về */}
            {tripType === 'roundtrip' && showReturnSection && activeFlightTab === 'return' && (
              <div id="return-flights-section" className="flights-container">
                {selectedFlight && (
                  <div className="selected-outbound-banner">
                    <i className="fas fa-check-circle" style={{ color: '#10b981', marginRight: 8 }} />
                    Chiều đi: <strong>{selectedFlight.flightCode}</strong>
                    {' '}({selectedFlight.from} → {selectedFlight.to}, {selectedFlight.selectedClass?.name})
                    <button
                      className="btn-change-outbound"
                      onClick={() => { setSelectedFlight(null); setActiveFlightTab('outbound'); }}
                    >
                      <i className="fas fa-exchange-alt" /> Đổi chiều đi
                    </button>
                  </div>
                )}
                <h2 className="results-title">
                  <i className="fas fa-plane-arrival" style={{ marginRight: 6 }} />Chuyến về &nbsp;
                  <strong>{searchParams?.toLoc}</strong> → <strong>{searchParams?.fromLoc}</strong>
                  {!returnSearching && <span> — {returnFlights.length} kết quả</span>}
                </h2>
                {returnSearching ? (
                  <div className="results-loading"><i className="fas fa-spinner fa-spin" /> Đang tìm chuyến về...</div>
                ) : returnFlights.length === 0 ? (
                  <div className="no-flights">
                    <i className="fas fa-plane-slash" /><p>Không tìm thấy chuyến về.</p>
                    <small>Thử chọn ngày về khác.</small>
                  </div>
                ) : (
                  returnFlights.map(f => (
                    <FlightCard key={f.id} flight={f} onSelect={handleSelectReturnFlight} selected={selectedReturnFlight?.id === f.id} />
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {!hasSearched && (<>
          <section className="popular-section">
            <h2 className="section-title">Các chuyến bay phổ biến</h2>
            <div className="dest-grid">
              {POPULAR_DESTINATIONS.map(d => (
                <div
                  key={d.city}
                  className="dest-card"
                  onClick={() => handleDestinationClick(d)}
                  style={{ cursor: 'pointer' }}
                  title={`Tìm chuyến bay đến ${d.city}`}
                >
                  <img src={d.img} alt={d.city} className="dest-card-img" />
                  <div className="dest-card-body">
                    <div className="dest-top-row">
                      <span className="dest-country">{d.country}</span>
                      <span className="dest-price">Từ {d.price}</span>
                    </div>
                    <div className="dest-bottom-row">
                      <h3>{d.city}</h3>
                      <button className="dest-cta">Đặt vé ngay</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="wcu-section">
            <div className="wcu-inner">
              <div className="wcu-header">
                <h2>Tại sao chọn chúng tôi?</h2>
                <p>Nền tảng đặt vé máy bay trực tuyến — nhanh, đơn giản, an toàn</p>
              </div>
              <div className="wcu-grid">
                {FEATURE_SERVICES.map(s => (
                  <div key={s.key} className="wcu-card">
                    <div className="wcu-icon" style={{ background: s.bg }}>
                      <i className={s.icon} style={{ color: s.color }} />
                    </div>
                    <h3>{s.title}</h3>
                    <p>{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>)}
      </>)}

      {step >= 1 && step <= 3 && (
        <div className="booking-flow">
          <Stepper steps={STEPS} currentStep={step + 1} />

          {tripType === 'roundtrip' && selectedReturnFlight && (
            <div className="roundtrip-summary-bar">
              <span><i className="fas fa-plane-departure" /> <strong>{selectedFlight?.flightCode}</strong> {selectedFlight?.from} → {selectedFlight?.to} ({selectedFlight?.selectedClass?.name})</span>
              <span className="rts-divider">|</span>
              <span><i className="fas fa-plane-arrival" /> <strong>{selectedReturnFlight.flightCode}</strong> {selectedReturnFlight.from} → {selectedReturnFlight.to} ({selectedReturnFlight.selectedClass?.name})</span>
            </div>
          )}

          {step === 1 && <PassengerForm flight={selectedFlight} onNext={handlePassengerNext} onBack={() => setStep(0)} user={user} />}
          {step === 2 && (
            <Services
              flight={selectedFlight}
              returnFlight={tripType === 'roundtrip' ? selectedReturnFlight : null}
              onNext={handleServicesNext}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <Payment
              flight={selectedFlight}
              returnFlight={selectedReturnFlight}
              passengers={passengers}
              services={selectedSvcs}
              onConfirm={handlePayment}
              onBack={() => setStep(2)}
            />
          )}
        </div>
      )}

      {step === 4 && (
        <Success
          booking={bookingResult?.outbound}
          returnBooking={bookingResult?.return}
          flight={selectedFlight}
          returnFlight={selectedReturnFlight}
          onReset={handleReset}
        />
      )}
    </div>
  );
};

export default Home;