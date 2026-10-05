import { useEffect, useState, type CSSProperties } from 'react';
import { useUI } from '../store';
import { CursorIcon } from './Icons';

export function RemoteCursors() {
  const cursors = useUI(s => s.cursors);
  const users = useUI(s => s.users);
  const cam = useUI(s => s.cam);
  const [now, setNow] = useState(() => Date.now());

  // Re-render every 2 s so idle cursors fade out.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <div id="cursors">
      {Object.entries(cursors).map(([id, c]) => {
        const u = users.find(u => u.id === id);
        if (!u) return null;
        const x = (c.x - cam.x) * cam.z, y = (c.y - cam.y) * cam.z;
        return (
          <div key={id} className="cursor" style={{
            '--c': u.color,
            transform: `translate(${x - 4}px, ${y - 3}px)`,
            opacity: now - c.t > 6000 ? 0.35 : 1,
          } as CSSProperties}>
            <CursorIcon />
            <span className="label">{u.role === 'teacher' ? '🍎 ' : ''}{u.name}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Toast() {
  const toast = useUI(s => s.toast);
  // Hidden once its time is up; a new toast (new key) shows again.
  const [hiddenKey, setHiddenKey] = useState<number | null>(null);
  const visible = !!toast && hiddenKey !== toast.key;
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setHiddenKey(toast.key), toast.ms);
    return () => clearTimeout(t);
  }, [toast]);
  return <div className={`toast${visible ? ' show' : ''}`} role="status" aria-live="polite">{toast?.msg}</div>;
}
