'use client';

import dynamic from 'next/dynamic';

// The board uses canvas, window and localStorage, so it only renders in the browser.
const BoardApp = dynamic(() => import('@teaching/board').then(m => m.BoardApp), { ssr: false });

export function BoardClient({ syncUrl }: { syncUrl: string }) {
  return <BoardApp syncUrl={syncUrl} />;
}
