import React, { useEffect, useState } from 'react';
import { adminService } from '../../services/admin.service';

// ─── Helpers ──────────────────────────────────────────────────
const fmtMoney = (n) => {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)         return (n / 1_000).toFixed(0) + 'K';
  return n > 0 ? n.toString() : '0';
};

const dayLabel = (dateStr) => {
  const d   = new Date(dateStr);
  const dow = d.getDay();
  const dd  = String(d.getDate()).padStart(2, '0');
  const mm  = d.getMonth() + 1;
  return {
    dow:  dow === 0 ? 'CN' : `T${dow + 1}`,
    date: `${dd}/${mm}`,
  };
};

const fallback7Days = () => Array.from({ length: 7 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - 6 + i);
  return { date: d.toISOString().split('T')[0], revenue: 0 };
});

const buildEmptyMonths = (year) =>
  Array.from({ length: 12 }, (_, i) => ({
    month:   `${year}-${String(i + 1).padStart(2, '0')}`,
    revenue: 0,
  }));

// ─── Chuẩn hoá mảng daily từ nhiều format API khác nhau ──

const normalizeDaily = (raw) => {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw.map((item) => {
    const date    = item.date ?? item.day ?? item.created_at ?? '';
    const revenue = Number(item.revenue ?? item.total ?? item.amount ?? 0);
    return { date: String(date).slice(0, 10), revenue };
  }).filter(item => item.date);
};

// ─── Biểu đồ cột 7 ngày ──────────────────────────────────────
const RevenueChart = ({ data, barColor }) => {
  const hasData = data.some(d => d.revenue > 0);
  const max     = Math.max(...data.map(d => d.revenue), 1);

  if (!hasData) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 8, padding: '32px 0', color: '#94a3b8',
      }}>
        <i className="fas fa-chart-bar" style={{ fontSize: 32, opacity: 0.4 }} />
        <span style={{ fontSize: 13 }}>Chưa có dữ liệu doanh thu</span>
      </div>
    );
  }

  return (
    <div className="css-bar-chart">
      {data.map((item, i) => {
        const isToday = i === data.length - 1;
        const heightPct = item.revenue > 0
          ? Math.max((item.revenue / max) * 100, 6)
          : 6;
        return (
          <div className="css-bar-wrap" key={item.date}
            title={`${item.date}: ${Number(item.revenue).toLocaleString('vi-VN')} ₫`}>
            <span className="css-bar-value">{fmtMoney(item.revenue)}</span>
            <div className="css-bar" style={{
              height:     `${heightPct}%`,
              background: isToday ? (barColor || '#3b82f6') : undefined,
              opacity:    item.revenue === 0 ? 0.5 : 1,
            }} />
            <span className="css-bar-label" style={{
              fontWeight: isToday ? 700 : 400,
              display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2,
            }}>
              <span style={{ fontSize: '0.7em', opacity: 0.6 }}>{dayLabel(item.date).dow}</span>
              <span>{dayLabel(item.date).date}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ─── Biểu đồ cột tháng ───────────────────────────────────────
const MonthlyRevenueChart = ({ data, year, onYearChange, barColor }) => {
  const hasData      = data.some(d => d.revenue > 0);
  const max          = Math.max(...data.map(d => d.revenue), 1);
  const currentMonth = new Date().getMonth() + 1;
  const currentYear  = new Date().getFullYear();

  return (
    <div className="chart-card monthly-chart-card">
      <div className="monthly-chart-header">
        <div>
          <h3>Doanh thu theo tháng</h3>
          <p>
            Tổng năm {year}:{' '}
            <strong style={{ color: '#10b981' }}>
              {data.reduce((s, d) => s + d.revenue, 0).toLocaleString('vi-VN')} ₫
            </strong>
          </p>
        </div>
        <div className="year-selector">
          <button className="year-btn" onClick={() => onYearChange(year - 1)}>
            <i className="fas fa-chevron-left" />
          </button>
          <span className="year-label">{year}</span>
          <button className="year-btn" onClick={() => onYearChange(year + 1)} disabled={year >= currentYear}>
            <i className="fas fa-chevron-right" />
          </button>
        </div>
      </div>

      {!hasData ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 8, padding: '40px 0', color: '#94a3b8',
        }}>
          <i className="fas fa-chart-bar" style={{ fontSize: 32, opacity: 0.4 }} />
          <span style={{ fontSize: 13 }}>Chưa có dữ liệu cho năm {year}</span>
        </div>
      ) : (
        <div className="css-bar-chart monthly-bar-chart">
          {data.map((item) => {
            const monthNum    = parseInt(item.month.split('-')[1], 10);
            const isThisMonth = year === currentYear && monthNum === currentMonth;
            const pct = item.revenue > 0
              ? Math.max((item.revenue / max) * 100, 6)
              : 6;
            const activeColor = barColor || '#3b82f6';

            return (
              <div className="css-bar-wrap" key={item.month}
                title={`Tháng ${monthNum}/${year}: ${Number(item.revenue).toLocaleString('vi-VN')} ₫`}>
                <span className="css-bar-value">{fmtMoney(item.revenue)}</span>
                <div className="css-bar monthly-bar" style={{
                  height:     `${pct}%`,
                  background: isThisMonth ? activeColor : '#10b981',
                  opacity:   item.revenue === 0 ? 0.5 : 1,
                }} />
                <span className="css-bar-label" style={{
                  fontWeight: isThisMonth ? 700 : 400,
                  color:      isThisMonth ? activeColor : undefined,
                }}>
                  {`Th.${monthNum}`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="monthly-legend">
        <span><span className="legend-dot" style={{ background: barColor || '#3b82f6' }} /> Tháng hiện tại</span>
        <span><span className="legend-dot" style={{ background: '#10b981' }} /> Các tháng khác</span>
      </div>
    </div>
  );
};

// ─── Donut chart ─────────────────────────────────────────────
const DonutChart = ({ total, success, pending, canceled }) => {
  const p1      = total ? (success / total) * 100 : 0;
  const p2      = total ? ((success + pending) / total) * 100 : 0;
  const donutBg = `conic-gradient(#10b981 0% ${p1}%, #f59e0b ${p1}% ${p2}%, #ef4444 ${p2}% 100%)`;
  return (
    <div className="donut-chart-bg" style={{ background: donutBg }}>
      <div className="donut-center"><h2>{total}</h2><span>Tổng vé</span></div>
    </div>
  );
};

// ─── Shortcut card ────────────────────────────────────────────
const ShortcutCard = ({ icon, label, color, tab, onNavigate }) => (
  <div
    onClick={() => onNavigate(tab)}
    style={{
      flex: '1 1 160px', padding: '14px 18px', borderRadius: 10,
      background: '#1e293b', borderLeft: `4px solid ${color}`,
      display: 'flex', alignItems: 'center', gap: 10,
      cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s',
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 4px 16px ${color}33`; }}
    onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
  >
    <i className={`fas ${icon}`} style={{ color, fontSize: 18 }} />
    <span style={{ color: '#f1f5f9', fontSize: 14, fontWeight: 500 }}>{label}</span>
    <i className="fas fa-arrow-right" style={{ color: '#475569', fontSize: 11, marginLeft: 'auto' }} />
  </div>
);

// ─── SUPER_ADMIN full dashboard ───────────────────────────────
const SuperAdminDashboard = ({ stats, daily, dailyTotal, monthlyData, monthlyLoading, year, setYear, onNavigate }) => {
  const u         = stats?.users    || {};
  const b         = stats?.bookings || {};
  const revenue   = stats?.revenue?.total || 0;
  const { total = 0, success = 0, pending = 0, canceling = 0, canceled = 0 } = b;

  const SHORTCUTS = [
    { icon: 'fa-building',       label: 'Hãng hàng không', color: '#3b82f6', tab: 'airlines'  },
    { icon: 'fa-map-marker-alt', label: 'Sân bay',         color: '#10b981', tab: 'airports'  },
    { icon: 'fa-users',          label: 'Tài khoản KH',    color: '#8b5cf6', tab: 'customers' },
  ];

  return (<>
    {/* KPI Cards */}
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

    {/* Charts row 1 */}
    <div className="chart-grid">
      <div className="chart-card">
        <h3>Doanh thu 7 ngày gần nhất</h3>
        <p>Tổng kỳ này: <strong style={{ color: '#10b981' }}>{dailyTotal.toLocaleString('vi-VN')} ₫</strong> — cột xanh đậm là hôm nay</p>
        <RevenueChart data={daily} barColor="#3b82f6" />
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

    {/* Monthly chart */}
    <div style={{ position: 'relative' }}>
      {monthlyLoading && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(255,255,255,.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 12, zIndex: 10,
        }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: 24, color: '#3b82f6' }} />
        </div>
      )}
      <MonthlyRevenueChart data={monthlyData} year={year} onYearChange={setYear} barColor="#3b82f6" />
    </div>

    {/* Shortcuts */}
    <div className="chart-card" style={{ marginTop: 0 }}>
      <h3>Thao tác nhanh</h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>Nhấn để chuyển đến chức năng tương ứng</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {SHORTCUTS.map(s => <ShortcutCard key={s.tab} {...s} onNavigate={onNavigate} />)}
      </div>
    </div>
  </>);
};

// ─── AIRLINE_ADMIN full dashboard ─────────────────────────────
const AirlineAdminDashboard = ({ stats, daily, dailyTotal, monthlyData, monthlyLoading, year, setYear, onNavigate }) => {
  const b         = stats?.bookings || {};
  const revenue   = stats?.revenue?.total || 0;
  const { total = 0, success = 0, pending = 0, canceling = 0, canceled = 0 } = b;

  const SHORTCUTS = [
    { icon: 'fa-route',       label: 'Chuyến bay', color: '#3b82f6', tab: 'flights'  },
    { icon: 'fa-plane',       label: 'Máy bay',    color: '#10b981', tab: 'planes'   },
    { icon: 'fa-utensils',    label: 'Dịch vụ',    color: '#8b5cf6', tab: 'services' },
    { icon: 'fa-ticket-alt',  label: 'Đặt vé',     color: '#f59e0b', tab: 'orders'   },
  ];

  return (<>
    {/* KPI Cards */}
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
        <div className="kpi-title">Chờ hủy vé <i className="fas fa-ban text-red" /></div>
        <div className="kpi-value text-red">{canceling}</div>
        <div className="kpi-trend text-red">Yêu cầu đang chờ duyệt</div>
      </div>
    </div>

    {/* Charts row 1 */}
    <div className="chart-grid">
      <div className="chart-card">
        <h3>Doanh thu hãng — 7 ngày gần nhất</h3>
        <p>Tổng kỳ này: <strong style={{ color: '#10b981' }}>{dailyTotal.toLocaleString('vi-VN')} ₫</strong> — cột cam là hôm nay</p>
        <RevenueChart data={daily} barColor="#f59e0b" />
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

    {/* Monthly chart */}
    <div style={{ position: 'relative' }}>
      {monthlyLoading && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(255,255,255,.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 12, zIndex: 10,
        }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: 24, color: '#3b82f6' }} />
        </div>
      )}
      <MonthlyRevenueChart data={monthlyData} year={year} onYearChange={setYear} barColor="#3b82f6" />
    </div>

    {/* Shortcuts */}
    <div className="chart-card" style={{ marginTop: 0 }}>
      <h3>Thao tác nhanh</h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>Nhấn để chuyển đến chức năng tương ứng</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {SHORTCUTS.map(s => <ShortcutCard key={s.tab} {...s} onNavigate={onNavigate} />)}
      </div>
    </div>
  </>);
};

// ─── Root component ───────────────────────────────────────────
const AdminOverview = ({ onNavigate }) => {
  const [stats,          setStats]          = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [statsError,     setStatsError]     = useState(false); // FIX: track lỗi API
  const [monthlyData,    setMonthlyData]    = useState(buildEmptyMonths(new Date().getFullYear()));
  const [year,           setYear]           = useState(new Date().getFullYear());
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  const storedUser   = (() => { try { return JSON.parse(localStorage.getItem('skybooker_user')); } catch { return null; } })();
  const isSuperAdmin = storedUser?.role === 'SUPER_ADMIN';

  // Fetch stats tổng quan
  useEffect(() => {
    setStatsError(false);
    adminService.getStats()
      .then(res => {
        const raw = res.data?.data;
        if (raw?.revenue?.daily) {
          const normalizedDaily = normalizeDaily(raw.revenue.daily);
          if (normalizedDaily) raw.revenue.daily = normalizedDaily;
        }
        setStats(raw);
      })
      .catch(() => setStatsError(true))
      .finally(() => setLoading(false));
  }, []);

  // Fetch doanh thu theo tháng
  useEffect(() => {
    if (typeof adminService.getMonthlyRevenue !== 'function') {
      setMonthlyData(buildEmptyMonths(year));
      return;
    }
    setMonthlyLoading(true);
    adminService.getMonthlyRevenue(year)
      .then(res => {
        const raw = res.data?.data ?? [];
        const normalize = (entry) => {
          if (!entry || typeof entry !== 'object') return null;
          if ('month' in entry && 'revenue' in entry) return entry;
          if ('month' in entry && 'total'   in entry) return { month: entry.month, revenue: entry.total };
          return null;
        };
        const normalizedRaw = (Array.isArray(raw)
          ? raw
          : Object.entries(raw).map(([k, v]) => ({ month: k, revenue: typeof v === 'object' ? v.revenue ?? v.total ?? 0 : v }))
        ).map(normalize).filter(Boolean);

        const filled = buildEmptyMonths(year).map(slot => {
          const found = normalizedRaw.find(d => d.month === slot.month);
          return found ? { ...slot, revenue: Number(found.revenue) || 0 } : slot;
        });
        setMonthlyData(filled);
      })
      .catch(() => setMonthlyData(buildEmptyMonths(year)))
      .finally(() => setMonthlyLoading(false));
  }, [year, stats]);

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>
      <i className="fas fa-spinner fa-spin" style={{ fontSize: 32 }} />
      <p style={{ marginTop: 12 }}>Đang tải dữ liệu...</p>
    </div>
  );

  if (statsError) return (
    <div style={{ textAlign: 'center', padding: '80px', color: '#ef4444' }}>
      <i className="fas fa-exclamation-triangle" style={{ fontSize: 32 }} />
      <p style={{ marginTop: 12 }}>Không thể tải dữ liệu tổng quan. Vui lòng thử lại.</p>
      <button
        onClick={() => { setLoading(true); setStatsError(false); adminService.getStats().then(res => setStats(res.data?.data)).catch(() => setStatsError(true)).finally(() => setLoading(false)); }}
        style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer' }}
      >
        <i className="fas fa-redo" /> Thử lại
      </button>
    </div>
  );

  const daily      = stats?.revenue?.daily || fallback7Days();
  const dailyTotal = daily.reduce((s, d) => s + (d.revenue || 0), 0);
  const shared     = { stats, daily, dailyTotal, monthlyData, monthlyLoading, year, setYear, onNavigate };

  return isSuperAdmin
    ? <SuperAdminDashboard  {...shared} />
    : <AirlineAdminDashboard {...shared} />;
};

export default AdminOverview;