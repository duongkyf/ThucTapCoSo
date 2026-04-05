import React, { useState, useCallback } from 'react';
import '../../style/AuthModal.css';

const FIELDS = {
  login: [
    { key: 'email',           type: 'email',    label: 'Email',              placeholder: 'example@gmail.com' },
    { key: 'password',        type: 'password', label: 'Mật khẩu',           placeholder: '••••••••' },
  ],
  register: [
    { key: 'username',        type: 'text',     label: 'Họ và tên',          placeholder: 'Nguyễn Văn A' },
    { key: 'email',           type: 'email',    label: 'Email',              placeholder: 'example@gmail.com' },
    { key: 'phone_number',    type: 'tel',      label: 'Số điện thoại',      placeholder: '0912 345 678', required: false },
    { key: 'id_number',       type: 'text',     label: 'CCCD / Hộ chiếu',   placeholder: '012345678901', required: false },
    { key: 'password',        type: 'password', label: 'Mật khẩu',           placeholder: 'Tối thiểu 6 ký tự' },
    { key: 'confirmPassword', type: 'password', label: 'Xác nhận mật khẩu', placeholder: '••••••••' },
  ],
};

const INITIAL = { username: '', email: '', phone_number: '', id_number: '', password: '', confirmPassword: '' };

const AuthModal = ({ isOpen, onClose, mode, setMode, onLogin, onRegister, loading, error, onClearError }) => {
  const [form,     setForm]    = useState(INITIAL);
  const [localErr, setLocalErr] = useState('');

  const handleChange = useCallback((key, value) => {
    onClearError?.(); setLocalErr('');
    setForm((p) => ({ ...p, [key]: value }));
  }, [onClearError]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault(); setLocalErr('');
    if (mode === 'register') {
      if (!form.username.trim()) { setLocalErr('Vui lòng nhập họ và tên!'); return; }
      if (form.password !== form.confirmPassword) { setLocalErr('Mật khẩu xác nhận không khớp!'); return; }
      const res = await onRegister(form.username, form.email, form.password, form.phone_number, form.id_number);
      if (res?.success) { setForm(INITIAL); setLocalErr(''); onClose(); }
    } else {
      const res = await onLogin(form.email, form.password);
      if (res?.success) { setForm(INITIAL); setLocalErr(''); onClose(); }
    }
  }, [form, mode, onLogin, onRegister, onClose]);

  const switchMode = useCallback((next) => {
    setMode(next); setForm(INITIAL); onClearError?.(); setLocalErr('');
  }, [setMode, onClearError]);

  if (!isOpen) return null;
  const isLogin = mode === 'login';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="auth-card" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>&times;</button>

        <div className="auth-header">
          <div className="auth-icon"><i className="fas fa-plane-departure" /></div>
          <h2>{isLogin ? 'Đăng Nhập' : 'Tạo Tài Khoản'}</h2>
          <p>{isLogin ? 'Chào mừng bạn quay trở lại!' : 'Tham gia cùng SkyBooker ngay hôm nay.'}</p>
        </div>

        {(localErr || error) && (
          <div className="auth-error">
            <i className="fas fa-exclamation-circle" /> {localErr || error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {FIELDS[mode].map(({ key, type, label, placeholder, required: req }) => (
            <div className="auth-field" key={key}>
              <label>{label}{req === false && <span style={{ color: '#94a3b8', fontSize: 11, marginLeft: 4 }}>(tùy chọn)</span>}</label>
              <input
                type={type}
                placeholder={placeholder}
                value={form[key]}
                onChange={(e) => handleChange(key, e.target.value)}
                required={req !== false}
                disabled={loading}
              />
            </div>
          ))}
          <button type="submit" className="btn-primary auth-submit" disabled={loading}>
            {loading
              ? <><i className="fas fa-spinner fa-spin" /> Đang xử lý...</>
              : isLogin
                ? <><i className="fas fa-sign-in-alt" /> Đăng Nhập</>
                : <><i className="fas fa-user-plus" /> Đăng Ký</>
            }
          </button>
        </form>

        <div className="auth-switch">
          {isLogin ? (<>
            Chưa có tài khoản?{' '}
            <strong onClick={() => switchMode('register')}>Đăng ký ngay</strong>
          </>) : (<>
            Đã có tài khoản?{' '}
            <strong onClick={() => switchMode('login')}>Đăng nhập tại đây</strong>
          </>)}
        </div>
      </div>
    </div>
  );
};

export default AuthModal;