import React, { useState, useEffect } from 'react';
import { getProjects, createProject, getProject, deleteProject, clearToken } from '../api/index.js';
import { useStore } from '../store/index.js';
import '../styles/theme.css';

export default function Dashboard({ navigate }) {
  const { user, setCurrentProject, setSceneObjects } = useStore();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewInput, setShowNewInput] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    setLoading(true);
    try {
      const data = await getProjects();
      setProjects(data);
    } catch (err) {
      setError('Failed to load projects: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    setCreating(true);
    try {
      const proj = await createProject(newProjectName.trim(), { objects: [] });
      setProjects(prev => [proj, ...prev]);
      setShowNewInput(false);
      setNewProjectName('');
    } catch (err) {
      setError('Failed to create project: ' + err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleOpen(proj) {
    try {
      const full = await getProject(proj.id);
      setCurrentProject(full);
      const objs = full.data?.objects || [];
      setSceneObjects(objs);
      navigate('editor');
    } catch (err) {
      setError('Failed to open project: ' + err.message);
    }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`Delete project "${name}"? This cannot be undone.`)) return;
    try {
      await deleteProject(id);
      setProjects(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      setError('Failed to delete: ' + err.message);
    }
  }

  function handleLogout() {
    clearToken();
    navigate('login');
  }

  function formatDate(str) {
    if (!str) return '—';
    try { return new Date(str).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch { return str; }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-dark)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-color)', padding: '0 32px', height: '60px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{ fontSize: '28px' }}>🦅</span>
        <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-primary)' }}>Eagle Game Engine</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          {user?.username || user?.email || 'User'}
          {user?.is_admin && <span style={{ marginLeft: '6px', background: 'var(--color-primary)', color: '#fff', borderRadius: '3px', padding: '1px 6px', fontSize: '10px', verticalAlign: 'middle' }}>ADMIN</span>}
        </span>
        <button className="btn btn-ghost" onClick={handleLogout} style={{ fontSize: '13px' }}>Logout</button>
      </header>

      {/* Main content */}
      <main style={{ flex: 1, padding: '32px', maxWidth: '1100px', width: '100%', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '28px', gap: '16px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-accent)' }}>My Projects</h2>
          <span style={{ flex: 1 }} />
          {!showNewInput ? (
            <button className="btn btn-primary" onClick={() => setShowNewInput(true)}>+ New Project</button>
          ) : (
            <form onSubmit={handleCreate} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                autoFocus
                type="text"
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                placeholder="Project name…"
                style={{ width: '220px', padding: '8px 12px' }}
                maxLength={80}
              />
              <button type="submit" className="btn btn-primary" disabled={creating || !newProjectName.trim()}>
                {creating ? 'Creating…' : 'Create'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => { setShowNewInput(false); setNewProjectName(''); }}>Cancel</button>
            </form>
          )}
        </div>

        {error && (
          <div style={{ background: '#e6394620', border: '1px solid var(--color-primary)', borderRadius: '4px', padding: '10px 14px', marginBottom: '20px', color: 'var(--color-primary)', fontSize: '13px' }}>
            {error}
            <button onClick={() => setError('')} style={{ marginLeft: '8px', background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>×</button>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-muted)', fontSize: '15px' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>⏳</div>
            Loading projects…
          </div>
        ) : projects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '52px', marginBottom: '16px' }}>📁</div>
            <p style={{ fontSize: '16px', marginBottom: '8px' }}>No projects yet.</p>
            <p style={{ fontSize: '13px' }}>Click <strong style={{ color: 'var(--color-accent)' }}>+ New Project</strong> to get started.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
            {projects.map(proj => (
              <div
                key={proj.id}
                style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', transition: 'border-color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-secondary)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span style={{ fontSize: '28px' }}>🎮</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--color-accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proj.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Updated {formatDate(proj.updated_at || proj.created_at)}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    onClick={() => handleOpen(proj)}
                  >
                    Open
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ color: 'var(--color-primary)', borderColor: 'var(--color-primary)' }}
                    onClick={() => handleDelete(proj.id, proj.name)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
