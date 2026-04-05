import React, { useEffect, useState } from 'react';
import { adminService } from '../../services/admin.service';

const BAR_VALUES = [25, 45, 30, 70, 55, 85, 60];

const AdminOverview = () => {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminService.getStats()
      .then((res) => setStats(res.data?.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const b = stats?.bookings || {};
  const u = stats?.users    || {};
  const total   = b.total   || 0;
  const success = b.success || 0;
  const pending   = b.pending   || 0;
  const canceling = b.canceling || 0;
  const canceled= b.canceled|| 0;
  const revenue = stats?.revenue?.total || 0;

  const p1 = total ? (success / total) * 100 : 0;
  const p2 = total ? ((success + pending) / total) * 100 : 0;
  const donutBg = `conic-gradient(#10b981 0% ${p1}%, #f59e0b ${p1}% ${p2}%, #ef4444 ${p2}% 100%)`;

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>
      <i className="fas fa-spinner fa-spin" style={{ fontSize: 32 }} />
      <p style={{ marginTop: 12 }}>Đang tải dữ liệu...</p>
    </div>
  );

  return (<>
    <div className="kpi-grid kpi-4col">
      <div className="kpi-card">
        <div className="kpi-title">Tổng doanh thu <i className="fas fa-chart-line text-green"/></div>
        <div className="kpi-value">{Number(revenue).toLocaleString('vi-VN')} ₫</div>
        <div className="kpi-trend text-green">Từ các đặt vé thành công</div>
      </div>
      <div className="kpi-card">
        <div className="kpi-title">Số vé đã bán <i className="fas fa-ticket-alt text-blue"/></div>
        <div className="kpi-value">{total}</div>
        <div className="kpi-trend text-blue">{success} thành công</div>
      </div>
      <div className="kpi-card">
        <div className="kpi-title">Khách hàng <i className="fas fa-users text-purple"/></div>
        <div className="kpi-value">{u.active || 0}</div>
        <div className="kpi-trend text-purple">{u.total || 0} tổng tài khoản</div>
      </div>
      <div className="kpi-card alert">
        <div className="kpi-title">Chờ hủy vé <i className="fas fa-ban text-red"/></div>
        <div className="kpi-value text-red">{canceling}</div>
        <div className="kpi-trend text-red">Yêu cầu hủy chờ duyệt</div>
      </div>
    </div>

    <div className="chart-grid">
      <div className="chart-card">
        <h3>Biểu đồ doanh thu (7 ngày)</h3><p>Đơn vị: Triệu VND</p>
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
        <h3>Trạng thái vé</h3><p>Tỷ lệ theo thời gian thực</p>
        <div className="donut-chart-bg" style={{ background: donutBg }}>
          <div className="donut-center"><h2>{total}</h2><span>Tổng vé</span></div>
        </div>
        <div className="chart-legend">
          <span className="leg-success">{success} Thành công</span>
          <span className="leg-warning">{pending} Chờ</span>
          <span className="leg-danger">{canceled} Hủy</span>
        </div>
      </div>
    </div>
  </>);
};

export default AdminOverview;