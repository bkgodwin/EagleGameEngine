import React, { useState } from 'react';
import { useStore } from '../store/index.js';

export default function Settings({ onClose, viewportRef }) {
  const { settings, updateSettings, snapSettings, updateSnapSettings, globalLighting, updateGlobalLighting, projectSettings, updateProjectSettings } = useStore();
  const [localSettings, setLocalSettings] = useState({ ...settings });
  const [localSnap, setLocalSnap] = useState({ ...snapSettings });
  const [localLighting, setLocalLighting] = useState({ ...globalLighting });
  const [localProject, setLocalProject] = useState({ ...projectSettings });
  const [activeTab, setActiveTab] = useState('graphics');

  const handleApply = () => {
    updateSettings(localSettings);
    updateSnapSettings(localSnap);
    updateGlobalLighting(localLighting);
    updateProjectSettings(localProject);
    if (viewportRef?.current?.applySettings) {
      viewportRef.current.applySettings(localSettings);
    }
    if (viewportRef?.current?.applyGlobalLighting) {
      viewportRef.current.applyGlobalLighting(localLighting);
    }
    onClose();
  };

  const field = (label, children) => (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '14px', gap: '12px' }}>
      <span style={{ width: '160px', color: 'var(--text-muted)', fontSize: '13px', flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  );

  const tabs = [
    { key: 'graphics', label: '🖥 Graphics' },
    { key: 'lighting', label: '☀️ Lighting' },
    { key: 'snap', label: '🧲 Snap' },
    { key: 'game', label: '🎮 Game Rules' },
  ];

  return (
    <div className="modal-overlay">
      <div className="modal-panel" style={{ minWidth: '480px' }}>
        <div className="modal-title">
          ⚙ Settings
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* Tabs */}
        <div className="tab-bar" style={{ marginBottom: '18px' }}>
          {tabs.map(t => (
            <button
              key={t.key}
              className={`tab-btn${activeTab === t.key ? ' active' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'graphics' && (
          <>
            {field('Render Distance',
              <>
                <input type="range" min="100" max="1000" step="50" value={localSettings.renderDistance}
                  onChange={e => setLocalSettings(l => ({ ...l, renderDistance: parseInt(e.target.value) }))} style={{ flex: 1 }} />
                <span style={{ width: '40px', textAlign: 'right', fontSize: '13px' }}>{localSettings.renderDistance}</span>
              </>
            )}
            {field('Shadow Quality',
              <select value={localSettings.shadowQuality}
                onChange={e => setLocalSettings(l => ({ ...l, shadowQuality: e.target.value }))} style={{ flex: 1 }}>
                <option value="off">Off</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            )}
            {field('Texture Quality',
              <select value={localSettings.textureQuality}
                onChange={e => setLocalSettings(l => ({ ...l, textureQuality: e.target.value }))} style={{ flex: 1 }}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            )}
            {field('Shadows Enabled',
              <input type="checkbox" checked={localSettings.shadowsEnabled}
                onChange={e => setLocalSettings(l => ({ ...l, shadowsEnabled: e.target.checked }))} style={{ width: 'auto' }} />
            )}
            {field('Lighting Quality',
              <select value={localSettings.lightingQuality}
                onChange={e => setLocalSettings(l => ({ ...l, lightingQuality: e.target.value }))} style={{ flex: 1 }}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            )}
          </>
        )}

        {activeTab === 'lighting' && (
          <>
            {field('Sun Color',
              <input type="color" value={localLighting.sunColor}
                onChange={e => setLocalLighting(l => ({ ...l, sunColor: e.target.value }))}
                style={{ width: '60px', height: '28px', padding: 0, border: 'none', cursor: 'pointer', background: 'none' }} />
            )}
            {field('Sun Intensity',
              <>
                <input type="range" min="0" max="5" step="0.1" value={localLighting.sunIntensity}
                  onChange={e => setLocalLighting(l => ({ ...l, sunIntensity: parseFloat(e.target.value) }))} style={{ flex: 1 }} />
                <span style={{ width: '32px', textAlign: 'right', fontSize: '13px' }}>{localLighting.sunIntensity.toFixed(1)}</span>
              </>
            )}
            {field('Sun X',
              <input type="number" value={localLighting.sunX} step="10"
                onChange={e => setLocalLighting(l => ({ ...l, sunX: parseFloat(e.target.value) || 0 }))}
                style={{ flex: 1 }} />
            )}
            {field('Sun Y',
              <input type="number" value={localLighting.sunY} step="10"
                onChange={e => setLocalLighting(l => ({ ...l, sunY: parseFloat(e.target.value) || 0 }))}
                style={{ flex: 1 }} />
            )}
            {field('Sun Z',
              <input type="number" value={localLighting.sunZ} step="10"
                onChange={e => setLocalLighting(l => ({ ...l, sunZ: parseFloat(e.target.value) || 0 }))}
                style={{ flex: 1 }} />
            )}
            {field('Ambient Color',
              <input type="color" value={localLighting.ambientColor}
                onChange={e => setLocalLighting(l => ({ ...l, ambientColor: e.target.value }))}
                style={{ width: '60px', height: '28px', padding: 0, border: 'none', cursor: 'pointer', background: 'none' }} />
            )}
            {field('Ambient Intensity',
              <>
                <input type="range" min="0" max="3" step="0.05" value={localLighting.ambientIntensity}
                  onChange={e => setLocalLighting(l => ({ ...l, ambientIntensity: parseFloat(e.target.value) }))} style={{ flex: 1 }} />
                <span style={{ width: '32px', textAlign: 'right', fontSize: '13px' }}>{localLighting.ambientIntensity.toFixed(2)}</span>
              </>
            )}
          </>
        )}

        {activeTab === 'snap' && (
          <>
            {field('Snapping',
              <input type="checkbox" checked={localSnap.enabled}
                onChange={e => setLocalSnap(l => ({ ...l, enabled: e.target.checked }))} style={{ width: 'auto' }} />
            )}
            {field('Translate Snap',
              <>
                <input type="number" value={localSnap.translate} step="0.1" min="0.01"
                  onChange={e => setLocalSnap(l => ({ ...l, translate: parseFloat(e.target.value) || 0.5 }))} style={{ flex: 1 }} />
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>units</span>
              </>
            )}
            {field('Rotate Snap',
              <>
                <input type="number" value={localSnap.rotate} step="1" min="1" max="90"
                  onChange={e => setLocalSnap(l => ({ ...l, rotate: parseFloat(e.target.value) || 15 }))} style={{ flex: 1 }} />
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>degrees</span>
              </>
            )}
            {field('Scale Snap',
              <>
                <input type="number" value={localSnap.scale} step="0.05" min="0.01"
                  onChange={e => setLocalSnap(l => ({ ...l, scale: parseFloat(e.target.value) || 0.25 }))} style={{ flex: 1 }} />
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>units</span>
              </>
            )}
          </>
        )}

        {activeTab === 'game' && (
          <>
            {field('PVP Damage',
              <input type="checkbox" checked={localProject.pvpDamage}
                onChange={e => setLocalProject(l => ({ ...l, pvpDamage: e.target.checked }))} style={{ width: 'auto' }} />
            )}
            {field('Weapon Damage',
              <>
                <input type="number" value={localProject.weaponDamage} step="5" min="1" max="200"
                  onChange={e => setLocalProject(l => ({ ...l, weaponDamage: parseInt(e.target.value) || 25 }))} style={{ flex: 1 }} />
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>HP</span>
              </>
            )}
            {field('AI Attack Damage',
              <>
                <input type="number" value={localProject.aiAttackDamage ?? 10} step="5" min="1" max="200"
                  onChange={e => setLocalProject(l => ({ ...l, aiAttackDamage: parseInt(e.target.value) || 10 }))} style={{ flex: 1 }} />
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>HP</span>
              </>
            )}
            {field('AI Health',
              <>
                <input type="number" value={localProject.aiHealth ?? 100} step="10" min="1" max="1000"
                  onChange={e => setLocalProject(l => ({ ...l, aiHealth: parseInt(e.target.value) || 100 }))} style={{ flex: 1 }} />
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>HP</span>
              </>
            )}
            {field('Max Players',
              <select value={localProject.maxPlayers}
                onChange={e => setLocalProject(l => ({ ...l, maxPlayers: parseInt(e.target.value) }))} style={{ flex: 1 }}>
                {[2, 4, 6, 8].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleApply}>Apply</button>
        </div>
      </div>
    </div>
  );
}
