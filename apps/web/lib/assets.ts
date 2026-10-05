import 'server-only';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

// Uploaded images for notebook-boards, stored on disk under .data/assets/<room>/<id>.<ext>.
// (In production this moves to Supabase Storage in the EU; the rest of the app only uses these functions.)

export const ASSET_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
} as const;
export type AssetExt = keyof typeof ASSET_TYPES;

const ROOM_RE = /^[a-z0-9-]{1,40}$/;
const FILE_RE = /^([A-Za-z0-9_-]{22})\.(webp|png|jpg|gif)$/;

// A fixed folder inside the web app (apps/web/.data/assets). Keeping the path static lets the build
// know which files the server reads, instead of packing the whole project into the deployment.
const ASSETS_DIR = path.join(process.cwd(), '.data', 'assets');

/** Detects the real image type from the file's first bytes. Whatever the browser claims is ignored. */
export function sniffImage(bytes: Uint8Array): AssetExt | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
  if (starts(0xff, 0xd8, 0xff)) return 'jpg';
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'gif';
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'webp';
  return null;
}

export async function countRoomAssets(room: string) {
  if (!ROOM_RE.test(room)) return 0;
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from validated room/file names under ASSETS_DIR
  try { return (await fs.readdir(path.join(ASSETS_DIR, room))).length; } catch { return 0; }
}

/** Saves an image and returns its public path, e.g. /api/assets/b-123/Ab3….webp */
export async function saveAsset(room: string, ext: AssetExt, bytes: Uint8Array) {
  if (!ROOM_RE.test(room)) throw new Error('Invalid room');
  const id = crypto.randomBytes(16).toString('base64url'); // 22 characters, unguessable
  const dir = path.join(ASSETS_DIR, room);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from validated room/file names under ASSETS_DIR
  await fs.mkdir(dir, { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from validated room/file names under ASSETS_DIR
  await fs.writeFile(path.join(dir, `${id}.${ext}`), bytes, { flag: 'wx' });
  return `/api/assets/${room}/${id}.${ext}`;
}

/** Reads an image. Returns null for anything that isn't a well-formed asset name. */
export async function readAsset(room: string, file: string) {
  const m = FILE_RE.exec(file);
  if (!ROOM_RE.test(room) || !m) return null;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from validated room/file names under ASSETS_DIR
    const bytes = await fs.readFile(path.join(ASSETS_DIR, room, file));
    return { bytes, type: ASSET_TYPES[m[2] as AssetExt] };
  } catch {
    return null;
  }
}
