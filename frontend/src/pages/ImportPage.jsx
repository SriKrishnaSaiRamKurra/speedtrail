import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import {
  ArrowLeft,
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle,
  FileCheck,
  Download,
  Calendar,
  User,
  Settings
} from 'lucide-react';

export default function ImportPage({ onBackToDashboard, activeGroupId }) {
  const { token, API_URL, members } = useAuth();
  
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [report, setReport] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  
  // Resolution form states
  const [resolvingId, setResolvingId] = useState(null);
  const [correctedDate, setCorrectedDate] = useState('');
  const [correctedPayer, setCorrectedPayer] = useState('');
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Dropdown list for mapping payers
  const [groupUsers, setGroupUsers] = useState([]);

  // Fetch users in group for anomaly resolution dropdowns
  const fetchGroupUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/groups/${activeGroupId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGroupUsers(data.members.map(m => m.user));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError('');
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a CSV file first.');
      return;
    }

    setUploading(true);
    setError('');
    setReport(null);
    setAnomalies([]);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_URL}/groups/${activeGroupId}/imports`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await res.json();
      if (res.ok) {
        setReport(data);
        setSuccess('CSV Processed successfully!');
        fetchGroupUsers();
        // Load report details
        fetchImportReportDetails(data.importId);
      } else {
        setError(data.error || 'Import failed.');
      }
    } catch (err) {
      setError('Connection error or invalid CSV file.');
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const fetchImportReportDetails = async (importId) => {
    try {
      const res = await fetch(`${API_URL}/imports/${importId}/report`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAnomalies(data.anomalies);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Resolve Anomaly Action Handler
  const handleResolveAnomaly = async (anomalyId, actionType, correctedVal = '') => {
    setError('');
    setSuccess('');
    
    try {
      const res = await fetch(`${API_URL}/imports/anomalies/${anomalyId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: actionType,
          correctedValue: correctedVal
        })
      });

      if (res.ok) {
        setSuccess('Anomaly resolved successfully.');
        setResolvingId(null);
        // Refresh anomalies from server
        fetchImportReportDetails(report.importId);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to resolve anomaly.');
      }
    } catch (err) {
      setError('Server connection error.');
      console.error(err);
    }
  };

  // Export anomaly list as JSON
  const handleExportJSON = () => {
    if (!report) return;
    const exportData = {
      importId: report.importId,
      processedAt: report.processedAt,
      summary: {
        totalRowsProcessed: report.totalRowsProcessed,
        successfulImports: report.successfulImports,
        rowsWithWarnings: report.rowsWithWarnings,
        rowsRequiringReview: report.rowsRequiringReview
      },
      anomalies: anomalies
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `import_report_${report.importId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-container animate-fade-in">
      <Navbar />

      <div style={{ margin: '0 16px 24px 16px' }}>
        <button
          onClick={onBackToDashboard}
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </button>

        {/* Status messages */}
        {(success || error) && (
          <div style={{
            padding: '12px 20px',
            borderRadius: 'var(--radius-sm)',
            background: success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${success ? 'var(--color-success)' : 'var(--color-error)'}`,
            color: success ? 'var(--color-success)' : 'var(--color-error)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.9rem',
            marginBottom: '20px'
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

        <div style={{ display: 'grid', gridTemplateColumns: report ? '380px 1fr' : '1fr', gap: '24px', alignItems: 'start' }}>
          
          {/* Uploader & Summary Card */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Upload size={20} className="text-secondary" />
              Upload Expenses CSV
            </h2>

            <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{
                border: '2px dashed var(--border-glass)',
                borderRadius: 'var(--radius-sm)',
                padding: '30px 20px',
                textAlign: 'center',
                background: 'rgba(0,0,0,0.1)',
                cursor: 'pointer',
                transition: 'var(--transition-fast)'
              }}
              onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
              onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border-glass)'}
              >
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                  id="csv-file-input"
                />
                <label htmlFor="csv-file-input" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                  <FileText size={40} className="text-secondary" />
                  <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                    {file ? file.name : 'Choose CSV file to upload'}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Requires: Date, Description, Paid By, Amount, Currency, Split Type, Split Details, Transaction Type
                  </span>
                </label>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={uploading || !file}
                style={{ width: '100%', padding: '12px' }}
              >
                {uploading ? 'Processing CSV Pipeline...' : 'Run Import Pipeline'}
              </button>
            </form>

            {/* Visual Metadata Import Report Dashboard */}
            {report && (
              <div style={{ marginTop: '24px', animation: 'fadeIn 0.3s ease' }}>
                <div style={{ borderBottom: '1px solid var(--border-glass)', margin: '16px 0' }} />
                
                <div style={{ display: 'flex', justifyWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Import Report Summary</h3>
                  <button
                    onClick={handleExportJSON}
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'inline-flex', gap: '6px' }}
                  >
                    <Download size={12} />
                    JSON Export
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '6px 0' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Rows Processed</span>
                    <span style={{ fontWeight: 600 }}>{report.totalRowsProcessed}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '6px 0' }}>
                    <span style={{ color: 'var(--color-success)' }}>Successful Imports</span>
                    <span style={{ fontWeight: 600, color: 'var(--color-success)' }}>{report.successfulImports}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '6px 0' }}>
                    <span style={{ color: 'var(--color-warning)' }}>Flagged Warnings</span>
                    <span style={{ fontWeight: 600, color: 'var(--color-warning)' }}>{report.rowsWithWarnings}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '6px 0' }}>
                    <span style={{ color: 'var(--color-error)' }}>Review Required Rows</span>
                    <span style={{ fontWeight: 600, color: 'var(--color-error)' }}>{report.rowsRequiringReview}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Panel: Anomalies Details Grid */}
          {report && (
            <div className="glass-panel" style={{ padding: '24px', animation: 'fadeIn 0.4s ease' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileCheck size={20} className="text-secondary" />
                Detected Anomalies Logs
              </h2>

              {anomalies.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border-glass)', borderRadius: 'var(--radius-sm)' }}>
                  Wow! No anomalies found in this import. All rows are imported successfully with clean data!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {anomalies.map((anom) => {
                    const isResolved = anom.resolved;
                    const canResolve = (anom.severity === 'WARNING' || anom.severity === 'ERROR') && !isResolved;
                    const isDupe = anom.anomalyType === 'DUPLICATE_EXPENSE';
                    const isAmbiguousDate = anom.anomalyType === 'AMBIGUOUS_DATE';
                    const isMissingPayer = anom.anomalyType === 'MISSING_PAYER';
                    
                    return (
                      <div key={anom.id} style={{
                        padding: '16px',
                        borderRadius: 'var(--radius-sm)',
                        background: isResolved ? 'rgba(16,185,129,0.02)' : 'rgba(245,158,11,0.02)',
                        border: `1px solid ${isResolved ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)'}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        transition: 'var(--transition-normal)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', wrap: 'wrap', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{
                              fontWeight: 600,
                              fontSize: '0.8rem',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: 'var(--bg-tertiary)',
                              color: 'var(--text-secondary)'
                            }}>
                              Row {anom.rowNumber}
                            </span>
                            <span className={`badge ${anom.severity === 'INFO' ? 'badge-info' : anom.severity === 'WARNING' ? 'badge-warning' : 'badge-error'}`}>
                              {anom.anomalyType.replace('_', ' ')}
                            </span>
                          </div>
                          
                          <span style={{ fontSize: '0.85rem' }}>
                            {isResolved ? (
                              <span style={{ color: 'var(--color-success)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
                                <CheckCircle size={14} /> Resolved
                              </span>
                            ) : (
                              <span style={{ color: 'var(--color-warning)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
                                <AlertTriangle size={14} /> Review Pending
                              </span>
                            )}
                          </span>
                        </div>

                        <div>
                          <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{anom.anomalyDescription}</p>
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            <strong>Auto Action Taken:</strong> {anom.actionTaken}
                          </p>
                        </div>

                        {/* Interactive Resolution Section */}
                        {canResolve && (
                          <div style={{
                            borderTop: '1px solid var(--border-glass)',
                            paddingTop: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px'
                          }}>
                            {resolvingId !== anom.id ? (
                              <button
                                onClick={() => {
                                  setResolvingId(anom.id);
                                  setCorrectedDate('');
                                  setCorrectedPayer('');
                                }}
                                className="btn btn-secondary"
                                style={{ alignSelf: 'flex-start', padding: '6px 12px', fontSize: '0.8rem', display: 'inline-flex', gap: '4px' }}
                              >
                                <Settings size={12} />
                                Resolve Manually
                              </button>
                            ) : (
                              <div style={{
                                padding: '12px',
                                background: 'var(--bg-primary)',
                                border: '1px solid rgba(255,255,255,0.05)',
                                borderRadius: 'var(--radius-sm)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '12px'
                              }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                  Choose Resolution Action:
                                </span>

                                {isDupe && (
                                  <div>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                      Confirm this transaction is valid and not a duplicate to import it.
                                    </p>
                                    <button
                                      onClick={() => handleResolveAnomaly(anom.id, 'APPROVE')}
                                      className="btn btn-primary"
                                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                    >
                                      Approve & Import Expense
                                    </button>
                                  </div>
                                )}

                                {isAmbiguousDate && (
                                  <div style={{ display: 'flex', gap: '8px', alignItems: 'end', flexWrap: 'wrap' }}>
                                    <div className="input-group" style={{ marginBottom: 0 }}>
                                      <label className="input-label">Select Correct Date</label>
                                      <input
                                        type="date"
                                        className="input-field"
                                        style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                                        value={correctedDate}
                                        onChange={(e) => setCorrectedDate(e.target.value)}
                                      />
                                    </div>
                                    <button
                                      onClick={() => handleResolveAnomaly(anom.id, 'CORRECT_DATE', correctedDate)}
                                      className="btn btn-primary"
                                      disabled={!correctedDate}
                                      style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                                    >
                                      Resolve Date
                                    </button>
                                  </div>
                                )}

                                {isMissingPayer && (
                                  <div style={{ display: 'flex', gap: '8px', alignItems: 'end', flexWrap: 'wrap' }}>
                                    <div className="input-group" style={{ marginBottom: 0 }}>
                                      <label className="input-label">Assign Correct Payer</label>
                                      <select
                                        className="input-field"
                                        style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                                        value={correctedPayer}
                                        onChange={(e) => setCorrectedPayer(e.target.value)}
                                      >
                                        <option value="">Select User</option>
                                        {groupUsers.map(u => (
                                          <option key={u.id} value={u.id}>{u.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <button
                                      onClick={() => handleResolveAnomaly(anom.id, 'CORRECT_PAYER', correctedPayer)}
                                      disabled={!correctedPayer}
                                      className="btn btn-primary"
                                      style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                                    >
                                      Map Payer
                                    </button>
                                  </div>
                                )}

                                {!isDupe && !isAmbiguousDate && !isMissingPayer && (
                                  <div>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                      Confirm auto action and resolve warning review state.
                                    </p>
                                    <button
                                      onClick={() => handleResolveAnomaly(anom.id, 'APPROVE')}
                                      className="btn btn-primary"
                                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                    >
                                      Approve & Clear Review Block
                                    </button>
                                  </div>
                                )}

                                <button
                                  type="button"
                                  onClick={() => setResolvingId(null)}
                                  className="btn btn-secondary"
                                  style={{ padding: '6px 12px', fontSize: '0.75rem', marginTop: '6px' }}
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
