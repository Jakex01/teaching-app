// Loaded images for the canvas, one per file. Files never change, so they're kept for the session.

type Entry =
  | { status: 'loading'; image: HTMLImageElement; waiting: Set<() => void> }
  | { status: 'ready'; image: HTMLImageElement }
  | { status: 'error'; image: HTMLImageElement };

const cache = new Map<string, Entry>();

/** Returns the image for `src`, starting to load it if needed. `onLoad` runs once it's ready. */
export function getImage(src: string, onLoad: () => void): Entry {
  let entry = cache.get(src);
  if (!entry) {
    const image = new Image();
    const loading: Entry = { status: 'loading', image, waiting: new Set() };
    entry = loading;
    cache.set(src, entry);
    image.decoding = 'async';
    image.onload = () => {
      cache.set(src, { status: 'ready', image });
      for (const fn of loading.waiting) fn();
    };
    image.onerror = () => {
      cache.set(src, { status: 'error', image });
      for (const fn of loading.waiting) fn();
    };
    image.src = src;
  }
  if (entry.status === 'loading') entry.waiting.add(onLoad);
  return entry;
}
