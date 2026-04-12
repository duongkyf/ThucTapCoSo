import { useState, useCallback, useEffect } from 'react';
import { authService } from '../services/auth.service';

const USER_KEY  = 'skybooker_user';
const TOKEN_KEY = 'skybooker_token';

const loadUser = () => {
  try {
    const saved = localStorage.getItem(USER_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
};

export const useAuth = () => {
  const [user,    setUser]    = useState(loadUser);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // ── Tự động refresh user từ server khi app khởi động ─────────
  // Đảm bảo dữ liệu (id_number, phone_number...) luôn mới nhất
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return; // chưa đăng nhập → bỏ qua

    authService.getMe()
      .then(({ data }) => {
        if (data?.success && data.user) {
          // Cập nhật state và localStorage với dữ liệu mới nhất từ server
          setUser(data.user);
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        }
      })
      .catch(() => {
        // Token hết hạn hoặc lỗi → đăng xuất
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(TOKEN_KEY);
        setUser(null);
      });
  }, []); // chỉ chạy 1 lần khi mount

  // Sync user to localStorage mỗi khi thay đổi
  useEffect(() => {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else {
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(TOKEN_KEY);
    }
  }, [user]);

  // ── Login ─────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    setLoading(true); setError('');
    try {
      const { data } = await authService.login(email, password);
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setUser(data.user);
      return { success: true, user: data.user };
    } catch (err) {
      const msg = err.response?.data?.message || 'Đăng nhập thất bại';
      setError(msg);
      return { success: false, message: msg };
    } finally { setLoading(false); }
  }, []);

  // ── Register ──────────────────────────────────────────────────
  const register = useCallback(async (username, email, password, phone_number, id_number) => {
    setLoading(true); setError('');
    try {
      const { data } = await authService.register(username, email, password, phone_number, id_number);
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setUser(data.user);
      return { success: true, user: data.user };
    } catch (err) {
      const msg = err.response?.data?.message || 'Đăng ký thất bại';
      setError(msg);
      return { success: false, message: msg };
    } finally { setLoading(false); }
  }, []);

  // ── Logout ────────────────────────────────────────────────────
  const logout = useCallback(() => {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const clearError = useCallback(() => setError(''), []);

  return { user, setUser, loading, error, clearError, login, register, logout };
};