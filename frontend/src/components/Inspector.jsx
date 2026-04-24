import React, { useState, useRef, useEffect } from 'react';
import { HexColorPicker } from 'react-colorful';
import { useStore } from '../store/index.js';

function XYZInput({ label, value, onChange, step = 0.1 }) {
  return (
    <div className="field-group">
      <div className="section-label" style={{ padding: '6px 0 2px', fontSize: '10px' }}>{label}</div>
      <div className="xyz-group">
        {['x', 'y', 'z'].map(axis => (
          <div className="xyz-input-wrap" key={axis}>
            <span style={{ color: axis === 'x' ? '#ef5350' : axis === 'y' ? '#66bb6a' : '#42a5f5' }}>{axis.toUpperCase()}</span>
            <input
              type="number"
              step={step}
              value={value?.[axis] ?? 0}
              onChange={e => onChange(axis, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Inspector({ viewportRef }) {
  const { sceneObjects, selectedObjectId, updateSceneObject } = useStore();
  const obj = sceneObjects.find(o => o.id === selectedObjectId);

  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorPickerRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target)) {
        setShowColorPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!obj) {
    return (
      <div className="inspector">
        <div className="panel-header"><span>Inspector</span></div>
        <p style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '13px' }}>
          Select an object to inspect it.
        </p>
      </div>
    );
  }

  const updateTransform = (field, axis, value) => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    const newVal = { ...(obj[field] || {}), [axis]: num };
    updateSceneObject(obj.id, { [field]: newVal });
    if (viewportRef?.current?.updateObjectTransform) {
      viewportRef.current.updateObjectTransform(
        obj.id,
        field === 'position' ? newVal : (obj.position || { x: 0, y: 0, z: 0 }),
        field === 'rotation' ? newVal : (obj.rotation || { x: 0, y: 0, z: 0 }),
        field === 'scale' ? newVal : (obj.scale || { x: 1, y: 1, z: 1 })
      );
    }
  };

  const updateMaterial = (updates) => {
    const newMat = { ...(obj.material || {}), ...updates };
    updateSceneObject(obj.id, { material: newMat });
    if (viewportRef?.current?.updateObjectMaterial) {
      viewportRef.current.updateObjectMaterial(obj.id, newMat.color || '#888888', !!newMat.wireframe);
    }
  };

  const updateLight = (updates) => {
    const newLight = { ...(obj.lightProps || {}), ...updates };
    updateSceneObject(obj.id, { lightProps: newLight });
    if (viewportRef?.current?.updateObjectLight) {
      viewportRef.current.updateObjectLight(obj.id, newLight);
    }
  };

  const isMesh = ['cube', 'sphere', 'plane'].includes(obj.type);
  const isPhysicsMesh = ['cube', 'sphere'].includes(obj.type);
  const isLight = ['directionalLight', 'pointLight', 'spotlight'].includes(obj.type);
  const isTerrain = obj.type === 'terrain';
  const isSpawn = obj.type === 'spawnPoint';
  const isKill = obj.type === 'killVolume';
  const isAiBot = obj.type === 'aiBot';
  const isGroup = obj.type === 'group';

  const mat = obj.material || {};
  const lightProps = obj.lightProps || { color: '#ffffff', intensity: 5, range: 500, angle: 30, castShadow: false };

  return (
    <div className="inspector">
      <div className="panel-header">
        <span>Inspector</span>
        <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>{obj.type}</span>
      </div>

      {/* Name */}
      <div className="inspector-section">
        <div className="inspector-section-title">🏷 Gameplay</div>
        <div className="field-group">
          <div className="field-row">
            <span className="field-label">Name</span>
            <input
              type="text"
              value={obj.name || ''}
              onChange={e => updateSceneObject(obj.id, { name: e.target.value })}
              style={{ flex: 1 }}
            />
          </div>
          <div className="field-row">
            <span className="field-label">Tags</span>
            <input
              type="text"
              value={obj.tags || ''}
              onChange={e => updateSceneObject(obj.id, { tags: e.target.value })}
              placeholder="tag1, tag2"
              style={{ flex: 1 }}
            />
          </div>
        </div>
      </div>

      {/* Transform */}
      <div className="inspector-section">
        <div className="inspector-section-title">📐 Transform</div>
        <XYZInput
          label="Position"
          value={obj.position || { x: 0, y: 0, z: 0 }}
          onChange={(axis, val) => updateTransform('position', axis, val)}
        />
        <XYZInput
          label="Rotation"
          value={obj.rotation || { x: 0, y: 0, z: 0 }}
          onChange={(axis, val) => updateTransform('rotation', axis, val)}
        />
        <XYZInput
          label="Scale"
          value={obj.scale || { x: 1, y: 1, z: 1 }}
          onChange={(axis, val) => updateTransform('scale', axis, val)}
          step={0.01}
        />
      </div>

      {/* Material */}
      {(isMesh || isTerrain) && (
        <div className="inspector-section">
          <div className="inspector-section-title">🎨 Material</div>
          <div className="field-group">
            <div className="field-row">
              <span className="field-label">Color</span>
              <div style={{ position: 'relative' }} ref={colorPickerRef}>
                <div
                  onClick={() => setShowColorPicker(v => !v)}
                  style={{ width: '36px', height: '22px', borderRadius: '3px', border: '1px solid var(--border-color)', cursor: 'pointer', background: mat.color || '#888888' }}
                />
                {showColorPicker && (
                  <div className="color-picker-popover" style={{ left: 0, top: '28px' }}>
                    <HexColorPicker
                      color={mat.color || '#888888'}
                      onChange={(c) => updateMaterial({ color: c })}
                    />
                    <div style={{ marginTop: '8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Hex:</span>
                      <input
                        type="text"
                        value={mat.color || '#888888'}
                        onChange={e => updateMaterial({ color: e.target.value })}
                        style={{ width: '80px', fontSize: '12px', padding: '2px 6px' }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '4px' }}>{mat.color || '#888888'}</span>
            </div>
            {!isTerrain && (
              <div className="field-row" style={{ marginTop: '4px' }}>
                <span className="field-label">Wireframe</span>
                <input
                  type="checkbox"
                  checked={!!mat.wireframe}
                  onChange={e => updateMaterial({ wireframe: e.target.checked })}
                  style={{ width: 'auto', padding: 0 }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Texture */}
      {(isMesh || isTerrain) && (
        <div className="inspector-section">
          <div className="inspector-section-title">🖼 Texture</div>
          <div className="field-group">
            <div className="field-row">
              <span className="field-label">Texture URL</span>
              <input
                type="text"
                value={obj.textureUrl || ''}
                onChange={e => updateSceneObject(obj.id, { textureUrl: e.target.value })}
                placeholder="https://... or local path"
                style={{ flex: 1, fontSize: '11px' }}
              />
            </div>
            <div className="field-row" style={{ marginTop: '4px' }}>
              <span className="field-label">Upload File</span>
              <button
                className="btn btn-ghost"
                style={{ fontSize: '11px' }}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      updateSceneObject(obj.id, { textureUrl: ev.target.result });
                      if (viewportRef?.current?.updateObjectTexture) {
                        viewportRef.current.updateObjectTexture(obj.id, ev.target.result, obj.textureRepeat || 1);
                      }
                    };
                    reader.readAsDataURL(file);
                  };
                  input.click();
                }}
              >📂 Browse</button>
            </div>
            <div className="field-row">
              <span className="field-label">Tiling</span>
              <input
                type="range"
                min="1" max="50" step="1"
                value={obj.textureRepeat || 1}
                onChange={e => {
                  const v = parseInt(e.target.value);
                  updateSceneObject(obj.id, { textureRepeat: v });
                  if (viewportRef?.current?.updateObjectTexture) {
                    viewportRef.current.updateObjectTexture(obj.id, obj.textureUrl || null, v);
                  }
                }}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: '11px', width: '24px', textAlign: 'right' }}>{obj.textureRepeat || 1}x</span>
            </div>
          </div>
        </div>
      )}

      {/* Physics (cube and sphere only) */}
      {isPhysicsMesh && (
        <div className="inspector-section">
          <div className="inspector-section-title">⚙ Physics</div>
          <div className="field-group">
            <div className="field-row">
              <span className="field-label">Simulate Physics</span>
              <input
                type="checkbox"
                checked={!!obj.simulatePhysics}
                onChange={e => updateSceneObject(obj.id, { simulatePhysics: e.target.checked })}
                style={{ width: 'auto', padding: 0 }}
              />
            </div>
            <div className="field-row">
              <span className="field-label">Enable Collision</span>
              <input
                type="checkbox"
                checked={obj.enableCollision !== false}
                onChange={e => updateSceneObject(obj.id, { enableCollision: e.target.checked })}
                style={{ width: 'auto', padding: 0 }}
              />
            </div>
            <div className="field-row">
              <span className="field-label">Mass (kg)</span>
              <input
                type="number"
                min="0.01"
                step="0.1"
                value={obj.mass != null ? obj.mass : 1}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v > 0) updateSceneObject(obj.id, { mass: v });
                }}
                style={{ width: '80px' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Light properties */}
      {isLight && (
        <div className="inspector-section">
          <div className="inspector-section-title">💡 Light</div>
          <div className="field-group">
            <div className="field-row">
              <span className="field-label">Color</span>
              <input
                type="color"
                value={lightProps.color || '#ffffff'}
                onChange={e => updateLight({ color: e.target.value })}
                style={{ width: '36px', height: '22px', padding: 0, border: 'none', cursor: 'pointer', background: 'none' }}
              />
            </div>
            <div className="field-row">
              <span className="field-label">Intensity</span>
              <input
                type="range"
                min="0" max="50" step="0.5"
                value={lightProps.intensity ?? 5}
                onChange={e => updateLight({ intensity: parseFloat(e.target.value) })}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: '11px', width: '28px', textAlign: 'right' }}>{(lightProps.intensity ?? 5).toFixed(1)}</span>
            </div>
            {(obj.type === 'pointLight' || obj.type === 'spotlight') && (
              <div className="field-row">
                <span className="field-label">Attenuation Dist.</span>
                <input
                  type="number"
                  value={lightProps.range ?? 500}
                  onChange={e => updateLight({ range: parseFloat(e.target.value) })}
                  step="10" min="0"
                  style={{ flex: 1 }}
                />
              </div>
            )}
            {obj.type === 'spotlight' && (
              <div className="field-row">
                <span className="field-label">Angle</span>
                <input
                  type="number"
                  value={lightProps.angle ?? 30}
                  onChange={e => updateLight({ angle: parseFloat(e.target.value) })}
                  step="1" min="1" max="89"
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>°</span>
              </div>
            )}
            <div className="field-row">
              <span className="field-label">Shadows</span>
              <input
                type="checkbox"
                checked={!!lightProps.castShadow}
                onChange={e => updateLight({ castShadow: e.target.checked })}
                style={{ width: 'auto', padding: 0 }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Terrain tools */}
      {isTerrain && (
        <div className="inspector-section">
          <div className="inspector-section-title">🏔 Terrain Sculpt</div>
          <div className="field-group">
            <div className="field-row">
              <span className="field-label">Tool</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                {['raise', 'lower', 'smooth'].map(tool => (
                  <label key={tool} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '12px' }}>
                    <input
                      type="radio"
                      name="terrain-tool"
                      value={tool}
                      checked={(obj.terrainTool || 'raise') === tool}
                      onChange={() => updateSceneObject(obj.id, { terrainTool: tool })}
                      style={{ width: 'auto', padding: 0 }}
                    />
                    {tool.charAt(0).toUpperCase() + tool.slice(1)}
                  </label>
                ))}
              </div>
            </div>
            <div className="field-row">
              <span className="field-label">Brush Size</span>
              <input
                type="range"
                min="1" max="30" step="0.5"
                value={obj.brushSize || 8}
                onChange={e => updateSceneObject(obj.id, { brushSize: parseFloat(e.target.value) })}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: '11px', width: '24px', textAlign: 'right' }}>{obj.brushSize || 8}</span>
            </div>
            <div className="field-row">
              <span className="field-label">Strength</span>
              <input
                type="range"
                min="0.01" max="2" step="0.01"
                value={obj.brushStrength || 0.3}
                onChange={e => updateSceneObject(obj.id, { brushStrength: parseFloat(e.target.value) })}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: '11px', width: '30px', textAlign: 'right' }}>{(obj.brushStrength || 0.3).toFixed(2)}</span>
            </div>
            <div style={{ paddingTop: '4px' }}>
              <label style={{ display: 'block', cursor: 'pointer' }}>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: '12px', width: '100%', justifyContent: 'center' }}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = (e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const img = new Image();
                        img.onload = () => {
                          const canvas = document.createElement('canvas');
                          canvas.width = img.width; canvas.height = img.height;
                          const ctx = canvas.getContext('2d');
                          ctx.drawImage(img, 0, 0);
                          const imageData = ctx.getImageData(0, 0, img.width, img.height);
                          if (viewportRef?.current?.importHeightmap) {
                            viewportRef.current.importHeightmap(obj.id, imageData);
                          }
                        };
                        img.src = ev.target.result;
                      };
                      reader.readAsDataURL(file);
                    };
                    input.click();
                  }}
                >
                  📥 Import Heightmap
                </button>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Spawn Point */}
      {isSpawn && (
        <div className="inspector-section">
          <div className="inspector-section-title">🚩 Spawn Point</div>
          <div className="field-group">
            <div className="field-row">
              <span className="field-label">AI Spawn</span>
              <input
                type="checkbox"
                checked={!!obj.isAiSpawn}
                onChange={e => updateSceneObject(obj.id, { isAiSpawn: e.target.checked })}
                style={{ width: 'auto', padding: 0 }}
              />
            </div>
            {!obj.isAiSpawn && (
              <div className="field-row">
                <span className="field-label">Index</span>
                <input
                  type="number"
                  value={obj.spawnIndex ?? 0}
                  onChange={e => updateSceneObject(obj.id, { spawnIndex: parseInt(e.target.value) || 0 })}
                  min="0"
                  style={{ flex: 1 }}
                />
              </div>
            )}
            {obj.isAiSpawn && (
              <>
                <div className="field-row">
                  <span className="field-label">AI Type</span>
                  <select
                    value={obj.aiSpawnType || 'zombie'}
                    onChange={e => updateSceneObject(obj.id, { aiSpawnType: e.target.value })}
                    style={{ flex: 1 }}
                  >
                    <option value="zombie">Zombie</option>
                    <option value="soldier">Soldier</option>
                  </select>
                </div>
                <div className="field-row">
                  <span className="field-label">Max Enemies</span>
                  <input
                    type="number"
                    value={obj.aiSpawnMaxEnemies ?? 3}
                    onChange={e => updateSceneObject(obj.id, { aiSpawnMaxEnemies: Math.min(10, Math.max(1, parseInt(e.target.value) || 1)) })}
                    min="1" max="10"
                    style={{ flex: 1 }}
                  />
                </div>
                <div className="field-row">
                  <span className="field-label">Spawn Rate (s)</span>
                  <input
                    type="number"
                    value={obj.aiSpawnRate ?? 5}
                    onChange={e => updateSceneObject(obj.id, { aiSpawnRate: Math.max(1, parseFloat(e.target.value) || 5) })}
                    min="1" step="0.5"
                    style={{ flex: 1 }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Kill Volume */}
      {isKill && (
        <div className="inspector-section">
          <div className="inspector-section-title">💀 Kill Volume</div>
          <div className="field-group">
            <div className="field-row">
              <span className="field-label">Message</span>
              <input
                type="text"
                value={obj.deathMessage || 'You were killed!'}
                onChange={e => updateSceneObject(obj.id, { deathMessage: e.target.value })}
                style={{ flex: 1 }}
              />
            </div>
          </div>
        </div>
      )}

      {/* AI Bot */}
      {isAiBot && (
        <div className="inspector-section">
          <div className="inspector-section-title">🤖 AI Bot</div>
          <div className="field-group">
            <div className="field-row">
              <span className="field-label">Type</span>
              <select
                value={obj.aiType || 'zombie'}
                onChange={e => updateSceneObject(obj.id, { aiType: e.target.value })}
                style={{ flex: 1 }}
              >
                <option value="zombie">Zombie</option>
                <option value="soldier">Soldier</option>
              </select>
            </div>
            <div className="field-row">
              <span className="field-label">Health</span>
              <input
                type="number"
                value={obj.aiHealth ?? 100}
                onChange={e => updateSceneObject(obj.id, { aiHealth: parseInt(e.target.value) || 100 })}
                step="10" min="1"
                style={{ flex: 1 }}
              />
            </div>
            <div className="field-row">
              <span className="field-label">Patrol R.</span>
              <input
                type="number"
                value={obj.patrolRadius ?? 10}
                onChange={e => updateSceneObject(obj.id, { patrolRadius: parseFloat(e.target.value) || 10 })}
                step="1" min="1"
                style={{ flex: 1 }}
              />
            </div>
            <div className="field-row">
              <span className="field-label">Detect R.</span>
              <input
                type="number"
                value={obj.detectRadius ?? 15}
                onChange={e => updateSceneObject(obj.id, { detectRadius: parseFloat(e.target.value) || 15 })}
                step="1" min="1"
                style={{ flex: 1 }}
              />
            </div>
            <div className="field-row">
              <span className="field-label">Damage</span>
              <input
                type="number"
                value={obj.attackDamage ?? 10}
                onChange={e => updateSceneObject(obj.id, { attackDamage: parseInt(e.target.value) || 10 })}
                step="1" min="0"
                style={{ flex: 1 }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Group */}
      {isGroup && (
        <div className="inspector-section">
          <div className="inspector-section-title">🗂️ Group</div>
          <div className="field-group">
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              {(obj.childIds || []).length} children
            </div>
            <button
              className="btn btn-ghost"
              style={{ fontSize: '12px', width: '100%' }}
              onClick={() => {
                // Ungroup: remove groupId from all children, remove this group object
                (obj.childIds || []).forEach(cid => updateSceneObject(cid, { groupId: undefined }));
                updateSceneObject(obj.id, { _delete: true });
                if (viewportRef?.current?.removeObject) viewportRef.current.removeObject(obj.id);
              }}
            >
              📤 Ungroup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
