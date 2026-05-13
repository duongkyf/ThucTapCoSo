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
  duration:    `${Math.floor(f.duration_minutes / 60)}h ${f.duration_minutes % 60}m`,
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
        .sort((a, b) => (a.ai_rank ?? Infinity) - (b.ai_rank ?? Infinity));
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

    setSearchInitial({ toLoc: dest.airportCode, departDate, tripType: 'oneway' });
    setSearching(true); setSearchError(''); setHasSearched(true);
    setSearchParams({ fromLoc: null, toLoc: dest.airportCode, toCity: dest.city, departDate, pax });
    setTripType('oneway'); setReturnDate('');
    setShowReturnSection(false); setActiveFlightTab('outbound');
    setSelectedFlight(null); setSelectedReturnFlight(null); setReturnFlights([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      const res = await flightService.searchWithAI({
        from:       null,
        to:         dest.airportCode,
        date:       departDate,
        passengers: 1,
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
        .sort((a, b) => (a.ai_rank ?? Infinity) - (b.ai_rank ?? Infinity));
      setFlights(mapped);
    } catch {
      setSearchError('Không thể tải dữ liệu chuyến bay. Vui lòng thử lại.');
      setFlights([]);
    } finally { setSearching(false); }
  }, [user]);

  const handleCustomizeSearch = useCallback(() => {
    setHasSearched(false);
    setSearchInitial(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <div className="home-page">
      {step === 0 && (<>
        <FlightSearch airports={airports} onSearch={handleSearch} initialValues={searchInitial} />

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