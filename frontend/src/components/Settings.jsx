import React, { useState } from 'react';
import { useStore } from '../store/index.js';

export default function Settings({ onClose, viewportRef }) {
  const { settings, updateSettings } = useStore();
  const [local, setLocal] = useState({ ...settings });

  const handleApply = () => {
    updateSettings(local);
    if (viewportRef?.current?.applySettings) {
      viewportRef.current.applySettings(local);
    }
    onClose();
  };

  const field = (label, children) => (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '14px', gap: '12px' }}>
      <span style={{ width: '160px', color: 'var(--text-muted)', fontSize: '13px', flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  );

  return (
    <div className="modal-overlay">
      <div className="modal-panel" style={{ minWidth: '460px' }}>
        <div className="modal-title">
          ⚙ Settings
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {field('Render Distance',
          <>
            <input
              type="range"
              min="100" max="1000" step="50"
              value={local.renderDistance}
              onChange={e => setLocal(l => ({ ...l, renderDistance: parseInt(e.target.value) }))}
              style={{ flex: 1 }}
            />
            <span style={{ width: '40px', textAlign: 'right', fontSize: '13px' }}>{local.renderDistance}</span>
          </>
        )}

        {field('Shadow Quality',
          <select
            value={local.shadowQuality}
            onChange={e => setLocal(l => ({ ...l, shadowQuality: e.target.value }))}
            style={{ flex: 1 }}
          >
            <option value="off">Off</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        )}

        {field('Texture Quality',
          <select
            value={local.textureQuality}
            onChange={e => setLocal(l => ({ ...l, textureQuality: e.target.value }))}
            style={{ flex: 1 }}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        )}

        {field('Shadows Enabled',
          <input
            type="checkbox"
            checked={local.shadowsEnabled}
            onChange={e => setLocal(l => ({ ...l, shadowsEnabled: e.target.checked }))}
            style={{ width: 'auto' }}
          />
        )}

        {field('Lighting Quality',
          <select
            value={local.lightingQuality}
            onChange={e => setLocal(l => ({ ...l, lightingQuality: e.target.value }))}
            style={{ flex: 1 }}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleApply}>Apply</button>
        </div>
      </div>
    </div>
  );
}
