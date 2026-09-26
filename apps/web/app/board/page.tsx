import type { Metadata } from 'next';
import { config } from '@/lib/config';
import { BoardClient } from './BoardClient';

export const metadata: Metadata = { title: 'Tablica · Doodle Board' };

export default function BoardPage() {
  return <BoardClient syncUrl={config.SYNC_PUBLIC_URL} />;
}
