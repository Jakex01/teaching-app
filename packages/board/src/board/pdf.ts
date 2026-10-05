// Turns a PDF worksheet into pieces for the board, entirely in the browser: the PDF itself never
// leaves this computer, only the rendered images are uploaded (through the normal image upload).
//
// "Smart" mode is built around CKE exam sheets (matura, egzamin ósmoklasisty), and works for any PDF
// whose tasks start with "Zadanie 1." / "Zad. 2":
// - each task becomes one image with only its text and figures. The printed answer grid ("kratka")
//   is light grey, so it's told apart from the dark print and left out; a task that continues on the
//   next page is joined into one image,
// - how much grid the sheet gave a task is measured, so the solution frame on the board gets a similar size,
// - the examiner's score boxes in the margins, side watermarks, and running headers/footers
//   ("Strona 5 z 29", sheet codes; recognised because they repeat on every page) are cut off,
// - an intro heading without its own points ("Zadanie 12." before "Zadanie 12.1.") is joined to the first part.
// Scanned PDFs have no text layer: then whole pages are used.

import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { LIMITS } from '../protocol';

/** Render resolution: pixels per PDF point (A4 is 595 × 842 points). */
const SCALE = 2;
/** Fallback header and footer bands, as a share of the page height, when no repeating lines are found. */
const HEADER = 0.065;
const FOOTER = 0.075;
/** Space kept above a heading, in points. */
const ABOVE_HEADING = 6;
/** Pixel darkness: print (text, formulas, figures) vs. anything on the page (including the light answer grid). */
const DARK = 150;
const ANY = 235;
const HEADING = /^\s*(zadanie|zad\.)\s*(\d{1,3}\.\d{1,2}|\d{1,3})\.?(?=\s|$|\()/i;

/** Part of one page, in PDF points from the page's top-left corner. */
interface Band { page: number; top: number; bottom: number; left: number; right: number }
interface Task { label: string; bands: Band[] }

export interface PdfPiece {
  /** "Zadanie 3", or "Strona 2" in pages mode. */
  label: string;
  canvas: HTMLCanvasElement;
  /** Size on the board, in board units (1 PDF point = 1 unit, so A4 is about 600 units wide). */
  width: number;
  height: number;
  /** Height of the answer grid the sheet gave this task, in board units (0 if none). */
  answerSpace: number;
}

export interface PdfAnalysis {
  pageCount: number;
  /** Pages that will be used (the first LIMITS.pdfPages). */
  usedPages: number;
  taskCount: number;
}

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  // The worker is a file of this app (same origin), so the Content-Security-Policy allows it.
  pdfjs.GlobalWorkerOptions.workerPort ??= new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' });
  return pdfjs;
}

export class PdfImport {
  private constructor(private task: PDFDocumentLoadingTask, private doc: PDFDocumentProxy, private tasks: Task[], readonly analysis: PdfAnalysis) {}

  /** Reads the PDF and looks for task headings. Throws for files that aren't a readable PDF. */
  static async open(file: File): Promise<PdfImport> {
    const pdfjs = await loadPdfjs();
    const loading = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), enableXfa: false });
    try {
      const doc = await loading.promise;
      const usedPages = Math.min(doc.numPages, LIMITS.pdfPages);
      const tasks = findTasks(await readPages(doc, usedPages));
      return new PdfImport(loading, doc, tasks, { pageCount: doc.numPages, usedPages, taskCount: tasks.length });
    } catch (e) {
      void loading.destroy();
      throw e;
    }
  }

  /** Renders the pieces: one per task in 'tasks' mode, one per page in 'pages' mode. */
  async pieces(mode: 'tasks' | 'pages', onProgress: (done: number, total: number) => void): Promise<PdfPiece[]> {
    const pages = new Map<number, HTMLCanvasElement>();
    const render = async (n: number) => {
      let canvas = pages.get(n);
      if (!canvas) {
        canvas = await renderPage(await this.doc.getPage(n));
        pages.set(n, canvas);
      }
      return canvas;
    };

    const smart = mode === 'tasks' && this.tasks.length > 0;
    const plan: Task[] = smart
      ? this.tasks
      : Array.from({ length: this.analysis.usedPages }, (_, i) => ({ label: `Strona ${i + 1}`, bands: [{ page: i + 1, top: 0, bottom: Infinity, left: 0, right: Infinity }] }));

    const out: PdfPiece[] = [];
    const total = Math.min(plan.length, LIMITS.pdfPieces);
    for (const [i, task] of plan.slice(0, total).entries()) {
      onProgress(i, total);
      const crops: HTMLCanvasElement[] = [];
      let answerSpace = 0;
      for (const band of task.bands) {
        const cut = cutBand(await render(band.page), band, smart);
        if (cut.canvas) crops.push(cut.canvas);
        answerSpace += cut.answerSpace;
      }
      const canvas = smart ? trimSides(stack(crops)) : stack(crops);
      if (canvas) out.push({ label: task.label, canvas, width: canvas.width / SCALE, height: canvas.height / SCALE, answerSpace: answerSpace / SCALE });
    }
    // Pages that only showed up as one piece don't need to stay in memory.
    pages.clear();
    return out;
  }

  close() { void this.task.destroy(); }
}

// ---------- Text layer: headings, running headers and footers ----------

interface Line { top: number; bottom: number; x: number; text: string }
interface PageText { n: number; width: number; height: number; lines: Line[] }

async function readPages(doc: PDFDocumentProxy, count: number): Promise<PageText[]> {
  const out: PageText[] = [];
  for (let n = 1; n <= count; n++) {
    const page = await doc.getPage(n);
    const { width, height } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    // Group text pieces into lines by their vertical position.
    const lines = new Map<number, { top: number; bottom: number; parts: { x: number; s: string }[] }>();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const [, , , , x, y] = item.transform as number[];
      const h = item.height || 10;
      const top = height - y - h;
      const key = Math.round(top / 3);
      const line = lines.get(key) ?? { top, bottom: top + h, parts: [] };
      line.top = Math.min(line.top, top);
      line.bottom = Math.max(line.bottom, top + h);
      line.parts.push({ x, s: item.str });
      lines.set(key, line);
    }
    out.push({
      n, width, height,
      lines: [...lines.values()].map(l => {
        const parts = l.parts.sort((a, b) => a.x - b.x);
        return { top: l.top, bottom: l.bottom, x: parts[0].x, text: parts.map(p => p.s).join(' ').trim() };
      }),
    });
    page.cleanup();
  }
  return out;
}

/** Top and bottom of each page's real content: below repeating headers, above repeating footers. */
function contentArea(pages: PageText[]) {
  // A line that appears (with numbers ignored) on many pages near the top or bottom is page furniture.
  const key = (l: Line, p: PageText) => `${l.text.replace(/\d+/g, '#')}@${l.top < p.height / 2 ? 'top' : 'bottom'}`;
  const seen = new Map<string, number>();
  for (const p of pages) for (const k of new Set(p.lines.map(l => key(l, p)))) seen.set(k, (seen.get(k) ?? 0) + 1);
  const repeats = (l: Line, p: PageText) =>
    pages.length >= 3 && !HEADING.test(l.text) && (seen.get(key(l, p)) ?? 0) >= Math.max(3, pages.length * 0.3);

  return new Map(pages.map(p => {
    let top = p.height * HEADER, bottom = p.height * (1 - FOOTER);
    for (const l of p.lines) {
      if (!repeats(l, p)) continue;
      if (l.top < p.height * 0.2) top = Math.max(top, l.bottom + 4);
      else if (l.top > p.height * 0.75) bottom = Math.min(bottom, l.top - 8);
    }
    return [p.n, { top, bottom, width: p.width }];
  }));
}

/** Finds task headings and turns them into page bands, in reading order. */
function findTasks(pages: PageText[]): Task[] {
  const area = contentArea(pages);
  const headings: { page: number; top: number; x: number; num: string }[] = [];
  for (const p of pages) {
    const a = area.get(p.n)!;
    for (const l of p.lines) {
      const m = HEADING.exec(l.text);
      if (m && l.top >= a.top - 2 && l.top < a.bottom) headings.push({ page: p.n, top: l.top, x: l.x, num: m[2] });
    }
  }
  headings.sort((a, b) => a.page - b.page || a.top - b.top);

  // The same number twice in a row is a heading split over two text pieces. An intro heading ("12.")
  // right before its first part ("12.1.") is joined to that part.
  const merged: typeof headings = [];
  for (const h of headings) {
    const prev = merged[merged.length - 1];
    if (prev && prev.num === h.num) continue;
    if (prev && h.num.startsWith(`${prev.num}.`) && h.page === prev.page) { prev.num = h.num; continue; }
    merged.push({ ...h });
  }

  return merged.map((h, i) => {
    const next = merged[i + 1];
    const a0 = area.get(h.page)!;
    // The printed column the heading starts in; margins outside it hold score boxes and watermarks.
    const left = Math.max(0, h.x - 14);
    const right = Math.min(a0.width, a0.width - h.x + 14);
    const bands: Band[] = [];
    // The last task runs to the end of its page only (later pages are usually scrap paper).
    const lastPage = next ? next.page : h.page;
    for (let p = h.page; p <= lastPage; p++) {
      const a = area.get(p)!;
      const top = p === h.page ? Math.max(a.top, h.top - ABOVE_HEADING) : a.top;
      const bottom = next && p === next.page ? Math.min(a.bottom, next.top - ABOVE_HEADING) : a.bottom;
      if (bottom - top > 8) bands.push({ page: p, top, bottom, left, right });
    }
    return { label: `Zadanie ${h.num}`, bands };
  });
}

// ---------- Pixels ----------

async function renderPage(page: PDFPageProxy) {
  const viewport = page.getViewport({ scale: SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return canvas;
}

/**
 * Cuts a band out of a rendered page. With `smart`, keeps only the rows with print (dropping the light
 * answer grid below it) and measures how tall that grid was. Without, returns the band as it is.
 */
function cutBand(page: HTMLCanvasElement, band: Band, smart: boolean): { canvas: HTMLCanvasElement | null; answerSpace: number } {
  const x0 = Math.max(0, Math.floor(band.left * SCALE));
  const x1 = Math.min(page.width, Math.ceil(band.right * SCALE));
  let top = Math.max(0, Math.floor(band.top * SCALE));
  let bottom = Math.min(page.height, Math.ceil(band.bottom * SCALE));
  let answerSpace = 0;

  if (smart) {
    const rows = scanRows(page, x0, x1, top, bottom);
    if (rows.lastAny >= 0) answerSpace = Math.max(0, rows.lastAny - Math.max(rows.lastDark, rows.firstAny));
    if (rows.lastDark < 0) return { canvas: null, answerSpace };
    top = Math.max(top, rows.firstDark - 8 * SCALE);
    bottom = Math.min(bottom, rows.lastDark + 10 * SCALE);
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, x1 - x0);
  canvas.height = Math.max(1, bottom - top);
  canvas.getContext('2d')!.drawImage(page, x0, top, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return { canvas, answerSpace };
}

/** First and last pixel rows (page coordinates) with dark print, and with anything at all. -1 when none. */
function scanRows(page: HTMLCanvasElement, x0: number, x1: number, from: number, to: number) {
  const out = { firstDark: -1, lastDark: -1, firstAny: -1, lastAny: -1 };
  if (to <= from || x1 <= x0) return out;
  const w = x1 - x0;
  const { data } = page.getContext('2d', { willReadFrequently: true })!.getImageData(x0, from, w, to - from);
  for (let r = 0; r < to - from; r++) {
    let dark = false, any = false;
    for (let x = 0, i = r * w * 4; x < w; x += 2, i += 8) {
      const v = Math.min(data[i], data[i + 1], data[i + 2]);
      if (v < ANY) { any = true; if (v < DARK) { dark = true; break; } }
    }
    const y = from + r;
    if (any) { if (out.firstAny < 0) out.firstAny = y; out.lastAny = y; }
    if (dark) { if (out.firstDark < 0) out.firstDark = y; out.lastDark = y; }
  }
  return out;
}

/** Drops empty columns left and right, so tasks don't carry the page margins. */
function trimSides(canvas: HTMLCanvasElement | null): HTMLCanvasElement | null {
  if (!canvas) return null;
  const { data, width, height } = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height);
  let left = width, right = -1;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0, i = y * width * 4; x < width; x++, i += 4) {
      if (Math.min(data[i], data[i + 1], data[i + 2]) < ANY) {
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (right < left) return canvas;
  const pad = 10 * SCALE;
  left = Math.max(0, left - pad);
  right = Math.min(width, Math.max(right + pad, left + 240 * SCALE)); // keep narrow tasks readable
  const out = document.createElement('canvas');
  out.width = right - left;
  out.height = height;
  out.getContext('2d')!.drawImage(canvas, left, 0, out.width, height, 0, 0, out.width, height);
  return out;
}

/** Puts crops one under another (a task that continues on the next page). */
function stack(crops: HTMLCanvasElement[]): HTMLCanvasElement | null {
  if (!crops.length) return null;
  if (crops.length === 1) return crops[0];
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(...crops.map(c => c.width));
  canvas.height = crops.reduce((sum, c) => sum + c.height + 8 * SCALE, -8 * SCALE);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let y = 0;
  for (const c of crops) { ctx.drawImage(c, 0, y); y += c.height + 8 * SCALE; }
  return canvas;
}
