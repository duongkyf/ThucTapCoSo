import React, { useState, useEffect, useCallback } from 'react';
import { bookingService } from '../services/booking.service';
import '../style/BookingHistory.css';

const formatMoney = (amount) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

const STATUS_CLASS = {
  'Thành công': 'success',
  'Chờ xử lý': 'pending',
  'Đã hủy':    'cancelled',
  'Chờ hủy':   'cancelling',  
};

// ─── CancelModal ──────────────────────────────────────────────
const CancelModal = ({ bookingRef, onConfirm, onClose }) => {
  const [reason, setReason] = useState('');
  const [err,    setErr]    = useState('');

  const handleSubmit = () => {
    if (!reason.trim()) { setErr('Vui lòng nhập lý do hủy vé.'); return; }
    onConfirm(reason.trim());
  };

  return (
    <div className="bh-modal-overlay" onClick={onClose}>
      <div className="bh-modal-box" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bh-modal-header">
          <div className="bh-modal-icon">
            <i className="fas fa-ban" />
          </div>
          <div>
            <h3>Gửi yêu cầu hủy vé</h3>
            <p>Mã đặt chỗ: <strong>{bookingRef}</strong></p>
          </div>
          <button className="bh-modal-close" onClick={onClose}>
            <i className="fas fa-times" />
          </button>
        </div>

        {/* Body */}
        <div className="bh-modal-body">
          <div className="bh-modal-warning">
            <i className="fas fa-info-circle" />
            <span>Yêu cầu của bạn sẽ được gửi đến quản trị viên để xem xét. Vé sẽ không bị hủy ngay lập tức.</span>
          </div>

          <div className="bh-modal-field">
            <label>Lý do hủy vé <span className="required">*</span></label>
            <textarea
              className={err ? 'has-error' : ''}
              rows={4}
              placeholder="VD: Thay đổi kế hoạch, có việc đột xuất, lịch bay không phù hợp..."
              value={reason}
              onChange={(e) => { setReason(e.target.value); setErr(''); }}
            />
            {err && (
              <span className="bh-modal-err">
                <i className="fas fa-exclamation-circle" /> {err}
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bh-modal-footer">
          <button className="bh-btn-back" onClick={onClose}>
            <i className="fas fa-arrow-left" /> Quay lại
          </button>
          <button className="bh-btn-submit" onClick={handleSubmit}>
            <i className="fas fa-paper-plane" /> Gửi yêu cầu
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── BookingCard ──────────────────────────────────────────────
const BookingCard = ({ booking, onRequestCancel }) => {
  const statusType = STATUS_CLASS[booking.status] || 'pending';
  const canCancel  = booking.status === 'Chờ xử lý';
  const isCancelling = booking.status === 'Chờ hủy';

  return (
    <div className={`booking-history-card${isCancelling ? ' cancelling' : ''}`}>
      <div className="bh-header">
        <div className="bh-pnr">MÃ ĐẶT CHỖ: <strong>{booking.booking_ref}</strong></div>
        <div className={`bh-status badge-${statusType}`}>{booking.status}</div>
      </div>

      <div className="bh-body">
        <div className="bh-route">
          <div className="bh-point">
            <div className="bh-iata">{booking.origin_iata}</div>
            <div className="bh-city">{booking.origin_city}</div>
          </div>
          <div className="bh-arrow">
            <i className="fas fa-plane" />
            <span>{booking.flight_code}</span>
          </div>
          <div className="bh-point">
            <div className="bh-iata">{booking.dest_iata}</div>
            <div className="bh-city">{booking.dest_city}</div>
          </div>
        </div>

        <div className="bh-meta">
          <div className="bh-meta-item">
            <i className="fas fa-calendar-alt" />
            <span>{new Date(booking.departure_time).toLocaleString('vi-VN')}</span>
          </div>
          <div className="bh-meta-item">
            <i className="fas fa-users" />
            <span>{booking.passenger_count} hành khách</span>
          </div>
          <div className="bh-meta-item">
            <i className="fas fa-receipt" />
            <span>Đặt ngày {new Date(booking.booking_date).toLocaleDateString('vi-VN')}</span>
          </div>
        </div>

        {/* Thông báo khi đang chờ hủy */}
        {isCancelling && (
          <div className="bh-cancelling-notice">
            <i className="fas fa-hourglass-half" />
            <span>Yêu cầu hủy đang chờ quản trị viên xem xét.</span>
          </div>
        )}
      </div>

      <div className="bh-footer">
        <div className="bh-total">
          Tổng cộng: <strong>{formatMoney(booking.total_amount)}</strong>
        </div>
        {canCancel && (
          <button className="btn-cancel-booking" onClick={() => onRequestCancel(booking)}>
            <i className="fas fa-times-circle" /> Hủy vé
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────
const BookingHistory = ({ user, onOpenAuth }) => {
  const [bookings,       setBookings]       = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');
  const [cancelTarget,   setCancelTarget]   = useState(null);

  useEffect(() => {
    if (!user) { setLoading(false); }
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await bookingService.getAll();
      setBookings(res.data?.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải lịch sử đặt vé');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  
  const handleConfirmCancel = useCallback(async (reason) => {
    const booking = cancelTarget;
    setCancelTarget(null);
    try {
      await bookingService.requestCancel(booking.booking_id, reason);
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể gửi yêu cầu hủy vé');
    }
  }, [cancelTarget, load]);

  // ── Render states ─────────────────────────────────────────
  if (!user) return (
    <div className="history-page">
      <div className="bh-empty-state">
        <i className="fas fa-lock" />
        <h3>Vui lòng đăng nhập</h3>
        <p>Đăng nhập để xem lịch sử đặt vé của bạn</p>
        <button className="bh-btn-login" onClick={() => onOpenAuth?.('login')}>
          <i className="fas fa-sign-in-alt" /> Đăng nhập ngay
        </button>
      </div>
    </div>
  );

  if (loading) return (
    <div className="history-page">
      <div className="bh-empty-state">
        <i className="fas fa-spinner fa-spin" style={{ color: '#94a3b8' }} />
        <p style={{ color: '#94a3b8' }}>Đang tải lịch sử...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="history-page">
      <div className="bh-empty-state">
        <i className="fas fa-exclamation-circle" style={{ color: '#ef4444' }} />
        <p style={{ color: '#ef4444' }}>{error}</p>
      </div>
    </div>
  );

  return (
    <div className="history-page">
      <div className="history-header">
        <h1><i className="fas fa-history" /> Lịch sử đặt vé</h1>
        <p>{bookings.length} chuyến bay</p>
      </div>

      {bookings.length === 0 ? (
        <div className="no-bookings">
          <i className="fas fa-ticket-alt" style={{ fontSize: 48, color: '#cbd5e1' }} />
          <h3>Chưa có đặt vé nào</h3>
          <p>Hãy tìm và đặt chuyến bay đầu tiên của bạn!</p>
        </div>
      ) : (
        <div className="bookings-list">
          {bookings.map((b) => (
            <BookingCard
              key={b.booking_id}
              booking={b}
              onRequestCancel={setCancelTarget}
            />
          ))}
        </div>
      )}

      {/* Modal hủy vé */}
      {cancelTarget && (
        <CancelModal
          bookingRef={cancelTarget.booking_ref}
          onConfirm={handleConfirmCancel}
          onClose={() => setCancelTarget(null)}
        />
      )}
    </div>
  );
};

export default BookingHistory;