import React, { memo } from 'react';
import '../../style/Stepper.css';

// ─── Constants ────────────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: 'Chọn vé' },
  { id: 2, label: 'Thông tin' },
  { id: 3, label: 'Dịch vụ' },
  { id: 4, label: 'Thanh toán' },
];

// ─── Main Component ───────────────────────────────────────────────────────────
const Stepper = memo(({ currentStep }) => (
  <div className="stepper-wrapper">
    {STEPS.map((step, index) => (
      <React.Fragment key={step.id}>
        <div className={`step-item${currentStep >= step.id ? ' active' : ''}`}>
          <div className="step-circle">{step.id}</div>
          <div className="step-label">{step.label}</div>
        </div>
        {index < STEPS.length - 1 && (
          <div className={`step-arrow${currentStep > step.id ? ' active' : ''}`}>
            <i className="fas fa-chevron-right" />
          </div>
        )}
      </React.Fragment>
    ))}
  </div>
));

Stepper.displayName = 'Stepper';

export default Stepper;