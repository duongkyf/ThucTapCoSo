import React, { useState, useMemo, useEffect } from 'react';
import { useAdminCrud, Badge, AdminTable, ActionBtns, AdminModal, STATUS_LABEL } from './AdminShared';
import { adminService } from '../../services/admin.service';
import { useAuth } from '../../hooks/useAuth';

const removeVietnameseTones = (str) => {
  if (!str) return '';
  return str.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
};

const FILTER_STATUS = [
  { value: '',            label: 'Tất cả'          },
  { value: 'Active',      label: 'Đang hoạt động'  },
  { value: 'Maintenance', label: 'Bảo trì'         },
  { value: 'Inactive',    label: 'Ngừng hoạt động' },
];

const AIRLINE_COLORS = {
  VN: '#003087', VJ: '#e8192c', QH: '#1b5e20', BL: '#1565c0',
  SQ: '#0a3161', TG: '#6d1a80', MH: '#003087', CX: '#006564',
  KE: '#00256c', NH: '#13448f',
};

const MANUFACTURER_ICON = {
  'Airbus': { bg: '#00205b', label: 'AB' },
  'Boeing': { bg: '#1b4f8a', label: 'BO' },
};

const MANUFACTURER_OPTIONS = [
  { value: 'Airbus',     label: 'Airbus'     },
  { value: 'Boeing',     label: 'Boeing'     },
  { value: 'Embraer',    label: 'Embraer'    },
  { value: 'Bombardier', label: 'Bombardier' },
  { value: 'ATR',        label: 'ATR'        },
  { value: 'Comac',      label: 'Comac'      },
  { value: 'Sukhoi',     label: 'Sukhoi'     },
];

const HEADERS = ['MÁY BAY', 'HÃNG BAY', 'NHÀ SẢN XUẤT', 'SỐ GHẾ', 'TRẠNG THÁI', 'HÀNH ĐỘNG'];

const AdminPlanes = () => {
  const { isAirlineAdmin, airlineId } = useAuth();

  const [airlines, setAirlines] = useState([]);

  useEffect(() => {
    adminService.airlines.getAll()
      .then(res => setAirlines(res.data?.data || []))
      .catch(() => {});
  }, []);

  const FIELDS = useMemo(() => [
    ...(!isAirlineAdmin ? [{
      key: 'airline_id', label: 'Hãng hàng không', type: 'combobox',
      placeholder: 'Nhập hoặc chọn hãng bay...',
      options: airlines.map(a => ({ value: a.airline_id, label: a.airline_name })),
    }] : []),
    {
      key: 'model_name', label: 'Tên mẫu máy bay', required: true,
      validate: (v) => (!v || !String(v).trim()) ? 'Tên mẫu máy bay không được để trống' : null,
    },
    {
      key: 'manufacturer', label: 'Nhà sản xuất', type: 'combobox',
      placeholder: 'Nhập hoặc chọn nhà sản xuất...',
      options: MANUFACTURER_OPTIONS,
    },
    {
      key: 'total_seats', label: 'Số ghế', type: 'number', required: true,
      validate: (v) => {
        const n = parseInt(v, 10);
        if (v === '' || v === null || v === undefined) return 'Số ghế không được để trống';
        if (isNaN(n) || n <= 0) return 'Số ghế phải là số nguyên dương';
        return null;
      },
    },
    {
      key: 'status', label: 'Trạng thái', type: 'select',
      options: [
        { value: 'Active',      label: 'Đang hoạt động' },
        { value: 'Maintenance', label: 'Bảo trì'         },
        { value: 'Inactive',    label: 'Ngừng hoạt động' },
      ],
    },
  ], [airlines, isAirlineAdmin]);

  const { data, loading, modal, saving, apiError,
          openAdd, openEdit, closeModal, handleSave, handleDelete } =
    useAdminCrud(adminService.aircrafts, adminService.aircrafts.getAll, 'aircraft_id');

  // Pre-fill airline_id cho AIRLINE_ADMIN khi mở form thêm mới
  const handleOpenAdd = () => {
    openAdd(isAirlineAdmin && airlineId ? { airline_id: airlineId } : undefined);
  };

  const [localError, setLocalError] = useState('');
  const handleSaveValidated = (item) => {
    setLocalError('');
    if (!item.model_name || !String(item.model_name).trim())
      return setLocalError('Tên mẫu máy bay không được để trống');
    const seats = Number(item.total_seats);
    if (!item.total_seats || isNaN(seats) || seats <= 0)
      return setLocalError('Số ghế phải là số nguyên dương (lớn hơn 0)');
    handleSave({
      ...item,
      model_name:  String(item.model_name).trim(),
      total_seats: seats,
      airline_id:  item.airline_id ? Number(item.airline_id) : null,
    });
  };

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
      [x.model_name, x.manufacturer, x.airline_name, x.airline_code].some(
        (v) => removeVietnameseTones(v || '').toLowerCase().includes(normalizedQuery)
      )
      && (!filterStatus  || x.status       === filterStatus)
      && (!filterAirline || x.airline_code === filterAirline)
    );
  }, [data, query, filterStatus, filterAirline]);

  return (
    <div className="panel-card">
      <div className="panel-header">
        <div>
          <h2>Quản lý Máy bay</h2>
          <p className="panel-subtitle">{filtered.length} / {data.length} máy bay</p>
        </div>
      </div>

      <div className="panel-toolbar">
        <div className="toolbar-left">
          <div className="search-input-wrap">
            <i className="fas fa-search" />
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Tìm mẫu máy bay, hãng, nhà sản xuất..." />
            {query && (
              <button className="clear-search" onClick={() => setQuery('')}>
                <i className="fas fa-times" />
              </button>
            )}
          </div>
          {/* AIRLINE_ADMIN không cần filter hãng */}
          {!isAirlineAdmin && (
            <select className="filter-select" value={filterAirline} onChange={e => setFilterAirline(e.target.value)}>
              {filterAirlineOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          <select className="filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            {FILTER_STATUS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <button className="btn-primary" onClick={handleOpenAdd}>
          <i className="fas fa-plus" /> Thêm máy bay
        </button>
      </div>

      <AdminTable loading={loading} headers={HEADERS}
        rows={filtered.map((x) => {
          const airlineCode  = x.airline_code || '';
          const airlineColor = AIRLINE_COLORS[airlineCode] || '#475569';
          const mfr = MANUFACTURER_ICON[x.manufacturer]
            || { bg: '#475569', label: (x.manufacturer || '??').slice(0, 2).toUpperCase() };

          return (
            <tr key={x.aircraft_id}>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, background: mfr.bg, color: '#fff',
                    fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>{mfr.label}</div>
                  <div>
                    <div className="cell-primary">{x.model_name}</div>
                    <div className="cell-meta">ID #{x.aircraft_id}</div>
                  </div>
                </div>
              </td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 6, background: airlineColor, color: '#fff',
                    fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>{airlineCode}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{x.airline_name || airlineCode || '—'}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{airlineCode}</div>
                  </div>
                </div>
              </td>
              <td>
                <span className="type-tag">
                  <i className="fas fa-industry" style={{ marginRight: 5, fontSize: 11 }} />
                  {x.manufacturer}
                </span>
              </td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="fas fa-chair" style={{ color: '#94a3b8', fontSize: 12 }} />
                  <strong>{x.total_seats}</strong>
                  <span style={{ color: '#94a3b8', fontSize: 12 }}>ghế</span>
                </div>
              </td>
              <td><Badge status={x.status} label={STATUS_LABEL[x.status] || x.status} /></td>
              <ActionBtns onEdit={() => openEdit(x)} onDelete={() => handleDelete(x.aircraft_id)} />
            </tr>
          );
        })}
      />

      <AdminModal
        isOpen={modal.isOpen} item={modal.item} fields={FIELDS}
        title={modal.item ? 'Sửa máy bay' : 'Thêm máy bay mới'}
        onClose={() => { setLocalError(''); closeModal(); }}
        onSave={handleSaveValidated}
        saving={saving}
        apiError={localError || apiError}
      />
    </div>
  );
};

export default AdminPlanes;