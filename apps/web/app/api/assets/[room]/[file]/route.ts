import { NextResponse, type NextRequest } from 'next/server';
import { readAsset } from '@/lib/assets';
import { canViewRoom } from '@/lib/room-access';

// Serves an uploaded image, only to the teacher of that notebook or the student it belongs to.
export async function GET(_: NextRequest, { params }: { params: Promise<{ room: string; file: string }> }) {
  const { room, file } = await params;
  const notFound = () => new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

  if (!(await canViewRoom(room))) return notFound();
  const asset = await readAsset(room, file);
  if (!asset) return notFound();

  return new NextResponse(new Uint8Array(asset.bytes), {
    headers: {
      'Content-Type': asset.type,
      // Files never change (new upload = new name), so the browser may keep them. "private": not in shared caches.
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Disposition': 'inline',
    },
  });
}
