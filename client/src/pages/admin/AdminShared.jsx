import { useState, useEffect, useCallback } from 'react';

// ─── useFetch ─────────────────────────────────────────────────
export function useFetch(fetchFn) {
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetchFn();
      setData(res.data?.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi tải dữ liệu');
    } finally { setLoading(false); }
  }, []); // eslint-disable-line

  useEffect(() => { load(); }, []); // eslint-disable-line

  return { data, setData, loading, error, reload: load };
}

// ─── useAdminCrud ─────────────────────────────────────────────
export function useAdminCrud(service, fetchFn, idKey = 'id') {
  const { data, loading, error, reload } = useFetch(fetchFn);
  const [modal,    setModal]    = useState({ isOpen: false, item: null });
  const [saving,   setSaving]   = useState(false);
  const [apiError, setApiError] = useState('');

  const openAdd    = useCallback(() => setModal({ isOpen: true, item: null }), []);
  const openEdit   = useCallback((item) => setModal({ isOpen: true, item }), []);
  const closeModal = useCallback(() => { setModal({ isOpen: false, item: null }); setApiError(''); }, []);

  const handleSave = useCallback(async (formData) => {
    setSaving(true); setApiError('');
    try {
      if (modal.item) {
        await service.update(modal.item[idKey], formData);
      } else {
        await service.create(formData);
      }
      closeModal();
      reload();
    } catch (err) {
      setApiError(err.response?.data?.message || 'Lỗi lưu dữ liệu');
    } finally { setSaving(false); }
  }, [modal, service, idKey, closeModal, reload]);

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('Bạn có chắc muốn xóa?')) return;
    try { await service.remove(id); reload(); }
    catch (err) { alert(err.response?.data?.message || 'Lỗi xóa'); }
  }, [service, reload]);

  return { data, loading, error, modal, saving, apiError, openAdd, openEdit, closeModal, handleSave, handleDelete, reload };
}

// ─── STATUS_CLASS ─────────────────────────────────────────────
export const STATUS_CLASS = {
  // ✅ Green
  'On Time':        'badge-success',
  'Active':         'badge-success',
  'active':         'badge-success',
  'Success':        'badge-success',
  'Confirmed':      'badge-success',
  'Checked In':     'badge-success',
  // ✅ Vietnamese aliases
  'Thành công':     'badge-success',
  'Đã xác nhận':    'badge-success',
  'Đã check-in':    'badge-success',
  'Đang hoạt động': 'badge-success',
  // 🟡 Yellow
  'Delayed':        'badge-warning',
  'Pending':        'badge-warning',
  'Maintenance':    'badge-warning',
  'Chờ xử lý':     'badge-warning',
  'Bảo trì':        'badge-warning',
  // 🟠 Orange
  'Chờ hủy':        'badge-orange',
  // 🔴 Red
  'Cancelled':      'badge-danger',
  'Inactive':       'badge-danger',
  'inactive':       'badge-danger',
  'Banned':         'badge-danger',
  'banned':         'badge-danger',
  'Stopped':        'badge-danger',
  'Đã hủy':         'badge-danger',
  'Ngừng hoạt động':'badge-danger',
};

// ─── helpers ──────────────────────────────────────────────────

/** Lấy value đầu tiên của options (string hoặc {value, label}) */
const firstOptionValue = (options = []) => {
  if (!options.length) return '';
  const first = options[0];
  return typeof first === 'object' ? first.value : first;
};

/**
 * Xác định xem một select có cần ép kiểu Number không.
 * Dựa vào value của option đầu tiên: nếu là số thì ép kiểu.
 */
const isNumericSelect = (options = []) => {
  const val = firstOptionValue(options);
  return val !== '' && !isNaN(Number(val));
};

// ─── Badge ────────────────────────────────────────────────────
export const Badge = ({ status }) => (
  <span className={`badge ${STATUS_CLASS[status] || 'badge-info'}`}>{status}</span>
);

// ─── AdminTable ───────────────────────────────────────────────
export const AdminTable = ({ headers, rows, loading }) => (
  <div className="table-wrapper">
    {loading ? (
      <div style={{ padding: '52px', textAlign: 'center', color: '#94a3b8' }}>
        <i className="fas fa-spinner fa-spin" style={{ fontSize: 26, display: 'block', marginBottom: 12 }} />
        <span style={{ fontSize: 14 }}>Đang tải dữ liệu...</span>
      </div>
    ) : (
      <table className="admin-table">
        <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.length > 0 ? rows : (
            <tr><td colSpan={headers.length} className="empty-row">
              <i className="fas fa-inbox" />
              Không có dữ liệu
            </td></tr>
          )}
        </tbody>
      </table>
    )}
  </div>
);

// ─── ActionBtns ───────────────────────────────────────────────
export const ActionBtns = ({ onEdit, onDelete }) => (
  <td className="actions">
    <button className="btn-icon text-blue" onClick={onEdit}   title="Sửa"><i className="fas fa-edit" /></button>
    <button className="btn-icon text-red"  onClick={onDelete} title="Xóa"><i className="fas fa-trash-alt" /></button>
  </td>
);

// ─── SearchBar ────────────────────────────────────────────────
export const SearchBar = ({
  query, onQuery,
  placeholder = 'Tìm kiếm...',
  filterVal, filterOptions, onFilter,
  onAdd, addLabel = 'Thêm mới',
}) => (
  <div className="panel-toolbar">
    <div className="toolbar-left">
      <div className="search-input-wrap">
        <i className="fas fa-search" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
        />
        {query && (
          <button className="clear-search" onClick={() => onQuery('')}>
            <i className="fas fa-times" />
          </button>
        )}
      </div>
      {filterOptions && (
        <select
          className="filter-select"
          value={filterVal}
          onChange={(e) => onFilter(e.target.value)}
        >
          {filterOptions.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      )}
    </div>
    {onAdd && (
      <button className="btn-primary" onClick={onAdd}>
        <i className="fas fa-plus" /> {addLabel}
      </button>
    )}
  </div>
);

// ─── AdminModal ───────────────────────────────────────────────
export const AdminModal = ({ isOpen, item, fields, onClose, onSave, saving, apiError, title }) => {
  const [form, setForm] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    const init = {};
    fields.forEach(({ key, type, options }) => {
      if (item?.[key] !== undefined && item?.[key] !== null) {
        init[key] = item[key];
      } else if (type === 'select' && options?.length > 0) {
        init[key] = firstOptionValue(options);
      } else {
        init[key] = '';
      }
    });
    setForm(init);
  }, [isOpen, item, fields]);

  if (!isOpen) return null;

  // Khi field cha (dependsOn) thay đổi → reset field con về option đầu tiên mới
  const handleChange = (key, value, field) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Reset các field phụ thuộc vào field vừa đổi
      fields.forEach((f) => {
        if (f.dependsOn === key) {
          const depOpts = typeof f.options === 'function' ? f.options(value) : f.options;
          next[f.key] = firstOptionValue(depOpts || []);
        }
      });
      return next;
    });
  };

  const handleSubmit = () => {
    const parsed = { ...form };
    fields.forEach(({ key, type, options, dependsOn }) => {
      // Resolve options (có thể là function với dependsOn)
      const resolvedOpts = typeof options === 'function'
        ? options(form[dependsOn])
        : options;
      if (type === 'number') {
        parsed[key] = Number(parsed[key]);
      } else if (type === 'select' && isNumericSelect(resolvedOpts)) {
        parsed[key] = Number(parsed[key]);
      }
    });
    onSave(parsed);
  };

  return (
    <div
      className="admin-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="admin-modal-box">
        <div className="modal-header">
          <h3>{title || (item ? 'Sửa thông tin' : 'Thêm mới')}</h3>
          <button className="modal-close" onClick={onClose}>
            <i className="fas fa-times" />
          </button>
        </div>

        <div className="modal-body">
          {apiError && (
            <div style={{
              background: '#fee2e2', border: '1px solid #fecaca',
              borderRadius: 8, padding: '10px 14px', marginBottom: 16,
              color: '#dc2626', fontSize: 14,
            }}>
              <i className="fas fa-exclamation-circle" /> {apiError}
            </div>
          )}

          {fields.map((field) => {
            const { key, label, type = 'text', options, dependsOn } = field;
            // Nếu options là function (dependent select), gọi với giá trị của field cha
            const resolvedOpts = typeof options === 'function'
              ? options(form[dependsOn])
              : options;

            return (
              <div className="admin-form-group" key={key}>
                <label>{label}</label>
                {type === 'select' ? (
                  <select
                    value={form[key] ?? ''}
                    onChange={(e) => handleChange(key, e.target.value, field)}
                  >
                    {(resolvedOpts || []).map((o) => {
                      const val = typeof o === 'object' ? o.value : o;
                      const lbl = typeof o === 'object' ? o.label : o;
                      return <option key={val} value={val}>{lbl}</option>;
                    })}
                  </select>
                ) : (
                  <input
                    type={type}
                    value={form[key] ?? ''}
                    onChange={(e) => handleChange(key, e.target.value, field)}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="admin-modal-actions">
          <button className="btn-outline" onClick={onClose}>Hủy</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving
              ? <><i className="fas fa-spinner fa-spin" /> Lưu...</>
              : <><i className="fas fa-save" /> Lưu lại</>
            }
          </button>
        </div>
      </div>
    </div>
  );
};