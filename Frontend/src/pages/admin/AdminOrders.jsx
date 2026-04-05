import React, { useState, useMemo } from 'react';
import { useFetch, Badge, AdminTable, SearchBar } from './AdminShared';
import { adminService } from '../../services/admin.service';

const FILTER_OPTS = [
  { value: '',           label: 'Tất cả'      },
  { value: 'Chờ xử lý', label: 'Chờ xử lý'  },
  { value: 'Chờ hủy',   label: 'Chờ hủy'    },
  { value: 'Đã hủy',    label: 'Đã hủy'      },
];

const HEADERS = ['MÃ ĐẶT VÉ', 'KHÁCH HÀNG', 'CHUYẾN BAY', 'NGÀY ĐẶT', 'TỔNG TIỀN', 'TRẠNG THÁI', 'HÀNH ĐỘNG'];

// ─── Detail Modal ────────────────────────────────────────────────
const DetailModal = ({ booking, onClose }) => (
  <div className="admin-modal-overlay" onClick={onClose}>
    <div className="admin-modal-box confirm-dialog-box" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
      <div className="confirm-dialog-header approve">
        <div className="confirm-dialog-icon"><i className="fas fa-ticket-alt" /></div>
        <div>
          <h3>Chi tiết đặt vé</h3>
          <p>Mã: <strong>{booking.booking_ref}</strong></p>
        </div>
        <button className="modal-close" onClick={onClose}><i className="fas fa-times" /></button>
      </div>
      <div className="confirm-dialog-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px' }}>
          {[
            { label: 'Hành khách',   value: booking.first_passenger || booking.username },
            { label: 'Email',         value: booking.email },
            { label: 'Chuyến bay',    value: booking.flight_code },
            { label: 'Tuyến',         value: `${booking.origin_city} → ${booking.dest_city}` },
            { label: 'Ngày đặt',      value: new Date(booking.booking_date).toLocaleDateString('vi-VN') },
            { label: 'Số hành khách', value: `${booking.total_passengers || 1} người` },
            { label: 'Tổng tiền',     value: Number(booking.total_amount).toLocaleString('vi-VN') + ' ₫' },
            { label: 'Trạng thái',    value: booking.status },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{value}</div>
            </div>
          ))}
        </div>
        {booking.cancel_reason && (
          <div style={{ marginTop: 16, padding: '12px 14px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Lý do yêu cầu hủy</div>
            <div style={{ fontSize: 14, color: '#c2410c' }}>{booking.cancel_reason}</div>
          </div>
        )}
      </div>
      <div className="confirm-dialog-footer">
        <button className="confirm-btn-cancel" onClick={onClose}><i className="fas fa-times" /> Đóng</button>
      </div>
    </div>
  </div>
);

// ─── Approve Cancel Modal ─────────────────────────────────────────
const ApproveCancelModal = ({ booking, onConfirm, onClose }) => (
  <div className="admin-modal-overlay" onClick={onClose}>
    <div className="admin-modal-box confirm-dialog-box" onClick={e => e.stopPropagation()}>
      <div className="confirm-dialog-header reject">
        <div className="confirm-dialog-icon"><i className="fas fa-check-circle" /></div>
        <div>
          <h3>Duyệt hủy vé</h3>
          <p>Mã đặt vé: <strong>{booking.booking_ref}</strong></p>
        </div>
        <button className="modal-close" onClick={onClose}><i className="fas fa-times" /></button>
      </div>
      <div className="confirm-dialog-body">
        {booking.cancel_reason && (
          <div style={{ padding: '10px 14px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Lý do khách hủy</div>
            <div style={{ fontSize: 14, color: '#c2410c' }}>{booking.cancel_reason}</div>
          </div>
        )}
        <div className="confirm-info reject">
          <i className="fas fa-exclamation-triangle" />
          <span>Xác nhận hủy vé này? Thao tác <strong>không thể hoàn tác</strong>.</span>
        </div>
      </div>
      <div className="confirm-dialog-footer">
        <button className="confirm-btn-cancel" onClick={onClose}><i className="fas fa-arrow-left" /> Quay lại</button>
        <button className="confirm-btn-submit reject" onClick={onConfirm}>
          <i className="fas fa-check" /> Duyệt hủy
        </button>
      </div>
    </div>
  </div>
);

// ─── Reject Cancel Modal ──────────────────────────────────────────
const RejectCancelModal = ({ booking, onConfirm, onClose }) => (
  <div className="admin-modal-overlay" onClick={onClose}>
    <div className="admin-modal-box confirm-dialog-box" onClick={e => e.stopPropagation()}>
      <div className="confirm-dialog-header approve">
        <div className="confirm-dialog-icon"><i className="fas fa-times-circle" /></div>
        <div>
          <h3>Từ chối hủy vé</h3>
          <p>Mã đặt vé: <strong>{booking.booking_ref}</strong></p>
        </div>
        <button className="modal-close" onClick={onClose}><i className="fas fa-times" /></button>
      </div>
      <div className="confirm-dialog-body">
        <div className="confirm-info approve">
          <i className="fas fa-info-circle" />
          <span>Từ chối yêu cầu hủy — vé sẽ quay lại trạng thái <strong>Chờ xử lý</strong>.</span>
        </div>
      </div>
      <div className="confirm-dialog-footer">
        <button className="confirm-btn-cancel" onClick={onClose}><i className="fas fa-arrow-left" /> Quay lại</button>
        <button className="confirm-btn-submit approve" onClick={onConfirm}>
          <i className="fas fa-ban" /> Từ chối hủy
        </button>
      </div>
    </div>
  </div>
);

// ─── Delete Modal ────────────────────────────────────────────────
const DeleteModal = ({ bookingRef, onConfirm, onClose }) => (
  <div className="admin-modal-overlay" onClick={onClose}>
    <div className="admin-modal-box confirm-dialog-box" onClick={e => e.stopPropagation()}>
      <div className="confirm-dialog-header reject">
        <div className="confirm-dialog-icon"><i className="fas fa-trash" /></div>
        <div>
          <h3>Xóa đặt vé</h3>
          <p>Mã đặt vé: <strong>{bookingRef}</strong></p>
        </div>
        <button className="modal-close" onClick={onClose}><i className="fas fa-times" /></button>
      </div>
      <div className="confirm-dialog-body">
        <div className="confirm-info reject">
          <i className="fas fa-exclamation-triangle" />
          <span>Thao tác này sẽ <strong>xóa vĩnh viễn</strong> đơn đặt vé và tất cả vé liên quan. Không thể hoàn tác.</span>
        </div>
      </div>
      <div className="confirm-dialog-footer">
        <button className="confirm-btn-cancel" onClick={onClose}><i className="fas fa-arrow-left" /> Quay lại</button>
        <button className="confirm-btn-submit reject" onClick={onConfirm}>
          <i className="fas fa-trash" /> Xóa vĩnh viễn
        </button>
      </div>
    </div>
  </div>
);

// ─── Main ────────────────────────────────────────────────────────
const AdminOrders = () => {
  const { data, loading, reload } = useFetch(adminService.bookings.getAll);
  const [query,  setQuery]  = useState('');
  const [filter, setFilter] = useState('');
  const [modal,  setModal]  = useState(null);

  const filtered = useMemo(() =>
    data.filter((x) =>
      [x.booking_ref, x.first_passenger, x.username, x.email, x.flight_code].some(
        (v) => (v || '').toLowerCase().includes(query.toLowerCase())
      ) && (!filter || x.status === filter)
    ), [data, query, filter]);

  const pendingCancelCount = data.filter(x => x.status === 'Chờ hủy').length;

  const handleApproveCancel = async () => {
    const { booking } = modal; setModal(null);
    try { await adminService.bookings.approveCancel(booking.booking_id); reload(); } catch {}
  };

  const handleRejectCancel = async () => {
    const { booking } = modal; setModal(null);
    try { await adminService.bookings.rejectCancel(booking.booking_id); reload(); } catch {}
  };

  const handleDelete = async () => {
    const { booking } = modal; setModal(null);
    try { await adminService.bookings.delete(booking.booking_id); reload(); } catch {}
  };

  return (
    <div className="panel-card">
      <div className="panel-header">
        <div>
          <h2>Quản lý Đơn đặt vé</h2>
          <p className="panel-subtitle">{filtered.length} / {data.length} đơn</p>
        </div>
        {pendingCancelCount > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#fff7ed', border: '1px solid #fed7aa',
            borderRadius: 10, padding: '8px 14px', fontSize: 13, color: '#c2410c', fontWeight: 600,
          }}>
            <i className="fas fa-hourglass-half" />
            {pendingCancelCount} yêu cầu hủy đang chờ duyệt
          </div>
        )}
      </div>

      <SearchBar query={query} onQuery={setQuery} placeholder="Tìm mã đặt vé, tên KH, chuyến bay..."
        filterVal={filter} filterOptions={FILTER_OPTS} onFilter={setFilter} />

      <AdminTable loading={loading} headers={HEADERS}
        rows={filtered.map((x) => (
          <tr key={x.booking_id} className={x.status === 'Chờ hủy' ? 'row-highlight-warning' : ''}>
            <td><strong className="text-blue">{x.booking_ref}</strong></td>
            <td>
              <div>
                <strong>{x.first_passenger || x.username}</strong>
                {x.total_passengers > 1 && (
                  <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>+{x.total_passengers - 1} người</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{x.email}</div>
            </td>
            <td>
              <strong>{x.flight_code}</strong>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{x.origin_city} → {x.dest_city}</div>
            </td>
            <td>{new Date(x.booking_date).toLocaleDateString('vi-VN')}</td>
            <td className="text-blue"><strong>{Number(x.total_amount).toLocaleString('vi-VN')} ₫</strong></td>
            <td>
              <Badge status={x.status} />
              {x.status === 'Chờ hủy' && x.cancel_reason && (
                <div style={{ fontSize: 11, color: '#c2410c', marginTop: 4, maxWidth: 140, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <i className="fas fa-comment-alt" style={{ marginRight: 4 }} />{x.cancel_reason}
                </div>
              )}
            </td>
            <td className="actions">
              <button className="btn-icon" style={{ color: '#3b82f6' }}
                onClick={() => setModal({ type: 'detail', booking: x })} title="Xem chi tiết">
                <i className="fas fa-eye" />
              </button>

              {/* Duyệt / từ chối hủy */}
              {x.status === 'Chờ hủy' && (<>
                <button className="btn-icon" style={{ color: '#f97316' }}
                  onClick={() => setModal({ type: 'approveCancel', booking: x })} title="Duyệt hủy">
                  <i className="fas fa-check-circle" />
                </button>
                <button className="btn-icon" style={{ color: '#6366f1' }}
                  onClick={() => setModal({ type: 'rejectCancel', booking: x })} title="Từ chối hủy">
                  <i className="fas fa-times-circle" />
                </button>
              </>)}

              <button className="btn-icon text-red"
                onClick={() => setModal({ type: 'delete', booking: x })} title="Xóa đơn">
                <i className="fas fa-trash-alt" />
              </button>
            </td>
          </tr>
        ))}
      />

      {modal?.type === 'detail'        && <DetailModal booking={modal.booking} onClose={() => setModal(null)} />}
      {modal?.type === 'approveCancel' && <ApproveCancelModal booking={modal.booking} onConfirm={handleApproveCancel} onClose={() => setModal(null)} />}
      {modal?.type === 'rejectCancel'  && <RejectCancelModal  booking={modal.booking} onConfirm={handleRejectCancel}  onClose={() => setModal(null)} />}
      {modal?.type === 'delete'        && <DeleteModal bookingRef={modal.booking.booking_ref} onConfirm={handleDelete} onClose={() => setModal(null)} />}
    </div>
  );
};

export default AdminOrders;