import React, { useState, useMemo, useEffect } from 'react';
import { useAdminCrud, Badge, AdminTable, ActionBtns, AdminModal, SearchBar } from './AdminShared';
import { adminService } from '../../services/admin.service';

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

const HEADERS = ['MÃ CHUYẾN', 'HÃNG BAY', 'TUYẾN BAY', 'KHỞI HÀNH', 'ĐẾN', 'GIÁ VÉ', 'TRẠNG THÁI', 'HÀNH ĐỘNG'];

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

  // airport options: "HAN – Nội Bài (Hà Nội)"
  const airportOptions = airports.map(a => ({
    value: a.airport_id,
    label: `${a.airport_id} – ${a.name} (${a.city})`,
  }));

  const FIELDS = [
    { key: 'flight_code', label: 'Mã chuyến bay' },
    {
      key: 'airline_id', label: 'Hãng hàng không', type: 'select',
      options: airlines.map(a => ({ value: a.airline_id, label: a.airline_name })),
    },
    {
      key: 'aircraft_id', label: 'Máy bay', type: 'select',
      options: aircrafts.map(a => ({ value: a.aircraft_id, label: `${a.model_name} (ID: ${a.aircraft_id})` })),
    },
    {
      key: 'source_airport_id', label: 'Sân bay đi', type: 'select',
      options: airportOptions,
    },
    {
      key: 'destination_airport_id', label: 'Sân bay đến', type: 'select',
      options: airportOptions,
    },
    { key: 'departure_time', label: 'Giờ khởi hành', type: 'datetime-local' },
    { key: 'arrival_time',   label: 'Giờ đến',        type: 'datetime-local' },
    { key: 'base_price',     label: 'Giá cơ bản (VNĐ)', type: 'number' },
    {
      key: 'status', label: 'Trạng thái', type: 'select',
      options: ['On Time', 'Delayed', 'Cancelled'],
    },
  ];

  const { data, loading, modal, saving, apiError,
          openAdd, openEdit, closeModal, handleSave, handleDelete } =
    useAdminCrud(adminService.flights, adminService.flights.getAll, 'flight_id');

  const [query,         setQuery]         = useState('');
  const [filterStatus,  setFilterStatus]  = useState('');
  const [filterAirline, setFilterAirline] = useState('');

  // Build airline filter options dynamically from loaded airlines
  const filterAirlineOpts = useMemo(() => [
    { value: '', label: 'Tất cả hãng' },
    ...airlines.map(a => ({ value: a.airline_code, label: a.airline_name })),
  ], [airlines]);

  const filtered = useMemo(() =>
    data.filter((x) =>
      [x.flight_code, x.source_airport_id, x.destination_airport_id,
       x.origin_city, x.dest_city, x.airline_name].some(
        (v) => (v || '').toLowerCase().includes(query.toLowerCase())
      )
      && (!filterStatus  || x.status       === filterStatus)
      && (!filterAirline || x.airline_code === filterAirline)
    ), [data, query, filterStatus, filterAirline]);

  const fmtTime = (dt) => dt
    ? new Date(dt).toLocaleString('vi-VN', {
        hour: '2-digit', minute: '2-digit',
        day:  '2-digit', month: '2-digit',
      })
    : '—';

  return (
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
              <td>
                <span className="iata-tag">{x.flight_code}</span>
              </td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 6,
                    background: color, color: '#fff',
                    fontSize: 10, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>{code}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                      {x.airline_name || code || '—'}
                    </div>
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
              <td><Badge status={x.status} /></td>
              <ActionBtns
                onEdit={() => openEdit(x)}
                onDelete={() => handleDelete(x.flight_id)}
              />
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
  );
};

export default AdminFlights;