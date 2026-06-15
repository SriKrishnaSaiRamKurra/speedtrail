import React from 'react';
import { X } from 'lucide-react';

export default function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '550px',
          padding: '24px',
          background: 'var(--bg-tertiary)',
          boxShadow: 'var(--shadow-lg)',
          animation: 'fadeIn 0.3s ease',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          borderBottom: '1px solid var(--border-glass)',
          paddingBottom: '12px'
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              borderRadius: '50%',
              transition: 'var(--transition-fast)'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
