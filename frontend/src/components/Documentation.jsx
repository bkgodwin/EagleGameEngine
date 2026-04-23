import React, { useState } from 'react';

const SECTIONS = [
  { id: 'getting-started', title: '1. Getting Started', content: `Welcome to Eagle Game Engine — a browser-based 3D game editor powered by Three.js.\n\nTo create your first project, log in and click "+ New Project" on the Dashboard. Enter a name and the project opens in the Editor.\n\nBasic workflow: Add objects via the Scene Hierarchy panel → adjust properties in the Inspector → press ▶ Play to test your scene → save with Ctrl+S.` },
  { id: 'editor-interface', title: '2. The Editor Interface', content: `The editor is divided into five areas:\n\n• Toolbar (top): Save, Play/Stop, transform mode buttons, Settings, Docs.\n• Scene Hierarchy (left): Lists all objects. Click to select, double-click to rename, × to delete.\n• Viewport (center): Interactive 3D view. Right-drag to orbit, middle-drag to pan, scroll to zoom.\n• Inspector (right): Edit transform, material, light and gameplay properties of the selected object.\n• Console (bottom): Real-time log messages from engine and save operations.` },
  { id: 'creating-objects', title: '3. Creating Objects', content: `Click "+ Add Object" in the Scene Hierarchy to reveal a dropdown menu of object types:\n\n📦 Cube, 🔮 Sphere, ▭ Plane — Basic 3D primitives.\n☀️ Directional Light, 💡 Point Light, 🔦 Spotlight — Scene lighting.\n🏔️ Terrain — A 100×100 sculpt-able heightmap mesh.\n🚩 Spawn Point — Where players appear in Play Mode.\n💀 Kill Volume — Triggers instant death on contact.\n\nEach object can be transformed via the Inspector or the translate gizmo (↔ mode).` },
  { id: 'materials', title: '4. Materials & Textures', content: `Select a mesh object (cube, sphere, plane, terrain) and open the Material section in the Inspector.\n\nClick the color swatch to open the HexColorPicker. You can also type a hex value directly.\n\nToggle Wireframe to render only edges — useful for debugging geometry.\n\nTerrain uses a separate green material automatically. You can change its color like any other mesh.` },
  { id: 'lighting', title: '5. Lighting', content: `Eagle supports three light types:\n\n• Directional Light — simulates sunlight; affects the entire scene from a direction.\n• Point Light — emits light in all directions from a point; set Range to control falloff.\n• Spotlight — cone-shaped light; control Angle (degrees) and Range.\n\nAll lights have Intensity (0–10) and Color controls. Enable Cast Shadow to produce real-time shadows (costs performance).` },
  { id: 'terrain', title: '6. Terrain', content: `Add a Terrain object and select it. In the Inspector under "Terrain Sculpt":\n\n• Raise / Lower / Smooth — radio buttons to choose sculpt tool.\n• Brush Size — radius of the sculpt area in world units.\n• Strength — how much height changes per click.\n\nClick on the terrain in the Viewport to sculpt.\n\nImport Heightmap lets you load a grayscale PNG image to set terrain heights automatically (white = high, black = low).` },
  { id: 'play-mode', title: '7. Play Mode & Controls', content: `Press ▶ Play in the toolbar to enter first-person Play Mode.\n\nControls:\n• WASD — move forward/backward/strafe.\n• Shift — sprint.\n• Space — jump.\n• Mouse — look around (pointer lock).\n• Left Click — shoot (yellow tracer ray).\n• Escape — exit Play Mode.\n\nYour health is displayed top-left. Walking into a Kill Volume deals instant damage. Spawn Points determine starting positions.` },
  { id: 'multiplayer', title: '8. Multiplayer', content: `Eagle Game Engine supports real-time multiplayer via WebSockets.\n\nWhen in Play Mode the NetworkManager attempts to connect to the /ws/multiplayer/{roomId} endpoint. Other players' positions are interpolated smoothly.\n\nPlayer count is shown top-right in Play Mode. The server broadcasts player_update, shoot, damage, and chat messages. Disconnects auto-reconnect after 3 seconds.` },
  { id: 'ai-agents', title: '9. AI Agents', content: `The backend includes an AI agent system. Agents are server-side bots that receive scene state and player positions via WebSocket and respond with movement and action commands.\n\nThe NetworkManager handles ai_update messages which update agent mesh positions in the scene. Agents can be configured per-project through the backend API.` },
  { id: 'performance', title: '10. Performance Tips', content: `• Keep object count below 90 (the editor warns at this threshold).\n• Use Shadow Quality "low" or "off" for faster rendering.\n• Avoid many real-time shadow-casting lights.\n• Terrain with 64×64 segments is the default — avoid multiple terrain objects.\n• Lower Render Distance in Settings to reduce fog far plane and draw calls.\n• Use Texture Quality "low" on lower-end hardware.\n• The Wireframe material mode is faster than full shading during layout.` },
];

export default function Documentation({ onClose }) {
  const [active, setActive] = useState('getting-started');
  const section = SECTIONS.find(s => s.id === active);

  return (
    <div className="modal-overlay" style={{ alignItems: 'stretch', padding: '40px' }}>
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', width: '100%', maxWidth: '900px', maxHeight: '80vh', overflow: 'hidden', margin: 'auto' }}>
        {/* Sidebar */}
        <div style={{ width: '220px', borderRight: '1px solid var(--border-color)', overflowY: 'auto', flexShrink: 0 }}>
          <div style={{ padding: '16px 12px 8px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Contents</div>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', background: active === s.id ? 'rgba(230,57,70,0.12)' : 'none',
                border: 'none', borderLeft: `3px solid ${active === s.id ? 'var(--color-primary)' : 'transparent'}`,
                color: active === s.id ? 'var(--color-accent)' : 'var(--text-muted)',
                padding: '8px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {s.title}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', position: 'relative' }}>
          <button className="modal-close" onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', fontSize: '22px' }}>×</button>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-accent)', marginBottom: '16px' }}>{section?.title}</h2>
          <div style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
            {section?.content}
          </div>
        </div>
      </div>
    </div>
  );
}
