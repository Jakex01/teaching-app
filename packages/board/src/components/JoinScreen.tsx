import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { COLORS } from '../constants';
import { getPref, setPref } from '../prefs';
import { LIMITS, type Role } from '../protocol';
import { roomId } from '../room';

const AVATAR_COLORS = COLORS.slice(1);

export function JoinScreen({ onJoin }: { onJoin: (me: { name: string; role: Role; color: string }) => void }) {
  const saved = getPref('me');
  const [name, setName] = useState(saved?.name ?? '');
  const [role, setRole] = useState<Role>(saved?.role ?? 'student');
  const [color, setColor] = useState<string>(
    () => saved?.color ?? AVATAR_COLORS[crypto.getRandomValues(new Uint32Array(1))[0] % AVATAR_COLORS.length].c,
  );
  const [leaving, setLeaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => input.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const me = { name: name.trim().slice(0, LIMITS.name) || 'Guest', role, color };
    setPref('me', me);
    setLeaving(true);
    onJoin(me);
  };

  return (
    <div className={`join${leaving ? ' hide' : ''}`}>
      <div className="join-blobs" aria-hidden="true">
        {[1, 2, 3, 4, 5].map(i => <span key={i} className={`blob b${i}`} />)}
      </div>
      <form className="join-card card" autoComplete="off" onSubmit={submit}>
        <div className="join-badge">Room <b>{roomId}</b></div>
        <h1>Let’s draw <span className="squiggle">together</span>!</h1>
        <label className="field">
          <span>Your name</span>
          <input ref={input} value={name} onChange={e => setName(e.target.value)} maxLength={LIMITS.name} placeholder="e.g. Kuba" required />
        </label>
        <div className="field">
          <span>I’m a…</span>
          <div className="roles">
            {([
              ['teacher', '🍎', 'Teacher', 'Spotlight & clear board'],
              ['student', '✏️', 'Student', 'Draw & follow along'],
            ] as const).map(([value, emoji, title, hint]) => (
              <label key={value} className="role">
                <input type="radio" name="role" value={value} checked={role === value} onChange={() => setRole(value)} />
                <span className="role-card">
                  <span className="role-emoji">{emoji}</span>
                  <b>{title}</b>
                  <small>{hint}</small>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Your cursor color</span>
          <div className="avatar-colors">
            {AVATAR_COLORS.map(({ name: label, c }) => (
              <button key={c} type="button" title={label} aria-label={label} className={`swatch${c === color ? ' active' : ''}`}
                style={{ '--c': c } as CSSProperties} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>
        <button className="btn big" type="submit">Jump in →</button>
      </form>
    </div>
  );
}
