import { useEffect, useRef, useState } from 'react';
import { engine } from '../board/engine';
import { inviteLink } from '../room';
import { showToast, useUI } from '../store';
import { BackIcon, BrandIcon, EyeIcon, InviteIcon, TrashIcon } from './Icons';
import { PdfButton, SolutionSpaceButton } from './PdfImport';

export function TopLeft() {
  const roomId = useUI(s => s.roomId);
  const notebook = useUI(s => s.notebook);

  const invite = async () => {
    const link = inviteLink(roomId);
    try { await navigator.clipboard.writeText(link); showToast('Invite link copied! 🎉'); }
    catch { showToast(link, 5000); }
  };

  const brand = (
    <div className="brand card">
      <span className="brand-mark"><BrandIcon /></span>
      <span className="brand-name">Doodle<span>Board</span></span>
    </div>
  );

  // A student's notebook: show its name and a way back to the app. No invite link: access is per person.
  if (notebook) {
    return (
      <header className="top-left">
        <a className="btn btn-back" href={notebook.backHref} title={notebook.backLabel}>
          <BackIcon /><span>{notebook.backLabel}</span>
        </a>
        <div className="room card">
          <span className="room-label">Zeszyt</span>
          <span className="room-name">{notebook.title}</span>
        </div>
      </header>
    );
  }

  return (
    <header className="top-left">
      {brand}
      <div className="room card">
        <span className="room-label">Room</span>
        <span className="room-name">{roomId}</span>
        <button className="btn btn-invite" title="Copy invite link" onClick={invite}>
          <InviteIcon /><span>Invite</span>
        </button>
      </div>
    </header>
  );
}

function TeacherTools() {
  const spotlightOn = useUI(s => s.spotlightOn);
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  // First click arms the button, the second one (within 3 s) clears.
  const onClear = () => {
    clearTimeout(timer.current);
    if (!armed) {
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), 3000);
      return;
    }
    setArmed(false);
    engine.clearBoard();
  };

  return (
    <div className="teacher-tools">
      <button className={`btn pill${spotlightOn ? ' on' : ''}`} title="Everyone follows your view" onClick={engine.toggleSpotlight}>
        <EyeIcon /><span>Spotlight</span>
      </button>
      <button className={`btn pill danger${armed ? ' confirm' : ''}`} title="Clear the whole board" onClick={onClear}>
        <TrashIcon /><span>{armed ? 'Sure?' : 'Clear'}</span>
      </button>
    </div>
  );
}

function People() {
  const users = useUI(s => s.users);
  const myId = useUI(s => s.me?.id);
  const sorted = [...users].sort((a, b) =>
    Number(b.id === myId) - Number(a.id === myId) || Number(b.role === 'teacher') - Number(a.role === 'teacher'));
  return (
    <div className="people card">
      {sorted.slice(0, 6).map(u => (
        <div key={u.id} className={`avatar${u.id === myId ? ' me' : ''}`} style={{ background: u.color }}>
          {(u.name.trim()[0] || '?').toUpperCase()}
          {u.role === 'teacher' && <span className="crown">🍎</span>}
          <span className="avatar-tip">
            {u.name}{u.id === myId ? ' (you)' : ''}{u.role === 'teacher' ? ' · teacher' : ''}
          </span>
        </div>
      ))}
      <span className="people-count">{users.length === 1 ? 'Just you' : `${users.length} here`}</span>
    </div>
  );
}

export function TopRight() {
  const isTeacher = useUI(s => s.me?.role === 'teacher');
  const inNotebook = useUI(s => !!s.notebook); // uploads need a notebook (open demo rooms have no storage)
  return (
    <aside className="top-right">
      <SolutionSpaceButton />
      {inNotebook && <PdfButton />}
      {isTeacher && <TeacherTools />}
      <People />
    </aside>
  );
}

export function FollowBanner() {
  const following = useUI(s => s.following);
  if (!following) return null;
  return (
    <div className="follow-banner">
      <span className="dot-pulse" />
      <span>Following {following}</span>
      <button className="btn tiny" onClick={engine.stopFollowing}>Look around</button>
    </div>
  );
}
