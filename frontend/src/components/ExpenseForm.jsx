import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Info, AlertCircle } from 'lucide-react';

export default function ExpenseForm({ groupId, members, expenseToEdit, onSave, onClose }) {
  const { API_URL, token } = useAuth();
  
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [paidByUserId, setPaidByUserId] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [splitType, setSplitType] = useState('EQUAL');
  const [shares, setShares] = useState({}); // { userId: value }
  const [error, setError] = useState('');

  // Active members on selected date
  const [activeMembers, setActiveMembers] = useState([]);

  // Determine active members when date changes
  useEffect(() => {
    if (!expenseDate || !members) return;
    const selectedDate = new Date(expenseDate);

    const active = members.filter(m => {
      const jAt = new Date(m.joinedAt);
      const lAt = m.leftAt ? new Date(m.leftAt) : null;
      return selectedDate >= jAt && (!lAt || selectedDate <= lAt);
    });

    setActiveMembers(active);
  }, [expenseDate, members]);

  // Load existing expense if editing
  useEffect(() => {
    if (expenseToEdit) {
      setDescription(expenseToEdit.description);
      setAmount(expenseToEdit.amount.toString());
      setCurrency(expenseToEdit.currency);
      setPaidByUserId(expenseToEdit.paidByUserId.toString());
      setExpenseDate(new Date(expenseToEdit.expenseDate).toISOString().split('T')[0]);
      setSplitType(expenseToEdit.splitType);
      
      const initialShares = {};
      expenseToEdit.shares.forEach(s => {
        // Find if value was a percentage or exact
        if (expenseToEdit.splitType === 'PERCENTAGE') {
          initialShares[s.userId] = s.sharePercentage?.toString() || '0';
        } else if (expenseToEdit.splitType === 'EXACT') {
          initialShares[s.userId] = s.shareAmount.toString();
        } else if (expenseToEdit.splitType === 'SHARES') {
          // In shares weight, we reconstruct weight from percentage
          initialShares[s.userId] = s.sharePercentage ? (parseFloat(s.sharePercentage) / 10).toString() : '1';
        } else {
          initialShares[s.userId] = 'true';
        }
      });
      setShares(initialShares);
    } else if (activeMembers.length > 0) {
      // Set defaults for new expense
      setPaidByUserId(activeMembers[0].userId.toString());
      const defaultShares = {};
      activeMembers.forEach(m => {
        defaultShares[m.userId] = splitType === 'EQUAL' ? 'true' : '0';
      });
      setShares(defaultShares);
    }
  }, [expenseToEdit, activeMembers]);

  // Initialize/reset share inputs when split type changes
  useEffect(() => {
    if (expenseToEdit && expenseToEdit.splitType === splitType) return;
    const defaultShares = {};
    activeMembers.forEach(m => {
      if (splitType === 'EQUAL') {
        defaultShares[m.userId] = 'true';
      } else if (splitType === 'PERCENTAGE') {
        defaultShares[m.userId] = (100 / activeMembers.length).toFixed(1);
      } else if (splitType === 'EXACT') {
        defaultShares[m.userId] = amount ? (parseFloat(amount) / activeMembers.length).toFixed(2) : '0';
      } else if (splitType === 'SHARES') {
        defaultShares[m.userId] = '1';
      }
    });
    setShares(defaultShares);
  }, [splitType, activeMembers]);

  const handleShareChange = (userId, val) => {
    setShares(prev => ({
      ...prev,
      [userId]: val
    }));
  };

  const handleCheckboxChange = (userId, checked) => {
    setShares(prev => ({
      ...prev,
      [userId]: checked ? 'true' : 'false'
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const parsedAmt = parseFloat(amount);
    if (isNaN(parsedAmt) || parsedAmt <= 0) {
      setError('Please enter a valid amount.');
      return;
    }

    if (!paidByUserId) {
      setError('Please select who paid.');
      return;
    }

    // Format shares for payload
    const payloadShares = [];
    const activeUserIds = activeMembers.map(m => m.userId);

    // Validate that the selected payer is active
    if (!activeUserIds.includes(parseInt(paidByUserId, 10))) {
      setError('The selected payer is not active on this date.');
      return;
    }

    if (splitType === 'EQUAL') {
      const selectedUsers = Object.keys(shares).filter(k => shares[k] === 'true').map(k => parseInt(k, 10));
      const activeSelected = selectedUsers.filter(uId => activeUserIds.includes(uId));
      
      if (activeSelected.length === 0) {
        setError('At least one active group member must be included in the split.');
        return;
      }
      activeSelected.forEach(uId => {
        payloadShares.push({ userId: uId, value: 1 });
      });

    } else if (splitType === 'PERCENTAGE') {
      let sumPct = 0;
      for (const m of activeMembers) {
        const pct = parseFloat(shares[m.userId] || 0);
        if (pct > 0) {
          sumPct += pct;
          payloadShares.push({ userId: m.userId, value: pct });
        }
      }

      if (Math.abs(sumPct - 100) > 0.1) {
        setError(`Percentages must sum up to exactly 100% (currently ${sumPct.toFixed(1)}%).`);
        return;
      }

    } else if (splitType === 'EXACT') {
      let sumAmt = 0;
      for (const m of activeMembers) {
        const amt = parseFloat(shares[m.userId] || 0);
        if (amt > 0) {
          sumAmt += amt;
          payloadShares.push({ userId: m.userId, value: amt });
        }
      }

      if (Math.abs(sumAmt - parsedAmt) > 0.05) {
        setError(`Exact split amounts must sum up to the total expense of ${currency} ${parsedAmt} (currently ${currency} ${sumAmt.toFixed(2)}).`);
        return;
      }

    } else if (splitType === 'SHARES') {
      let sumWeights = 0;
      for (const m of activeMembers) {
        const weight = parseFloat(shares[m.userId] || 0);
        if (weight > 0) {
          sumWeights += weight;
          payloadShares.push({ userId: m.userId, value: weight });
        }
      }

      if (sumWeights <= 0) {
        setError('Please specify shares for at least one active member.');
        return;
      }
    }

    const payload = {
      description,
      amount: parsedAmt,
      currency,
      paidByUserId: parseInt(paidByUserId, 10),
      expenseDate,
      splitType,
      shares: payloadShares
    };

    try {
      const url = expenseToEdit 
        ? `${API_URL}/expenses/${expenseToEdit.id}`
        : `${API_URL}/groups/${groupId}/expenses`;
      
      const method = expenseToEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to save expense');
      }

      onSave();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          color: 'var(--color-error)',
          padding: '12px',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.85rem',
          marginBottom: '16px'
        }}>
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      <div className="input-group">
        <label className="input-label" htmlFor="desc">Description</label>
        <input
          id="desc"
          type="text"
          required
          placeholder="e.g. Cloud Hosting, Dinner"
          className="input-field"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
        <div className="input-group">
          <label className="input-label" htmlFor="amount">Amount</label>
          <input
            id="amount"
            type="number"
            step="0.01"
            required
            placeholder="0.00"
            className="input-field"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor="currency">Currency</label>
          <select
            id="currency"
            className="input-field"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option value="INR">INR (₹)</option>
            <option value="USD">USD ($)</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div className="input-group">
          <label className="input-label" htmlFor="date">Date</label>
          <input
            id="date"
            type="date"
            required
            className="input-field"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
          />
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor="payer">Paid By</label>
          <select
            id="payer"
            className="input-field"
            value={paidByUserId}
            onChange={(e) => setPaidByUserId(e.target.value)}
          >
            <option value="">Select Payer</option>
            {activeMembers.map(m => (
              <option key={m.userId} value={m.userId}>{m.user.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="input-group" style={{ marginBottom: '16px' }}>
        <label className="input-label" htmlFor="splitType">Split Method</label>
        <select
          id="splitType"
          className="input-field"
          value={splitType}
          onChange={(e) => setSplitType(e.target.value)}
        >
          <option value="EQUAL">Split Equally</option>
          <option value="PERCENTAGE">Split by Percentage (%)</option>
          <option value="EXACT">Split by Exact Amount</option>
          <option value="SHARES">Split by Shares/Ratio</option>
        </select>
      </div>

      {/* Dynamic Member Splits Section */}
      <div style={{
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 'var(--radius-sm)',
        padding: '16px',
        border: '1px solid var(--border-glass)',
        marginBottom: '24px'
      }}>
        <div style={{
          fontSize: '0.85rem',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          marginBottom: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>Split Details</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 400, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Info size={12} />
            Showing active members for {expenseDate}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {activeMembers.map(m => {
            const userId = m.userId;
            const isPayer = paidByUserId === userId.toString();

            return (
              <div key={userId} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                borderRadius: '6px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.03)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {splitType === 'EQUAL' ? (
                    <input
                      type="checkbox"
                      checked={shares[userId] === 'true'}
                      onChange={(e) => handleCheckboxChange(userId, e.target.checked)}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                  ) : (
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-primary)' }}></div>
                  )}
                  <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                    {m.user.name} {isPayer && <span style={{ fontSize: '0.75rem', color: 'var(--color-accent)' }}>(Payer)</span>}
                  </span>
                </div>

                {splitType !== 'EQUAL' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {splitType === 'PERCENTAGE' && (
                      <>
                        <input
                          type="number"
                          className="input-field"
                          style={{ width: '80px', padding: '6px', textAlign: 'right' }}
                          value={shares[userId] || ''}
                          onChange={(e) => handleShareChange(userId, e.target.value)}
                        />
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>%</span>
                      </>
                    )}

                    {splitType === 'EXACT' && (
                      <>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{currency}</span>
                        <input
                          type="number"
                          className="input-field"
                          style={{ width: '100px', padding: '6px', textAlign: 'right' }}
                          placeholder="0.00"
                          value={shares[userId] || ''}
                          onChange={(e) => handleShareChange(userId, e.target.value)}
                        />
                      </>
                    )}

                    {splitType === 'SHARES' && (
                      <>
                        <input
                          type="number"
                          className="input-field"
                          style={{ width: '80px', padding: '6px', textAlign: 'right' }}
                          value={shares[userId] || '1'}
                          onChange={(e) => handleShareChange(userId, e.target.value)}
                        />
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>share(s)</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          {expenseToEdit ? 'Update Expense' : 'Add Expense'}
        </button>
      </div>
    </form>
  );
}
