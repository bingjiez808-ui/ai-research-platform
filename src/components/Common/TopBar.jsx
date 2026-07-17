import { useState, useEffect } from 'react';
import { isLiveMode, onApiModeChange } from '../../utils/api.js';

export default function TopBar({ title, showBack, onBack }) {
  const [time, setTime] = useState('');
  const [liveMode, setLiveMode] = useState(isLiveMode());

  useEffect(() => {
    const unsub = onApiModeChange(setLiveMode);
    return unsub;
  }, []);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          weekday: 'long',
        }) +
        ' ' +
        now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      );
    };
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {showBack && (
          <button
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 'var(--font-size-xl)',
              cursor: 'pointer',
              padding: '4px 8px',
              color: 'var(--gray-600)',
            }}
          >
            ← 返回
          </button>
        )}
        <span className="topbar-title">{title}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {!liveMode && (
          <span style={{
            background: '#fef3c7',
            color: '#92400e',
            padding: '2px 12px',
            borderRadius: 20,
            fontSize: 'var(--font-size-xs)',
            fontWeight: 500,
          }}>
            📡 演示模式
          </span>
        )}
        <span className="topbar-time">{time}</span>
      </div>
    </div>
  );
}
