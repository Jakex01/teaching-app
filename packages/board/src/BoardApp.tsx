import { useEffect, useRef, useState } from 'react';
import { engine } from './board/engine';
import { JoinScreen } from './components/JoinScreen';
import { RemoteCursors, Toast } from './components/Overlays';
import { DrawDialog } from './components/DrawDialog';
import { PdfDialog } from './components/PdfImport';
import { PlaceInSection } from './components/PlaceInSection';
import { SectionsNav } from './components/SectionsNav';
import { Dock, History, StyleBubble, Zoom } from './components/Toolbar';
import { FollowBanner, TopLeft, TopRight } from './components/TopBar';
import type { Role } from './protocol';
import { resolveRoomId } from './room';
import { useUI, type Notebook } from './store';

import './styles.css';

/** A student's notebook opened from the app: who you are was already decided by the server. */
export interface BoardSession extends Notebook {
  /** Add a section with this title once the board has loaded. */
  newSection?: string;
  room: string;
  /** Signed by the web app, checked by the sync server. */
  ticket: string;
  name: string;
  role: Role;
  color: string;
}

export interface BoardAppProps {
  /** WebSocket address of the sync server, e.g. ws://localhost:3001/ws */
  syncUrl?: string;
  /** Without a session the board is an open demo room: ?room= from the URL and a join screen. */
  session?: BoardSession;
}

export function BoardApp({ syncUrl, session }: BoardAppProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const [room] = useState(() => session?.room ?? resolveRoomId());
  const [joinVisible, setJoinVisible] = useState(!session);

  useEffect(() => {
    useUI.setState({
      roomId: room,
      notebook: session ? { title: session.title, backHref: session.backHref, backLabel: session.backLabel } : null,
    });
    engine.attach(canvas.current!, editor.current!);
    if (session) {
      engine.join({ name: session.name, role: session.role, color: session.color }, session.room, { syncUrl, ticket: session.ticket, newSection: session.newSection });
    }
    return () => {
      engine.leave();
      engine.detach();
    };
  }, [room, session, syncUrl]);

  const onJoin = (me: { name: string; role: Role; color: string }) => {
    engine.join(me, room, { syncUrl });
    setTimeout(() => setJoinVisible(false), 400); // let the fade-out finish
  };

  return (
    <div className="board-root">
      <canvas id="board" ref={canvas} />
      <RemoteCursors />
      <textarea id="text-editor" ref={editor} spellCheck={false} />

      <TopLeft />
      <SectionsNav />
      <TopRight />
      <FollowBanner />
      <StyleBubble />
      <Dock />
      <History />
      <Zoom />
      <Toast />
      <PdfDialog />
      <DrawDialog />
      <PlaceInSection />

      {joinVisible && <JoinScreen onJoin={onJoin} />}
    </div>
  );
}
