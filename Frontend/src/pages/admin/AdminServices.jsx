import React, { useState, useMemo } from 'react';
import { useAdminCrud, Badge, AdminTable, ActionBtns, AdminModal, SearchBar } from './AdminShared';
import { adminService } from '../../services/admin.service';

const FIELDS = [
  { key: 'service_name', label: 'Tên dịch vụ' },
  { key: 'type', label: 'Loại', type: 'select',
    options: [
      { value: 'meal',      label: 'Bữa ăn'         },
      { value: 'baggage',   label: 'Hành lý'         },
      { value: 'oversized', label: 'Hành lý cồng kềnh'},
    ]},
  { key: 'price',       label: 'Giá (VNĐ)', type: 'number' },
  { key: 'description', label: 'Mô tả' },
  { key: 'status', label: 'Trạng thái', type: 'select',
    options: [{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }] },
];

const HEADERS = ['TÊN DỊCH VỤ', 'GIÁ', 'TRẠNG THÁI', 'HÀNH ĐỘNG'];

const TABS = [
  { key: 'meal',    label: 'Bữa ăn',  icon: 'fa-utensils',        types: ['meal'] },
  { key: 'baggage', label: 'Hành lý', icon: 'fa-suitcase-rolling', types: ['baggage', 'oversized'] },
];

const TAB_LABEL = { meal: 'bữa ăn', baggage: 'dịch vụ hành lý' };

const AdminServices = () => {
  const { data, loading, modal, saving, apiError, openAdd, openEdit, closeModal, handleSave, handleDelete } =
    useAdminCrud(adminService.services, adminService.services.getAll, 'service_id');

  const [activeTab, setActiveTab] = useState('meal');
  const [query, setQuery] = useState('');

  const currentTypes = TABS.find(t => t.key === activeTab)?.types || [];

  const filtered = useMemo(() =>
    data.filter((x) =>
      currentTypes.includes(x.type) &&
      (x.service_name || '').toLowerCase().includes(query.toLowerCase())
    ), [data, query, activeTab]);

  const TYPE_BADGE = {
    meal:      { label: 'Bữa ăn',          bg: '#fff7ed', color: '#f97316' },
    baggage:   { label: 'Hành lý',          bg: '#eff6ff', color: '#3b82f6' },
    oversized: { label: 'Hành lý cồng kềnh', bg: '#f5f3ff', color: '#7c3aed' },
  };

  return (
    <div className="panel-card">
      <div className="panel-header">
        <div>
          <h2>Services</h2>
          <p className="panel-subtitle">{filtered.length} / {data.length} dịch vụ</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 10, padding: '0 24px 16px' }}>
        {TABS.map((tab) => {
          const count = data.filter(x => tab.types.includes(x.type)).length;
          return (
            <button key={tab.key}
              onClick={() => { setActiveTab(tab.key); setQuery(''); }}
              style={{
                padding: '10px 20px',
                border: '2px solid',
                borderColor: activeTab === tab.key ? '#3b82f6' : '#e2e8f0',
                borderRadius: 10,
                background: activeTab === tab.key ? '#eff6ff' : 'white',
                color: activeTab === tab.key ? '#1d4ed8' : '#64748b',
                fontWeight: 600, fontSize: 14,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                transition: 'all 0.18s',
              }}>
              <i className={`fas ${tab.icon}`} />
              {tab.label}
              <span style={{
                background: activeTab === tab.key ? '#dbeafe' : '#f1f5f9',
                color: activeTab === tab.key ? '#1d4ed8' : '#94a3b8',
                borderRadius: 20, padding: '1px 8px', fontSize: 12, fontWeight: 700,
              }}>{count}</span>
            </button>
          );
        })}
        <button className="btn-primary" style={{ marginLeft: 'auto' }} onClick={openAdd}>
          <i className="fas fa-plus" /> Thêm dịch vụ
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '0 24px 16px' }}>
        <div className="search-input-wrap">
          <i className="fas fa-search" />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder={`Tìm kiếm ${TAB_LABEL[activeTab]}...`} />
          {query && <button className="clear-search" onClick={() => setQuery('')}><i className="fas fa-times" /></button>}
        </div>
      </div>

      <AdminTable loading={loading} headers={HEADERS}
        rows={filtered.map((x) => {
          const tb = TYPE_BADGE[x.type] || { label: x.type, bg: '#f1f5f9', color: '#64748b' };
          return (
            <tr key={x.service_id}>
              <td>
                <div style={{ fontWeight: 600, color: '#1e293b' }}>{x.service_name}</div>
                {x.description && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{x.description}</div>}
                <span style={{
                  display: 'inline-block', marginTop: 4,
                  background: tb.bg, color: tb.color,
                  borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                }}>{tb.label}</span>
              </td>
              <td className="text-blue"><strong>{Number(x.price).toLocaleString('vi-VN')} ₫</strong></td>
              <td><Badge status={x.status} /></td>
              <ActionBtns onEdit={() => openEdit(x)} onDelete={() => handleDelete(x.service_id)} />
            </tr>
          );
        })}
      />

      <AdminModal isOpen={modal.isOpen} item={modal.item} fields={FIELDS}
        onClose={closeModal} onSave={handleSave} saving={saving} apiError={apiError} />
    </div>
  );
};

export default AdminServices;