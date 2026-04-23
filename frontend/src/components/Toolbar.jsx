import React, { useState } from 'react';
import { useStore } from '../store/index.js';
import { clearToken } from '../api/index.js';

export default function Toolbar({ navigate, viewportRef, onSettings, onAdmin, onDocs }) {
  const { user, isPlaying, setIsPlaying, editorMode, setEditorMode, currentProject } = useStore();
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (viewportRef?.current?.saveProject) {
      await viewportRef.current.saveProject();
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  };

  const handleBack = async () => {
    if (viewportRef?.current?.saveProject) {
      await viewportRef.current.saveProject();
    }
    navigate('dashboard');
  };

  const modes = [
    { key: 'select', icon: '↖', label: 'Select' },
    { key: 'translate', icon: '↔', label: 'Move' },
    { key: 'rotate', icon: '↻', label: 'Rotate' },
    { key: 'scale', icon: '⤢', label: 'Scale' },
  ];

  return (
    <div className="toolbar">
      {/* Logo */}
      <span style={{ fontSize: '22px', marginRight: '4px' }}>🦅</span>

      {/* Back button */}
      <button className="toolbar-btn" onClick={handleBack} title="Back to Dashboard">
        ← Dashboard
      </button>

      <div className="toolbar-divider" />

      {/* Save */}
      <button className="toolbar-btn" onClick={handleSave} title="Save (Ctrl+S)">
        💾 {saved ? 'Saved!' : 'Save'}
      </button>

      <div className="toolbar-divider" />

      {/* Play / Stop */}
      {!isPlaying ? (
        <button
          className="toolbar-btn"
          onClick={() => setIsPlaying(true)}
          title="Enter Play Mode"
          style={{ color: '#4caf50' }}
        >
          ▶ Play
        </button>
      ) : (
        <button
          className="toolbar-btn"
          onClick={() => setIsPlaying(false)}
          title="Stop Play Mode"
          style={{ color: 'var(--color-primary)' }}
        >
          ⏹ Stop
        </button>
      )}

      <div className="toolbar-divider" />

      {/* Transform mode buttons */}
      {modes.map(m => (
        <button
          key={m.key}
          className={`toolbar-btn${editorMode === m.key ? ' active' : ''}`}
          onClick={() => setEditorMode(m.key)}
          title={m.label}
        >
          {m.icon} {m.label}
        </button>
      ))}

      <div className="toolbar-divider" />

      {/* Settings / Admin / Docs */}
      <button className="toolbar-btn" onClick={onSettings} title="Settings">⚙ Settings</button>
      {user?.is_admin && (
        <button className="toolbar-btn" onClick={onAdmin} title="Admin Panel">👥 Admin</button>
      )}
      <button className="toolbar-btn" onClick={onDocs} title="Documentation">? Docs</button>

      <div className="toolbar-spacer" />

      {/* Project name + user info */}
      {currentProject && (
        <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginRight: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
          📂 {currentProject.name}
        </span>
      )}
      <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginRight: '8px' }}>
        🌐 0 online
      </span>
      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
        {user?.username || user?.email || ''}
      </span>
    </div>
  );
}
