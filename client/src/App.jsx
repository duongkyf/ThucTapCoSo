import React, { useState, useCallback, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Header         from './components/Header';
import Footer         from './components/Footer';
import AuthModal      from './components/auth/AuthModal';
import Home           from './pages/home/Home';
import BookingHistory from './pages/BookingHistory';
import Checkin        from './pages/Checkin';
import Profile        from './pages/Profile';
import AdminDashboard from './pages/admin/Admin';
import { useAuth }    from './hooks/useAuth';
import './App.css';

// ─── Route guards ─────────────────────────────────────────────
const AdminRoute   = ({ user, children }) =>
  user?.role === 'admin' ? children : <Navigate to="/" replace />;

const PrivateRoute = ({ user, children }) =>
  user ? children : <Navigate to="/" replace />;

// ─── App Content ──────────────────────────────────────────────
const AppContent = () => {
  const { user, setUser, loading, error, clearError, login, register, logout } = useAuth();
  const [authModal, setAuthModal] = useState({ open: false, mode: 'login' });
  const navigate = useNavigate();

  // Navigate dựa trên user role sau khi login/logout
  useEffect(() => {
    if (user?.role === 'admin') {
      navigate('/admin', { replace: true });
    }
  }, [user]);  // eslint-disable-line

  const openAuth  = useCallback((mode = 'login') => setAuthModal({ open: true, mode }), []);
  const closeAuth = useCallback(() => {
    setAuthModal((p) => ({ ...p, open: false }));
    clearError();
  }, [clearError]);

  const handleLogin = useCallback(async (email, password) => {
    const res = await login(email, password);
    if (res.success) closeAuth();
    return res;
  }, [login, closeAuth]);

  const handleRegister = useCallback(async (username, email, password, phone_number, id_number) => {
    const res = await register(username, email, password, phone_number, id_number);
    if (res.success) closeAuth();
    return res;
  }, [register, closeAuth]);

  const handleLogout = useCallback(() => {
    logout();
    navigate('/', { replace: true });
  }, [logout, navigate]);

  const isAdmin = user?.role === 'admin';

  return (
    <div className="app-wrapper">
      {!isAdmin && (
        <Header
          user={user}
          onOpenAuth={() => openAuth('login')}
          onLogout={handleLogout}
        />
      )}

      <main className="main-content">
        <Routes>
          <Route path="/"        element={<Home user={user} onOpenAuth={openAuth} />} />
          <Route path="/checkin" element={<Checkin />} />

          <Route path="/history" element={<BookingHistory user={user} onOpenAuth={openAuth} />} />
          <Route path="/profile" element={
            <PrivateRoute user={user}>
              <Profile user={user} setUser={setUser} onLogout={handleLogout} />
            </PrivateRoute>
          } />
          <Route path="/admin" element={
            <AdminRoute user={user}>
              <AdminDashboard user={user} onLogout={handleLogout} />
            </AdminRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {!isAdmin && <Footer />}

      <AuthModal
        isOpen={authModal.open}
        mode={authModal.mode}
        setMode={(mode) => setAuthModal((p) => ({ ...p, mode }))}
        onClose={closeAuth}
        onLogin={handleLogin}
        onRegister={handleRegister}
        loading={loading}
        error={error}
        onClearError={clearError}
      />
    </div>
  );
};

// ─── Root ─────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}