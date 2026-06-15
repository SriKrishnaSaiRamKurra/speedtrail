import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import ImportPage from './pages/ImportPage';

export default function App() {
  const { user, loading } = useAuth();
  
  // Local simple routing
  const [view, setView] = useState('dashboard'); // dashboard, import
  const [isRegistering, setIsRegistering] = useState(false);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '4px solid var(--border-glass)',
          borderTopColor: 'var(--color-primary)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '16px'
        }} />
        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Initializing Shared Expenses Engine...</span>
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}} />
      </div>
    );
  }

  // Auth Guard
  if (!user) {
    return isRegistering ? (
      <Register onToggleLogin={() => setIsRegistering(false)} />
    ) : (
      <Login onToggleRegister={() => setIsRegistering(true)} />
    );
  }

  // Selected views
  if (view === 'import') {
    return (
      <ImportPage
        onBackToDashboard={() => setView('dashboard')}
        activeGroupId={1} // Defaulting to first group (seeded Flatmates Shared Expenses)
      />
    );
  }

  return (
    <Dashboard
      onGoToImport={() => setView('import')}
    />
  );
}
