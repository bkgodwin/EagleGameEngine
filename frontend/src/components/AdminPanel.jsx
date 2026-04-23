import React, { useState, useEffect } from 'react';
import {
  adminGetUsers, adminUpdateUser, adminDeleteUser, adminResetPassword,
  adminGetSettings, adminUpdateSettings, adminGetStats,
} from '../api/index.js';

export default function AdminPanel({ onClose }) {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [siteSettings, setSiteSettings] = useState({ registration_enabled: true, max_players: 16, storage_limit_mb: 500 });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (tab === 'users') loadUsers();
    else if (tab === 'settings') loadSettings();
    else if (tab === 'stats') loadStats();
  }, [tab]);

  async function loadUsers() {
    setLoading(true); setError('');
    try { setUsers(await adminGetUsers()); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function loadSettings() {
    setLoading(true); setError('');
    try { setSiteSettings(await adminGetSettings()); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function loadStats() {
    setLoading(true); setError('');
    try { setStats(await adminGetStats()); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function toggleAdmin(user) {
    try {
      const updated = await adminUpdateUser(user.id, { is_admin: !user.is_admin });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, ...updated } : u));
    } catch (e) { setError(e.message); }
  }

  async function toggleActive(user) {
    try {
      const updated = await adminUpdateUser(user.id, { is_active: !user.is_active });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, ...updated } : u));
    } catch (e) { setError(e.message); }
  }

  async function handleResetPassword(user) {
    const newPwd = window.prompt(`New password for ${user.username}:`);
    if (!newPwd) return;
    try {
      await adminResetPassword(user.id, newPwd);
      setMsg('Password reset for ' + user.username);
      setTimeout(() => setMsg(''), 3000);
    } catch (e) { setError(e.message); }
  }

  async function handleDeleteUser(user) {
    if (!window.confirm(`Delete user "${user.username}"? This is permanent.`)) return;
    try {
      await adminDeleteUser(user.id);
      setUsers(prev => prev.filter(u => u.id !== user.id));
    } catch (e) { setError(e.message); }
  }

  async function saveSettings() {
    try {
      await adminUpdateSettings(siteSettings);
      setMsg('Settings saved.');
      setTimeout(() => setMsg(''), 2000);
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-panel" style={{ minWidth: '700px', maxHeight: '80vh' }}>
        <div className="modal-title">
          👥 Admin Panel
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="tab-bar">
          {['users', 'settings', 'stats'].map(t => (
            <button key={t} className={`tab-btn${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {error && <div style={{ background: '#e6394620', border: '1px solid var(--color-primary)', borderRadius: '4px', padding: '8px 12px', marginBottom: '12px', color: 'var(--color-primary)', fontSize: '13px' }}>{error}</div>}
        {msg && <div style={{ background: '#4caf5020', border: '1px solid #4caf50', borderRadius: '4px', padding: '8px 12px', marginBottom: '12px', color: '#4caf50', fontSize: '13px' }}>{msg}</div>}

        {loading && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading…</div>}

        {/* Users tab */}
        {tab === 'users' && !loading && (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Username</th>
                  <th>Admin</th>
                  <th>Active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td style={{ fontSize: '12px' }}>{user.email}</td>
                    <td>{user.username}</td>
                    <td>
                      <input type="checkbox" checked={!!user.is_admin} onChange={() => toggleAdmin(user)} style={{ width: 'auto' }} />
                    </td>
                    <td>
                      <input type="checkbox" checked={!!user.is_active} onChange={() => toggleActive(user)} style={{ width: 'auto' }} />
                    </td>
                    <td style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn btn-ghost" style={{ fontSize: '11px', padding: '3px 8px' }} onClick={() => handleResetPassword(user)}>Reset Pwd</button>
                      <button className="btn btn-danger" style={{ fontSize: '11px', padding: '3px 8px' }} onClick={() => handleDeleteUser(user)}>Delete</button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>No users found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Settings tab */}
        {tab === 'settings' && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ width: '200px', color: 'var(--text-muted)', fontSize: '13px' }}>Registration Enabled</span>
              <input
                type="checkbox"
                checked={!!siteSettings.registration_enabled}
                onChange={e => setSiteSettings(s => ({ ...s, registration_enabled: e.target.checked }))}
                style={{ width: 'auto' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ width: '200px', color: 'var(--text-muted)', fontSize: '13px' }}>Max Players</span>
              <input
                type="range" min="2" max="64" step="2"
                value={siteSettings.max_players || 16}
                onChange={e => setSiteSettings(s => ({ ...s, max_players: parseInt(e.target.value) }))}
                style={{ flex: 1 }}
              />
              <span style={{ width: '36px', textAlign: 'right', fontSize: '13px' }}>{siteSettings.max_players || 16}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ width: '200px', color: 'var(--text-muted)', fontSize: '13px' }}>Storage Limit (MB)</span>
              <input
                type="number"
                value={siteSettings.storage_limit_mb || 500}
                onChange={e => setSiteSettings(s => ({ ...s, storage_limit_mb: parseInt(e.target.value) }))}
                style={{ flex: 1 }}
                min="10"
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={saveSettings}>Save Settings</button>
            </div>
          </div>
        )}

        {/* Stats tab */}
        {tab === 'stats' && !loading && stats && (
          <div className="stat-cards">
            {[
              { label: 'Total Users', value: stats.total_users ?? '—', icon: '👤' },
              { label: 'Total Projects', value: stats.total_projects ?? '—', icon: '🎮' },
              { label: 'Total Assets', value: stats.total_assets ?? '—', icon: '📦' },
              { label: 'Storage Used', value: stats.total_storage_mb != null ? stats.total_storage_mb.toFixed(1) + ' MB' : '—', icon: '💾' },
            ].map(s => (
              <div key={s.label} className="stat-card">
                <div style={{ fontSize: '28px', marginBottom: '6px' }}>{s.icon}</div>
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        )}
        {tab === 'stats' && !loading && !stats && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No stats available.</div>
        )}
      </div>
    </div>
  );
}
