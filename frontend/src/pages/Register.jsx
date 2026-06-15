import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Activity, Mail, Lock, User, AlertTriangle } from 'lucide-react';

export default function Register({ onToggleLogin }) {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await register(name, email, password);
    } catch (err) {
      setError(err.message || 'Registration failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '80vh',
      padding: '20px'
    }}>
      <div className="glass-panel animate-fade-in" style={{
        width: '100%',
        maxWidth: '420px',
        padding: '40px 30px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-glass)'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '30px' }}>
          <div style={{
            background: 'var(--grad-primary)',
            padding: '12px',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            marginBottom: '16px',
            boxShadow: 'var(--shadow-glow)'
          }}>
            <Activity size={32} />
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }} className="title-grad">
            Create Account
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '6px' }}>
            Join Spreetail SplitShare
          </p>
        </div>

        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: 'var(--color-error)',
            padding: '12px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.85rem',
            marginBottom: '20px'
          }}>
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label" htmlFor="name">Full Name</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <User size={16} style={{ position: 'absolute', left: '16px', color: 'var(--text-muted)' }} />
              <input
                id="name"
                type="text"
                required
                className="input-field"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ width: '100%', paddingLeft: '44px' }}
              />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="email">Email Address</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Mail size={16} style={{ position: 'absolute', left: '16px', color: 'var(--text-muted)' }} />
              <input
                id="email"
                type="email"
                required
                className="input-field"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: '100%', paddingLeft: '44px' }}
              />
            </div>
          </div>

          <div className="input-group" style={{ marginBottom: '24px' }}>
            <label className="input-label" htmlFor="password">Password</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Lock size={16} style={{ position: 'absolute', left: '16px', color: 'var(--text-muted)' }} />
              <input
                id="password"
                type="password"
                required
                className="input-field"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: '100%', paddingLeft: '44px' }}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', padding: '12px 20px', fontSize: '1rem' }}
          >
            {loading ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>

        <div style={{
          textAlign: 'center',
          marginTop: '24px',
          fontSize: '0.9rem',
          color: 'var(--text-secondary)'
        }}>
          Already have an account?{' '}
          <button
            onClick={onToggleLogin}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-primary)',
              cursor: 'pointer',
              fontWeight: 500,
              textDecoration: 'underline'
            }}
          >
            Log In
          </button>
        </div>
      </div>
    </div>
  );
}
