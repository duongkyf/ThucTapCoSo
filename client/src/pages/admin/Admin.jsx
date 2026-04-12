import React, { useState, useCallback } from 'react';
import AdminOverview  from './AdminOverview';
import AdminFlights   from './AdminFlights';
import AdminPlanes    from './AdminPlanes';
import AdminOrders    from './AdminOrders';
import AdminServices  from './AdminServices';
import AdminAirports  from './AdminAirports';
import AdminCustomers from './AdminCustomers';
import AdminAirlines  from './AdminAirlines';
import '../../style/Admin.css';

// ─── Nav config ───────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { tab: 'overview',   icon: 'fa-list',            label: 'Tổng quan'       },
  { tab: 'flights',    icon: 'fa-route',           label: 'Chuyến bay'      },
  { tab: 'planes',     icon: 'fa-plane',           label: 'Máy bay'         },
  { tab: 'airlines',   icon: 'fa-building',        label: 'Hãng hàng không' },
  { tab: 'orders',     icon: 'fa-ticket-alt',      label: 'Đặt vé'          },
  { tab: 'services',   icon: 'fa-utensils',        label: 'Dịch vụ'         },
  { tab: 'airports',   icon: 'fa-map-marker-alt',  label: 'Sân bay'         },
  { tab: 'customers',  icon: 'fa-users',           label: 'Tài khoản KH'    },
];

const renderPanel = (tab) => {
  switch (tab) {
    case 'overview':  return <AdminOverview />;
    case 'flights':   return <AdminFlights />;
    case 'planes':    return <AdminPlanes />;
    case 'airlines':  return <AdminAirlines />;
    case 'orders':    return <AdminOrders />;
    case 'services':  return <AdminServices />;
    case 'airports':  return <AdminAirports />;
    case 'customers': return <AdminCustomers />;
    default:          return <AdminOverview />;
  }
};

// ─── Component ────────────────────────────────────────────────────────────────
const Admin = ({ user, onLogout }) => {
  const [tab, setTab] = useState('overview');

  const handleLogout = useCallback(() => {
    onLogout?.();
  }, [onLogout]);

  return (
    <div className="admin-layout">

      {/* ── Sidebar ──────────────────────────────── */}
      <aside className="admin-sidebar">
        <div className="admin-brand" onClick={() => setTab('overview')}>
          <i className="fas fa-plane-departure" style={{ color: '#3b82f6' }} />
          SkyBooker
        </div>

        <div className="sidebar-label">ĐIỀU HƯỚNG</div>
        <nav className="admin-nav">
          {NAV_ITEMS.map(({ tab: t, icon, label }) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              <i className={`fas ${icon}`} /> {label}
            </button>
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        {/* ── User footer ──────────────────────── */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <img
              src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user?.username || 'Admin')}&background=0D8ABC&color=fff`}
              alt="Admin"
            />
            <div>
              <div className="sidebar-user-name">{user?.username || 'Quản trị viên'}</div>
              <div className="sidebar-user-email">{user?.email || 'admin@sky.com'}</div>
            </div>
          </div>
          <button className="btn-logout" onClick={handleLogout}>
            <i className="fas fa-sign-out-alt" /> Đăng xuất
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────── */}
      <main className="admin-main">
        <header className="admin-topbar">
          <h1 className="topbar-title">
            {NAV_ITEMS.find((n) => n.tab === tab)?.label || 'Tổng quan'}
          </h1>
          <span className="topbar-date">
            {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </header>
        <div className="admin-content-area">
          {renderPanel(tab)}
        </div>
      </main>

    </div>
  );
};

export default Admin;