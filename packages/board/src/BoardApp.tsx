import { useEffect, useRef, useState } from 'react';
import { engine } from './board/engine';
import { JoinScreen } from './components/JoinScreen';
import { RemoteCursors, Toast } from './components/Overlays';
import { Dock, History, StyleBubble, Zoom } from './components/Toolbar';
import { FollowBanner, TopLeft, TopRight } from './components/TopBar';
import type { Role } from './protocol';

import './styles.css';

export interface BoardAppProps {
  /** WebSocket address of the sync server, e.g. ws://localhost:3001/ws */
  syncUrl?: string;
}

export function BoardApp({ syncUrl }: BoardAppProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const [joinVisible, setJoinVisible] = useState(true);

  useEffect(() => {
    engine.attach(canvas.current!, editor.current!);
    return () => engine.detach();
  }, []);

  const onJoin = (me: { name: string; role: Role; color: string }) => {
    engine.join(me, syncUrl);
    setTimeout(() => setJoinVisible(false), 400); // let the fade-out finish
  };

  return (
    <div className="board-root">
      <canvas id="board" ref={canvas} />
      <RemoteCursors />
      <textarea id="text-editor" ref={editor} spellCheck={false} />

      <TopLeft />
      <TopRight />
      <FollowBanner />
      <StyleBubble />
      <Dock />
      <History />
      <Zoom />
      <Toast />

      {joinVisible && <JoinScreen onJoin={onJoin} />}
    </div>
  );
}
