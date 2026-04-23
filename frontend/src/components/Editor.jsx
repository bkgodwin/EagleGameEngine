import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/index.js';
import Toolbar from './Toolbar.jsx';
import SceneHierarchy from './SceneHierarchy.jsx';
import Viewport from './Viewport.jsx';
import Inspector from './Inspector.jsx';
import BottomPanel from './BottomPanel.jsx';
import PlayMode from './PlayMode.jsx';
import Settings from './Settings.jsx';
import AdminPanel from './AdminPanel.jsx';
import Documentation from './Documentation.jsx';
import '../styles/editor.css';

export default function Editor({ navigate }) {
  const { isPlaying, sceneObjects, currentProject, addLog } = useStore();
  const viewportRef = useRef(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const autosaveTimer = useRef(null);
  const initDone = useRef(false);

  // Ctrl+S to save
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (viewportRef.current?.saveProject) {
          viewportRef.current.saveProject();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Autosave on scene edits (2-second debounce, skip initial load)
  useEffect(() => {
    if (!initDone.current) {
      initDone.current = true;
      return;
    }
    if (!currentProject || isPlaying) return;
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      if (viewportRef.current?.saveProject) {
        viewportRef.current.saveProject();
      }
    }, 2000);
    return () => clearTimeout(autosaveTimer.current);
  }, [sceneObjects]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isPlaying) return <PlayMode navigate={navigate} />;

  return (
    <div className="editor-container">
      <Toolbar
        navigate={navigate}
        viewportRef={viewportRef}
        onSettings={() => setShowSettings(true)}
        onAdmin={() => setShowAdmin(true)}
        onDocs={() => setShowDocs(true)}
      />
      <SceneHierarchy viewportRef={viewportRef} />
      <Viewport ref={viewportRef} />
      <Inspector viewportRef={viewportRef} />
      <BottomPanel />
      {showSettings && <Settings onClose={() => setShowSettings(false)} viewportRef={viewportRef} />}
      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
      {showDocs && <Documentation onClose={() => setShowDocs(false)} />}
    </div>
  );
}
