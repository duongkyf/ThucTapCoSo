import React, { useState, useMemo } from 'react';
import { useFetch, Badge, AdminTable, SearchBar } from './AdminShared';
import { adminService } from '../../services/admin.service';

const FILTER_OPTS = [
  { value: '',       label: 'Tất cả'         },
  { value: 'active', label: 'Đang hoạt động' },
  { value: 'banned', label: 'Đã khóa'        },
];

const HEADERS = ['KHÁCH HÀNG', 'EMAIL', 'SĐT', 'CCCD / HỘ CHIẾU', 'ĐẶT VÉ', 'CHI TIÊU', 'TRẠNG THÁI', 'HÀNH ĐỘNG'];

const strToColor = (str = '') => {
  const colors = ['#1a56db','#0ea5e9','#10b981','#f59e0b','#8b5cf6','#ef4444','#ec4899'];
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
};

const getInitials = (name = '') => {
  const p = name.trim().split(' ');
  return p.length >= 2 ? (p[0][0] + p[p.length-1][0]).toUpperCase() : name.slice(0,2).toUpperCase() || 'U';
};

// ─── Detail Modal ──────────────────────────────────────────────
const DetailModal = ({ user, onClose }) => {
  const bg       = strToColor(user.username);
  const initials = getInitials(user.username);
  const fmtMoney = (n) => Number(n).toLocaleString('vi-VN') + ' ₫';

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal-box confirm-dialog-box" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="confirm-dialog-header approve">
          <div className="confirm-dialog-icon" style={{ background: bg, borderRadius: '50%', fontSize: 18, fontWeight: 800 }}>
            {initials}
          </div>
          <div>
            <h3>{user.username}</h3>
            <p>ID #{user.user_id}</p>
          </div>
          <button className="modal-close" onClick={onClose}><i className="fas fa-times" /></button>
        </div>
        <div className="confirm-dialog-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' }}>
            {[
              { label: 'Email',             value: user.email           || '—' },
              { label: 'Số điện thoại',     value: user.phone_number    || '—' },
              { label: 'CCCD / Hộ chiếu',   value: user.id_number       || '—' },
              { label: 'Trạng thái',         value: user.status === 'banned' ? 'Đã khóa' : 'Hoạt động' },
              { label: 'Tổng đơn đặt vé',   value: `${user.total_bookings ?? 0} đơn` },
              { label: 'Tổng chi tiêu',      value: fmtMoney(user.total_spent ?? 0) },
              { label: 'Ngày tham gia',      value: user.created_at ? new Date(user.created_at).toLocaleDateString('vi-VN') : '—' },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="confirm-dialog-footer">
          <button className="confirm-btn-cancel" onClick={onClose}><i className="fas fa-times" /> Đóng</button>
        </div>
      </div>
    </div>
  );
};

// ─── Main ──────────────────────────────────────────────────────
const AdminCustomers = () => {
  const { data, loading, reload } = useFetch(adminService.customers.getAll);
  const [query,  setQuery]  = useState('');
  const [filter, setFilter] = useState('');
  const [detail, setDetail] = useState(null);

  const realUsers = useMemo(() =>
    data.filter((x) =>
      x.role !== 'guest' &&
      x.email !== 'guest@skybooker.vn' &&
      x.username !== 'Khách'
    ), [data]);

  const filtered = useMemo(() =>
    realUsers.filter((x) =>
      [x.username, x.email, x.phone_number, x.id_number].some(
        (v) => (v || '').toLowerCase().includes(query.toLowerCase())
      ) && (!filter || x.status === filter)
    ), [realUsers, query, filter]);

  const handleBan = async (id, isBanned) => {
    if (!window.confirm(`${isBanned ? 'Mở khóa' : 'Khóa'} tài khoản này?`)) return;
    try {
      if (isBanned) await adminService.customers.unban(id);
      else          await adminService.customers.ban(id);
      reload();
    } catch { alert('Lỗi thao tác'); }
  };

  const fmtMoney = (n) => Number(n).toLocaleString('vi-VN') + ' ₫';

  return (
    <div className="panel-card">
      <div className="panel-header">
        <div>
          <h2>Quản lý Khách hàng</h2>
          <p className="panel-subtitle">{filtered.length} / {realUsers.length} tài khoản</p>
        </div>
      </div>

      <SearchBar
        query={query} onQuery={setQuery}
        placeholder="Tìm tên, email, SĐT, CCCD..."
        filterVal={filter} filterOptions={FILTER_OPTS} onFilter={setFilter}
      />

      <AdminTable loading={loading} headers={HEADERS}
        rows={filtered.map((x) => {
          const isBanned = x.status === 'banned';
          const initials = getInitials(x.username);
          const bg       = strToColor(x.username);

          return (
            <tr key={x.user_id} className={isBanned ? 'row-banned' : ''}>
              <td>
                <div className="tbl-avatar-wrap">
                  <div className="tbl-avatar-initials" style={{ background: bg }}>{initials}</div>
                  <div>
                    <div className="cell-primary">{x.username}</div>
                    <div className="cell-meta">ID #{x.user_id}</div>
                  </div>
                </div>
              </td>
              <td><div style={{ fontSize: 13 }}>{x.email}</div></td>
              <td>
                {x.phone_number
                  ? <span style={{ fontWeight: 500 }}>{x.phone_number}</span>
                  : <span className="text-gray">—</span>}
              </td>
              <td>
                {x.id_number
                  ? <span className="type-tag"><i className="fas fa-id-card" style={{ marginRight: 5 }}/>{x.id_number}</span>
                  : <span className="text-gray">—</span>}
              </td>
              <td><span className="badge badge-info">{x.total_bookings ?? 0} đơn</span></td>
              <td><strong className="text-blue">{fmtMoney(x.total_spent ?? 0)}</strong></td>
              <td><Badge status={isBanned ? 'banned' : 'active'} /></td>
              <td className="actions">
                {/* Xem chi tiết */}
                <button className="btn-icon" style={{ color: '#3b82f6' }}
                  onClick={() => setDetail(x)} title="Xem chi tiết">
                  <i className="fas fa-eye" />
                </button>
                {/* Khóa / Mở khóa */}
                <button
                  className={`btn-icon ${isBanned ? 'text-green' : 'text-red'}`}
                  onClick={() => handleBan(x.user_id, isBanned)}
                  title={isBanned ? 'Mở khóa' : 'Khóa tài khoản'}>
                  <i className={`fas ${isBanned ? 'fa-unlock' : 'fa-ban'}`} />
                </button>
              </td>
            </tr>
          );
        })}
      />

      {detail && <DetailModal user={detail} onClose={() => setDetail(null)} />}
    </div>
  );
};

export default AdminCustomers;