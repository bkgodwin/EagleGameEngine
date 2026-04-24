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
  aiBot: '🤖',
  group: '🗂️',
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
  { type: 'aiBot', label: 'AI Bot' },
];

export default function SceneHierarchy({ viewportRef }) {
  const { sceneObjects, selectedObjectId, selectedObjectIds, setSelectedObjectId, setSelectedObjectIds, updateSceneObject } = useStore();
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

  function handleItemClick(e, obj) {
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+click: toggle in multi-select
      const newIds = selectedObjectIds.includes(obj.id)
        ? selectedObjectIds.filter(i => i !== obj.id)
        : [...selectedObjectIds, obj.id];
      setSelectedObjectIds(newIds);
      setSelectedObjectId(obj.id);
    } else {
      setSelectedObjectIds([]);
      setSelectedObjectId(obj.id);
    }
    if (viewportRef?.current?.selectObject) viewportRef.current.selectObject(obj.id);
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

      {selectedObjectIds.length > 1 && (
        <div style={{ padding: '4px 12px 6px', fontSize: '11px', color: 'var(--color-accent)', background: 'rgba(100,180,255,0.1)', marginBottom: '4px' }}>
          <div style={{ marginBottom: '4px' }}>{selectedObjectIds.length} objects selected (Ctrl+click to add/remove)</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              className="btn btn-ghost"
              style={{ fontSize: '10px', padding: '2px 8px', flex: 1 }}
              title="Group selected objects"
              onClick={() => {
                const { addSceneObject, removeSceneObject: _r, updateSceneObject: _u } = useStore.getState();
                const groupId = 'group_' + Date.now();
                const groupName = 'Group ' + (sceneObjects.filter(o => o.type === 'group').length + 1);
                // Compute average position
                const selObjs = sceneObjects.filter(o => selectedObjectIds.includes(o.id));
                const avgPos = selObjs.reduce((acc, o) => ({ x: acc.x + (o.position?.x || 0) / selObjs.length, y: acc.y + (o.position?.y || 0) / selObjs.length, z: acc.z + (o.position?.z || 0) / selObjs.length }), { x: 0, y: 0, z: 0 });
                addSceneObject({ id: groupId, name: groupName, type: 'group', position: avgPos, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, childIds: [...selectedObjectIds] });
                selectedObjectIds.forEach(id => useStore.getState().updateSceneObject(id, { groupId }));
                setSelectedObjectIds([]);
                setSelectedObjectId(groupId);
              }}
            >📦 Group</button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: '10px', padding: '2px 8px', flex: 1 }}
              title="Delete all selected"
              onClick={() => {
                selectedObjectIds.forEach(id => { if (viewportRef?.current?.removeObject) viewportRef.current.removeObject(id); });
                setSelectedObjectIds([]);
                setSelectedObjectId(null);
              }}
            >🗑 Delete All</button>
          </div>
        </div>
      )}

      {/* Object list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sceneObjects.length === 0 && (
          <div style={{ padding: '20px 12px', color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center' }}>
            No objects in scene.<br />Add one above.
          </div>
        )}
        {sceneObjects.map(obj => {
          const isSelected = selectedObjectId === obj.id;
          const isMultiSelected = selectedObjectIds.includes(obj.id);
          return (
            <div
              key={obj.id}
              className={`hierarchy-item${isSelected ? ' selected' : ''}${isMultiSelected && !isSelected ? ' multi-selected' : ''}`}
              style={isMultiSelected && !isSelected ? { background: 'rgba(100,180,255,0.08)', borderLeft: '2px solid #42a5f5' } : {}}
              onClick={(e) => handleItemClick(e, obj)}
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
          );
        })}
      </div>
    </div>
  );
}
