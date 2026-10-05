// UI state shared between the React components and the canvas engine.

import { create } from 'zustand';
import { COLORS, type SizeIndex, type ToolId } from './constants';
import { getPref } from './prefs';
import type { PdfAnalysis } from './board/pdf';
import type { User } from './protocol';

export interface Style {
  color: string;
  hlColor: string;
  size: SizeIndex;
  fill: boolean;
}

export interface Me {
  id: string | null;
  name: string;
  role: User['role'];
  color: string;
}

export interface RemoteCursor { x: number; y: number; t: number }

/** Set when the board is a student's notebook opened from the app (not an open demo room). */
export interface Notebook {
  title: string;
  backHref: string;
  backLabel: string;
}

interface UIState {
  roomId: string;
  notebook: Notebook | null;
  me: Me | null;
  users: User[];
  tool: ToolId;
  style: Style;
  selection: { count: number; hasShape: boolean; styleable: boolean; oneImage: boolean };
  canUndo: boolean;
  canRedo: boolean;
  cam: { x: number; y: number; z: number };
  cursors: Record<string, RemoteCursor>;
  spotlightOn: boolean;
  following: string | null; // name of the teacher being followed
  toast: { msg: string; ms: number; key: number } | null;
  /** The PDF import dialog: null when closed. `progress` is shown while busy. */
  pdf: { fileName: string; analysis: PdfAnalysis | null; progress: string | null } | null;
  /** Sections of the board, top to bottom (the side panel). */
  sections: { id: string; title: string; color: string }[];
  /** Just pasted (an image, maybe with its task card): offer to move it into a section. */
  placed: { ids: string[]; key: number } | null;
}

export const useUI = create<UIState>(() => ({
  roomId: '',
  notebook: null,
  me: null,
  users: [],
  tool: 'pen',
  style: {
    color: getPref('color') ?? COLORS[0].c,
    hlColor: getPref('hlColor') ?? COLORS[3].c,
    size: getPref('size') ?? 1,
    fill: getPref('fill') ?? false,
  },
  selection: { count: 0, hasShape: false, styleable: false, oneImage: false },
  canUndo: false,
  canRedo: false,
  cam: { x: 0, y: 0, z: 1 },
  cursors: {},
  spotlightOn: false,
  following: null,
  toast: null,
  pdf: null,
  sections: [],
  placed: null,
}));

let toastKey = 0;
export function showToast(msg: string, ms = 1800) {
  useUI.setState({ toast: { msg, ms, key: ++toastKey } });
}
