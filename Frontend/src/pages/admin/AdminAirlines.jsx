import React, { useState, useMemo } from 'react';
import { useAdminCrud, Badge, AdminTable, ActionBtns, AdminModal, SearchBar } from './AdminShared';
import { adminService } from '../../services/admin.service';

// Danh sách quốc gia phổ biến trong hàng không châu Á & quốc tế
const COUNTRY_OPTIONS = [
  { value: 'Việt Nam',        label: '🇻🇳 Việt Nam'        },
  { value: 'Singapore',       label: '🇸🇬 Singapore'       },
  { value: 'Thái Lan',        label: '🇹🇭 Thái Lan'        },
  { value: 'Malaysia',        label: '🇲🇾 Malaysia'        },
  { value: 'Nhật Bản',        label: '🇯🇵 Nhật Bản'        },
  { value: 'Hàn Quốc',        label: '🇰🇷 Hàn Quốc'        },
  { value: 'Trung Quốc',      label: '🇨🇳 Trung Quốc'      },
  { value: 'Hồng Kông',       label: '🇭🇰 Hồng Kông'       },
  { value: 'Đài Loan',        label: '🇹🇼 Đài Loan'        },
  { value: 'Indonesia',       label: '🇮🇩 Indonesia'       },
  { value: 'Philippines',     label: '🇵🇭 Philippines'     },
  { value: 'Ấn Độ',           label: '🇮🇳 Ấn Độ'           },
  { value: 'Úc',              label: '🇦🇺 Úc'              },
  { value: 'Anh',             label: '🇬🇧 Anh'             },
  { value: 'Pháp',            label: '🇫🇷 Pháp'            },
  { value: 'Đức',             label: '🇩🇪 Đức'             },
  { value: 'Mỹ',              label: '🇺🇸 Mỹ'              },
  { value: 'Canada',          label: '🇨🇦 Canada'          },
  { value: 'UAE',             label: '🇦🇪 UAE'             },
  { value: 'Qatar',           label: '🇶🇦 Qatar'           },
  { value: 'Thổ Nhĩ Kỳ',     label: '🇹🇷 Thổ Nhĩ Kỳ'     },
];

const FIELDS = [
  { key: 'airline_code', label: 'Mã IATA (2 ký tự)' },
  { key: 'airline_name', label: 'Tên hãng hàng không' },
  {
    key: 'country', label: 'Quốc gia', type: 'select',
    options: COUNTRY_OPTIONS,
  },
  { key: 'logo_url', label: 'URL Logo' },
  {
    key: 'status', label: 'Trạng thái', type: 'select',
    options: ['active', 'inactive'],
  },
];

const FILTER_OPTS = [
  { value: '',         label: 'Tất cả'  },
  { value: 'active',   label: 'Active'  },
  { value: 'inactive', label: 'Inactive'},
];

const AIRLINE_COLORS = {
  VN: '#003087', VJ: '#e8192c', QH: '#1b5e20', BL: '#1565c0',
};

const HEADERS = ['HÃNG BAY', 'QUỐC GIA', 'CHUYẾN BAY', 'MÁY BAY', 'TRẠNG THÁI', 'HÀNH ĐỘNG'];

const AirlineLogo = ({ logo, code, name }) => {
  const [err, setErr] = React.useState(false);
  const color = AIRLINE_COLORS[code] || '#475569';
  if (logo && !err) {
    return (
      <img src={logo} alt={name}
        style={{
          width: 40, height: 40, objectFit: 'contain', borderRadius: 8,
          border: '1px solid #e2e8f0', padding: 4, background: '#fff', flexShrink: 0,
        }}
        onError={() => setErr(true)}
      />
    );
  }
  return (
    <div style={{
      width: 40, height: 40, borderRadius: 8, background: color,
      color: '#fff', fontSize: 13, fontWeight: 800,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>{code}</div>
  );
};

const AdminAirlines = () => {
  const { data, loading, modal, saving, apiError, openAdd, openEdit, closeModal, handleSave, handleDelete } =
    useAdminCrud(adminService.airlines, adminService.airlines.getAll, 'airline_id');
  const [query,  setQuery]  = useState('');
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() =>
    data.filter((x) =>
      [x.airline_code, x.airline_name, x.country].some(
        (v) => (v || '').toLowerCase().includes(query.toLowerCase())
      ) && (!filter || x.status === filter)
    ), [data, query, filter]);

  return (
    <div className="panel-card">
      <div className="panel-header">
        <div>
          <h2>Quản lý Hãng hàng không</h2>
          <p className="panel-subtitle">{filtered.length} / {data.length} hãng bay</p>
        </div>
      </div>

      <SearchBar
        query={query} onQuery={setQuery}
        placeholder="Tìm mã IATA, tên hãng, quốc gia..."
        filterVal={filter} filterOptions={FILTER_OPTS} onFilter={setFilter}
        onAdd={openAdd} addLabel="Thêm hãng bay"
      />

      <AdminTable loading={loading} headers={HEADERS}
        rows={filtered.map((x) => (
          <tr key={x.airline_id}>
            <td>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <AirlineLogo logo={x.logo_url} code={x.airline_code} name={x.airline_name} />
                <div>
                  <div className="cell-primary">{x.airline_name}</div>
                  <div style={{ marginTop: 3 }}>
                    <span className="iata-tag">{x.airline_code}</span>
                  </div>
                </div>
              </div>
            </td>
            <td>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <i className="fas fa-globe-asia" style={{ color: '#94a3b8', fontSize: 12 }} />
                {x.country || '—'}
              </div>
            </td>
            <td>
              <span className="badge badge-info">{x.total_flights ?? 0} chuyến</span>
            </td>
            <td>
              <span className="badge badge-purple">{x.total_aircrafts ?? 0} máy bay</span>
            </td>
            <td>
              <Badge status={x.status === 'active' ? 'active' : 'banned'} />
            </td>
            <ActionBtns onEdit={() => openEdit(x)} onDelete={() => handleDelete(x.airline_id)} />
          </tr>
        ))}
      />

      <AdminModal
        isOpen={modal.isOpen} item={modal.item} fields={FIELDS}
        title={modal.item ? 'Sửa hãng bay' : 'Thêm hãng bay mới'}
        onClose={closeModal} onSave={handleSave} saving={saving} apiError={apiError}
      />
    </div>
  );
};

export default AdminAirlines;