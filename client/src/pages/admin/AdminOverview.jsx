import React, { useEffect, useState } from 'react';
import { adminService } from '../../services/admin.service';

const BAR_VALUES = [25, 45, 30, 70, 55, 85, 60];

// ── Donut chart dùng chung ────────────────────────────────────
const DonutChart = ({ total, success, pending, canceled }) => {
  const p1 = total ? (success / total) * 100 : 0;
  const p2 = total ? ((success + pending) / total) * 100 : 0;
  const bg  = `conic-gradient(#10b981 0% ${p1}%, #f59e0b ${p1}% ${p2}%, #ef4444 ${p2}% 100%)`;
  return (
    <div className="donut-chart-bg" style={{ background: bg }}>
      <div className="donut-center">
        <h2>{total}</h2>
        <span>Tổng vé</span>
      </div>
    </div>
  );
};

// ── Shortcut card có thể click ────────────────────────────────
const ShortcutCard = ({ icon, label, color, tab, onNavigate }) => (
  <div
    onClick={() => onNavigate(tab)}
    style={{
      flex: '1 1 160px', padding: '14px 18px', borderRadius: 10,
      background: '#1e293b', borderLeft: `4px solid ${color}`,
      display: 'flex', alignItems: 'center', gap: 10,
      cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s',
    }}
    onMouseEnter={e => {
      e.currentTarget.style.transform  = 'translateY(-2px)';
      e.currentTarget.style.boxShadow  = `0 4px 16px ${color}33`;
    }}
    onMouseLeave={e => {
      e.currentTarget.style.transform  = '';
      e.currentTarget.style.boxShadow  = '';
    }}
  >
    <i className={`fas ${icon}`} style={{ color, fontSize: 18 }} />
    <span style={{ color: '#f1f5f9', fontSize: 14, fontWeight: 500 }}>{label}</span>
    <i className="fas fa-arrow-right" style={{ color: '#475569', fontSize: 11, marginLeft: 'auto' }} />
  </div>
);

// ── Dashboard SUPER_ADMIN ─────────────────────────────────────
const SuperAdminOverview = ({ stats, onNavigate }) => {
  const u       = stats?.users    || {};
  const b       = stats?.bookings || {};
  const revenue = stats?.revenue?.total || 0;

  const total     = b.total     || 0;
  const success   = b.success   || 0;
  const pending   = b.pending   || 0;
  const canceling = b.canceling || 0;
  const canceled  = b.canceled  || 0;

  const SUPER_SHORTCUTS = [
    { icon: 'fa-building',       label: 'Hãng hàng không', color: '#3b82f6', tab: 'airlines'  },
    { icon: 'fa-map-marker-alt', label: 'Sân bay',         color: '#10b981', tab: 'airports'  },
    { icon: 'fa-users',          label: 'Tài khoản KH',    color: '#8b5cf6', tab: 'customers' },
  ];

  return (
    <>
      <div className="kpi-grid kpi-4col">
        <div className="kpi-card">
          <div className="kpi-title">Tổng doanh thu <i className="fas fa-chart-line text-green" /></div>
          <div className="kpi-value">{Number(revenue).toLocaleString('vi-VN')} ₫</div>
          <div className="kpi-trend text-green">Từ toàn bộ đặt vé thành công</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Khách hàng <i className="fas fa-users text-purple" /></div>
          <div className="kpi-value">{u.total || 0}</div>
          <div className="kpi-trend text-purple">{u.active || 0} tài khoản đang hoạt động</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Tổng đặt vé <i className="fas fa-ticket-alt text-blue" /></div>
          <div className="kpi-value">{total}</div>
          <div className="kpi-trend text-blue">{success} thành công</div>
        </div>
        <div className="kpi-card alert">
          <div className="kpi-title">Chờ hủy vé <i className="fas fa-ban text-red" /></div>
          <div className="kpi-value text-red">{canceling}</div>
          <div className="kpi-trend text-red">Yêu cầu đang chờ duyệt</div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <h3>Doanh thu hệ thống (7 ngày)</h3>
          <p>Đơn vị: Triệu VND</p>
          <div className="css-bar-chart">
            {BAR_VALUES.map((v, i) => (
              <div className="css-bar-wrap" key={i}>
                <span className="css-bar-value">{v}M</span>
                <div className="css-bar" style={{ height: `${v}%` }} />
                <span className="css-bar-label">T{i + 2}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="chart-card">
          <h3>Trạng thái đặt vé toàn hệ thống</h3>
          <p>Tỷ lệ theo thời gian thực</p>
          <DonutChart total={total} success={success} pending={pending} canceled={canceled} />
          <div className="chart-legend">
            <span className="leg-success">{success} Thành công</span>
            <span className="leg-warning">{pending} Chờ xử lý</span>
            <span className="leg-danger">{canceled} Đã hủy</span>
          </div>
        </div>
      </div>

      {/* ── Thao tác nhanh có thể click ── */}
      <div className="chart-card" style={{ marginTop: 0 }}>
        <h3>Thao tác nhanh</h3>
        <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>
          Nhấn để chuyển đến chức năng tương ứng
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {SUPER_SHORTCUTS.map(s => (
            <ShortcutCard key={s.tab} {...s} onNavigate={onNavigate} />
          ))}
        </div>
      </div>
    </>
  );
};

// ── Dashboard AIRLINE_ADMIN ───────────────────────────────────
const AirlineAdminOverview = ({ stats, onNavigate }) => {
  const b       = stats?.bookings || {};
  const revenue = stats?.revenue?.total || 0;

  const total   = b.total   || 0;
  const success = b.success || 0;
  const pending = b.pending || 0;
  const canceled= b.canceled|| 0;

  const AIRLINE_SHORTCUTS = [
    { icon: 'fa-route',      label: 'Chuyến bay', color: '#3b82f6', tab: 'flights'  },
    { icon: 'fa-plane',      label: 'Máy bay',    color: '#10b981', tab: 'planes'   },
    { icon: 'fa-utensils',   label: 'Dịch vụ',    color: '#8b5cf6', tab: 'services' },
    { icon: 'fa-ticket-alt', label: 'Đặt vé',     color: '#f59e0b', tab: 'orders'   },
  ];

  return (
    <>
      <div className="kpi-grid kpi-4col">
        <div className="kpi-card">
          <div className="kpi-title">Doanh thu hãng <i className="fas fa-chart-line text-green" /></div>
          <div className="kpi-value">{Number(revenue).toLocaleString('vi-VN')} ₫</div>
          <div className="kpi-trend text-green">Từ đặt vé thành công của hãng</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Tổng đặt vé <i className="fas fa-ticket-alt text-blue" /></div>
          <div className="kpi-value">{total}</div>
          <div className="kpi-trend text-blue">{success} thành công</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Chờ xử lý <i className="fas fa-clock text-yellow" /></div>
          <div className="kpi-value" style={{ color: '#f59e0b' }}>{pending}</div>
          <div className="kpi-trend" style={{ color: '#f59e0b' }}>Vé chờ xác nhận</div>
        </div>
        <div className="kpi-card alert">
          <div className="kpi-title">Đã hủy <i className="fas fa-ban text-red" /></div>
          <div className="kpi-value text-red">{canceled}</div>
          <div className="kpi-trend text-red">Vé đã hủy của hãng</div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <h3>Doanh thu hãng (7 ngày)</h3>
          <p>Đơn vị: Triệu VND</p>
          <div className="css-bar-chart">
            {BAR_VALUES.map((v, i) => (
              <div className="css-bar-wrap" key={i}>
                <span className="css-bar-value">{v}M</span>
                <div className="css-bar" style={{ height: `${v}%`, background: '#f59e0b' }} />
                <span className="css-bar-label">T{i + 2}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="chart-card">
          <h3>Trạng thái đặt vé của hãng</h3>
          <p>Tỷ lệ theo thời gian thực</p>
          <DonutChart total={total} success={success} pending={pending} canceled={canceled} />
          <div className="chart-legend">
            <span className="leg-success">{success} Thành công</span>
            <span className="leg-warning">{pending} Chờ xử lý</span>
            <span className="leg-danger">{canceled} Đã hủy</span>
          </div>
        </div>
      </div>

      {/* ── Thao tác nhanh có thể click ── */}
      <div className="chart-card" style={{ marginTop: 0 }}>
        <h3>Thao tác nhanh</h3>
        <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>
          Nhấn để chuyển đến chức năng tương ứng
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {AIRLINE_SHORTCUTS.map(s => (
            <ShortcutCard key={s.tab} {...s} onNavigate={onNavigate} />
          ))}
        </div>
      </div>
    </>
  );
};

// ── Root component ────────────────────────────────────────────
const AdminOverview = ({ onNavigate }) => {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  const storedUser = (() => {
    try { return JSON.parse(localStorage.getItem('skybooker_user')); }
    catch { return null; }
  })();
  const isSuperAdmin = storedUser?.role === 'SUPER_ADMIN';

  useEffect(() => {
    adminService.getStats()
      .then(res => setStats(res.data?.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>
      <i className="fas fa-spinner fa-spin" style={{ fontSize: 32 }} />
      <p style={{ marginTop: 12 }}>Đang tải dữ liệu...</p>
    </div>
  );

  return isSuperAdmin
    ? <SuperAdminOverview  stats={stats} onNavigate={onNavigate} />
    : <AirlineAdminOverview stats={stats} onNavigate={onNavigate} />;
};

export default AdminOverview;