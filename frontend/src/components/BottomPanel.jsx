import React, { useEffect, useRef } from 'react';
import { useStore } from '../store/index.js';

export default function BottomPanel() {
  const { logs, clearLogs, consoleCollapsed, setConsoleCollapsed } = useStore();
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!consoleCollapsed && bottomRef.current) {
      bottomRef.current.scrollTop = bottomRef.current.scrollHeight;
    }
  }, [logs, consoleCollapsed]);

  function logColor(level) {
    if (level === 'error') return '#f44336';
    if (level === 'warn') return '#ff9800';
    return '#a8dadc';
  }

  return (
    <div
      className="bottom-panel"
      style={{ height: consoleCollapsed ? '32px' : undefined, overflow: consoleCollapsed ? 'hidden' : undefined }}
    >
      <div className="panel-header">
        <span>Console</span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {!consoleCollapsed && (
            <button
              className="btn btn-ghost"
              style={{ fontSize: '11px', padding: '2px 8px' }}
              onClick={clearLogs}
            >
              Clear
            </button>
          )}
          <button
            className="btn btn-ghost"
            style={{ fontSize: '11px', padding: '2px 8px' }}
            onClick={() => setConsoleCollapsed(!consoleCollapsed)}
            title={consoleCollapsed ? 'Expand console' : 'Collapse console'}
          >
            {consoleCollapsed ? '▲' : '▼'}
          </button>
        </div>
      </div>
      {!consoleCollapsed && (
        <div ref={bottomRef} style={{ flex: 1, overflowY: 'auto', padding: '2px 0' }}>
          {logs.length === 0 && (
            <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic' }}>
              No logs yet.
            </div>
          )}
          {logs.map((log, i) => (
            <div key={i} className="log-entry">
              <span className="log-time">{log.time}</span>
              <span className="log-dot" style={{ background: logColor(log.level) }} />
              <span className="log-msg" style={{ color: logColor(log.level) }}>{log.msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
