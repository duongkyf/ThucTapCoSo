import React, { memo } from 'react';
import { Link } from 'react-router-dom';
import '../style/Footer.css';

// ─── Static data ──────────────────────────────────────────────────────────────
const ABOUT_LINKS = [
  'Giới thiệu SkyBooker',
  'Tuyển dụng',
  'Chính sách bảo mật',
  'Điều khoản sử dụng',
];

const SUPPORT_LINKS = [
  'Câu hỏi thường gặp (FAQ)',
  'Hướng dẫn đặt vé',
  'Quy định hành lý',
  'Chính sách hoàn/hủy vé',
];

const SOCIAL_ICONS = [
  { icon: 'fab fa-facebook', label: 'Facebook' },
  { icon: 'fab fa-instagram', label: 'Instagram' },
  { icon: 'fab fa-youtube', label: 'YouTube' },
];

const CURRENT_YEAR = new Date().getFullYear();

// ─── Main Component ───────────────────────────────────────────────────────────
const Footer = memo(() => (
  <footer className="site-footer">
    <div className="footer-container">
      <div className="footer-col">
        <h3>
          <i className="fas fa-plane-departure" style={{ color: 'var(--primary)' }} /> SkyBooker
        </h3>
        <p>
          Đồng hành cùng bạn trên mọi chuyến bay. Trải nghiệm dịch vụ đặt vé máy bay
          trực tuyến nhanh chóng, an toàn và tiện lợi nhất cùng chúng tôi.
        </p>
      </div>

      <div className="footer-col">
        <h4>Về chúng tôi</h4>
        <ul>
          {ABOUT_LINKS.map((text) => (
            <li key={text}><Link to="#">{text}</Link></li>
          ))}
        </ul>
      </div>

      <div className="footer-col">
        <h4>Hỗ trợ khách hàng</h4>
        <ul>
          {SUPPORT_LINKS.map((text) => (
            <li key={text}><Link to="#">{text}</Link></li>
          ))}
        </ul>
      </div>

      <div className="footer-col">
        <h4>Liên hệ</h4>
        <ul>
          <li><i className="fas fa-phone-alt" /> Hotline: 1900 1234</li>
          <li><i className="fas fa-envelope" /> support@skybooker.vn</li>
          <li><i className="fas fa-map-marker-alt" /> Tầng 10, Tòa nhà ABC, Q.1, TP.HCM</li>
        </ul>
        <div style={{ marginTop: '20px', display: 'flex', gap: '15px', fontSize: '20px' }}>
          {SOCIAL_ICONS.map(({ icon, label }) => (
            <Link key={label} to="#" style={{ color: 'white' }} aria-label={label}>
              <i className={icon} />
            </Link>
          ))}
        </div>
      </div>
    </div>

    <div className="footer-bottom">
      <p>&copy; {CURRENT_YEAR} SkyBooker. Nền tảng đặt vé máy bay hàng đầu.</p>
    </div>
  </footer>
));

Footer.displayName = 'Footer';

export default Footer;