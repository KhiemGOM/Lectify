import React from 'react';
import '../styles/LoadingModal.css';

export default function LoadingModal({ message = 'Loading…' }) {
  return (
    <div className="lm-overlay" role="dialog" aria-modal="true" aria-label={message}>
      <div className="lm-card">
        <div className="lm-spinner" />
        <p className="lm-message">{message}</p>
      </div>
    </div>
  );
}
