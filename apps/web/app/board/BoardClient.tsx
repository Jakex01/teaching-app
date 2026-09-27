'use client';

import dynamic from 'next/dynamic';
import type { BoardSession } from '@teaching/board';

// The board uses canvas, window and localStorage, so it only renders in the browser.
const BoardApp = dynamic(() => import('@teaching/board').then(m => m.BoardApp), { ssr: false });

export function BoardClient({ syncUrl, session }: { syncUrl: string; session?: BoardSession }) {
  return <BoardApp syncUrl={syncUrl} session={session} />;
}
