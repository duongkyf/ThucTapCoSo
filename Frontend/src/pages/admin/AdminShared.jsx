import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

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
  // Green
  'On Time':         'badge-success',
  'Active':          'badge-success',
  'active':          'badge-success',
  'Success':         'badge-success',
  'Confirmed':       'badge-success',
  'Checked In':      'badge-success',
  'Thành công':      'badge-success',
  'Đã xác nhận':     'badge-success',
  'Đã check-in':     'badge-success',
  'Đang hoạt động':  'badge-success',
  // Yellow
  'Delayed':         'badge-warning',
  'Pending':         'badge-warning',
  'Maintenance':     'badge-warning',
  'Chờ xử lý':      'badge-warning',
  'Bảo trì':         'badge-warning',
  // Orange
  'Chờ hủy':         'badge-orange',
  // Red
  'Cancelled':       'badge-danger',
  'Inactive':        'badge-danger',
  'inactive':        'badge-danger',
  'Banned':          'badge-danger',
  'banned':          'badge-danger',
  'Stopped':         'badge-danger',
  'Đã hủy':          'badge-danger',
  'Ngừng hoạt động': 'badge-danger',
};

// Label map: DB value → display text
export const STATUS_LABEL = {
  'Active':      'Đang hoạt động',
  'Maintenance': 'Bảo trì',
  'Inactive':    'Ngừng hoạt động',
};

// ─── helpers ──────────────────────────────────────────────────
const firstOptionValue = (options = []) => {
  if (!options.length) return '';
  const first = options[0];
  return typeof first === 'object' ? first.value : first;
};

const isNumericSelect = (options = []) => {
  const val = firstOptionValue(options);
  return val !== '' && !isNaN(Number(val));
};

// ─── Time slot helpers (datetime-split) ──────────────────────
const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

const splitDateTime = (val) => {
  if (!val) return { date: '', time: '06:00' };
  const s = typeof val === 'string' ? val : new Date(val).toISOString();
  return { date: s.slice(0, 10), time: s.slice(11, 16) || '06:00' };
};

const joinDateTime = (date, time) => (date && time) ? `${date}T${time}:00` : '';

// ─── ComboBox ─────────────────────────────────────────────────
export const ComboBox = ({ options = [], value, onChange, placeholder = 'Nhập hoặc chọn...', disabled = false }) => {
  const [input,  setInput]  = useState('');
  const [open,   setOpen]   = useState(false);
  const [rect,   setRect]   = useState(null);
  const inputRef = useRef(null);
  const listRef  = useRef(null);

  // Sync display label khi value hoặc options thay đổi
  useEffect(() => {
    const match = options.find((o) => String(o.value) === String(value));
    setInput(match ? match.label : value ?? '');
  }, [value, options]);

  const openDropdown = () => {
    if (inputRef.current) setRect(inputRef.current.getBoundingClientRect());
    setOpen(true);
  };

  // Đóng khi click ra ngoài
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        inputRef.current && !inputRef.current.contains(e.target) &&
        listRef.current  && !listRef.current.contains(e.target)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(input.toLowerCase()) ||
    String(o.value).toLowerCase().includes(input.toLowerCase())
  );

  const handleSelect = (opt) => {
    setInput(opt.label);
    onChange(opt.value);
    setOpen(false);
  };

  const handleInputChange = (e) => {
    if (disabled) return;
    const val = e.target.value;
    setInput(val);
    onChange(val);
    if (!open) openDropdown();
  };

  // Portal dropdown — thoát overflow của modal
  const dropdown = open && rect && createPortal(
    <div
      ref={listRef}
      style={{
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,.12)',
        zIndex: 99999,
        maxHeight: 220,
        overflowY: 'auto',
      }}
    >
      {filtered.length === 0 ? (
        <div style={{ padding: '10px 14px', fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>
          <i className="fas fa-search" style={{ marginRight: 6 }} />
          Không tìm thấy kết quả
        </div>
      ) : (
        filtered.map((o) => {
          const isSelected = String(o.value) === String(value);
          return (
            <div
              key={o.value}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(o); }}
              style={{
                padding: '9px 14px', fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: isSelected ? '#eff6ff' : 'transparent',
                color: isSelected ? '#2563eb' : '#1e293b',
                fontWeight: isSelected ? 600 : 400,
              }}
              onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#f8fafc'; }}
              onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
            >
              <span>{o.label}</span>
              {isSelected && <i className="fas fa-check" style={{ fontSize: 11 }} />}
            </div>
          );
        })
      )}
    </div>,
    document.body
  );

  return (
    <div ref={inputRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={input}
        onChange={handleInputChange}
        onFocus={() => !disabled && openDropdown()}
        placeholder={disabled ? 'Chọn trước trường phía trên...' : placeholder}
        disabled={disabled}
        style={{ width: '100%', opacity: disabled ? 0.6 : 1 }}
      />
      {dropdown}
    </div>
  );
};

// ─── Badge ────────────────────────────────────────────────────
export const Badge = ({ status, label }) => (
  <span className={`badge ${STATUS_CLASS[status] || 'badge-info'}`}>{label || status}</span>
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
  const [form,        setForm]        = useState({});
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    const init = {};
    fields.forEach(({ key, type, options }) => {
      if (item?.[key] !== undefined && item?.[key] !== null) {
        init[key] = item[key];
      } else if (type === 'datetime-split') {
        init[key] = item?.[key] ? item[key] : '';
      } else if (type === 'select' && options?.length > 0) {
        init[key] = firstOptionValue(options);
      } else {
        init[key] = '';
      }
    });
    setForm(init);
    setFieldErrors({});
  }, [isOpen, item, fields]);

  if (!isOpen) return null;

  // Reset field con khi field cha thay đổi
  const handleChange = (key, value, field) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      fields.forEach((f) => {
        if (f.dependsOn === key) {
          if (f.type === 'combobox') {
            next[f.key] = '';
          } else {
            const depOpts = typeof f.options === 'function' ? f.options(value) : f.options;
            next[f.key] = firstOptionValue(depOpts || []);
          }
        }
      });
      return next;
    });
    // Xóa lỗi của field vừa thay đổi
    if (fieldErrors[key]) setFieldErrors(prev => ({ ...prev, [key]: '' }));
  };

  const handleSubmit = () => {
    // Chạy validate cho tất cả field có hàm validate
    const errors = {};
    fields.forEach(({ key, validate }) => {
      if (typeof validate === 'function') {
        const err = validate(form[key]);
        if (err) errors[key] = err;
      }
    });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    const parsed = { ...form };
    fields.forEach(({ key, type, options, dependsOn }) => {
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
            const resolvedOpts = typeof options === 'function'
              ? options(form[dependsOn])
              : options;
            const hasError = !!fieldErrors[key];

            return (
              <div className="admin-form-group" key={key}>
                <label>
                  {label}
                  {field.required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
                </label>

                {type === 'datetime-split' ? (() => {
                  const { date, time } = splitDateTime(form[key] ?? '');
                  return (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="date"
                        value={date}
                        style={{ flex: 1, ...(hasError ? { borderColor: '#ef4444' } : {}) }}
                        onChange={(e) => handleChange(key, joinDateTime(e.target.value, time), field)}
                      />
                      <select
                        value={TIME_SLOTS.includes(time) ? time : '06:00'}
                        style={{ width: 100 }}
                        onChange={(e) => handleChange(key, joinDateTime(date, e.target.value), field)}
                      >
                        {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  );
                })() : type === 'select' ? (
                  <select
                    value={form[key] ?? ''}
                    onChange={(e) => handleChange(key, e.target.value, field)}
                    style={hasError ? { borderColor: '#ef4444' } : {}}
                  >
                    {(resolvedOpts || []).map((o) => {
                      const val = typeof o === 'object' ? o.value : o;
                      const lbl = typeof o === 'object' ? o.label : o;
                      return <option key={val} value={val}>{lbl}</option>;
                    })}
                  </select>
                ) : type === 'combobox' ? (
                  <ComboBox
                    options={resolvedOpts || []}
                    value={form[key] ?? ''}
                    onChange={(val) => handleChange(key, val, field)}
                    placeholder={
                      dependsOn && !form[dependsOn]
                        ? 'Chọn trước ' + (fields.find(f => f.key === dependsOn)?.label || '') + '...'
                        : field.placeholder
                    }
                    disabled={!!(dependsOn && !form[dependsOn])}
                  />
                ) : (
                  <input
                    type={type}
                    value={form[key] ?? ''}
                    onChange={(e) => handleChange(key, e.target.value, field)}
                    style={hasError ? { borderColor: '#ef4444' } : {}}
                  />
                )}

                {hasError && (
                  <span style={{ color: '#ef4444', fontSize: 12, marginTop: 4, display: 'block' }}>
                    <i className="fas fa-exclamation-circle" style={{ marginRight: 4 }} />
                    {fieldErrors[key]}
                  </span>
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