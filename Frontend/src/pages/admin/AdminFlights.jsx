import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAdminCrud, Badge, AdminTable, ActionBtns, AdminModal } from './AdminShared';
import { adminService } from '../../services/admin.service';

const removeVietnameseTones = (str) => {
  if (!str) return '';
  return str
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
};

const FILTER_STATUS = [
  { value: '',          label: 'Tất cả'   },
  { value: 'On Time',   label: 'Đúng giờ' },
  { value: 'Delayed',   label: 'Trễ'      },
  { value: 'Cancelled', label: 'Hủy'      },
];

const AIRLINE_COLORS = {
  VN: '#003087', VJ: '#e8192c', QH: '#1b5e20', BL: '#1565c0',
  SQ: '#0a3161', TG: '#6d1a80', MH: '#003087', CX: '#006564',
  KE: '#00256c', NH: '#13448f',
};

const HEADERS = ['MÃ CHUYẾN', 'HÃNG BAY', 'TUYẾN BAY', 'KHỞI HÀNH', 'ĐẾN', 'GIÁ VÉ', 'LOẠI', 'TRẠNG THÁI', 'HÀNH ĐỘNG'];

// ─── FlightChart ──────────────────────────────────────────────
const FlightChart = ({ data }) => {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  const chartData = useMemo(() => {
    const toKey = (d) =>
      `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

    const today       = new Date();
    const windowStart = new Date(today); windowStart.setDate(today.getDate() - 14);
    const windowEnd   = new Date(today); windowEnd.setDate(today.getDate() + 15);
    windowStart.setHours(0,0,0,0);
    windowEnd.setHours(23,59,59,999);

    const counts = {};
    for (let d = new Date(windowStart); d <= windowEnd; d.setDate(d.getDate() + 1)) {
      counts[toKey(new Date(d))] = 0;
    }

    data.forEach(x => {
      if (!x.departure_time) return;
      const dep = new Date(x.departure_time);
      if (x.is_recurring) {
        const start = dep > windowStart ? dep : windowStart;
        for (let d = new Date(start); d <= windowEnd; d.setDate(d.getDate() + 1)) {
          const key = toKey(new Date(d));
          if (key in counts) counts[key]++;
        }
      } else {
        const key = toKey(dep);
        if (key in counts) counts[key]++;
      }
    });

    const sorted   = Object.keys(counts).sort();
    const todayKey = toKey(today);
    const labels   = sorted.map(k => {
      const [, m, d] = k.split('-');
      return k === todayKey ? `${d}/${m} ▪` : `${d}/${m}`;
    });
    const values = sorted.map(k => counts[k]);
    return { labels, values, todayIndex: sorted.indexOf(todayKey) };
  }, [data]);

  const stats = useMemo(() => {
    const v = chartData.values;
    if (!v.length) return { windowTotal: 0, recurring: 0, avg: 0, max: 0 };
    return {
      windowTotal: v.reduce((s, x) => s + x, 0),
      recurring:   data.filter(x => x.is_recurring).length,
      avg:         Math.round(v.reduce((s, x) => s + x, 0) / v.length),
      max:         Math.max(...v),
    };
  }, [chartData, data]);

  // Vẽ chart khi chartData thay đổi
  useEffect(() => {
    if (!canvasRef.current || typeof window.Chart === 'undefined') return;
    if (chartRef.current) chartRef.current.destroy();

    const isDark      = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const lineColor   = isDark ? '#60a5fa' : '#3b82f6';
    const todayColor  = '#f59e0b';

    chartRef.current = new window.Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: chartData.labels,
        datasets: [{
          label: 'Số chuyến bay',
          data: chartData.values,
          backgroundColor: chartData.labels.map((_, i) =>
            i === chartData.todayIndex ? todayColor + 'cc' : lineColor + '99'
          ),
          borderColor: chartData.labels.map((_, i) =>
            i === chartData.todayIndex ? todayColor : lineColor
          ),
          borderWidth: 1.5, borderRadius: 5, borderSkipped: false,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => `Ngày ${items[0].label}`,
              label: (item)  => `  ${item.raw} chuyến bay`,
            },
            backgroundColor: isDark ? '#1e293b' : '#fff',
            titleColor:      isDark ? '#f1f5f9' : '#1e293b',
            bodyColor:       isDark ? '#94a3b8' : '#475569',
            borderColor:     isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
            borderWidth: 1, padding: 10, cornerRadius: 8,
          },
        },
        scales: {
          x: {
            ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { size: 11 }, maxRotation: 45, autoSkip: chartData.labels.length > 15 },
            grid: { display: false }, border: { display: false },
          },
          y: {
            beginAtZero: true,
            ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { size: 11 }, stepSize: 1, precision: 0 },
            grid: { color: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
            border: { display: false },
          },
        },
      },
    });

    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [chartData]);

  // Load Chart.js một lần
  useEffect(() => {
    if (window.Chart) return;
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
    script.onload = () => {
      if (canvasRef.current) canvasRef.current.dispatchEvent(new Event('chartjs-ready'));
    };
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = () => { if (chartRef.current) chartRef.current.destroy(); };
    canvas.addEventListener('chartjs-ready', handler);
    return () => canvas.removeEventListener('chartjs-ready', handler);
  }, [chartData]);

  return (
    <div className="panel-card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, padding: 10, fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
            Số chuyến bay theo ngày
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8' }}>
            {chartData.labels.length} ngày gần nhất
          </p>
        </div>
        {/* Mini stats */}
        <div style={{ display: 'flex', gap: 20, paddingRight: 16 }}>
          {[
            { label: 'Trong cửa sổ', value: stats.windowTotal, color: '#3b82f6' },
            { label: 'Bay hàng ngày', value: stats.recurring,   color: '#f59e0b' },
            { label: 'Trung bình/ngày', value: stats.avg,       color: '#10b981' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ height: 180 }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────
const AdminFlights = () => {
  const [airlines,  setAirlines]  = useState([]);
  const [aircrafts, setAircrafts] = useState([]);
  const [airports,  setAirports]  = useState([]);

  useEffect(() => {
    adminService.airlines.getAll()
      .then(res => setAirlines(res.data?.data || []))
      .catch(() => {});
    adminService.aircrafts.getAll()
      .then(res => setAircrafts(res.data?.data || []))
      .catch(() => {});
    adminService.airports.getAll()
      .then(res => setAirports(res.data?.data || []))
      .catch(() => {});
  }, []);

  const airportOptions = airports.map(a => ({
    value: a.airport_id,
    label: `${a.airport_id} – ${a.name} (${a.city})`,
  }));

  const FIELDS = useMemo(() => [
    {
      key: 'airline_id', label: 'Hãng hàng không', type: 'combobox',
      placeholder: 'Nhập hoặc chọn hãng bay...',
      options: airlines.map(a => ({ value: a.airline_id, label: a.airline_name })),
    },
    {
      key: 'aircraft_id', label: 'Máy bay', type: 'select',
      dependsOn: 'airline_id',
      options: (selectedAirlineId) => {
        const byAirline = aircrafts.filter(a => String(a.airline_id) === String(selectedAirlineId));
        if (!byAirline.length) return [{ value: '', label: '— Không có máy bay —' }];
        return byAirline.map(a => ({
          value: a.aircraft_id,
          label: `${a.model_name} (${a.manufacturer ?? ''})`,
        }));
      },
    },
    {
      key: 'source_airport_id', label: 'Sân bay đi', type: 'combobox',
      placeholder: 'Nhập mã hoặc tên sân bay...',
      options: airportOptions,
    },
    {
      key: 'destination_airport_id', label: 'Sân bay đến', type: 'combobox',
      placeholder: 'Nhập mã hoặc tên sân bay...',
      options: airportOptions,
    },
    { key: 'departure_time', label: 'Giờ khởi hành', type: 'datetime-split' },
    { key: 'arrival_time',   label: 'Giờ đến',        type: 'datetime-split' },
    { key: 'base_price',     label: 'Giá cơ bản (VNĐ)', type: 'number' },
    {
      key: 'status', label: 'Trạng thái', type: 'select',
      options: ['On Time', 'Delayed', 'Cancelled'],
    },
    {
      key: 'is_recurring', label: 'Lịch bay', type: 'select',
      options: [
        { value: 0, label: 'Một lần (không lặp)' },
        { value: 1, label: 'Hàng ngày (recurring)' },
      ],
    },
  ], [airlines, aircrafts, airportOptions]);

  const { data, loading, modal, saving, apiError,
          openAdd, openEdit, closeModal, handleSave, handleDelete } =
    useAdminCrud(adminService.flights, adminService.flights.getAll, 'flight_id');

  const [query,         setQuery]         = useState('');
  const [filterStatus,  setFilterStatus]  = useState('');
  const [filterAirline, setFilterAirline] = useState('');

  const filterAirlineOpts = useMemo(() => [
    { value: '', label: 'Tất cả hãng' },
    ...airlines.map(a => ({ value: a.airline_code, label: a.airline_name })),
  ], [airlines]);

  const filtered = useMemo(() => {
    const normalizedQuery = removeVietnameseTones(query).toLowerCase();
    return data.filter((x) =>
      [x.flight_code, x.source_airport_id, x.destination_airport_id,
       x.origin_city, x.dest_city, x.airline_name].some(
        (v) => removeVietnameseTones(v || '').toLowerCase().includes(normalizedQuery)
      )
      && (!filterStatus  || x.status       === filterStatus)
      && (!filterAirline || x.airline_code === filterAirline)
    );
  }, [data, query, filterStatus, filterAirline]);

  const fmtTime = (dt) => dt
    ? new Date(dt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
    : '—';

  return (
    <div>
      {/* Biểu đồ thống kê (toàn bộ data, không lọc) */}
      <FlightChart data={data} />

      {/* Bảng danh sách */}
      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h2>Quản lý Chuyến bay</h2>
            <p className="panel-subtitle">{filtered.length} / {data.length} chuyến bay</p>
          </div>
        </div>

        <div className="panel-toolbar">
          <div className="toolbar-left">
            <div className="search-input-wrap">
              <i className="fas fa-search" />
              <input value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Tìm mã chuyến, sân bay, hãng bay..." />
              {query && (
                <button className="clear-search" onClick={() => setQuery('')}>
                  <i className="fas fa-times" />
                </button>
              )}
            </div>
            <select className="filter-select" value={filterAirline} onChange={e => setFilterAirline(e.target.value)}>
              {filterAirlineOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className="filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              {FILTER_STATUS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button className="btn-primary" onClick={openAdd}>
            <i className="fas fa-plus" /> Thêm chuyến bay
          </button>
        </div>

        <AdminTable loading={loading} headers={HEADERS}
          rows={filtered.map((x) => {
            const code  = x.airline_code || '';
            const color = AIRLINE_COLORS[code] || '#475569';
            return (
              <tr key={x.flight_id}>
                <td><span className="iata-tag">{x.flight_code}</span></td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 6, background: color, color: '#fff',
                      fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>{code}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{x.airline_name || code || '—'}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{x.model_name}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="iata-tag" style={{ fontSize: 11 }}>{x.source_airport_id}</span>
                    <i className="fas fa-long-arrow-alt-right" style={{ color: '#94a3b8', fontSize: 12 }} />
                    <span className="iata-tag" style={{ fontSize: 11 }}>{x.destination_airport_id}</span>
                  </div>
                  <div className="cell-meta">{x.origin_city} → {x.dest_city}</div>
                </td>
                <td><div style={{ fontWeight: 600, fontSize: 13 }}>{fmtTime(x.departure_time)}</div></td>
                <td><div style={{ fontWeight: 600, fontSize: 13 }}>{fmtTime(x.arrival_time)}</div></td>
                <td className="text-blue">
                  <strong>{Number(x.base_price).toLocaleString('vi-VN')} ₫</strong>
                </td>
                <td>
                  {x.is_recurring
                    ? <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a',
                        borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                      }}>
                        <i className="fas fa-sync-alt" style={{ fontSize: 9 }} /> Hàng ngày
                      </span>
                    : <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0',
                        borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                      }}>
                        <i className="fas fa-circle" style={{ fontSize: 6 }} /> Một lần
                      </span>
                  }
                </td>
                <td><Badge status={x.status} /></td>
                <ActionBtns onEdit={() => openEdit(x)} onDelete={() => handleDelete(x.flight_id)} />
              </tr>
            );
          })}
        />

        <AdminModal
          isOpen={modal.isOpen} item={modal.item} fields={FIELDS}
          title={modal.item ? 'Sửa chuyến bay' : 'Thêm chuyến bay mới'}
          onClose={closeModal} onSave={handleSave} saving={saving} apiError={apiError}
        />
      </div>
    </div>
  );
};

export default AdminFlights;