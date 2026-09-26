// The canvas engine: drawing, tools, undo, camera, spotlight and live sync.
// React renders the UI around it and talks to it through the `engine` singleton and the store.

import { nanoid } from 'nanoid';
import { LINE_TYPES, SHAPE_TYPES, SIZES, TEXT_SIZES, TOOLS, toolDef, type SizeIndex, type ToolDef, type ToolId } from '../constants';
import { setPref } from '../prefs';
import { LIMITS, type BoardElement, type FollowCamera, type LineEl, type ServerMessage, type ShapeEl, type StrokeEl, type TextEl, type User } from '../protocol';
import { roomId } from '../room';
import { showToast, useUI, type Me } from '../store';
import { Socket, defaultSyncUrl } from '../net/socket';
import { bbox, clamp, clearMeasureCache, hit, translateEl, unionBox, wc, type Box } from './geometry';
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
  | { kind: 'marquee'; sx: number; sy: number; cx: number; cy: number; base: Set<string> };

const clone = <T>(o: T): T => structuredClone(o);
const newId = () => nanoid(12);

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
    on(canvas, 'wheel', e => this.onWheel(e), { passive: false });
    on(window, 'keydown', e => this.onKeyDown(e));
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

  join(me: Omit<Me, 'id'>, syncUrl = defaultSyncUrl()) {
    useUI.setState({ me: { ...me, id: null } });
    this.socket?.close();
    this.socket = new Socket(
      syncUrl,
      { t: 'join', room: roomId, name: me.name, role: me.role, color: me.color },
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
    let hasShape = false;
    for (const id of this.selection) if (SHAPE_TYPES.has(this.elements.get(id)?.type ?? '')) hasShape = true;
    useUI.setState({ selection: { count: this.selection.size, hasShape } });
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
    for (const el of this.elements.values()) {
      if (this.editing?.el.id === el.id) continue;
      const b = bbox(el);
      if (b.x2 < v.x1 - 50 || b.x1 > v.x2 + 50 || b.y2 < v.y1 - 50 || b.y1 > v.y2 + 50) continue;
      drawElement(ctx, el);
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
        ctx.strokeRect(b.x1 - pad, b.y1 - pad, b.x2 - b.x1 + pad * 2, b.y2 - b.y1 + pad * 2);
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
      else el.size = SIZES[i];
    });
  };

  toggleFill = () => {
    const fill = !this.style.fill;
    useUI.setState({ style: { ...this.style, fill } });
    setPref('fill', fill);
    this.applyStyleToSelection(el => { if (el.type === 'rect' || el.type === 'ellipse' || el.type === 'triangle') el.fill = fill; });
  };

  private applyStyleToSelection(change: (el: BoardElement) => void) {
    if (this.tool !== 'select' || !this.selection.size) return;
    const before: BoardElement[] = [], after: BoardElement[] = [];
    for (const id of this.selection) {
      const el = this.elements.get(id);
      if (!el) continue;
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

    // Pan: hand tool, space, middle mouse
    if (tool === 'hand' || this.spaceDown || e.button === 1) {
      this.drag = { kind: 'pan', lx: e.clientX, ly: e.clientY };
      canvas.classList.add('grabbing');
      return;
    }
    if (e.button !== 0) return;

    const sizeW = SIZES[style.size];
    const by = this.me.id ?? undefined;

    if (tool === 'pen' || tool === 'highlighter') {
      const hl = tool === 'highlighter';
      const el: StrokeEl = { id: newId(), type: 'stroke', pts: [[wc(w.x), wc(w.y)]], color: hl ? style.hlColor : style.color, size: hl ? sizeW * 3 : sizeW, hl, by };
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
      const target = this.topHit(w.x, w.y, 6 / this.cam.z);
      if (target) {
        if (e.shiftKey) {
          if (this.selection.has(target.id)) this.selection.delete(target.id);
          else this.selection.add(target.id);
        } else if (!this.selection.has(target.id)) {
          this.selection = new Set([target.id]);
        }
        const before = [...this.selection].map(id => this.elements.get(id)).filter((el): el is BoardElement => !!el).map(clone);
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
    if (!drag) return;

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
          pts.push([wc(p.x), wc(p.y)]);
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
        break;
      case 'shape': case 'line':
        if (d.added) { this.send([d.el]); this.pushHistory({ kind: 'add', els: [clone(d.el)] }); }
        break;
      case 'erase':
        if (d.removed.length) this.pushHistory({ kind: 'delete', els: d.removed });
        break;
      case 'move':
        if (d.moved) {
          const after = d.before.map(b => this.elements.get(b.id)).filter((el): el is BoardElement => !!el);
          this.send(after);
          this.pushHistory({ kind: 'update', before: d.before, after: after.map(clone) });
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

  private onCameraChange() {
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
