import React, { useState, useMemo } from 'react';
import { useAdminCrud, AdminTable, ActionBtns, AdminModal, SearchBar, Badge } from './AdminShared';
import { adminService } from '../../services/admin.service';

const COUNTRY_OPTIONS = [
  { value: 'Việt Nam',    label: '🇻🇳 Việt Nam'    },
  { value: 'Singapore',   label: '🇸🇬 Singapore'   },
  { value: 'Thái Lan',    label: '🇹🇭 Thái Lan'    },
  { value: 'Malaysia',    label: '🇲🇾 Malaysia'    },
  { value: 'Nhật Bản',    label: '🇯🇵 Nhật Bản'    },
  { value: 'Hàn Quốc',    label: '🇰🇷 Hàn Quốc'    },
  { value: 'Trung Quốc',  label: '🇨🇳 Trung Quốc'  },
  { value: 'Hồng Kông',   label: '🇭🇰 Hồng Kông'   },
  { value: 'Đài Loan',    label: '🇹🇼 Đài Loan'    },
  { value: 'Indonesia',   label: '🇮🇩 Indonesia'   },
  { value: 'Philippines', label: '🇵🇭 Philippines' },
  { value: 'Ấn Độ',       label: '🇮🇳 Ấn Độ'       },
  { value: 'Úc',          label: '🇦🇺 Úc'          },
  { value: 'Anh',         label: '🇬🇧 Anh'         },
  { value: 'Pháp',        label: '🇫🇷 Pháp'        },
  { value: 'Đức',         label: '🇩🇪 Đức'         },
  { value: 'Mỹ',          label: '🇺🇸 Mỹ'          },
  { value: 'Canada',      label: '🇨🇦 Canada'      },
  { value: 'UAE',         label: '🇦🇪 UAE'         },
  { value: 'Qatar',       label: '🇶🇦 Qatar'       },
  { value: 'Thổ Nhĩ Kỳ', label: '🇹🇷 Thổ Nhĩ Kỳ' },
];

// Thành phố theo quốc gia — dùng để lọc city options khi chọn country
const CITY_BY_COUNTRY = {
  'Việt Nam':    ['Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Phú Quốc', 'Nha Trang', 'Huế', 'Đà Lạt', 'Cần Thơ', 'Hải Phòng', 'Vinh', 'Quy Nhon', 'Buôn Ma Thuột'],
  'Singapore':   ['Singapore'],
  'Thái Lan':    ['Bangkok', 'Phuket', 'Chiang Mai', 'Krabi'],
  'Malaysia':    ['Kuala Lumpur', 'Penang', 'Kota Kinabalu', 'Langkawi'],
  'Nhật Bản':    ['Tokyo', 'Osaka', 'Nagoya', 'Fukuoka', 'Sapporo', 'Okinawa'],
  'Hàn Quốc':   ['Seoul', 'Busan', 'Jeju', 'Incheon'],
  'Trung Quốc':  ['Bắc Kinh', 'Thượng Hải', 'Quảng Châu', 'Thâm Quyến', 'Thành Đô'],
  'Hồng Kông':   ['Hồng Kông'],
  'Đài Loan':    ['Đài Bắc', 'Cao Hùng'],
  'Indonesia':   ['Jakarta', 'Bali', 'Surabaya', 'Medan'],
  'Philippines': ['Manila', 'Cebu', 'Davao'],
  'Ấn Độ':       ['New Delhi', 'Mumbai', 'Bangalore', 'Chennai'],
  'Úc':          ['Sydney', 'Melbourne', 'Brisbane', 'Perth'],
  'Anh':         ['London', 'Manchester', 'Birmingham'],
  'Pháp':        ['Paris', 'Lyon', 'Nice'],
  'Đức':         ['Frankfurt', 'Munich', 'Berlin'],
  'Mỹ':          ['New York', 'Los Angeles', 'San Francisco', 'Chicago', 'Dallas'],
  'Canada':      ['Toronto', 'Vancouver', 'Montreal'],
  'UAE':         ['Dubai', 'Abu Dhabi'],
  'Qatar':       ['Doha'],
  'Thổ Nhĩ Kỳ': ['Istanbul', 'Ankara'],
};

// Flatten toàn bộ thành phố (dùng khi chưa chọn quốc gia)
const ALL_CITIES = [...new Set(Object.values(CITY_BY_COUNTRY).flat())].sort();

const FILTER_OPTS = [
  { value: '',         label: 'Tất cả'  },
  { value: 'active',   label: 'Active'  },
  { value: 'inactive', label: 'Inactive'},
];

const HEADERS = ['MÃ IATA', 'TÊN SÂN BAY', 'THÀNH PHỐ', 'QUỐC GIA', 'TRẠNG THÁI', 'HÀNH ĐỘNG'];

// ─── AdminAirports ────────────────────────────────────────────
const AdminAirports = () => {
  const { data, loading, modal, saving, apiError, openAdd, openEdit, closeModal, handleSave, handleDelete } =
    useAdminCrud(adminService.airports, adminService.airports.getAll, 'airport_id');
  const [query,  setQuery]  = useState('');
  const [filter, setFilter] = useState('');

  const FIELDS = [
    { key: 'airport_id', label: 'Mã IATA (3 ký tự)' },
    { key: 'name',       label: 'Tên sân bay'        },
    {
      key: 'country', label: 'Quốc gia', type: 'select',
      options: COUNTRY_OPTIONS,
    },
    {
      key: 'city', label: 'Thành phố', type: 'select',
      dependsOn: 'country',
      options: (country) =>
        (CITY_BY_COUNTRY[country] || ALL_CITIES).map(c => ({ value: c, label: c })),
    },
    {
      key: 'status', label: 'Trạng thái', type: 'select',
      options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }],
    },
  ];

  const filtered = useMemo(() =>
    data.filter((x) =>
      [x.airport_id, x.name, x.city, x.country].some(
        (v) => (v || '').toLowerCase().includes(query.toLowerCase())
      ) && (!filter || (x.status || 'active') === filter)
    ), [data, query, filter]);

  return (
    <div className="panel-card">
      <div className="panel-header">
        <div>
          <h2>Quản lý Sân bay</h2>
          <p className="panel-subtitle">{filtered.length} / {data.length} sân bay</p>
        </div>
      </div>

      <SearchBar
        query={query} onQuery={setQuery}
        placeholder="Tìm mã IATA, tên, thành phố..."
        filterVal={filter} filterOptions={FILTER_OPTS} onFilter={setFilter}
        onAdd={openAdd} addLabel="Thêm sân bay"
      />

      <AdminTable loading={loading} headers={HEADERS}
        rows={filtered.map((x) => (
          <tr key={x.airport_id}>
            <td><span className="iata-tag">{x.airport_id}</span></td>
            <td><strong>{x.name}</strong></td>
            <td>{x.city}</td>
            <td>{x.country}</td>
            <td><Badge status={x.status || 'active'} /></td>
            <ActionBtns onEdit={() => openEdit(x)} onDelete={() => handleDelete(x.airport_id)} />
          </tr>
        ))}
      />

      <AdminModal
        isOpen={modal.isOpen} item={modal.item} fields={FIELDS}
        title={modal.item ? 'Sửa sân bay' : 'Thêm sân bay mới'}
        onClose={closeModal} onSave={handleSave} saving={saving} apiError={apiError}
      />
    </div>
  );
};

export default AdminAirports;