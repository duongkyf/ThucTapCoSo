import React, { useState, useCallback, useEffect, useRef } from 'react';
import FlightSearch from '../flights/FlightSearch';
import FlightCard from '../flights/FlightCard';
import Stepper from '../flights/Stepper';
import PassengerForm from '../flights/PassengerForm';
import Services from '../flights/Services';
import Payment from '../flights/Payment';
import Success from '../flights/Success';
import PreferenceSliderModal from '../../components/PreferenceSliderModal';
import { flightService } from '../../services/flight.service';
import { bookingService } from '../../services/booking.service';
import '../../style/Home.css';

// ─── Static data ──────────────────────────────────────────────
const POPULAR_DESTINATIONS = [
  { city: 'Đà Nẵng', country: 'Việt Nam', price: '1.299.000 VND', img: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=600' },
  { city: 'Tokyo', country: 'Nhật Bản', price: '8.990.000 VND', img: 'https://images.unsplash.com/photo-1549693578-d683be217e58?q=80&w=1477' },
  { city: 'Paris', country: 'Pháp', price: '15.490.000 VND', img: 'https://images.unsplash.com/photo-1642947392578-b37fbd9a4d45?w=1080' },
];

const FEATURE_SERVICES = [
  { title: 'Suất ăn đa dạng', desc: 'Thưởng thức các món ăn ngon được chuẩn bị bởi các đầu bếp hàng đầu.', icon: 'fas fa-utensils', img: 'https://images.unsplash.com/photo-1626201853398-7cba6a8ebd7f?w=1080' },
  { title: 'Chọn chỗ thoải mái', desc: 'Chọn chỗ ngồi ưa thích của bạn với các lựa chọn chỗ để chân rộng rãi.', icon: 'fas fa-chair', img: 'https://images.unsplash.com/photo-1764023602899-b862aea3b897?w=1080' },
  { title: 'Hành lý linh hoạt', desc: 'Du lịch thoải mái với chính sách hành lý hào phóng của chúng tôi.', icon: 'fas fa-suitcase-rolling', img: 'https://images.unsplash.com/photo-1714235058817-af16a662fe1d?w=1080' },
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
  time:    new Date(f.departure_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
  arrTime: new Date(f.arrival_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
  duration: `${Math.floor(f.duration_minutes / 60)}h ${f.duration_minutes % 60}m`,
  type: 'Bay thẳng',
  available_seats: f.available_seats,
  aircraft: f.aircraft_model,
  classes: [
    { type: 'eco',      name: 'Phổ thông',          price: Number(f.base_price),       isPopular: true, benefits: ['Hành lý xách tay 7kg', 'Chọn ghế tiêu chuẩn', 'Đổi vé 1 lần'] },
    { type: 'premium',  name: 'Phổ thông đặc biệt', price: Number(f.base_price) * 1.5, benefits: ['Hành lý 15kg', 'Ghế rộng hơn +5cm', 'Ưu tiên lên máy bay', 'Đổi vé miễn phí'] },
    { type: 'business', name: 'Thương gia',          price: Number(f.base_price) * 2.5, benefits: ['Hành lý 30kg', 'Ghế rộng hơn', 'Ưu tiên lên máy bay', 'Bữa ăn cao cấp'] },
    { type: 'first',    name: 'Hạng nhất',           price: Number(f.base_price) * 4,   benefits: ['Hành lý 40kg', 'Phòng chờ VIP', 'Bữa ăn Chef', 'Ghế nằm hoàn toàn'] },
  ],
  raw: f,
});

const STEPS = ['Chọn chuyến bay', 'Thông tin hành khách', 'Dịch vụ', 'Thanh toán'];

// ─── Home Component ───────────────────────────────────────────
const Home = ({ user, onOpenAuth }) => {
  const [airports,       setAirports]       = useState([]);
  const [step,           setStep]           = useState(0);
  const [flights,        setFlights]        = useState([]);
  const [searching,      setSearching]      = useState(false);
  const [searchError,    setSearchError]    = useState('');
  const [hasSearched,    setHasSearched]    = useState(false);
  const [searchParams,   setSearchParams]   = useState(null);
  const [selectedFlight, setSelectedFlight] = useState(null);
  const [passengers,     setPassengers]     = useState([]);
  const [selectedSvcs,   setSelectedSvcs]   = useState([]);
  const [bookingResult,  setBookingResult]  = useState(null);

  // Slider state
  const [showSlider,       setShowSlider]       = useState(false);
  const [customPrefVector, setCustomPrefVector] = useState(null);
  // Lưu prefVector từ response AI để truyền vào slider làm giá trị ban đầu
  const [lastPrefVector,   setLastPrefVector]   = useState(null);

  // Dùng ref để handleSearch luôn đọc được giá trị mới nhất của customPrefVector
  // mà không cần thêm vào dependency array (tránh vòng lặp vô hạn)
  const customPrefVectorRef = useRef(customPrefVector);
  useEffect(() => { customPrefVectorRef.current = customPrefVector; }, [customPrefVector]);

  // Load airports
  useEffect(() => {
    flightService.getAirports()
      .then((res) => {
        const list = (res.data?.data || []).map((a) => ({ code: a.airport_id, name: `${a.city} (${a.airport_id})` }));
        setAirports(list.length ? list : [
          { code: 'SGN', name: 'Hồ Chí Minh (SGN)' },
          { code: 'HAN', name: 'Hà Nội (HAN)' },
          { code: 'DAD', name: 'Đà Nẵng (DAD)' },
        ]);
      })
      .catch(() => setAirports([
        { code: 'SGN', name: 'Hồ Chí Minh (SGN)' },
        { code: 'HAN', name: 'Hà Nội (HAN)' },
        { code: 'DAD', name: 'Đà Nẵng (DAD)' },
      ]));
  }, []);

  // Search flights — dùng ref để đọc customPrefVector mới nhất
  const handleSearch = useCallback(async ({ fromLoc, toLoc, departDate, pax }) => {
    setSearching(true);
    setSearchError('');
    setHasSearched(true);
    setSearchParams({ fromLoc, toLoc, departDate, pax });

    try {
      const res = await flightService.searchWithAI({
        from:         fromLoc,
        to:           toLoc,
        date:         departDate,
        passengers:   (pax?.adult || 1) + (pax?.child || 0),
        userId:       user?.user_id ?? null,
        customVector: customPrefVectorRef.current,  // luôn đọc giá trị mới nhất qua ref
      });

      const rawFlights = res.data?.data      || [];
      const aiEnabled  = res.data?.aiEnabled ?? false;
      const meta       = res.data?.meta      ?? {};

      // Lưu prefVector từ response để dùng làm initialVector cho slider
      if (meta?.prefVector) setLastPrefVector(meta.prefVector);

      const mapped = rawFlights.map(f => ({
        ...mapFlight(f),
        pax,
        ai_rank:     f.ai_rank     ?? null,
        ai_score:    f.ai_score    ?? 0,
        explanation: f.explanation ?? null,
        aiEnabled,
        aiMeta: meta,
      }));

      mapped.sort((a, b) => {
        if (a.ai_rank === null && b.ai_rank === null) return 0;
        if (a.ai_rank === null) return 1;
        if (b.ai_rank === null) return -1;
        return a.ai_rank - b.ai_rank;
      });

      setFlights(mapped);
    } catch {
      setSearchError('Không thể tải dữ liệu chuyến bay. Vui lòng thử lại.');
      setFlights([]);
    } finally {
      setSearching(false);
    }
  }, [user]); // user là dependency duy nhất — customPrefVector đọc qua ref

  // Apply custom vector từ slider → cập nhật ref + state rồi search lại
  const handleApplyCustomVector = useCallback((vector) => {
    customPrefVectorRef.current = vector;
    setCustomPrefVector(vector);
    setShowSlider(false);
    if (searchParams) handleSearch(searchParams);
  }, [searchParams, handleSearch]);

  // Reset về vector mặc định của user
  const handleResetToUserVector = useCallback(() => {
    customPrefVectorRef.current = null;
    setCustomPrefVector(null);
    setShowSlider(false);
    if (searchParams) handleSearch(searchParams);
  }, [searchParams, handleSearch]);

  const handleSelectFlight = useCallback((flight, cls) => {
    const pax = flight.pax || searchParams?.pax || { adult: 1, child: 0, infant: 0 };
    setSelectedFlight({ ...flight, selectedClass: cls, pax, search: searchParams });
    setStep(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [searchParams]);

  const handlePassengerNext = useCallback((paxData) => {
    setPassengers(paxData);
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleServicesNext = useCallback((svcs) => {
    setSelectedSvcs(svcs);
    setStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handlePayment = useCallback(async (paymentData) => {
    try {
      const contact = {
        name:  passengers[0]?.passenger_name || '',
        email: passengers[0]?.email          || '',
        phone: passengers[0]?.phone          || '',
      };
      const basePrice    = selectedFlight.selectedClass.price;
      const priceWithTax = Math.round(basePrice * 1.1);
      const servicesList = [
        ...Object.entries(selectedSvcs?.baggage   || {}),
        ...Object.entries(selectedSvcs?.oversized || {}),
        ...Object.entries(selectedSvcs?.meal      || {}),
      ].filter(([, price]) => price > 0).map(([key, price]) => ({ name: key, price }));

      const res = await bookingService.create({
        flight_id: selectedFlight.id,
        passengers: passengers.map((p) => ({
          passenger_name: p.passenger_name,
          passenger_type: p.passenger_type || 'adult',
          identity_card:  p.identity_card  || '',
          ticket_price:   priceWithTax,
          class:          selectedFlight.selectedClass.type || 'eco',
        })),
        services: servicesList,
        contact,
      });
      setBookingResult(res.data?.data);
      setStep(4);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error('Payment error:', err);
      alert(err.response?.data?.message || err.message || 'Đặt vé thất bại, vui lòng thử lại');
    }
  }, [selectedFlight, passengers, selectedSvcs]);

  const handleReset = useCallback(() => {
    setStep(0); setFlights([]); setHasSearched(false);
    setSelectedFlight(null); setPassengers([]); setSelectedSvcs([]); setBookingResult(null);
  }, []);

  return (
    <div className="home-page">
      {step === 0 && (<>
        <FlightSearch airports={airports} onSearch={handleSearch} onOpenSlider={() => setShowSlider(true)} />

        {hasSearched && (
          <div className="results-section">
            {searching ? (
              <div className="results-loading">
                <i className="fas fa-spinner fa-spin" /> Đang tìm chuyến bay...
              </div>
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
                <h2 className="results-title">
                  Chuyến bay từ <strong>{searchParams?.fromLoc}</strong> đến <strong>{searchParams?.toLoc}</strong>
                  <span> — {flights.length} kết quả</span>
                </h2>
                {/* Badge thông báo đang dùng vector tùy chỉnh */}
                {customPrefVector && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    background: '#ede9fe', border: '1px solid #c4b5fd',
                    borderRadius: '10px', padding: '6px 14px',
                    fontSize: '13px', color: '#5b21b6', fontWeight: 500,
                    marginBottom: '16px',
                  }}>
                    <i className="fas fa-sliders-h" />
                    Đang sắp xếp theo sở thích tùy chỉnh của bạn
                    <button
                      onClick={handleResetToUserVector}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', fontSize: '12px', padding: '0 0 0 4px', fontWeight: 600 }}
                    >
                      Đặt lại
                    </button>
                  </div>
                )}
                {flights.map((f) => (
                  <FlightCard key={f.id} flight={f} onSelect={handleSelectFlight} />
                ))}
              </div>
            )}
          </div>
        )}

        {!hasSearched && (<>
          <section className="popular-section">
            <h2 className="section-title">Các chuyến bay phổ biến</h2>
            <div className="dest-grid">
              {POPULAR_DESTINATIONS.map((d) => (
                <div key={d.city} className="dest-card">
                  <img src={d.img} alt={d.city} className="dest-card-img" />
                  <div className="dest-card-body">
                    <div className="dest-top-row">
                      <h3>{d.city}</h3>
                      <span className="dest-price">Từ {d.price}</span>
                    </div>
                    <p>{d.country}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="services-section">
            <h2 className="section-title" style={{ maxWidth: 1200, margin: '0 auto 20px', padding: '0 20px' }}>Dịch vụ của chúng tôi</h2>
            <div className="services-grid">
              {FEATURE_SERVICES.map((s) => (
                <div key={s.title} className="service-card">
                  <div className="service-img" style={{ backgroundImage: `url(${s.img})` }} />
                  <div className="service-content">
                    <i className={s.icon} />
                    <h3>{s.title}</h3>
                    <p>{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>)}
      </>)}

      {step >= 1 && step <= 3 && (
        <div className="booking-flow">
          <Stepper steps={STEPS} currentStep={step - 1} />
          {step === 1 && <PassengerForm flight={selectedFlight} onNext={handlePassengerNext} onBack={() => setStep(0)} user={user} />}
          {step === 2 && <Services      flight={selectedFlight} onNext={handleServicesNext}  onBack={() => setStep(1)} />}
          {step === 3 && <Payment       flight={selectedFlight} passengers={passengers} services={selectedSvcs} onConfirm={handlePayment} onBack={() => setStep(2)} />}
        </div>
      )}

      {step === 4 && <Success booking={bookingResult} flight={selectedFlight} onReset={handleReset} />}

      {/* ── PreferenceSliderModal — render ở đây để luôn sẵn sàng ── */}
      <PreferenceSliderModal
        isOpen={showSlider}
        onClose={() => setShowSlider(false)}
        onApply={handleApplyCustomVector}
        onReset={handleResetToUserVector}
        initialVector={customPrefVector ?? lastPrefVector}
      />
    </div>
  );
};

export default Home;