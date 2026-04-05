import React, { useState, useCallback, useEffect } from 'react';
import FlightSearch  from '../flights/FlightSearch';
import FlightCard    from '../flights/FlightCard';
import Stepper       from '../flights/Stepper';
import PassengerForm from '../flights/PassengerForm';
import Services      from '../flights/Services';
import Payment       from '../flights/Payment';
import Success       from '../flights/Success';
import { flightService }  from '../../services/flight.service';
import { bookingService } from '../../services/booking.service';
import '../../style/Home.css';

// ─── Static data ──────────────────────────────────────────────
const POPULAR_DESTINATIONS = [
  { city: 'Đà Nẵng',  country: 'Việt Nam', price: '1.299.000 VND', img: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=600' },
  { city: 'Tokyo',    country: 'Nhật Bản',  price: '8.990.000 VND', img: 'https://images.unsplash.com/photo-1549693578-d683be217e58?q=80&w=1477' },
  { city: 'Paris',    country: 'Pháp',      price: '15.490.000 VND', img: 'https://images.unsplash.com/photo-1642947392578-b37fbd9a4d45?w=1080' },
];

const FEATURE_SERVICES = [
  { title: 'Suất ăn đa dạng',      desc: 'Thưởng thức các món ăn ngon được chuẩn bị bởi các đầu bếp hàng đầu.', icon: 'fas fa-utensils',       img: 'https://images.unsplash.com/photo-1626201853398-7cba6a8ebd7f?w=1080' },
  { title: 'Chọn chỗ thoải mái',   desc: 'Chọn chỗ ngồi ưa thích của bạn với các lựa chọn chỗ để chân rộng rãi.', icon: 'fas fa-chair',        img: 'https://images.unsplash.com/photo-1764023602899-b862aea3b897?w=1080' },
  { title: 'Hành lý linh hoạt',    desc: 'Du lịch thoải mái với chính sách hành lý hào phóng của chúng tôi.',    icon: 'fas fa-suitcase-rolling', img: 'https://images.unsplash.com/photo-1714235058817-af16a662fe1d?w=1080' },
];

// Chuyển flight từ API sang format FlightCard cần
const mapFlight = (f) => {
  return {
  id:         f.flight_id,
  flightCode: f.flight_code,
  airline:    f.airline_name  || f.flight_code?.slice(0,2),
  airlineCode:f.airline_code  || f.flight_code?.slice(0,2),
  logo:       f.airline_logo  || '',
  from:       f.origin_iata,
  to:         f.dest_iata,
  fromCity:   f.origin_city,
  toCity:     f.dest_city,
  time:       new Date(f.departure_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
  arrTime:    new Date(f.arrival_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
  duration:   `${Math.floor(f.duration_minutes / 60)}h ${f.duration_minutes % 60}m`,
  type:       'Bay thẳng',
  available_seats: f.available_seats,
  aircraft:   f.aircraft_model,
  classes: [
    { type: 'eco',      name: 'Phổ thông',           price: Number(f.base_price),       isPopular: true,
      benefits: ['Hành lý xách tay 7kg', 'Chọn ghế tiêu chuẩn', 'Đổi vé 1 lần'] },
    { type: 'premium',  name: 'Phổ thông đặc biệt',  price: Number(f.base_price) * 1.5,
      benefits: ['Hành lý 15kg', 'Ghế rộng hơn +5cm', 'Ưu tiên lên máy bay', 'Đổi vé miễn phí'] },
    { type: 'business', name: 'Thương gia',           price: Number(f.base_price) * 2.5,
      benefits: ['Hành lý 30kg', 'Ghế rộng hơn', 'Ưu tiên lên máy bay', 'Bữa ăn cao cấp'] },
    { type: 'first',    name: 'Hạng nhất',            price: Number(f.base_price) * 4,
      benefits: ['Hành lý 40kg', 'Phòng chờ VIP', 'Bữa ăn Chef', 'Ghế nằm hoàn toàn'] },
  ],
  raw: f,
  };
};

const STEPS = ['Chọn chuyến bay', 'Thông tin hành khách', 'Dịch vụ', 'Thanh toán'];

// ─── Home Component ───────────────────────────────────────────
const Home = ({ user, onOpenAuth }) => {
  const [airports,      setAirports]      = useState([]);
  const [step,          setStep]          = useState(0);
  const [flights,       setFlights]       = useState([]);
  const [searching,     setSearching]     = useState(false);
  const [searchError,   setSearchError]   = useState('');
  const [hasSearched,   setHasSearched]   = useState(false);
  const [searchParams,  setSearchParams]  = useState(null);
  const [selectedFlight,setSelectedFlight]= useState(null);
  const [passengers,    setPassengers]    = useState([]);
  const [selectedSvcs,  setSelectedSvcs]  = useState([]);
  const [bookingResult, setBookingResult] = useState(null);

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

  // Search flights
  const handleSearch = useCallback(async ({ fromLoc, toLoc, departDate, pax }) => {
    setSearching(true); setSearchError(''); setHasSearched(true);
    setSearchParams({ fromLoc, toLoc, departDate, pax });
    try {
      const res = await flightService.search({ from: fromLoc, to: toLoc, date: departDate });
      // Nhúng pax thẳng vào từng flight để không phụ thuộc vào closure
      setFlights((res.data?.data || []).map(f => ({ ...mapFlight(f), pax })));
    } catch {
      setSearchError('Không thể tải dữ liệu chuyến bay. Vui lòng thử lại.');
      setFlights([]);
    } finally { setSearching(false); }
  }, []);

  // Select flight → go to step 1
  const handleSelectFlight = useCallback((flight, cls) => {
    // Ưu tiên pax từ flight object (đã nhúng lúc search), fallback về searchParams
    const pax = flight.pax || searchParams?.pax || { adult: 1, child: 0, infant: 0 };
    setSelectedFlight({ ...flight, selectedClass: cls, pax, search: searchParams });
    setStep(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [searchParams]);

  // Step 1 → 2
  const handlePassengerNext = useCallback((paxData) => {
    setPassengers(paxData);
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Step 2 → 3
  const handleServicesNext = useCallback((svcs) => {
    setSelectedSvcs(svcs);
    setStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Step 3 → Confirm booking
  const handlePayment = useCallback(async (paymentData) => {
    try {
      const contact = {
        name:  passengers[0]?.passenger_name || '',
        email: passengers[0]?.email || '',
        phone: passengers[0]?.phone || '',
      };

      const basePrice    = selectedFlight.selectedClass.price;
      const priceWithTax = Math.round(basePrice * 1.1); // giá vé đã bao gồm thuế 10%

      // Gom dịch vụ từ selectedSvcs thành list { name, price }
      const servicesList = [
        ...Object.entries(selectedSvcs?.baggage   || {}),
        ...Object.entries(selectedSvcs?.oversized || {}),
        ...Object.entries(selectedSvcs?.meal      || {}),
      ]
        .filter(([, price]) => price > 0)
        .map(([key, price]) => ({ name: key, price }));

      const res = await bookingService.create({
        flight_id:  selectedFlight.id,
        passengers: passengers.map((p) => ({
          passenger_name: p.passenger_name,
          passenger_type: p.passenger_type || 'adult',
          identity_card:  p.identity_card  || '',
          ticket_price:   priceWithTax,                        // ← có thuế 10%
          class:          selectedFlight.selectedClass.type || 'eco',
        })),
        services: servicesList,                                // ← truyền dịch vụ thật
        contact,
      });
      setBookingResult(res.data?.data);
      setStep(4);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error('Payment error:', err);
      const msg = err.response?.data?.message || err.message || 'Đặt vé thất bại, vui lòng thử lại';
      alert(msg);
    }
  }, [selectedFlight, passengers, selectedSvcs]);

  const handleReset = useCallback(() => {
    setStep(0); setFlights([]); setHasSearched(false);
    setSelectedFlight(null); setPassengers([]); setSelectedSvcs([]); setBookingResult(null);
  }, []);

  return (
    <div className="home-page">
      {step === 0 && (<>
        <FlightSearch airports={airports} onSearch={handleSearch} />

        {/* Flight results */}
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
                {flights.map((f) => (
                  <FlightCard key={f.id} flight={f} onSelect={handleSelectFlight} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Popular destinations */}
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
          {step === 2 && <Services flight={selectedFlight} onNext={handleServicesNext} onBack={() => setStep(1)} />}
          {step === 3 && <Payment flight={selectedFlight} passengers={passengers} services={selectedSvcs} onConfirm={handlePayment} onBack={() => setStep(2)} />}
        </div>
      )}

      {step === 4 && <Success booking={bookingResult} flight={selectedFlight} onReset={handleReset} />}
    </div>
  );
};

export default Home;