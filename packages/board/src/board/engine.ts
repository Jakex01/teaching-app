// The canvas engine: drawing, tools, undo, camera, spotlight and live sync.
// React renders the UI around it and talks to it through the `engine` singleton and the store.

import { nanoid } from 'nanoid';
import { LINE_TYPES, SHAPE_TYPES, SIZES, TEXT_SIZES, TOOLS, toolDef, type SizeIndex, type ToolDef, type ToolId } from '../constants';
import { getView, setPref, setView } from '../prefs';
import { LIMITS, type BoardElement, type FollowCamera, type ImageEl, type LineEl, type ServerMessage, type SectionEl, type ShapeEl, type StrokeEl, type TaskCardEl, type TextEl, type User } from '../protocol';
import { showToast, useUI, type Me } from '../store';
import { Socket, defaultSyncUrl } from '../net/socket';
import {
  CARD, SECTION, bbox, clamp, clearMeasureCache, hintLayout, solutionArea, fromImageLocal, hit, imageCenter, imageCorners, normalizeAngle, rotate,
  translateEl, unionBox, wc, type Box, type Pt,
} from './geometry';
import { getImage } from './images';
import { imageFromTransfer, pdfFromTransfer, prepareImage } from './imageUpload';
import type { PdfImport } from './pdf';
import { drawElement, drawGrid, type Camera } from './render';

type HistoryEntry =
  | { kind: 'add' | 'delete'; els: BoardElement[] }
  | { kind: 'update'; before: BoardElement[]; after: BoardElement[] };

type Drag =
  | { kind: 'pan'; lx: number; ly: number }
  | { kind: 'stroke'; el: StrokeEl }
  | { kind: 'shape'; el: ShapeEl; sx: number; sy: number; added: boolean }
  | { kind: 'line'; el: LineEl; added: boolean }
  | { kind: 'erase'; removed: BoardElement[] }
  | { kind: 'move'; lx: number; ly: number; before: BoardElement[]; moved: boolean }
  | { kind: 'marquee'; sx: number; sy: number; cx: number; cy: number; base: Set<string> }
  | { kind: 'resize'; before: ImageEl; corner: Corner; anchor: Pt }
  | { kind: 'rotate'; before: ImageEl; startAngle: number }
  | { kind: 'sectionResize'; before: SectionEl };

/** Image corners: top-left, top-right, bottom-right, bottom-left, as signs in the image's own frame. */
type Corner = 0 | 1 | 2 | 3;
const CORNER_SIGNS: Record<Corner, Pt> = { 0: [-1, -1], 1: [1, -1], 2: [1, 1], 3: [-1, 1] };
const HANDLE_PX = 9;           // corner handle radius on screen
const ROTATE_HANDLE_PX = 30;   // distance of the rotation handle above the image
/** Elements with colour and size (everything except images). */
type Styleable = Exclude<BoardElement, ImageEl>;

const clone = <T>(o: T): T => structuredClone(o);
const newId = () => nanoid(12);

/** Where a PDF goes: a new section (named after the file), an existing one, or free space. */
export type PdfTarget = { kind: 'new'; title: string } | { kind: 'section'; id: string } | { kind: 'none' };

/** A stroke point; a pen (not a mouse or finger) also records its pressure, for nicer ink. */
const penPoint = (x: number, y: number, e: PointerEvent): StrokeEl['pts'][number] =>
  e.pointerType === 'pen' && e.pressure > 0 ? [wc(x), wc(y), Math.round(e.pressure * 100) / 100] : [wc(x), wc(y)];

// Task cards (PDF worksheets, pasted tasks), in board units; 1 unit = 1 PDF point.
const CARD_ROW_GAP = 48;
const SOLUTION_MIN_WIDTH = 440;
const SOLUTION_MIN_HEIGHT = 360;
const SOLUTION_MAX_HEIGHT = 1100;
/** Free room kept below the lowest writing in a solution area; it grows when you get closer than this. */
const SOLUTION_GROW_ROOM = 160;
const SOLUTION_GROW_ROOM_X = 120;
const SOLUTION_MAX_CARD_WIDTH = 6000;
/** Room kept under the task for the hint button. */
const HINT_ROOM = 56;
/** Screen pixels taken by the sections panel on the left; views of a section start right of it. */
const SIDE_PANEL = 270;
const SECTION_MIN_W = 600;
const SECTION_MIN_H = 400;
/** New sections are big: room for several task cards and notes. */
const SECTION_W = 2400;
const SECTION_H = 1600;
/** Free room kept under (and beside) the lowest thing in a section; it grows when you get closer. */
const SECTION_ROOM = 240;
const SECTION_COLORS = ['#3D8BFF', '#22C1A0', '#8B5CF6', '#FF9F1C', '#FF6FB5'] as const;
const CARD_COLORS = ['#FFC93C', '#22C1A0', '#3D8BFF', '#8B5CF6', '#FF6FB5', '#FF9F1C'] as const;

/** A card for a task image of size w×h placed at (x, y): the image goes in its left part. */
function taskCard(x: number, y: number, w: number, h: number, label: string, color: string, solutionHeight: number, by?: string): { card: TaskCardEl; imgX: number; imgY: number } {
  const split = CARD.pad + w + CARD.gap;
  const solW = Math.max(w, SOLUTION_MIN_WIDTH);
  const bodyH = Math.max(h, solutionHeight);
  return {
    card: { id: newId(), type: 'task', color, label, by, x: wc(x), y: wc(y), w: wc(split + solW + CARD.pad), h: wc(CARD.header + bodyH + CARD.pad + HINT_ROOM), split: wc(split), taskH: wc(h) },
    imgX: wc(x + CARD.pad),
    imgY: wc(y + CARD.header),
  };
}

function throttle<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: A;
  return (...args: A) => {
    lastArgs = args;
    const now = performance.now();
    if (now - last >= ms) { last = now; fn(...args); }
    else if (!timer) timer = setTimeout(() => { timer = null; last = performance.now(); fn(...lastArgs); }, ms - (now - last));
  };
}

const KEYMAP: Record<string, ToolId> = Object.fromEntries(
  TOOLS.filter((t): t is ToolDef => t !== 'sep').map(t => [t.key.toLowerCase(), t.id]),
);

class BoardEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private editor: HTMLTextAreaElement | null = null;
  private cleanup: (() => void)[] = [];

  private elements = new Map<string, BoardElement>(); // Map order = draw order
  private cam: Camera = { x: 0, y: 0, z: 1 };
  /** The board whose view is remembered (see saveView). */
  private viewRoom: string | null = null;
  /** A section to add once the board has loaded ("add it there" when making a new board). */
  private pendingSection: string | null = null;
  private dpr = 1;
  private selection = new Set<string>();
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  private drag: Drag | null = null;
  private pointerWorld: { x: number; y: number } | null = null;
  private spaceDown = false;
  private touches = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; cx: number; cy: number } | null = null;
  private editing: { el: TextEl; isNew: boolean; before: TextEl | null } | null = null;
  private drawQueued = false;

  private socket: Socket | null = null;
  /** Board ticket; also authorises image uploads. Open demo rooms have none. */
  private ticket: string | null = null;
  /** A PDF that has been read and waits for the teacher's choice in the import dialog. */
  private pdfJob: PdfImport | null = null;
  private uploadUrl = '/api/assets';
  private hintsUrl = '/api/hints';
  private followingId: string | null = null;
  private followOptOut = false;
  private pendingMoves = new Set<string>();
  private moveTimer: ReturnType<typeof setTimeout> | null = null;

  // ---------- Store shortcuts ----------
  private get tool() { return useUI.getState().tool; }
  private get style() { return useUI.getState().style; }
  private get me() { return useUI.getState().me; }
  private get users() { return useUI.getState().users; }

  // ---------- Lifecycle ----------
  attach(canvas: HTMLCanvasElement, editor: HTMLTextAreaElement) {
    this.detach();
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.editor = editor;
    editor.hidden = true;
    editor.maxLength = LIMITS.text;
    if (!this.cam.x && !this.cam.y) { this.cam.x = -innerWidth / 2; this.cam.y = -innerHeight / 2; }

    const on = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement | Window, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };

    on(canvas, 'pointerdown', e => this.onPointerDown(e));
    on(canvas, 'pointermove', e => this.onPointerMove(e));
    on(canvas, 'pointerup', e => this.onPointerUp(e));
    on(canvas, 'pointercancel', e => this.onPointerUp(e));
    on(canvas, 'pointerleave', () => { this.pointerWorld = null; if (this.tool === 'eraser') this.requestDraw(); });
    on(canvas, 'dblclick', e => this.onDoubleClick(e));
    // The right mouse button pans the board, so the browser's menu stays closed.
    on(canvas, 'contextmenu', e => e.preventDefault());
    on(canvas, 'wheel', e => this.onWheel(e), { passive: false });
    on(window, 'keydown', e => this.onKeyDown(e));
    on(window, 'paste', e => this.onPaste(e));
    const onPageHide = () => this.saveView();
    window.addEventListener('pagehide', onPageHide);
    this.cleanup.push(() => window.removeEventListener('pagehide', onPageHide));
    on(canvas, 'dragover', e => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
    on(canvas, 'drop', e => this.onDrop(e));
    on(window, 'keyup', e => { if (e.code === 'Space') { this.spaceDown = false; canvas.classList.remove('panning'); } });
    on(window, 'resize', () => this.resize());
    on(editor, 'input', () => this.autoSizeEditor());
    on(editor, 'blur', () => setTimeout(() => this.commitText(), 0));
    on(editor, 'keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); this.commitText(); }
    });

    const spotlightTimer = setInterval(() => { if (useUI.getState().spotlightOn) this.broadcastCam(); }, 2000);
    this.cleanup.push(() => clearInterval(spotlightTimer));

    document.fonts?.ready.then(() => { clearMeasureCache(); this.requestDraw(); });

    this.applyCursorClass();
    this.resize();
  }

  detach() {
    for (const fn of this.cleanup) fn();
    this.cleanup = [];
    this.canvas = null;
    this.ctx = null;
    this.editor = null;
  }

  /** Leaves the room (e.g. when navigating away from the board page). */
  leave() {
    this.saveView();
    this.socket?.close();
    this.socket = null;
    this.ticket = null;
    this.elements.clear();
    this.selection.clear();
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.followingId = null;
    this.followOptOut = false;
    useUI.setState({ me: null, users: [], cursors: {}, following: null, spotlightOn: false, canUndo: false, canRedo: false });
  }

  /** Joins a room. With a ticket, the server takes name and role from the ticket instead. */
  join(me: Omit<Me, 'id'>, room: string, opts: { syncUrl?: string; ticket?: string; newSection?: string } = {}) {
    this.pendingSection = opts.newSection?.trim() || null;
    useUI.setState({ me: { ...me, id: null }, roomId: room });
    // Open the board where you left it last time (on this device).
    this.viewRoom = room;
    const view = getView(room);
    if (view) {
      this.cam = { z: view.z, x: view.cx - innerWidth / 2 / view.z, y: view.cy - innerHeight / 2 / view.z };
      this.onCameraChange();
    }
    this.ticket = opts.ticket ?? null;
    this.socket?.close();
    this.socket = new Socket(
      opts.syncUrl ?? defaultSyncUrl(),
      opts.ticket
        ? { t: 'join-ticket', ticket: opts.ticket }
        : { t: 'join', room, name: me.name, role: me.role, color: me.color },
      msg => this.onMessage(msg),
      () => showToast('Connection lost — reconnecting…', 3000),
    );
    this.socket.open();
  }

  // ---------- Networking ----------
  private onMessage(msg: ServerMessage) {
    switch (msg.t) {
      case 'init': {
        const me = this.me;
        if (me) useUI.setState({ me: { ...me, id: msg.you.id } });
        this.elements.clear();
        for (const el of msg.elements) this.elements.set(el.id, el);
        for (const id of this.selection) if (!this.elements.has(id)) this.selection.delete(id);
        this.setUsers(msg.users);
        this.syncSelection();
        this.requestDraw();
        if (this.pendingSection) {
          const title = this.pendingSection;
          this.pendingSection = null;
          this.addSection(title);
          // Not again after a reload.
          history.replaceState(null, '', location.pathname);
        }
        break;
      }
      case 'presence':
        this.setUsers(msg.users);
        break;
      case 'upsert':
        for (const el of msg.els) {
          if (this.editing?.el.id === el.id) continue;
          this.elements.set(el.id, el);
        }
        this.requestDraw();
        break;
      case 'delete':
        for (const id of msg.ids) { this.elements.delete(id); this.selection.delete(id); }
        this.syncSelection();
        this.requestDraw();
        break;
      case 'clear':
        this.elements.clear();
        this.selection.clear();
        this.syncSelection();
        this.requestDraw();
        showToast('The teacher cleared the board ✨');
        break;
      case 'cursor':
        useUI.setState(s => ({ cursors: { ...s.cursors, [msg.id]: { x: msg.x, y: msg.y, t: Date.now() } } }));
        break;
      case 'bye':
        this.removeCursor(msg.id);
        break;
      case 'follow':
        this.onFollow(msg.id, msg.cam);
        break;
      case 'error':
        showToast(msg.msg, 3500);
        break;
    }
  }

  private setUsers(users: User[]) {
    const ids = new Set(users.map(u => u.id));
    const cursors = Object.fromEntries(Object.entries(useUI.getState().cursors).filter(([id]) => ids.has(id)));
    useUI.setState({ users, cursors });
  }

  private removeCursor(id: string) {
    useUI.setState(s => {
      const { [id]: _gone, ...rest } = s.cursors;
      return { cursors: rest };
    });
  }

  private send(els: BoardElement[]) { this.socket?.sendElements(els); }
  private sendCursor = throttle((x: number, y: number) => this.socket?.send({ t: 'cursor', x, y }), 45);
  private sendDraft = throttle((el: BoardElement) => { if (this.elements.has(el.id)) this.send([el]); }, 50);

  // Moves of many elements are batched into one message every 40 ms.
  private queueMove(id: string) {
    this.pendingMoves.add(id);
    if (this.moveTimer) return;
    this.moveTimer = setTimeout(() => {
      this.moveTimer = null;
      const els = [...this.pendingMoves].map(id => this.elements.get(id)).filter((e): e is BoardElement => !!e);
      this.pendingMoves.clear();
      if (els.length) this.send(els);
    }, 40);
  }

  // Local change helpers: apply + broadcast
  private addEls(els: BoardElement[]) {
    for (const el of els) this.elements.set(el.id, el);
    this.send(els);
    this.requestDraw();
  }
  private deleteEls(ids: string[]) {
    for (const id of ids) { this.elements.delete(id); this.selection.delete(id); }
    this.socket?.sendDelete(ids);
    this.requestDraw();
  }

  // ---------- Undo / redo ----------
  private pushHistory(entry: HistoryEntry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack.length = 0;
    this.syncHistory();
  }
  private applyEntry(entry: HistoryEntry, reverse: boolean) {
    if (entry.kind === 'update') {
      this.addEls((reverse ? entry.before : entry.after).filter(el => this.elements.has(el.id)).map(clone));
    } else if ((entry.kind === 'add') === reverse) {
      this.deleteEls(entry.els.map(e => e.id));
    } else {
      this.addEls(entry.els.map(clone));
    }
    this.syncSelection();
  }
  undo = () => {
    const e = this.undoStack.pop();
    if (!e) return;
    this.applyEntry(e, true);
    this.redoStack.push(e);
    this.syncHistory();
  };
  redo = () => {
    const e = this.redoStack.pop();
    if (!e) return;
    this.applyEntry(e, false);
    this.undoStack.push(e);
    this.syncHistory();
  };
  private syncHistory() {
    useUI.setState({ canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0 });
  }

  private syncSelection() {
    let hasShape = false, styleable = false;
    for (const id of this.selection) {
      const type = this.elements.get(id)?.type ?? '';
      if (SHAPE_TYPES.has(type)) hasShape = true;
      if (type && type !== 'image') styleable = true;
    }
    const only = this.selection.size === 1 ? this.elements.get([...this.selection][0]) : undefined;
    const oneImage = only?.type === 'image' && !this.cardUnder(bbox(only));
    useUI.setState({ selection: { count: this.selection.size, hasShape, styleable, oneImage } });
  }

  // ---------- Coordinates ----------
  private toWorld(sx: number, sy: number) { return { x: sx / this.cam.z + this.cam.x, y: sy / this.cam.z + this.cam.y }; }
  toScreen(wx: number, wy: number) { return { x: (wx - this.cam.x) * this.cam.z, y: (wy - this.cam.y) * this.cam.z }; }

  private topHit(x: number, y: number, tol: number) {
    const list = [...this.elements.values()];
    for (let i = list.length - 1; i >= 0; i--) if (hit(list[i], x, y, tol)) return list[i];
    return null;
  }

  // ---------- Rendering ----------
  requestDraw() {
    if (this.drawQueued) return;
    this.drawQueued = true;
    requestAnimationFrame(() => this.draw());
  }

  private resize() {
    if (!this.canvas) return;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(innerWidth * this.dpr);
    this.canvas.height = Math.round(innerHeight * this.dpr);
    this.requestDraw();
  }

  private draw() {
    this.drawQueued = false;
    const ctx = this.ctx;
    if (!ctx) return;
    const { cam, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawGrid(ctx, cam, innerWidth, innerHeight);

    ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, -cam.x * cam.z * dpr, -cam.y * cam.z * dpr);
    // Skip elements that are off screen
    const v = { x1: cam.x, y1: cam.y, x2: cam.x + innerWidth / cam.z, y2: cam.y + innerHeight / cam.z };
    // Sections and task cards are backgrounds: drawn first (sections under cards), under everything else.
    const layer = (el: BoardElement) => (el.type === 'section' ? 0 : el.type === 'task' ? 1 : 2);
    for (const drawLayer of [0, 1, 2]) {
      for (const el of this.elements.values()) {
        if (layer(el) !== drawLayer) continue;
        if (this.editing?.el.id === el.id) continue;
        const b = bbox(el);
        if (b.x2 < v.x1 - 50 || b.x1 > v.x2 + 50 || b.y2 < v.y1 - 50 || b.y1 > v.y2 + 50) continue;
        drawElement(ctx, el, () => this.requestDraw());
      }
    }

    if (this.selection.size) {
      ctx.save();
      ctx.lineWidth = 2 / cam.z;
      ctx.strokeStyle = '#3D8BFF';
      ctx.setLineDash([6 / cam.z, 5 / cam.z]);
      let all: Box | null = null;
      for (const id of this.selection) {
        const el = this.elements.get(id);
        if (!el) continue;
        const b = bbox(el);
        const pad = 6 / cam.z;
        if (el.type === 'image') {
          // Follow the image's rotation instead of drawing its (larger) bounding box.
          ctx.save();
          ctx.translate(...imageCenter(el));
          ctx.rotate(el.rot);
          ctx.strokeRect(-el.w / 2 - pad, -el.h / 2 - pad, el.w + pad * 2, el.h + pad * 2);
          ctx.restore();
        } else {
          ctx.strokeRect(b.x1 - pad, b.y1 - pad, b.x2 - b.x1 + pad * 2, b.y2 - b.y1 + pad * 2);
        }
        all = unionBox(all, b);
      }
      if (all && this.selection.size > 1) {
        const pad = 12 / cam.z;
        ctx.setLineDash([]);
        ctx.lineWidth = 2.5 / cam.z;
        ctx.strokeStyle = '#1E1B3A';
        ctx.strokeRect(all.x1 - pad, all.y1 - pad, all.x2 - all.x1 + pad * 2, all.y2 - all.y1 + pad * 2);
      }
      ctx.restore();
      this.drawImageHandles(ctx);
      this.drawSectionHandle(ctx);
    }

    const drag = this.drag;
    if (drag?.kind === 'marquee') {
      const x = Math.min(drag.sx, drag.cx), y = Math.min(drag.sy, drag.cy);
      const w = Math.abs(drag.cx - drag.sx), h = Math.abs(drag.cy - drag.sy);
      ctx.save();
      ctx.fillStyle = 'rgba(61,139,255,.10)';
      ctx.strokeStyle = '#3D8BFF';
      ctx.lineWidth = 2 / cam.z;
      ctx.setLineDash([6 / cam.z, 5 / cam.z]);
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }

    if (this.tool === 'eraser' && this.pointerWorld) {
      ctx.save();
      ctx.lineWidth = 2 / cam.z;
      ctx.strokeStyle = '#FF5A4E';
      ctx.fillStyle = 'rgba(255,90,78,.12)';
      ctx.beginPath();
      ctx.arc(this.pointerWorld.x, this.pointerWorld.y, 10 / cam.z, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    this.syncSections();

    // Let React know about the camera (zoom label, remote cursors).
    const s = useUI.getState().cam;
    if (s.x !== cam.x || s.y !== cam.y || s.z !== cam.z) useUI.setState({ cam: { ...cam } });
  }

  // ---------- Tools & style ----------
  setTool = (id: ToolId) => {
    if (this.editing) this.commitText();
    if (id !== 'select') this.selection.clear();
    useUI.setState({ tool: id });
    this.applyCursorClass();
    this.syncSelection();
    this.requestDraw();
  };

  private applyCursorClass() {
    if (!this.canvas) return;
    const id = this.tool;
    this.canvas.style.cursor = ''; // drop any handle cursor from the select tool
    this.canvas.className =
      id === 'select' ? 'tool-select' :
      id === 'hand' ? 'tool-hand' :
      id === 'text' ? 'tool-text' :
      id === 'eraser' ? 'tool-eraser' : 'tool-draw';
  }

  setColor = (c: string) => {
    const style = this.style;
    if (this.tool === 'highlighter') { useUI.setState({ style: { ...style, hlColor: c } }); setPref('hlColor', c); }
    else { useUI.setState({ style: { ...style, color: c } }); setPref('color', c); }
    this.applyStyleToSelection(el => { el.color = c; });
  };

  setSize = (i: SizeIndex) => {
    useUI.setState({ style: { ...this.style, size: i } });
    setPref('size', i);
    this.applyStyleToSelection(el => {
      if (el.type === 'text') el.fs = TEXT_SIZES[i];
      else if (el.type === 'stroke') el.size = SIZES[i] * (el.hl ? 3 : 1);
      else if (el.type !== 'task' && el.type !== 'section') el.size = SIZES[i]; // cards and sections have a colour but no line size
    });
  };

  toggleFill = () => {
    const fill = !this.style.fill;
    useUI.setState({ style: { ...this.style, fill } });
    setPref('fill', fill);
    this.applyStyleToSelection(el => { if (el.type === 'rect' || el.type === 'ellipse' || el.type === 'triangle') el.fill = fill; });
  };

  private applyStyleToSelection(change: (el: Styleable) => void) {
    if (this.tool !== 'select' || !this.selection.size) return;
    const before: BoardElement[] = [], after: BoardElement[] = [];
    for (const id of this.selection) {
      const el = this.elements.get(id);
      if (!el || el.type === 'image') continue; // images have no colour or line size
      before.push(clone(el));
      change(el);
      after.push(clone(el));
    }
    if (!after.length) return;
    this.addEls(after.map(clone));
    this.pushHistory({ kind: 'update', before, after });
  }

  // ---------- Text editing ----------
  private openTextEditor(el: TextEl, isNew: boolean) {
    const editor = this.editor;
    if (!editor) return;
    this.editing = { el, isNew, before: isNew ? null : clone(el) };
    editor.hidden = false;
    editor.value = el.text;
    editor.style.color = el.color;
    this.positionEditor();
    this.requestDraw();
    editor.focus();
    editor.select();
    setTimeout(() => { if (this.editing && document.activeElement !== editor) editor.focus(); }, 0);
  }

  private positionEditor() {
    if (!this.editing || !this.editor) return;
    const { el } = this.editing;
    const s = this.toScreen(el.x, el.y);
    this.editor.style.left = s.x + 'px';
    this.editor.style.top = s.y + 'px';
    this.editor.style.fontSize = el.fs * this.cam.z + 'px';
    this.autoSizeEditor();
  }

  private autoSizeEditor() {
    const ed = this.editor;
    if (!ed) return;
    ed.style.width = '10px';
    ed.style.height = '10px';
    ed.style.width = Math.max(40, ed.scrollWidth + 4) + 'px';
    ed.style.height = ed.scrollHeight + 'px';
  }

  private commitText() {
    if (!this.editing || !this.editor) return;
    const { el, isNew, before } = this.editing;
    this.editing = null;
    const text = this.editor.value.replace(/\s+$/, '').slice(0, LIMITS.text);
    this.editor.hidden = true;
    this.editor.blur();
    if (!text) {
      if (!isNew && before && this.elements.has(el.id)) {
        this.deleteEls([el.id]);
        this.pushHistory({ kind: 'delete', els: [before] });
      }
      this.requestDraw();
      return;
    }
    el.text = text;
    if (isNew) {
      this.addEls([el]);
      this.pushHistory({ kind: 'add', els: [clone(el)] });
    } else if (before && before.text !== text) {
      this.addEls([el]);
      this.pushHistory({ kind: 'update', before: [before], after: [clone(el)] });
    }
    this.growCards([el]);
    this.requestDraw();
  }

  // ---------- Pointer ----------
  private onPointerDown(e: PointerEvent) {
    const canvas = this.canvas;
    if (!canvas || !this.me) return;
    if (this.editing) { this.commitText(); if (this.tool === 'text') return; }
    canvas.setPointerCapture(e.pointerId);
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) {
        // Cancel whatever the first finger started and begin pinch
        this.cancelDrag();
        const [a, b] = [...this.touches.values()];
        this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        return;
      }
      if (this.touches.size > 2) return;
    }
    this.stopFollowing();
    const w = this.toWorld(e.clientX, e.clientY);
    const tool = this.tool;
    const style = this.style;

    // Pan: hand tool, space, middle or right mouse button
    if (tool === 'hand' || this.spaceDown || e.button === 1 || e.button === 2) {
      this.drag = { kind: 'pan', lx: e.clientX, ly: e.clientY };
      canvas.classList.add('grabbing');
      return;
    }
    if (e.button !== 0) return;

    // The "Podpowiedź" button on a task card works with any tool.
    const hintCard = this.hintButtonAt(w.x, w.y);
    if (hintCard) { void this.onHintButton(hintCard); return; }

    const sizeW = SIZES[style.size];
    const by = this.me.id ?? undefined;

    if (tool === 'pen' || tool === 'highlighter') {
      const hl = tool === 'highlighter';
      const el: StrokeEl = { id: newId(), type: 'stroke', pts: [penPoint(w.x, w.y, e)], color: hl ? style.hlColor : style.color, size: hl ? sizeW * 3 : sizeW, hl, by };
      this.addEls([el]);
      this.drag = { kind: 'stroke', el };
    } else if (SHAPE_TYPES.has(tool)) {
      const el: ShapeEl = { id: newId(), type: tool as ShapeEl['type'], x: wc(w.x), y: wc(w.y), w: 0, h: 0, color: style.color, size: sizeW, fill: style.fill, by };
      this.drag = { kind: 'shape', el, sx: el.x, sy: el.y, added: false };
    } else if (LINE_TYPES.has(tool)) {
      const el: LineEl = { id: newId(), type: tool as LineEl['type'], x1: wc(w.x), y1: wc(w.y), x2: wc(w.x), y2: wc(w.y), color: style.color, size: sizeW, by };
      this.drag = { kind: 'line', el, added: false };
    } else if (tool === 'eraser') {
      this.drag = { kind: 'erase', removed: [] };
      this.eraseAt(w.x, w.y);
    } else if (tool === 'text') {
      e.preventDefault(); // keep focus in the text box we're about to open
      const existing = this.topHit(w.x, w.y, 4 / this.cam.z);
      if (existing?.type === 'text') { this.openTextEditor(existing, false); return; }
      const fs = TEXT_SIZES[style.size];
      this.openTextEditor({ id: newId(), type: 'text', x: wc(w.x), y: wc(w.y - fs * 0.6), text: '', color: style.color, fs, by }, true);
    } else if (tool === 'select') {
      const sectionHandle = this.sectionHandleAt(w.x, w.y);
      if (sectionHandle) { this.drag = { kind: 'sectionResize', before: clone(sectionHandle) }; return; }
      const handle = this.imageHandleAt(w.x, w.y);
      if (handle) {
        const before = clone(handle.el);
        if (handle.kind === 'rotate') {
          const [cx, cy] = imageCenter(before);
          this.drag = { kind: 'rotate', before, startAngle: Math.atan2(w.y - cy, w.x - cx) };
        } else {
          const [sx, sy] = CORNER_SIGNS[handle.corner];
          this.drag = { kind: 'resize', before, corner: handle.corner, anchor: fromImageLocal(before, -sx * before.w / 2, -sy * before.h / 2) };
        }
        return;
      }
      const target = this.topHit(w.x, w.y, 6 / this.cam.z);
      if (target) {
        if (e.shiftKey) {
          if (this.selection.has(target.id)) this.selection.delete(target.id);
          else this.selection.add(target.id);
        } else if (!this.selection.has(target.id)) {
          this.selection = new Set([target.id]);
        }
        const before = [...this.selection].map(id => this.elements.get(id)).filter((el): el is BoardElement => !!el).map(clone);
        // Sections and task cards carry what's on them (tasks, written solutions), like frames.
        for (const el of this.cardContents(before)) before.push(clone(el));
        this.drag = { kind: 'move', lx: w.x, ly: w.y, before, moved: false };
      } else {
        if (!e.shiftKey) this.selection.clear();
        this.drag = { kind: 'marquee', sx: w.x, sy: w.y, cx: w.x, cy: w.y, base: new Set(this.selection) };
      }
      this.syncSelection();
      this.requestDraw();
    }
  }

  private onPointerMove(e: PointerEvent) {
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && this.touches.size === 2) {
        const [a, b] = [...this.touches.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        this.cam.x -= (cx - this.pinch.cx) / this.cam.z;
        this.cam.y -= (cy - this.pinch.cy) / this.cam.z;
        this.zoomAt(cx, cy, (this.cam.z * dist) / this.pinch.dist);
        this.pinch = { dist, cx, cy };
        return;
      }
    }
    const w = this.toWorld(e.clientX, e.clientY);
    this.pointerWorld = w;
    if (this.me) this.sendCursor(wc(w.x), wc(w.y));
    if (this.tool === 'eraser') this.requestDraw();
    const drag = this.drag;
    if (!drag) {
      if (this.tool === 'select' && this.canvas) this.canvas.style.cursor = this.handleCursor(w.x, w.y);
      return;
    }

    switch (drag.kind) {
      case 'pan':
        this.cam.x -= (e.clientX - drag.lx) / this.cam.z;
        this.cam.y -= (e.clientY - drag.ly) / this.cam.z;
        drag.lx = e.clientX; drag.ly = e.clientY;
        this.onCameraChange();
        break;
      case 'stroke': {
        const pts = drag.el.pts;
        const before = pts.length;
        const events = e.getCoalescedEvents?.() ?? [];
        for (const ev of events.length ? events : [e]) {
          if (pts.length >= LIMITS.points) break;
          const p = this.toWorld(ev.clientX, ev.clientY);
          const prev = pts[pts.length - 1];
          if (Math.hypot(p.x - prev[0], p.y - prev[1]) * this.cam.z < 1.5) continue;
          pts.push(penPoint(p.x, p.y, ev));
        }
        if (pts.length !== before) { this.requestDraw(); this.sendDraft(drag.el); }
        break;
      }
      case 'shape': {
        const el = drag.el;
        let dx = w.x - drag.sx, dy = w.y - drag.sy;
        if (e.shiftKey) { const m = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * m; dy = Math.sign(dy || 1) * m; }
        el.x = wc(Math.min(drag.sx, drag.sx + dx)); el.y = wc(Math.min(drag.sy, drag.sy + dy));
        el.w = wc(Math.abs(dx)); el.h = wc(Math.abs(dy));
        if (!drag.added && (el.w + el.h) * this.cam.z > 4) { drag.added = true; this.addEls([el]); }
        else if (drag.added) { this.requestDraw(); this.sendDraft(el); }
        break;
      }
      case 'line': {
        const el = drag.el;
        let { x, y } = w;
        if (e.shiftKey) {
          const ang = Math.round(Math.atan2(y - el.y1, x - el.x1) / (Math.PI / 4)) * (Math.PI / 4);
          const len = Math.hypot(x - el.x1, y - el.y1);
          x = el.x1 + Math.cos(ang) * len; y = el.y1 + Math.sin(ang) * len;
        }
        el.x2 = wc(x); el.y2 = wc(y);
        if (!drag.added && Math.hypot(el.x2 - el.x1, el.y2 - el.y1) * this.cam.z > 4) { drag.added = true; this.addEls([el]); }
        else if (drag.added) { this.requestDraw(); this.sendDraft(el); }
        break;
      }
      case 'erase': {
        const events = e.getCoalescedEvents?.() ?? [];
        for (const ev of events.length ? events : [e]) { const p = this.toWorld(ev.clientX, ev.clientY); this.eraseAt(p.x, p.y); }
        break;
      }
      case 'move': {
        const dx = w.x - drag.lx, dy = w.y - drag.ly;
        if (!dx && !dy) break;
        drag.lx = w.x; drag.ly = w.y; drag.moved = true;
        for (const b of drag.before) {
          const el = this.elements.get(b.id);
          if (!el) continue;
          translateEl(el, dx, dy);
          this.queueMove(el.id);
        }
        this.requestDraw();
        break;
      }
      case 'sectionResize': {
        const el = this.elements.get(drag.before.id);
        if (el?.type !== 'section') break;
        el.w = wc(Math.max(SECTION_MIN_W, w.x - el.x));
        el.h = wc(Math.max(SECTION_MIN_H, w.y - el.y));
        this.sendDraft(el);
        this.requestDraw();
        break;
      }
      case 'resize': {
        const el = this.elements.get(drag.before.id);
        if (el?.type !== 'image') break;
        const b = drag.before;
        const [sx, sy] = CORNER_SIGNS[drag.corner];
        const [ax, ay] = drag.anchor;
        // Pointer position relative to the fixed opposite corner, in the image's own frame.
        const [lx, ly] = rotate(w.x - ax, w.y - ay, -b.rot);
        const min = 12 / this.cam.z;
        let nw = Math.max(lx * sx, min), nh = Math.max(ly * sy, min);
        if (!e.shiftKey) {
          // Keep proportions (hold Shift to stretch freely).
          const k = Math.max(nw / b.w, nh / b.h, min / Math.min(b.w, b.h));
          nw = b.w * k; nh = b.h * k;
        }
        const [ox, oy] = rotate(sx * nw / 2, sy * nh / 2, b.rot);
        el.w = Math.max(1, wc(nw)); el.h = Math.max(1, wc(nh));
        el.x = wc(ax + ox - el.w / 2); el.y = wc(ay + oy - el.h / 2);
        this.requestDraw();
        this.sendDraft(el);
        break;
      }
      case 'rotate': {
        const el = this.elements.get(drag.before.id);
        if (el?.type !== 'image') break;
        const [cx, cy] = imageCenter(drag.before);
        let a = drag.before.rot + Math.atan2(w.y - cy, w.x - cx) - drag.startAngle;
        if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12); // Shift: steps of 15°
        el.rot = normalizeAngle(a);
        this.requestDraw();
        this.sendDraft(el);
        break;
      }
      case 'marquee': {
        drag.cx = w.x; drag.cy = w.y;
        const m = { x1: Math.min(drag.sx, w.x), y1: Math.min(drag.sy, w.y), x2: Math.max(drag.sx, w.x), y2: Math.max(drag.sy, w.y) };
        this.selection = new Set(drag.base);
        for (const el of this.elements.values()) {
          const b = bbox(el);
          if (b.x1 >= m.x1 && b.x2 <= m.x2 && b.y1 >= m.y1 && b.y2 <= m.y2) this.selection.add(el.id);
        }
        this.syncSelection();
        this.requestDraw();
        break;
      }
    }
  }

  private eraseAt(x: number, y: number) {
    if (this.drag?.kind !== 'erase') return;
    const tol = 10 / this.cam.z;
    const ids: string[] = [];
    for (const el of this.elements.values()) if (hit(el, x, y, tol)) ids.push(el.id);
    if (!ids.length) return;
    for (const id of ids) this.drag.removed.push(clone(this.elements.get(id)!));
    this.deleteEls(ids);
  }

  private endDrag() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.canvas?.classList.remove('grabbing');
    switch (d.kind) {
      case 'stroke':
        this.send([d.el]);
        this.pushHistory({ kind: 'add', els: [clone(d.el)] });
        this.growCards([d.el]);
        break;
      case 'shape': case 'line':
        if (d.added) { this.send([d.el]); this.pushHistory({ kind: 'add', els: [clone(d.el)] }); this.growCards([d.el]); }
        break;
      case 'erase':
        if (d.removed.length) this.pushHistory({ kind: 'delete', els: d.removed });
        break;
      case 'sectionResize': case 'resize': case 'rotate': {
        const el = this.elements.get(d.before.id);
        if (el) {
          this.send([el]);
          this.pushHistory({ kind: 'update', before: [d.before], after: [clone(el)] });
        }
        break;
      }
      case 'move':
        if (d.moved) {
          const after = d.before.map(b => this.elements.get(b.id)).filter((el): el is BoardElement => !!el);
          this.send(after);
          this.pushHistory({ kind: 'update', before: d.before, after: after.map(clone) });
          this.growCards(after);
        }
        break;
    }
    this.syncSelection();
    this.requestDraw();
  }

  private cancelDrag() {
    const d = this.drag;
    if (!d) return;
    if (d.kind === 'stroke' || ((d.kind === 'shape' || d.kind === 'line') && d.added)) this.deleteEls([d.el.id]);
    this.drag = null;
  }

  private onPointerUp(e: PointerEvent) {
    if (e.pointerType === 'touch') {
      this.touches.delete(e.pointerId);
      if (this.pinch) { if (this.touches.size < 2) this.pinch = null; return; }
    }
    this.endDrag();
  }

  private onDoubleClick(e: MouseEvent) {
    if (this.tool !== 'select') return;
    const w = this.toWorld(e.clientX, e.clientY);
    const t = this.topHit(w.x, w.y, 6 / this.cam.z);
    if (t?.type === 'text') { this.selection.clear(); this.syncSelection(); this.openTextEditor(t, false); }
  }

  // ---------- Zoom & pan ----------
  private zoomAt(sx: number, sy: number, z: number) {
    z = clamp(z, 0.1, 5);
    const before = this.toWorld(sx, sy);
    this.cam.z = z;
    this.cam.x = before.x - sx / z;
    this.cam.y = before.y - sy / z;
    this.onCameraChange();
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    this.stopFollowing();
    if (e.ctrlKey || e.metaKey) {
      this.zoomAt(e.clientX, e.clientY, this.cam.z * Math.exp(-e.deltaY * 0.01));
    } else {
      this.cam.x += e.deltaX / this.cam.z;
      this.cam.y += e.deltaY / this.cam.z;
      this.onCameraChange();
    }
  }

  private animateCam(target: Camera, ms = 350) {
    const start = { ...this.cam };
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const ease = 1 - Math.pow(1 - k, 3);
      this.cam.x = start.x + (target.x - start.x) * ease;
      this.cam.y = start.y + (target.y - start.y) * ease;
      this.cam.z = start.z + (target.z - start.z) * ease;
      this.onCameraChange();
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  zoomBy = (f: number) => {
    const cx = innerWidth / 2, cy = innerHeight / 2;
    const z = clamp(this.cam.z * f, 0.1, 5);
    const w = this.toWorld(cx, cy);
    this.animateCam({ z, x: w.x - cx / z, y: w.y - cy / z }, 200);
  };

  resetView = () => {
    if (!this.elements.size) { this.animateCam({ x: -innerWidth / 2, y: -innerHeight / 2, z: 1 }); return; }
    let b: Box | null = null;
    for (const el of this.elements.values()) b = unionBox(b, bbox(el));
    if (!b) return;
    const pad = 120;
    const z = clamp(Math.min(innerWidth / (b.x2 - b.x1 + pad * 2), innerHeight / (b.y2 - b.y1 + pad * 2)), 0.1, 1.5);
    this.animateCam({ z, x: (b.x1 + b.x2) / 2 - innerWidth / 2 / z, y: (b.y1 + b.y2) / 2 - innerHeight / 2 / z });
  };

  /** Remembers where you're looking on this board, for the next time it's opened. */
  private saveView() {
    if (!this.viewRoom) return;
    const { x, y, z } = this.cam;
    setView(this.viewRoom, { cx: x + innerWidth / 2 / z, cy: y + innerHeight / 2 / z, z });
  }
  private saveViewSoon = throttle(() => this.saveView(), 500);

  private onCameraChange() {
    this.saveViewSoon();
    this.requestDraw();
    this.positionEditor();
    if (useUI.getState().spotlightOn) this.broadcastCam();
  }

  // ---------- Spotlight (teacher leads, students follow) ----------
  // Sends the centre + zoom so it works across different screen sizes.
  private broadcastCam = throttle(() => {
    if (!useUI.getState().spotlightOn) return;
    const { cam } = this;
    this.socket?.send({ t: 'follow', cam: { on: true, cx: wc(cam.x + innerWidth / 2 / cam.z), cy: wc(cam.y + innerHeight / 2 / cam.z), z: cam.z } });
  }, 80);

  toggleSpotlight = () => {
    const on = !useUI.getState().spotlightOn;
    useUI.setState({ spotlightOn: on });
    if (on) { showToast('Spotlight on — everyone follows your view 👀'); this.broadcastCam(); }
    else { this.socket?.send({ t: 'follow', cam: { on: false } }); showToast('Spotlight off'); }
  };

  private onFollow(teacherId: string, c: FollowCamera) {
    if (!c.on) {
      this.followOptOut = false;
      if (this.followingId === teacherId) {
        this.followingId = null;
        useUI.setState({ following: null });
        showToast('Spotlight ended — explore freely!');
      }
      return;
    }
    if (this.followOptOut) return;
    if (this.followingId !== teacherId) {
      this.followingId = teacherId;
      const teacher = this.users.find(u => u.id === teacherId);
      useUI.setState({ following: teacher ? teacher.name : 'teacher' });
    }
    this.cam.z = c.z;
    this.cam.x = c.cx - innerWidth / 2 / c.z;
    this.cam.y = c.cy - innerHeight / 2 / c.z;
    this.requestDraw();
    this.positionEditor();
  }

  stopFollowing = () => {
    if (!this.followingId) return;
    this.followingId = null;
    this.followOptOut = true;
    useUI.setState({ following: null });
    showToast('Stopped following — you can look around');
  };

  // ---------- Teacher: clear ----------
  clearBoard = () => {
    if (this.me?.role !== 'teacher') return;
    const all = [...this.elements.values()].map(clone);
    if (!all.length) return;
    this.elements.clear();
    this.selection.clear();
    this.socket?.send({ t: 'clear' });
    this.pushHistory({ kind: 'delete', els: all });
    this.syncSelection();
    this.requestDraw();
    showToast('Board cleared — Ctrl+Z to bring it back');
  };

  // ---------- Images: handles ----------
  /** The one selected image, when exactly one image is selected in the select tool. */
  private selectedImage(): ImageEl | null {
    if (this.tool !== 'select' || this.selection.size !== 1) return null;
    const el = this.elements.get([...this.selection][0]);
    return el?.type === 'image' ? el : null;
  }

  private rotateHandlePos(el: ImageEl): Pt {
    return fromImageLocal(el, 0, -el.h / 2 - ROTATE_HANDLE_PX / this.cam.z);
  }

  private imageHandleAt(x: number, y: number): { el: ImageEl; kind: 'rotate' } | { el: ImageEl; kind: 'resize'; corner: Corner } | null {
    const el = this.selectedImage();
    if (!el) return null;
    const r = (HANDLE_PX + 3) / this.cam.z;
    const [rx, ry] = this.rotateHandlePos(el);
    if (Math.hypot(x - rx, y - ry) <= r) return { el, kind: 'rotate' };
    const corners = imageCorners(el);
    for (const c of [0, 1, 2, 3] as Corner[]) {
      if (Math.hypot(x - corners[c][0], y - corners[c][1]) <= r) return { el, kind: 'resize', corner: c };
    }
    return null;
  }

  /** Mouse cursor over the handles: diagonal arrows that follow the image's rotation, or "grab" for rotating. */
  private handleCursor(x: number, y: number) {
    if (this.sectionHandleAt(x, y)) return 'nwse-resize';
    const h = this.imageHandleAt(x, y);
    if (!h) return '';
    if (h.kind === 'rotate') return 'grab';
    const [sx, sy] = CORNER_SIGNS[h.corner];
    const [dx, dy] = rotate(sx, sy, h.el.rot);
    const deg = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 180;
    return deg < 22.5 || deg >= 157.5 ? 'ew-resize' : deg < 67.5 ? 'nwse-resize' : deg < 112.5 ? 'ns-resize' : 'nesw-resize';
  }

  /** The one selected section's bottom-right corner, for resizing it by hand. */
  private sectionHandleAt(x: number, y: number): SectionEl | null {
    if (this.tool !== 'select' || this.selection.size !== 1) return null;
    const el = this.elements.get([...this.selection][0]);
    if (el?.type !== 'section') return null;
    const r = 16 / this.cam.z;
    return Math.abs(x - (el.x + el.w)) <= r && Math.abs(y - (el.y + el.h)) <= r ? el : null;
  }

  private drawSectionHandle(ctx: CanvasRenderingContext2D) {
    if (this.tool !== 'select' || this.selection.size !== 1) return;
    const el = this.elements.get([...this.selection][0]);
    if (el?.type !== 'section') return;
    const s = 16 / this.cam.z;
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#3D8BFF';
    ctx.lineWidth = 2.5 / this.cam.z;
    ctx.beginPath();
    ctx.rect(el.x + el.w - s / 2, el.y + el.h - s / 2, s, s);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawImageHandles(ctx: CanvasRenderingContext2D) {
    const el = this.selectedImage();
    if (!el) return;
    const z = this.cam.z;
    const [rx, ry] = this.rotateHandlePos(el);
    const [tx, ty] = fromImageLocal(el, 0, -el.h / 2);
    ctx.save();
    ctx.lineWidth = 2 / z;
    ctx.strokeStyle = '#1E1B3A';
    // Stem + round rotation handle
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(rx, ry); ctx.stroke();
    ctx.fillStyle = '#FFC93C';
    ctx.beginPath(); ctx.arc(rx, ry, HANDLE_PX / z, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Square corner handles, turned with the image
    ctx.fillStyle = '#FFFFFF';
    const half = (HANDLE_PX - 2) / z;
    for (const [cx, cy] of imageCorners(el)) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(el.rot);
      ctx.fillRect(-half, -half, half * 2, half * 2);
      ctx.strokeRect(-half, -half, half * 2, half * 2);
      ctx.restore();
    }
    ctx.restore();
  }

  // ---------- Images: paste & drop ----------
  private onPaste(e: ClipboardEvent) {
    const target = e.target as HTMLElement | null;
    if (!this.me || this.editing || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
    const file = imageFromTransfer(e.clipboardData);
    if (!file) return;
    e.preventDefault();
    const at = this.pointerWorld ?? this.toWorld(innerWidth / 2, innerHeight / 2);
    void this.insertImage(file, at);
  }

  private onDrop(e: DragEvent) {
    const pdf = pdfFromTransfer(e.dataTransfer);
    if (pdf && this.me) {
      e.preventDefault();
      void this.openPdf(pdf);
      return;
    }
    const file = imageFromTransfer(e.dataTransfer);
    if (!file || !this.me) return;
    e.preventDefault();
    void this.insertImage(file, this.toWorld(e.clientX, e.clientY));
  }

  /** Uploads an image and places it centred on `at`, scaled to fit comfortably on screen. */
  private async insertImage(file: File, at: { x: number; y: number }) {
    if (!this.ticket) {
      showToast('Obrazy można wklejać w zeszytach uczniów.', 3000);
      return;
    }
    showToast('Wgrywam obraz…', 15000);
    let prepared: Awaited<ReturnType<typeof prepareImage>>;
    try {
      prepared = await prepareImage(file);
    } catch {
      showToast('Nie udało się odczytać tego obrazu.', 3500);
      return;
    }
    try {
      const { width, height } = prepared;
      const src = await this.upload(prepared.blob);

      const fit = Math.min(1, (innerWidth * 0.5) / this.cam.z / width, (innerHeight * 0.5) / this.cam.z / height);
      const w = Math.max(1, wc(width * fit)), h = Math.max(1, wc(height * fit));
      const el: ImageEl = {
        id: newId(), type: 'image', src,
        x: wc(at.x - w / 2), y: wc(at.y - h / 2), w, h, rot: 0,
        by: this.me?.id ?? undefined,
      };
      this.addEls([el]);
      this.pushHistory({ kind: 'add', els: [clone(el)] });
      // A screenshot of a task (text on a light background) goes straight onto a task card.
      // Separate undo step, so Ctrl+Z keeps the image and drops only the card.
      if (prepared.document && !this.cardUnder(bbox(el))) {
        const card = this.makeTaskCard(el);
        this.growCards([card]);
        this.offerSection([card.id, el.id]);
        showToast('Wygląda na zadanie: dodano miejsce na rozwiązanie ✏️ (Ctrl+Z zostawi sam obraz)', 4500);
        return;
      }
      this.growCards([el]);
      this.offerSection([el.id]);
      // Like Miro: the new image is selected, ready to move, resize or rotate.
      this.setTool('select');
      this.selection = new Set([el.id]);
      this.syncSelection();
      this.requestDraw();
      showToast('Obraz dodany 🖼️');
    } catch (e) {
      showToast((e as Error).message, 3500);
    }
  }

  /** Uploads a prepared image and returns its address. Throws an Error with a message for the person. */
  private async upload(blob: Blob): Promise<string> {
    const res = await fetch(this.uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': blob.type, 'X-Board-Ticket': this.ticket ?? '' },
      body: blob,
      credentials: 'same-origin',
    }).catch(() => null);
    const data: { src?: unknown; error?: unknown } = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok || typeof data.src !== 'string') {
      throw new Error(typeof data.error === 'string' ? data.error : 'Nie udało się wgrać obrazu.');
    }
    getImage(data.src, () => this.requestDraw()); // start loading right away
    return data.src;
  }

  // ---------- Task cards ----------
  /** The card a box lies on (mostly inside), if any. */
  private cardUnder(b: Box): TaskCardEl | null {
    for (const el of this.elements.values()) {
      if (el.type !== 'task') continue;
      const cx = (b.x1 + b.x2) / 2, cy = (b.y1 + b.y2) / 2;
      if (cx >= el.x && cx <= el.x + el.w && cy >= el.y && cy <= el.y + el.h) return el;
    }
    return null;
  }

  /** Elements lying inside the given task cards or sections (not already in the list). */
  private cardContents(els: BoardElement[]): BoardElement[] {
    const cards = els.filter((el): el is TaskCardEl => el.type === 'task');
    const sections = els.filter((el): el is SectionEl => el.type === 'section');
    if (!cards.length && !sections.length) return [];
    const taken = new Set(els.map(el => el.id));
    const out: BoardElement[] = [];
    for (const el of this.elements.values()) {
      if (taken.has(el.id) || el.type === 'section') continue;
      const b = bbox(el);
      const cx = (b.x1 + b.x2) / 2, cy = (b.y1 + b.y2) / 2;
      const onCard = el.type !== 'task' && cards.some(c => b.x1 >= c.x - 4 && b.x2 <= c.x + c.w + 4 && b.y1 >= c.y - 4 && b.y2 <= c.y + c.h + 4);
      const inSection = sections.some(s => cx >= s.x && cx <= s.x + s.w && cy >= s.y && cy <= s.y + s.h);
      if (onCard || inSection) out.push(el);
    }
    return out;
  }

  /** The section an element lies in (by its centre), if any. */
  private sectionAt(b: Box): SectionEl | null {
    const cx = (b.x1 + b.x2) / 2, cy = (b.y1 + b.y2) / 2;
    for (const el of this.elements.values()) {
      if (el.type === 'section' && cx >= el.x && cx <= el.x + el.w && cy >= el.y && cy <= el.y + el.h) return el;
    }
    return null;
  }

  /**
   * Writing that gets close to the bottom or right edge of a solution area makes the card bigger, and what's
   * below it (in its column) or beside it (in its row) moves away by as much, so cards never overlap. Not part of undo: undoing the
   * writing leaves the extra room, which does no harm.
   */
  private growCards(changed: BoardElement[]) {
    const updates = new Map<string, BoardElement>();
    for (const el of changed) {
      if (el.type === 'task') continue;
      const b = bbox(el);
      for (const card of this.elements.values()) {
        if (card.type !== 'task') continue;
        const area = solutionArea(card);
        // Writing that starts in the solution area (or just past its edge).
        const startsInside = b.x1 >= area.x1 - 20 && b.x1 <= area.x2 + 40 && b.y1 >= area.y1 - 20 && b.y1 <= area.y2 + 40;
        if (!startsInside) continue;

        // Downwards: everything below the card in its column moves down.
        const needDown = b.y2 + SOLUTION_GROW_ROOM - area.y2;
        if (needDown > 0) this.growCardDown(card, wc(Math.max(needDown, 120)), updates, el.id);

        // Sideways: everything to the right of the card in its row moves right.
        const needRight = b.x2 + SOLUTION_GROW_ROOM_X - area.x2;
        if (needRight > 0 && card.w < SOLUTION_MAX_CARD_WIDTH) {
          const oldRight = card.x + card.w;
          const delta = wc(Math.min(Math.max(needRight, 160), SOLUTION_MAX_CARD_WIDTH - card.w));
          for (const other of this.elements.values()) {
            if (other.id === card.id || other.id === el.id) continue;
            const ob = bbox(other);
            if (ob.x1 >= oldRight - 2 && ob.y2 > card.y && ob.y1 < card.y + card.h) {
              translateEl(other, delta, 0);
              updates.set(other.id, other);
            }
          }
          card.w = wc(card.w + delta);
          updates.set(card.id, card);
        }
      }
    }
    // Sections grow too: anything that starts in a section and gets near its bottom or right edge.
    for (const el of changed) {
      if (el.type === 'section') continue;
      const b = bbox(el);
      const section = this.sectionAt({ x1: b.x1, y1: b.y1, x2: b.x1, y2: b.y1 });
      if (!section) continue;
      if (b.y2 + SECTION_ROOM > section.y + section.h) this.growSectionTo(section, b.y2 + SECTION_ROOM - SECTION.pad, updates);
      if (b.x2 + SECTION_ROOM > section.x + section.w) this.widenSectionTo(section, b.x2 + SECTION_ROOM, updates);
    }
    if (updates.size) {
      this.send([...updates.values()]);
      this.requestDraw();
    }
  }

  /** Makes a section reach right to `right`; what's beside it (in its rows) moves right. */
  private widenSectionTo(section: SectionEl, right: number, updates: Map<string, BoardElement>) {
    const delta = wc(right - (section.x + section.w));
    if (delta <= 0) return;
    const oldRight = section.x + section.w;
    for (const other of this.elements.values()) {
      if (other.id === section.id || updates.has(other.id)) continue;
      const ob = bbox(other);
      if (ob.x1 >= oldRight - 2 && ob.y2 > section.y && ob.y1 < section.y + section.h) {
        translateEl(other, delta, 0);
        updates.set(other.id, other);
      }
    }
    section.w = wc(section.w + delta);
    updates.set(section.id, section);
  }

  // ---------- Hints on task cards ----------
  private hintsLoading = new Set<string>();

  private hintButtonAt(x: number, y: number): TaskCardEl | null {
    for (const el of this.elements.values()) {
      if (el.type !== 'task') continue;
      const b = hintLayout(el).button;
      if (b && x >= b.x1 && x <= b.x2 && y >= b.y1 && y <= b.y2) return el;
    }
    return null;
  }

  /** The task image on a card: the topmost image in its left part. */
  private cardImage(card: TaskCardEl): ImageEl | null {
    let best: ImageEl | null = null;
    for (const el of this.cardContents([card])) {
      if (el.type !== 'image' || el.x > card.x + card.split) continue;
      if (!best || el.y < best.y) best = el;
    }
    return best;
  }

  /** Shows the next hint; the first click asks the server (AI) to prepare them. */
  private async onHintButton(card: TaskCardEl) {
    if (card.hints?.length) { this.showNextHint(card.id); return; }
    if (!this.ticket) { showToast('Podpowiedzi działają w zeszytach uczniów.', 3000); return; }
    if (this.hintsLoading.has(card.id)) return;
    const img = this.cardImage(card);
    if (!img) { showToast('Na tej karcie nie ma obrazu zadania.', 3000); return; }

    this.hintsLoading.add(card.id);
    showToast('Przygotowuję podpowiedzi… 💡', 30000);
    try {
      const res = await fetch(this.hintsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Board-Ticket': this.ticket },
        body: JSON.stringify({ src: img.src }),
        credentials: 'same-origin',
      }).catch(() => null);
      const data: { hints?: unknown; error?: unknown } = res ? await res.json().catch(() => ({})) : {};
      const hints = Array.isArray(data.hints) ? data.hints.filter((h): h is string => typeof h === 'string').slice(0, LIMITS.hints) : [];
      if (!res?.ok || !hints.length) {
        showToast(typeof data.error === 'string' ? data.error : 'Nie udało się przygotować podpowiedzi.', 4000);
        return;
      }
      const current = this.elements.get(card.id);
      if (current?.type !== 'task') return;
      current.hints = hints.map(h => h.slice(0, LIMITS.hintText));
      current.shown = 0;
      // Cards made before hints existed don't know where the task ends.
      current.taskH ??= wc(Math.max(0, bbox(img).y2 - (current.y + CARD.header)));
      this.showNextHint(current.id);
      showToast('💡 Podpowiedź gotowa');
    } finally {
      this.hintsLoading.delete(card.id);
    }
  }

  private showNextHint(id: string) {
    const card = this.elements.get(id);
    if (card?.type !== 'task' || !card.hints?.length) return;
    card.shown = Math.min(card.hints.length, (card.shown ?? 0) + 1);
    const updates = new Map<string, BoardElement>([[card.id, card]]);
    // Make the card tall enough for the hints (what's below moves down).
    const needed = hintLayout(card).bottom + CARD.pad - (card.y + card.h);
    if (needed > 0) this.growCardDown(card, wc(needed + 24), updates);
    this.send([...updates.values()]);
    this.requestDraw();
  }

  /** Makes a card taller; everything below it in its column moves down by as much. */
  private growCardDown(card: TaskCardEl, delta: number, updates: Map<string, BoardElement>, except?: string) {
    const oldBottom = card.y + card.h;
    for (const other of this.elements.values()) {
      if (other.id === card.id || other.id === except) continue;
      const ob = bbox(other);
      if (ob.y1 >= oldBottom - 2 && ob.x2 > card.x && ob.x1 < card.x + card.w) {
        translateEl(other, 0, delta);
        updates.set(other.id, other);
      }
    }
    card.h = wc(card.h + delta);
    updates.set(card.id, card);
    // The section holding the card grows with it (what's below it already moved down above).
    const section = this.sectionAt(bbox(card));
    if (section && section.y + section.h >= oldBottom - 2) {
      section.h = wc(section.h + delta);
      updates.set(section.id, section);
    }
  }

  /** Makes a section reach down to `bottom` (plus padding); everything below it in its column moves down. */
  private growSectionTo(section: SectionEl, bottom: number, updates: Map<string, BoardElement>) {
    const delta = wc(bottom + SECTION.pad - (section.y + section.h));
    if (delta <= 0) return;
    const oldBottom = section.y + section.h;
    for (const other of this.elements.values()) {
      if (other.id === section.id || updates.has(other.id)) continue;
      const ob = bbox(other);
      if (ob.y1 >= oldBottom - 2 && ob.x2 > section.x && ob.x1 < section.x + section.w) {
        translateEl(other, 0, delta);
        updates.set(other.id, other);
      }
    }
    section.h = wc(section.h + delta);
    updates.set(section.id, section);
  }

  // ---------- Sections ----------
  private sectionsKey = '';

  /** Tells React the list of sections (for the side panel), when it changes. */
  private syncSections() {
    const list = [...this.elements.values()]
      .filter((el): el is SectionEl => el.type === 'section')
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map(s => ({ id: s.id, title: s.title, color: s.color }));
    const key = JSON.stringify(list);
    if (key !== this.sectionsKey) { this.sectionsKey = key; useUI.setState({ sections: list }); }
  }

  /** Where a new section goes: under everything on the board, lined up with the sections above. */
  private newSectionSpot() {
    let content: Box | null = null;
    let left: number | null = null;
    for (const el of this.elements.values()) {
      content = unionBox(content, bbox(el));
      if (el.type === 'section') left = left === null ? el.x : Math.min(left, el.x);
    }
    if (!content) return this.toWorld(Math.min(80, innerWidth * 0.06), 110);
    return { x: wc(left ?? content.x1), y: wc(content.y2 + 160) };
  }

  private makeSection(title: string, at: { x: number; y: number }, w = SECTION_W, h = SECTION_H): SectionEl {
    const count = [...this.elements.values()].filter(el => el.type === 'section').length;
    return {
      id: newId(), type: 'section', title: title.trim().slice(0, 80) || 'Sekcja', by: this.me?.id ?? undefined,
      color: SECTION_COLORS[count % SECTION_COLORS.length], x: wc(at.x), y: wc(at.y), w, h,
    };
  }

  /** A new, empty section at the bottom of the board; the view moves to it. */
  addSection = (title: string) => {
    if (!this.me) return;
    const section = this.makeSection(title, this.newSectionSpot());
    this.addEls([section]);
    this.pushHistory({ kind: 'add', els: [clone(section)] });
    this.goToSection(section.id);
    showToast(`Sekcja „${section.title}” dodana 📁`);
  };

  renameSection = (id: string, title: string) => {
    const el = this.elements.get(id);
    const name = title.trim().slice(0, 80);
    if (el?.type !== 'section' || !name || name === el.title) return;
    const before = clone(el);
    el.title = name;
    this.addEls([el]);
    this.pushHistory({ kind: 'update', before: [before], after: [clone(el)] });
  };

  /** Moves the view to a section's top, fitting its width. */
  goToSection = (id: string) => {
    const el = this.elements.get(id);
    if (el?.type !== 'section') return;
    this.stopFollowing();
    const z = clamp(Math.min(1, (innerWidth - SIDE_PANEL - 60) / el.w), 0.2, 1);
    this.animateCam({ z, x: el.x - SIDE_PANEL / z, y: el.y - 100 / z });
  };

  /** A pasted task (screenshot, photo): puts the selected image on a task card with room for the solution. */
  addSolutionSpace = () => {
    const [id] = this.selection;
    const img = this.selection.size === 1 && id ? this.elements.get(id) : undefined;
    if (img?.type !== 'image' || !this.me) return;
    this.makeTaskCard(img);
    showToast('Gotowe: pisz rozwiązanie w białym polu ✏️');
  };

  /** Puts a task card around an image already on the board (numbered after the cards already there). */
  private makeTaskCard(img: ImageEl): TaskCardEl {
    const b = bbox(img);
    const count = [...this.elements.values()].filter(el => el.type === 'task').length;
    const { card } = taskCard(b.x1 - CARD.pad, b.y1 - CARD.header, b.x2 - b.x1, b.y2 - b.y1,
      `Zadanie ${count + 1}`, CARD_COLORS[count % CARD_COLORS.length], SOLUTION_MIN_HEIGHT, this.me?.id ?? undefined);
    this.addEls([card]);
    this.pushHistory({ kind: 'add', els: [clone(card)] });
    this.selection.clear();
    this.syncSelection();
    this.setTool('pen'); // ready to write the solution
    return card;
  }

  // ---------- Putting a pasted task into a section ----------
  private placedKey = 0;

  /** Shows "Wstaw do sekcji" for what was just pasted (only when the board has sections). */
  private offerSection(ids: string[]) {
    if (![...this.elements.values()].some(el => el.type === 'section')) return;
    useUI.setState({ placed: { ids, key: ++this.placedKey } });
  }

  dismissPlaced = () => useUI.setState({ placed: null });

  /** Moves elements (a task with its card) into a section, under what's already there; the section grows to fit. */
  moveIntoSection = (ids: string[], sectionId: string) => {
    const section = this.elements.get(sectionId);
    if (section?.type !== 'section') return;
    const moving = ids.map(id => this.elements.get(id)).filter((el): el is BoardElement => !!el);
    if (!moving.length) return;
    const all = [...moving, ...this.cardContents(moving)];
    const movingIds = new Set(all.map(el => el.id));

    let box: Box | null = null;
    for (const el of all) box = unionBox(box, bbox(el));
    if (!box) return;
    let lowest = section.y + SECTION.header + 32 - CARD_ROW_GAP;
    for (const el of this.elements.values()) {
      if (el.id === section.id || movingIds.has(el.id) || this.sectionAt(bbox(el))?.id !== section.id) continue;
      lowest = Math.max(lowest, bbox(el).y2);
    }
    const dx = section.x + SECTION.pad - box.x1;
    const dy = lowest + CARD_ROW_GAP - box.y1;

    const before = all.map(clone);
    // Moved elements are in `updates` from the start, so making room doesn't push them.
    const updates = new Map<string, BoardElement>(all.map(el => [el.id, el]));
    this.growSectionTo(section, box.y2 + dy + SECTION_ROOM - SECTION.pad, updates);
    this.widenSectionTo(section, box.x2 + dx + SECTION.pad, updates);
    for (const el of all) translateEl(el, dx, dy);
    this.send([...updates.values()]);
    this.pushHistory({ kind: 'update', before, after: all.map(clone) });
    useUI.setState({ placed: null });

    const z = clamp(this.cam.z, 0.4, 1);
    this.animateCam({ z, x: section.x - SIDE_PANEL / z, y: box.y1 + dy - 120 / z });
    showToast(`Przeniesiono do sekcji „${section.title}” 📁`);
  };

  // ---------- PDF worksheets ----------
  /** Reads a PDF and opens the import dialog. */
  openPdf = async (file: File) => {
    if (!this.ticket) {
      showToast('PDF można wstawić w zeszycie ucznia.', 3000);
      return;
    }
    this.cancelPdf();
    useUI.setState({ pdf: { fileName: file.name, analysis: null, progress: 'Czytam PDF…' } });
    try {
      const { PdfImport } = await import('./pdf'); // loaded only when needed (pdf.js is big)
      this.pdfJob = await PdfImport.open(file);
      useUI.setState({ pdf: { fileName: file.name, analysis: this.pdfJob.analysis, progress: null } });
    } catch (e) {
      console.warn('PDF import failed:', e);
      useUI.setState({ pdf: null });
      showToast('Nie udało się odczytać tego PDF-a.', 3500);
    }
  };

  cancelPdf = () => {
    this.pdfJob?.close();
    this.pdfJob = null;
    useUI.setState({ pdf: null });
  };

  /**
   * Places the PDF on the board: each task (or page) on the left, with a frame beside it for the solution.
   * Everything is ordinary board elements, so it can be moved, resized or deleted, and one undo removes it all.
   */
  insertPdf = async (mode: 'tasks' | 'pages', target: PdfTarget = { kind: 'none' }) => {
    const job = this.pdfJob;
    const state = useUI.getState().pdf;
    if (!job || !state || !this.me) return;
    const setProgress = (progress: string) => useUI.setState({ pdf: { ...state, progress } });

    try {
      setProgress('Przygotowuję…');
      const pieces = await job.pieces(mode, (done, total) => setProgress(`Przygotowuję ${done + 1} z ${total}…`));
      if (!pieces.length) throw new Error('W tym PDF-ie nie ma nic do wstawienia.');

      const by = this.me.id ?? undefined;
      let section: SectionEl | null = null;
      let start: { x: number; y: number };
      if (target.kind === 'new') {
        // A new section at the bottom of the board, named after the file.
        const spot = this.newSectionSpot();
        section = this.makeSection(target.title, spot);
        start = { x: wc(spot.x + SECTION.pad), y: wc(spot.y + SECTION.header + 32) };
      } else if (target.kind === 'section' && this.elements.get(target.id)?.type === 'section') {
        // Into an existing section, under what's already in it.
        section = this.elements.get(target.id) as SectionEl;
        let lowest = section.y + SECTION.header + 32 - CARD_ROW_GAP;
        for (const el of this.elements.values()) {
          if (el.id === section.id || this.sectionAt(bbox(el))?.id !== section.id) continue;
          lowest = Math.max(lowest, bbox(el).y2);
        }
        start = { x: wc(section.x + SECTION.pad), y: wc(lowest + CARD_ROW_GAP) };
      } else {
        // In free space: to the right of everything already on the board (or where you're looking, if it's empty).
        let content: Box | null = null;
        for (const el of this.elements.values()) content = unionBox(content, bbox(el));
        start = content ? { x: wc(content.x2 + 160), y: wc(content.y1) } : this.toWorld(Math.min(120, innerWidth * 0.08), 110);
      }
      const els: BoardElement[] = [];
      let y = start.y;
      for (const [i, piece] of pieces.entries()) {
        setProgress(`Wgrywam ${i + 1} z ${pieces.length}…`);
        const blob = await new Promise<Blob>((resolve, reject) =>
          piece.canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Nie udało się przygotować strony.'))), 'image/png'));
        const prepared = await prepareImage(blob);
        const src = await this.upload(prepared.blob);

        const w = wc(piece.width), h = wc(piece.height);
        // As much room as the exam sheet gave for the answer (within limits).
        const solutionH = clamp(piece.answerSpace, SOLUTION_MIN_HEIGHT, SOLUTION_MAX_HEIGHT);
        const { card, imgX, imgY } = taskCard(start.x, y, w, h, piece.label, CARD_COLORS[i % CARD_COLORS.length], solutionH, by);
        els.push(card, { id: newId(), type: 'image', src, x: imgX, y: imgY, w, h, rot: 0, by });
        y += card.h + CARD_ROW_GAP;
      }

      const bottom = y - CARD_ROW_GAP;
      const widest = Math.max(...els.filter(el => el.type === 'task').map(el => (el as TaskCardEl).w));
      if (section && target.kind === 'new') {
        section.w = wc(Math.max(section.w, widest + SECTION.pad * 2));
        section.h = wc(Math.max(section.h, bottom + SECTION_ROOM - section.y));
        els.unshift(section);
      } else if (section) {
        // Make room first (what's below the section moves down), then add the tasks.
        const updates = new Map<string, BoardElement>();
        this.growSectionTo(section, bottom, updates);
        if (section.w < widest + SECTION.pad * 2) { section.w = wc(widest + SECTION.pad * 2); updates.set(section.id, section); }
        if (updates.size) this.send([...updates.values()]);
      }

      this.addEls(els);
      this.pushHistory({ kind: 'add', els: els.map(clone) });
      this.setTool('pen');
      this.cancelPdf();
      // Take the view to the first task (right of the sections panel).
      const z = clamp(this.cam.z, 0.5, 1);
      this.animateCam({ z, x: start.x - (section ? SIDE_PANEL : 60) / z, y: start.y - (section ? SECTION.header + 110 : 110) / z });
      showToast(mode === 'tasks' ? `Wstawiono zadania: ${pieces.length} ✏️` : `Wstawiono strony: ${pieces.length} ✏️`, 2500);
    } catch (e) {
      console.warn('PDF insert failed:', e);
      setProgress('');
      useUI.setState({ pdf: { ...state, progress: null } });
      showToast(e instanceof Error && e.message ? e.message : 'Nie udało się wstawić PDF-a.', 4000);
    }
  };

  // ---------- Keyboard ----------
  private onKeyDown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || !this.me) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (e.code === 'Space' && !this.spaceDown) { this.spaceDown = true; this.canvas?.classList.add('panning'); e.preventDefault(); return; }
    if (mod && key === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
    if (mod && key === 'y') { e.preventDefault(); this.redo(); return; }
    if (mod && key === 'a') {
      e.preventDefault();
      this.setTool('select');
      this.selection = new Set(this.elements.keys());
      this.syncSelection();
      this.requestDraw();
      return;
    }
    if (mod && key === 'd' && this.selection.size) { e.preventDefault(); this.duplicateSelection(); return; }
    if (mod) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selection.size) {
      const els = [...this.selection].map(id => this.elements.get(id)).filter((el): el is BoardElement => !!el).map(clone);
      this.deleteEls(els.map(el => el.id));
      this.pushHistory({ kind: 'delete', els });
      this.syncSelection();
      return;
    }
    if (e.key === 'Escape') { this.selection.clear(); this.syncSelection(); this.requestDraw(); return; }
    if (e.key === '+' || e.key === '=') { this.zoomBy(1.25); return; }
    if (e.key === '-') { this.zoomBy(0.8); return; }
    if (e.key === '0') { this.resetView(); return; }
    const t = KEYMAP[key];
    if (t && toolDef(t)) this.setTool(t);
  }

  private duplicateSelection() {
    const copies: BoardElement[] = [];
    for (const id of this.selection) {
      const el = this.elements.get(id);
      if (!el) continue;
      const c = clone(el);
      c.id = newId();
      c.by = this.me?.id ?? undefined;
      translateEl(c, 24, 24);
      copies.push(c);
    }
    this.addEls(copies);
    this.selection = new Set(copies.map(c => c.id));
    this.pushHistory({ kind: 'add', els: copies.map(clone) });
    this.syncSelection();
  }
}

export const engine = new BoardEngine();
