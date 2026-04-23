import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/index.js';

const TYPE_ICONS = {
  cube: '📦',
  sphere: '🔮',
  plane: '▭',
  directionalLight: '☀️',
  pointLight: '💡',
  spotlight: '🔦',
  terrain: '🏔️',
  spawnPoint: '🚩',
  killVolume: '💀',
};

const ADD_TYPES = [
  { type: 'cube', label: 'Cube' },
  { type: 'sphere', label: 'Sphere' },
  { type: 'plane', label: 'Plane' },
  { type: 'directionalLight', label: 'Directional Light' },
  { type: 'pointLight', label: 'Point Light' },
  { type: 'spotlight', label: 'Spotlight' },
  { type: 'terrain', label: 'Terrain' },
  { type: 'spawnPoint', label: 'Spawn Point' },
  { type: 'killVolume', label: 'Kill Volume' },
];

export default function SceneHierarchy({ viewportRef }) {
  const { sceneObjects, selectedObjectId, setSelectedObjectId, updateSceneObject } = useStore();
  const [showDropdown, setShowDropdown] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleAddObject(type, label) {
    setShowDropdown(false);
    const name = `${label} ${sceneObjects.filter(o => o.type === type).length + 1}`;
    if (viewportRef?.current?.addObject) {
      viewportRef.current.addObject(type, name);
    }
  }

  function handleDelete(e, id) {
    e.stopPropagation();
    if (viewportRef?.current?.removeObject) {
      viewportRef.current.removeObject(id);
    }
  }

  function handleStartRename(e, obj) {
    e.stopPropagation();
    setRenamingId(obj.id);
    setRenameValue(obj.name);
  }

  function handleRenameSubmit(id) {
    if (renameValue.trim()) {
      updateSceneObject(id, { name: renameValue.trim() });
      if (viewportRef?.current?.updateObjectName) {
        viewportRef.current.updateObjectName(id, renameValue.trim());
      }
    }
    setRenamingId(null);
  }

  const overLimit = sceneObjects.length >= 90;

  return (
    <div className="scene-hierarchy">
      <div className="panel-header">
        <span>Scene Hierarchy</span>
        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{sceneObjects.length}</span>
      </div>

      {/* Add button */}
      <div style={{ padding: '8px 12px', position: 'relative' }} ref={dropdownRef}>
        <button
          className="btn btn-secondary"
          style={{ width: '100%', justifyContent: 'center', fontSize: '12px' }}
          onClick={() => setShowDropdown(v => !v)}
          disabled={overLimit}
          title={overLimit ? 'Object limit (90) reached' : 'Add object'}
        >
          + Add Object
        </button>

        {showDropdown && (
          <div className="add-object-dropdown">
            {ADD_TYPES.map(({ type, label }) => (
              <button key={type} onClick={() => handleAddObject(type, label)}>
                <span>{TYPE_ICONS[type]}</span>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {overLimit && (
        <div style={{ padding: '4px 12px', fontSize: '11px', color: '#ff9800', background: 'rgba(255,152,0,0.1)', marginBottom: '4px' }}>
          ⚠ Approaching object limit (90 max)
        </div>
      )}

      {/* Object list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sceneObjects.length === 0 && (
          <div style={{ padding: '20px 12px', color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center' }}>
            No objects in scene.<br />Add one above.
          </div>
        )}
        {sceneObjects.map(obj => (
          <div
            key={obj.id}
            className={`hierarchy-item${selectedObjectId === obj.id ? ' selected' : ''}`}
            onClick={() => {
              setSelectedObjectId(obj.id);
              if (viewportRef?.current?.selectObject) viewportRef.current.selectObject(obj.id);
            }}
            onDoubleClick={(e) => handleStartRename(e, obj)}
          >
            <span className="item-icon">{TYPE_ICONS[obj.type] || '📦'}</span>

            {renamingId === obj.id ? (
              <input
                autoFocus
                className="item-name"
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={() => handleRenameSubmit(obj.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRenameSubmit(obj.id);
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                style={{ flex: 1, background: '#0f3460', border: '1px solid var(--color-secondary)', borderRadius: '3px', padding: '1px 6px', fontSize: '12px', color: 'var(--color-accent)', outline: 'none' }}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className="item-name" title={obj.name}>{obj.name}</span>
            )}

            <button
              className="item-delete"
              onClick={(e) => handleDelete(e, obj.id)}
              title="Delete object"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
