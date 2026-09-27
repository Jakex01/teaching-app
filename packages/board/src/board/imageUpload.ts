// Prepares a pasted or dropped image before it leaves the browser: scales it down and re-encodes it.
// Re-encoding also drops photo metadata such as GPS location.

import { LIMITS } from '../protocol';

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));

export async function prepareImage(file: Blob): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file); // throws for files the browser can't read
  const scale = Math.min(1, LIMITS.imageSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // WebP keeps transparency and is small. Browsers that can't encode it fall back to PNG, then JPEG if too big.
  let blob = await toBlob(canvas, 'image/webp', 0.85);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/png');
  if (blob && blob.size > LIMITS.imageBytes) blob = await toBlob(canvas, 'image/jpeg', 0.82);
  if (!blob) throw new Error('Could not encode image');
  return { blob, width, height };
}

/** Images from the clipboard or a drop, if any. */
export function imageFromTransfer(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of data.items ?? []) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile();
  }
  return [...(data.files ?? [])].find(f => f.type.startsWith('image/')) ?? null;
}
