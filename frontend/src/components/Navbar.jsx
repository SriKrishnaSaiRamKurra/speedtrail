import React from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, User, Activity } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <nav className="glass-panel" style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '16px 24px',
      margin: '16px',
      borderRadius: 'var(--radius-md)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          background: 'var(--grad-primary)',
          padding: '8px',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff'
        }}>
          <Activity size={20} />
        </div>
        <span style={{ fontSize: '1.25rem', fontWeight: 700 }} className="title-grad">
          Spreetail SplitShare
        </span>
      </div>

      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(255, 255, 255, 0.04)',
            padding: '6px 12px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--border-glass)',
            fontSize: '0.9rem'
          }}>
            <User size={14} className="text-secondary" />
            <span style={{ fontWeight: 500 }}>{user.name}</span>
          </div>

          <button
            onClick={logout}
            className="btn btn-secondary"
            style={{
              padding: '6px 12px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <LogOut size={14} />
            Logout
          </button>
        </div>
      )}
    </nav>
  );
}
