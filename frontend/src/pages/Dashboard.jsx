import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import Modal from '../components/Modal';
import ExpenseForm from '../components/ExpenseForm';
import {
  Plus,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  DollarSign,
  FileSpreadsheet,
  Trash2,
  Edit2,
  Calendar,
  AlertTriangle,
  History,
  CheckCircle,
  Users
} from 'lucide-react';

export default function Dashboard({ onGoToImport }) {
  const { token, API_URL, user } = useAuth();
  
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [balances, setBalances] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  
  // UI states
  const [activeTab, setActiveTab] = useState('expenses'); // expenses, balances, history
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Settlement Recording State
  const [settlementFrom, setSettlementFrom] = useState('');
  const [settlementTo, setSettlementTo] = useState('');
  const [settlementAmount, setSettlementAmount] = useState('');
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);

  // Group Member Management States
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberJoinDate, setNewMemberJoinDate] = useState('');
  const [isExitMemberOpen, setIsExitMemberOpen] = useState(false);
  const [exitingMemberUserId, setExitingMemberUserId] = useState(null);
  const [exitingMemberName, setExitingMemberName] = useState('');
  const [exitDate, setExitDate] = useState('');

  // Fetch groups on mount
  useEffect(() => {
    fetchGroups();
  }, []);

  // Fetch group data when active group changes
  useEffect(() => {
    if (activeGroup) {
      fetchGroupDetails(activeGroup.id);
      fetchExpenses(activeGroup.id);
      fetchBalancesAndSuggestions(activeGroup.id);
      fetchSettlements(activeGroup.id);
    }
  }, [activeGroup]);

  const fetchGroups = async () => {
    try {
      const res = await fetch(`${API_URL}/groups`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGroups(data);
        if (data.length > 0) {
          // Select seeded group by default if it exists
          const seeded = data.find(g => g.name.includes('Flatmates'));
          setActiveGroup(seeded || data[0]);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchGroupDetails = async (gId) => {
    try {
      const res = await fetch(`${API_URL}/groups/${gId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchExpenses = async (gId) => {
    try {
      const res = await fetch(`${API_URL}/groups/${gId}/expenses`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setExpenses(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchBalancesAndSuggestions = async (gId) => {
    try {
      const res = await fetch(`${API_URL}/groups/${gId}/balances`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBalances(data.balances);
        setSuggestions(data.settlementSuggestions);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSettlements = async (gId) => {
    try {
      const res = await fetch(`${API_URL}/groups/${gId}/settlements`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSettlements(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenAddExpense = () => {
    setExpenseToEdit(null);
    setIsExpenseModalOpen(true);
  };

  const handleOpenEditExpense = (exp) => {
    setExpenseToEdit(exp);
    setIsExpenseModalOpen(true);
  };

  const handleDeleteExpense = async (id) => {
    if (!window.confirm('Are you sure you want to delete this expense?')) return;

    try {
      const res = await fetch(`${API_URL}/expenses/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        setSuccess('Expense deleted successfully!');
        fetchExpenses(activeGroup.id);
        fetchBalancesAndSuggestions(activeGroup.id);
      } else {
        setError('Failed to delete expense.');
      }
    } catch (err) {
      setError('Server error.');
    }
  };

  const handleSaveExpense = () => {
    setIsExpenseModalOpen(false);
    setExpenseToEdit(null);
    setSuccess('Expense saved successfully!');
    fetchExpenses(activeGroup.id);
    fetchBalancesAndSuggestions(activeGroup.id);
  };

  // Greedy settlement triggers
  const handleQuickSettle = (suggestion) => {
    setSettlementFrom(suggestion.fromUserId.toString());
    setSettlementTo(suggestion.toUserId.toString());
    setSettlementAmount(suggestion.amount.toString());
    setIsSettlementModalOpen(true);
  };

  const handleSaveSettlement = async (e) => {
    e.preventDefault();
    setError('');

    const payload = {
      fromUserId: parseInt(settlementFrom, 10),
      toUserId: parseInt(settlementTo, 10),
      amount: parseFloat(settlementAmount)
    };

    try {
      const res = await fetch(`${API_URL}/groups/${activeGroup.id}/settlements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setIsSettlementModalOpen(false);
        setSuccess('Settlement payment recorded successfully!');
        fetchBalancesAndSuggestions(activeGroup.id);
        fetchSettlements(activeGroup.id);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to record settlement.');
      }
    } catch (err) {
      setError('Server error.');
    }
  };

  const handleAddMemberSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${API_URL}/groups/${activeGroup.id}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: newMemberEmail,
          joinedAt: newMemberJoinDate ? new Date(newMemberJoinDate).toISOString() : new Date().toISOString()
        })
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess('Member added to group timeline successfully!');
        setIsAddMemberOpen(false);
        setNewMemberEmail('');
        setNewMemberJoinDate('');
        fetchGroupDetails(activeGroup.id);
        fetchBalancesAndSuggestions(activeGroup.id);
      } else {
        setError(data.error || 'Failed to add member.');
      }
    } catch (err) {
      setError('Server error.');
    }
  };

  const handleExitMemberSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${API_URL}/groups/${activeGroup.id}/members/${exitingMemberUserId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          leftAt: exitDate ? new Date(exitDate).toISOString() : new Date().toISOString()
        })
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess('Member exit date recorded successfully.');
        setIsExitMemberOpen(false);
        setExitingMemberUserId(null);
        setExitingMemberName('');
        setExitDate('');
        fetchGroupDetails(activeGroup.id);
        fetchBalancesAndSuggestions(activeGroup.id);
      } else {
        setError(data.error || 'Failed to record member exit.');
      }
    } catch (err) {
      setError('Server error.');
    }
  };

  // Helper formatting values
  const formatMoney = (val, currency = 'INR') => {
    const sym = currency === 'USD' ? '$' : '₹';
    return `${sym}${parseFloat(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const myBalance = balances.find(b => b.userId === user?.id)?.netBalance || 0;
  const totalGroupExpenses = expenses
    .filter(e => e.transactionType === 'EXPENSE')
    .reduce((sum, e) => sum + parseFloat(e.amount), 0); // Note: Simple sum of raw amount (visual metadata)

  return (
    <div className="app-container">
      <Navbar />

      {/* Action Notifications */}
      {(success || error) && (
        <div style={{
          margin: '0 16px 16px 16px',
          padding: '12px 20px',
          borderRadius: 'var(--radius-sm)',
          background: success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          border: `1px solid ${success ? 'var(--color-success)' : 'var(--color-error)'}`,
          color: success ? 'var(--color-success)' : 'var(--color-error)',
          display: 'flex',
          justifyContent: 'between',
          alignItems: 'center',
          fontSize: '0.9rem'
        }}>
          <span>{success || error}</span>
          <button
            onClick={() => { setSuccess(''); setError(''); }}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Dismiss
          </button>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: '300px 1fr',
        gap: '24px',
        margin: '0 16px 24px 16px',
        alignItems: 'start'
      }}>
        
        {/* Left Sidebar: Group Info & Timelines */}
        <aside className="glass-panel" style={{ padding: '24px', minHeight: '75vh' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={20} className="text-secondary" />
            Group Timeline
          </h2>
          
          <div style={{ marginBottom: '24px' }}>
            <label className="input-label">Select Active Group</label>
            <select
              className="input-field"
              style={{ width: '100%', marginTop: '6px' }}
              value={activeGroup?.id || ''}
              onChange={(e) => {
                const selected = groups.find(g => g.id === parseInt(e.target.value, 10));
                if (selected) setActiveGroup(selected);
              }}
            >
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <div style={{ borderBottom: '1px solid var(--border-glass)', marginBottom: '16px' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>
              Members History
            </h3>
            <button
              onClick={() => setIsAddMemberOpen(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-primary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                fontSize: '0.8rem',
                fontWeight: 600
              }}
            >
              <Plus size={14} /> Add Member
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {members.map(m => {
              const joined = new Date(m.joinedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
              const left = m.leftAt 
                ? new Date(m.leftAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                : 'Present';

              const isMeera = m.user.name === 'Meera';
              const isSam = m.user.name === 'Sam';
              const isDev = m.user.name === 'Dev';

              return (
                <div key={m.id} style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.04)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{m.user.name}</span>
                    {isMeera && <span className="badge badge-error" style={{ fontSize: '0.65rem' }}>Exited</span>}
                    {isSam && <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>Late Join</span>}
                    {isDev && <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>Trip Only</span>}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Timeline: {joined} - {left}
                    </div>
                    {!m.leftAt && (
                      <button
                        onClick={() => {
                          setExitingMemberUserId(m.userId);
                          setExitingMemberName(m.user.name);
                          setExitDate('');
                          setIsExitMemberOpen(true);
                        }}
                        style={{
                          background: 'rgba(239, 68, 68, 0.08)',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          color: 'var(--color-error)',
                          borderRadius: '4px',
                          padding: '2px 6px',
                          fontSize: '0.7rem',
                          cursor: 'pointer'
                        }}
                      >
                        Exit
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Right Dashboard panel */}
        <main style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Key Metrics Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Group Expenses Total</span>
              <span style={{ fontSize: '1.75rem', fontWeight: 700 }} className="title-grad">
                {formatMoney(totalGroupExpenses, 'INR')}
              </span>
            </div>

            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>My Balance Position</span>
              <span style={{
                fontSize: '1.75rem',
                fontWeight: 700,
                color: myBalance >= 0 ? 'var(--color-success)' : 'var(--color-error)'
              }}>
                {myBalance >= 0 ? '+' : ''}{formatMoney(myBalance, 'INR')}
              </span>
            </div>

            <div className="glass-panel" style={{
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '10px',
              background: 'rgba(99, 102, 241, 0.05)',
              border: '1px solid rgba(99, 102, 241, 0.15)'
            }}>
              <button
                onClick={onGoToImport}
                className="btn btn-primary"
                style={{ width: '100%', height: '100%', fontSize: '0.95rem' }}
              >
                <FileSpreadsheet size={18} />
                Import CSV Expenses
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="glass-panel" style={{ padding: '6px', display: 'flex', gap: '6px' }}>
            <button
              onClick={() => setActiveTab('expenses')}
              className={`btn ${activeTab === 'expenses' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1, padding: '10px' }}
            >
              Expenses & Splits
            </button>
            <button
              onClick={() => setActiveTab('balances')}
              className={`btn ${activeTab === 'balances' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1, padding: '10px' }}
            >
              Balances & Settle suggests
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`btn ${activeTab === 'history' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1, padding: '10px' }}
            >
              Settlements History
            </button>
          </div>

          {/* Tab 1: Expenses */}
          {activeTab === 'expenses' && (
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px'
              }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Group Expenses</h2>
                <button onClick={handleOpenAddExpense} className="btn btn-primary">
                  <Plus size={18} />
                  Add Manual Expense
                </button>
              </div>

              {expenses.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  No expenses recorded yet. Use the CSV Importer or add a manual expense to start!
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-glass)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        <th style={{ padding: '12px 8px' }}>Date</th>
                        <th style={{ padding: '12px 8px' }}>Description</th>
                        <th style={{ padding: '12px 8px' }}>Paid By</th>
                        <th style={{ padding: '12px 8px' }}>Amount</th>
                        <th style={{ padding: '12px 8px' }}>Split</th>
                        <th style={{ padding: '12px 8px' }}>Status</th>
                        <th style={{ padding: '12px 8px', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.map(exp => {
                        const hasReview = exp.needsReview;
                        const isDup = exp.duplicateFlag;
                        const isRefund = exp.transactionType === 'REFUND';

                        return (
                          <tr key={exp.id} style={{
                            borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                            background: hasReview ? 'rgba(245, 158, 11, 0.02)' : 'transparent',
                            fontSize: '0.9rem'
                          }}>
                            <td style={{ padding: '14px 8px' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Calendar size={14} className="text-muted" />
                                {formatDate(exp.expenseDate)}
                              </span>
                            </td>
                            <td style={{ padding: '14px 8px', fontWeight: 500 }}>
                              {exp.description}
                              {isRefund && <span className="badge badge-success" style={{ fontSize: '0.6rem', marginLeft: '6px' }}>Refund</span>}
                            </td>
                            <td style={{ padding: '14px 8px' }}>{exp.paidByUser?.name || exp.originalPayer || 'Unknown'}</td>
                            <td style={{ padding: '14px 8px', fontWeight: 600 }}>{formatMoney(exp.amount, exp.currency)}</td>
                            <td style={{ padding: '14px 8px' }}>
                              <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>{exp.splitType}</span>
                            </td>
                            <td style={{ padding: '14px 8px' }}>
                              {hasReview ? (
                                <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <AlertTriangle size={10} />
                                  Needs Review
                                </span>
                              ) : isDup ? (
                                <span className="badge badge-error" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <AlertTriangle size={10} />
                                  Duplicate
                                </span>
                              ) : (
                                <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <CheckCircle size={10} />
                                  Active
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '14px 8px', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '8px' }}>
                                <button
                                  onClick={() => handleOpenEditExpense(exp)}
                                  className="btn btn-secondary"
                                  style={{ padding: '6px', borderRadius: '4px' }}
                                  title="Edit Expense"
                                >
                                  <Edit2 size={12} />
                                </button>
                                <button
                                  onClick={() => handleDeleteExpense(exp.id)}
                                  className="btn btn-danger"
                                  style={{ padding: '6px', borderRadius: '4px' }}
                                  title="Delete Expense"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Balances & Suggestions */}
          {activeTab === 'balances' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              
              {/* Balances list */}
              <div className="glass-panel" style={{ padding: '24px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '20px' }}>Individual Balances</h2>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {balances.map(b => (
                    <div key={b.userId} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '14px 16px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-glass)',
                      borderRadius: 'var(--radius-sm)'
                    }}>
                      <span style={{ fontWeight: 500 }}>{b.name}</span>
                      <span style={{
                        fontWeight: 600,
                        color: b.netBalance > 0 ? 'var(--color-success)' : b.netBalance < 0 ? 'var(--color-error)' : 'var(--text-secondary)'
                      }}>
                        {b.netBalance > 0 ? '+' : ''}{formatMoney(b.netBalance, 'INR')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Settlement suggestions */}
              <div className="glass-panel" style={{ padding: '24px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '20px' }}>Suggested Settlements</h2>
                
                {suggestions.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                    All debts are fully settled! No payments required.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {suggestions.map((sug, idx) => (
                      <div key={idx} style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        padding: '16px',
                        background: 'rgba(99, 102, 241, 0.03)',
                        border: '1px solid rgba(99, 102, 241, 0.1)',
                        borderRadius: 'var(--radius-sm)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyWrap: 'wrap', gap: '8px', fontSize: '0.95rem' }}>
                          <span style={{ fontWeight: 600, color: 'var(--color-error)' }}>{sug.fromUserName}</span>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>owes</span>
                          <span style={{ fontWeight: 600, color: 'var(--color-success)' }}>{sug.toUserName}</span>
                          <ArrowRight size={14} className="text-muted" />
                          <span style={{ fontWeight: 700 }} className="title-grad">{formatMoney(sug.amount, 'INR')}</span>
                        </div>
                        <button
                          onClick={() => handleQuickSettle(sug)}
                          className="btn btn-primary"
                          style={{ alignSelf: 'flex-start', padding: '6px 12px', fontSize: '0.8rem' }}
                        >
                          Record Payment
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 3: History */}
          {activeTab === 'history' && (
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '20px' }}>Settlements Log</h2>
              
              {settlements.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  No settlements recorded yet.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-glass)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        <th style={{ padding: '12px 8px' }}>Date</th>
                        <th style={{ padding: '12px 8px' }}>From User</th>
                        <th style={{ padding: '12px 8px' }}>To User</th>
                        <th style={{ padding: '12px 8px' }}>Amount Settle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlements.map(set => (
                        <tr key={set.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)', fontSize: '0.9rem' }}>
                          <td style={{ padding: '12px 8px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <History size={14} className="text-muted" />
                              {formatDate(set.settlementDate)}
                            </span>
                          </td>
                          <td style={{ padding: '12px 8px', fontWeight: 500, color: 'var(--color-error)' }}>{set.fromUser.name}</td>
                          <td style={{ padding: '12px 8px', fontWeight: 500, color: 'var(--color-success)' }}>{set.toUser.name}</td>
                          <td style={{ padding: '12px 8px', fontWeight: 700 }} className="title-grad">{formatMoney(set.amount, 'INR')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </main>
      </div>

      {/* Manual Expense Creation Modal */}
      <Modal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        title={expenseToEdit ? 'Edit Expense' : 'Add New Expense'}
      >
        <ExpenseForm
          groupId={activeGroup?.id}
          members={members}
          expenseToEdit={expenseToEdit}
          onSave={handleSaveExpense}
          onClose={() => setIsExpenseModalOpen(false)}
        />
      </Modal>

      {/* Settlement Record Modal */}
      <Modal
        isOpen={isSettlementModalOpen}
        onClose={() => setIsSettlementModalOpen(false)}
        title="Record Debt Settlement Payment"
      >
        <form onSubmit={handleSaveSettlement}>
          <div className="input-group">
            <label className="input-label">Payer (Who Paid)</label>
            <select
              className="input-field"
              value={settlementFrom}
              onChange={(e) => setSettlementFrom(e.target.value)}
              required
            >
              {members.map(m => (
                <option key={m.userId} value={m.userId}>{m.user.name}</option>
              ))}
            </select>
          </div>

          <div className="input-group">
            <label className="input-label">Receiver (Who Received)</label>
            <select
              className="input-field"
              value={settlementTo}
              onChange={(e) => setSettlementTo(e.target.value)}
              required
            >
              {members.map(m => (
                <option key={m.userId} value={m.userId}>{m.user.name}</option>
              ))}
            </select>
          </div>

          <div className="input-group" style={{ marginBottom: '24px' }}>
            <label className="input-label">Settlement Amount (INR)</label>
            <input
              type="number"
              className="input-field"
              step="0.01"
              required
              value={settlementAmount}
              onChange={(e) => setSettlementAmount(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsSettlementModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Record Payment
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Member Modal */}
      <Modal
        isOpen={isAddMemberOpen}
        onClose={() => setIsAddMemberOpen(false)}
        title="Add Member to Group Timeline"
      >
        <form onSubmit={handleAddMemberSubmit}>
          <div className="input-group">
            <label className="input-label">User Email Address</label>
            <input
              type="email"
              className="input-field"
              placeholder="e.g. sam@flatmates.com"
              required
              value={newMemberEmail}
              onChange={(e) => setNewMemberEmail(e.target.value)}
            />
          </div>

          <div className="input-group" style={{ marginBottom: '24px' }}>
            <label className="input-label">Join Date (Timeline Start)</label>
            <input
              type="date"
              className="input-field"
              required
              value={newMemberJoinDate}
              onChange={(e) => setNewMemberJoinDate(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsAddMemberOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Add Member
            </button>
          </div>
        </form>
      </Modal>

      {/* Exit Member Modal */}
      <Modal
        isOpen={isExitMemberOpen}
        onClose={() => setIsExitMemberOpen(false)}
        title={`Set Exit Date for ${exitingMemberName}`}
      >
        <form onSubmit={handleExitMemberSubmit}>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Setting an exit date soft-removes the member. They will remain in historical calculations for expenses before this date, but will not participate in splits after this date.
          </p>

          <div className="input-group" style={{ marginBottom: '24px' }}>
            <label className="input-label">Exit Date (Timeline End)</label>
            <input
              type="date"
              className="input-field"
              required
              value={exitDate}
              onChange={(e) => setExitDate(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsExitMemberOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-danger">
              Confirm Exit
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
