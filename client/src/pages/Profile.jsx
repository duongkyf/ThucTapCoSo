import React, { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/auth.service';
import '../style/Profile.css';

const TABS = [
  { id: 'personal', label: 'Thông tin cá nhân', icon: 'fas fa-user'       },
  { id: 'security', label: 'Bảo mật',           icon: 'fas fa-shield-alt' },
  { id: 'history',  label: 'Lịch sử đặt vé',    icon: 'fas fa-ticket-alt' },
];

const EMPTY_PWD = { current_password: '', new_password: '', confirmPassword: '' };

const strToColor = (str = '') => {
  const colors = ['#1a56db','#0ea5e9','#10b981','#f59e0b','#8b5cf6','#ef4444','#ec4899'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const getInitials = (name = '') => {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || 'U';
};

// ─── Personal Tab ──────────────────────────────────────────────
const PersonalTab = ({ user, setUser }) => {
  const [form, setForm] = useState({
    username:     user?.username     || '',
    phone_number: user?.phone_number || '',
    id_number:    user?.id_number    || '',
  });
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState('');

  const handleSave = useCallback(async () => {
    setSaving(true); setMsg('');
    try {
      await authService.updateProfile(form);
      const updated = { ...user, ...form };
      setUser(updated);
      localStorage.setItem('skybooker_user', JSON.stringify(updated));
      setMsg('success:Cập nhật thành công!');
      setEditing(false);
    } catch (err) {
      setMsg('error:' + (err.response?.data?.message || 'Lỗi cập nhật'));
    } finally { setSaving(false); }
  }, [form, user, setUser]);

  const msgType = msg.startsWith('success') ? 'success' : 'error';
  const msgText = msg.split(':').slice(1).join(':');

  return (
    <div className="tab-content">
      <div className="content-header">
        <h2>Thông tin cá nhân</h2>
        {!editing
          ? <button className="btn-edit-toggle" onClick={() => setEditing(true)}><i className="fas fa-edit" /> Chỉnh sửa</button>
          : <button className="btn-cancel-toggle" onClick={() => { setEditing(false); setMsg(''); }}>Hủy</button>
        }
      </div>

      {msg && <div className={`profile-msg ${msgType}`}><i className={`fas fa-${msgType === 'success' ? 'check-circle' : 'exclamation-circle'}`} /> {msgText}</div>}

      <div className="profile-form">
        <div className="form-row">
          <div className="form-group">
            <label>Họ và tên</label>
            <div className={`input-icon-wrap ${editing ? 'editable' : ''}`}>
              <i className="fas fa-user" />
              <input type="text" value={form.username} disabled={!editing}
                onChange={e => setForm(p => ({ ...p, username: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label>Email</label>
            <div className="input-icon-wrap">
              <i className="fas fa-envelope" />
              <input type="email" value={user?.email || ''} disabled />
            </div>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Số điện thoại</label>
            <div className={`input-icon-wrap ${editing ? 'editable' : ''}`}>
              <i className="fas fa-phone" />
              <input type="text" value={form.phone_number} placeholder="0912 345 678" disabled={!editing}
                onChange={e => setForm(p => ({ ...p, phone_number: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label>CCCD / Hộ chiếu</label>
            <div className={`input-icon-wrap ${editing ? 'editable' : ''}`}>
              <i className="fas fa-id-card" />
              <input type="text" value={form.id_number} placeholder="012345678901" disabled={!editing}
                onChange={e => setForm(p => ({ ...p, id_number: e.target.value }))} />
            </div>
          </div>
        </div>

        <div className="form-section-title">
          <i className="fas fa-info-circle" /> Thông tin tài khoản
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Ngày tạo tài khoản</label>
            <div className="input-icon-wrap">
              <i className="fas fa-calendar-alt" />
              <input type="text"
                value={user?.created_at ? new Date(user.created_at).toLocaleDateString('vi-VN') : ''}
                disabled />
            </div>
          </div>
          <div className="form-group" />
        </div>

        {editing && (
          <button className="btn-save-profile" onClick={handleSave} disabled={saving}>
            {saving ? <><i className="fas fa-spinner fa-spin" /> Đang lưu...</> : <><i className="fas fa-save" /> Lưu thay đổi</>}
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Security Tab ──────────────────────────────────────────────
const SecurityTab = ({ onLogout }) => {
  const navigate = useNavigate();
  const [form, setForm]     = useState(EMPTY_PWD);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState('');

  const handleSave = useCallback(async () => {
    if (form.new_password !== form.confirmPassword) { setMsg('error:Mật khẩu xác nhận không khớp'); return; }
    if (form.new_password.length < 6)               { setMsg('error:Mật khẩu mới phải có ít nhất 6 ký tự'); return; }
    setSaving(true); setMsg('');
    try {
      await authService.changePassword(form.current_password, form.new_password);
      setMsg('success:Đổi mật khẩu thành công!');
      setForm(EMPTY_PWD);
    } catch (err) {
      setMsg('error:' + (err.response?.data?.message || 'Lỗi đổi mật khẩu'));
    } finally { setSaving(false); }
  }, [form]);

  const msgType = msg.startsWith('success') ? 'success' : 'error';
  const msgText = msg.split(':').slice(1).join(':');

  return (
    <div className="tab-content">
      <div className="content-header"><h2>Đổi mật khẩu</h2></div>
      {msg && <div className={`profile-msg ${msgType}`}><i className={`fas fa-${msgType === 'success' ? 'check-circle' : 'exclamation-circle'}`} /> {msgText}</div>}
      <div className="profile-form">
        {[
          { key: 'current_password', label: 'Mật khẩu hiện tại',     icon: 'fa-lock' },
          { key: 'new_password',     label: 'Mật khẩu mới',          icon: 'fa-key' },
          { key: 'confirmPassword',  label: 'Xác nhận mật khẩu mới', icon: 'fa-check-circle' },
        ].map(({ key, label, icon }) => (
          <div className="form-group" key={key} style={{ marginBottom: 20 }}>
            <label>{label}</label>
            <div className="input-icon-wrap editable">
              <i className={`fas ${icon}`} />
              <input type="password" value={form[key]}
                onChange={e => { setMsg(''); setForm(p => ({ ...p, [key]: e.target.value })); }} />
            </div>
          </div>
        ))}
        <button className="btn-save-profile" onClick={handleSave} disabled={saving}>
          {saving ? <><i className="fas fa-spinner fa-spin" /> Đang lưu...</> : <><i className="fas fa-lock" /> Đổi mật khẩu</>}
        </button>
        <div className="security-actions">
          <div className="security-action-title">Hoạt động tài khoản</div>
          <button className="security-action-btn history" onClick={() => navigate('/history')}>
            <div className="security-action-icon"><i className="fas fa-ticket-alt" /></div>
            <div className="security-action-info">
              <span>Lịch sử đặt vé</span>
              <small>Xem tất cả chuyến bay đã đặt</small>
            </div>
            <i className="fas fa-chevron-right arrow" />
          </button>
          <button className="security-action-btn logout" onClick={onLogout}>
            <div className="security-action-icon"><i className="fas fa-sign-out-alt" /></div>
            <div className="security-action-info">
              <span>Đăng xuất</span>
              <small>Thoát khỏi tài khoản này</small>
            </div>
            <i className="fas fa-chevron-right arrow" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Profile Main ──────────────────────────────────────────────
const Profile = ({ user, setUser, onLogout }) => {
  const navigate   = useNavigate();
  const [tab, setTab]         = useState('personal');
  const [avatarSrc, setAvatarSrc] = useState(user?.photoURL || null);
  const fileInputRef = useRef(null);

  const name     = user?.username || '';
  const initials = getInitials(name);
  const avatarBg = strToColor(name);

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target.result;
      setAvatarSrc(src);
      // Persist to localStorage (UI-only, no backend upload)
      const updated = { ...user, photoURL: src };
      setUser(updated);
      localStorage.setItem('skybooker_user', JSON.stringify(updated));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="profile-page">
      <div className="profile-container">
        <aside className="profile-sidebar">
          {/* Avatar */}
          <div className="profile-avatar-wrap">
            <div className="avatar-edit-container" onClick={() => fileInputRef.current?.click()}>
              {avatarSrc
                ? <img src={avatarSrc} alt={name} className="sidebar-avatar-img" />
                : <div className="sidebar-avatar-initials" style={{ background: avatarBg }}>{initials}</div>
              }
              <div className="avatar-edit-overlay">
                <i className="fas fa-camera" />
                <span>Đổi ảnh</span>
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*"
              style={{ display: 'none' }} onChange={handleAvatarChange} />
            <h3>{name}</h3>
            <p>{user?.email}</p>
          </div>

          {/* Nav */}
          <nav className="profile-nav">
            {TABS.map(({ id, label, icon }) => (
              <button key={id}
                className={`profile-nav-item ${tab === id ? 'active' : ''}`}
                onClick={() => { if (id === 'history') { navigate('/history'); } else setTab(id); }}
              >
                <i className={icon} /> {label}
              </button>
            ))}
          </nav>

          {/* Logout button in sidebar */}
          <div className="sidebar-logout-wrap">
            <button className="sidebar-logout-btn" onClick={onLogout}>
              <i className="fas fa-sign-out-alt" /> Đăng xuất
            </button>
          </div>
        </aside>

        <main className="profile-main">
          {tab === 'personal' && <PersonalTab user={user} setUser={setUser} />}
          {tab === 'security' && <SecurityTab onLogout={onLogout} />}
        </main>
      </div>
    </div>
  );
};

export default Profile;