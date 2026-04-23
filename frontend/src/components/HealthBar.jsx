import React from 'react';
export default function HealthBar({ health }) {
  const pct = Math.max(0, Math.min(100, health));
  const color = pct > 60 ? '#4caf50' : pct > 30 ? '#ff9800' : '#f44336';
  return (
    <div style={{ background: 'rgba(0,0,0,0.6)', borderRadius: '4px', padding: '8px 12px', minWidth: '150px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'white', fontSize: '12px', marginBottom: '4px' }}>
        <span>❤️ Health</span><span>{Math.round(pct)}</span>
      </div>
      <div style={{ background: '#333', borderRadius: '2px', height: '8px', overflow: 'hidden' }}>
        <div style={{ width: pct + '%', background: color, height: '100%', transition: 'width 0.3s, background 0.3s' }} />
      </div>
    </div>
  );
}
