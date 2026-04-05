import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../style/Header.css';

const NAV_LINKS = [
  { to: '/',        label: 'Đặt vé'   },
  { to: '/history', label: 'Lịch sử'  },
  { to: '/checkin', label: 'Check-in' },
];

// Tạo màu từ tên (consistent per username)
const strToColor = (str = '') => {
  const colors = ['#1a56db','#0ea5e9','#10b981','#f59e0b','#8b5cf6','#ef4444','#ec4899'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

// Lấy chữ viết tắt từ username
const getInitials = (name = '') => {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || 'U';
};

const Avatar = ({ user, size = 36 }) => {
  const name     = user?.username || '';
  const initials = getInitials(name);
  const bg       = strToColor(name);

  if (user?.photoURL) {
    return <img src={user.photoURL} className="user-avatar" alt={name} style={{ width: size, height: size }} />;
  }

  return (
    <div
      className="user-avatar-initials"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
};

const Header = ({ user, onOpenAuth, onLogout }) => {
  const [open, setOpen] = useState(false);
  const ref             = useRef(null);
  const navigate        = useNavigate();

  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  useEffect(() => { if (!user) setOpen(false); }, [user]);

  const handleClick  = useCallback(() => { user ? setOpen(v => !v) : onOpenAuth('login'); }, [user, onOpenAuth]);
  const handleLogout = useCallback(() => { setOpen(false); onLogout(); }, [onLogout]);

  return (
    <header>
      <div className="logo" onClick={() => navigate('/')} role="button" tabIndex={0}>
        <i className="fas fa-plane-departure" /> SkyBooker
      </div>

      <nav className="nav-links">
        {NAV_LINKS.map(({ to, label }) => <Link key={to} to={to}>{label}</Link>)}
      </nav>

      <div className="user-info-container" ref={ref}>
        <div className="user-info" onClick={handleClick}>
          {user ? (
            <>
              <Avatar user={user} size={34} />
              <span className="user-name-text">{user.username}</span>
            </>
          ) : (
            <>
              <div className="user-avatar-initials guest" style={{ width: 34, height: 34, fontSize: 13 }}>
                <i className="fas fa-user" />
              </div>
              <span className="user-name-text">Tài khoản</span>
            </>
          )}
          <i className={`fas fa-chevron-down icon-arrow ${open ? 'rotated' : ''}`} />
        </div>

        {user && open && (
          <div className="user-dropdown show">
            <div className="dropdown-header">
              <div className="dropdown-avatar-wrap">
                <Avatar user={user} size={44} />
                <div className="dropdown-user-info">
                  <strong>{user.username}</strong>
                  <small>{user.email}</small>
                </div>
              </div>
            </div>
            <Link to="/profile" className="dropdown-item" onClick={() => setOpen(false)}>
              <i className="fas fa-user-circle" /> Hồ sơ của tôi
            </Link>
            <Link to="/history" className="dropdown-item" onClick={() => setOpen(false)}>
              <i className="fas fa-ticket-alt" /> Lịch sử đặt vé
            </Link>
            <div className="dropdown-divider" />
            <button className="dropdown-item btn-logout-drop" onClick={handleLogout}>
              <i className="fas fa-sign-out-alt" /> Đăng xuất
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;