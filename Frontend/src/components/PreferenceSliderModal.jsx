import React, { useState, useEffect } from 'react';

const FACTORS = [
  { key: 'price', label: 'Giá vé (càng cao càng ưu tiên rẻ)', icon: 'fa-tag', min: 0, max: 1, step: 0.05 },
  { key: 'airline', label: 'Hãng bay ưa thích', icon: 'fa-heart', min: 0, max: 1, step: 0.05 },
  { key: 'time', label: 'Giờ bay sáng', icon: 'fa-sun', min: 0, max: 1, step: 0.05 },
  { key: 'class', label: 'Hạng thương gia / nhất', icon: 'fa-crown', min: 0, max: 1, step: 0.05 },
];

const PreferenceSliderModal = ({ isOpen, onClose, onApply, initialVector, onReset }) => {
  const [tempVector, setTempVector] = useState([0.6, 0.5, 0.5, 0.5]);

  useEffect(() => {
    if (initialVector && initialVector.length === 6) {
      // Map từ vector 6 chiều (price_sens, dur, stop, airline, morning, business) sang 4 chiều hiển thị
      setTempVector([
        initialVector[0],        // price_sensitivity
        initialVector[3],        // airline_loyalty
        initialVector[4],        // morning_preference
        initialVector[5],        // business_class_pref
      ]);
    }
  }, [initialVector]);

  const handleChange = (index, val) => {
    const newVec = [...tempVector];
    newVec[index] = parseFloat(val);
    setTempVector(newVec);
  };

  const handleApply = () => {
    // Chuyển 4 chiều thành vector 6 chiều (các chiều khác giữ 0.5)
    const fullVector = [
      tempVector[0],   // price
      0.5,             // duration (neutral)
      0.5,             // stops (neutral)
      tempVector[1],   // airline
      tempVector[2],   // morning
      tempVector[3],   // business
    ];
    onApply(fullVector);
    onClose();
  };

  const handleReset = () => {
    if (onReset) onReset();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '20px', padding: '24px', width: '400px', maxWidth: '90%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <h3 style={{ margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="fas fa-sliders-h" /> Điều chỉnh sở thích tạm thời
        </h3>
        <p style={{ color: '#666', fontSize: '13px', marginBottom: '20px' }}>
          Kéo các thanh trượt để ưu tiên theo ý bạn. Nhấn "Áp dụng" để tìm lại chuyến bay.
        </p>

        {FACTORS.map((factor, idx) => (
          <div key={factor.key} style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <i className={`fas ${factor.icon}`} style={{ width: '20px', color: '#6366f1' }} />
              <span style={{ fontWeight: 600 }}>{factor.label}</span>
              <span style={{ marginLeft: 'auto', fontSize: '13px', color: '#6366f1' }}>
                {Math.round(tempVector[idx] * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={factor.min}
              max={factor.max}
              step={factor.step}
              value={tempVector[idx]}
              onChange={(e) => handleChange(idx, e.target.value)}
              style={{ width: '100%', accentColor: '#6366f1' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#aaa' }}>
              <span>Ưu tiên thấp</span>
              <span>Ưu tiên cao</span>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
          <button onClick={handleApply} style={{
            flex: 1, background: '#6366f1', color: '#fff', border: 'none', borderRadius: '12px',
            padding: '12px', fontWeight: 600, cursor: 'pointer',
          }}>Áp dụng</button>
          <button onClick={handleReset} style={{
            flex: 1, background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: '12px',
            padding: '12px', fontWeight: 600, cursor: 'pointer',
          }}>Dùng sở thích của tôi</button>
          <button onClick={onClose} style={{
            background: 'transparent', border: '1px solid #e2e8f0', borderRadius: '12px',
            padding: '12px', cursor: 'pointer',
          }}>Đóng</button>
        </div>
      </div>
    </div>
  );
};

export default PreferenceSliderModal;