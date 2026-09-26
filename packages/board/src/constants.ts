export const COLORS = [
  { name: 'Ink', c: '#1E1B3A' },
  { name: 'Tomato', c: '#FF5A4E' },
  { name: 'Tangerine', c: '#FF9F1C' },
  { name: 'Sunflower', c: '#FFC93C' },
  { name: 'Mint', c: '#22C1A0' },
  { name: 'Sky', c: '#3D8BFF' },
  { name: 'Grape', c: '#8B5CF6' },
  { name: 'Bubblegum', c: '#FF6FB5' },
] as const;

export const SIZES = [3, 6, 12] as const;
export const SIZE_NAMES = ['Thin', 'Medium', 'Thick'] as const;
export const TEXT_SIZES = [20, 32, 52] as const;
export type SizeIndex = 0 | 1 | 2;

export const FONT = '"Fredoka", "Nunito", system-ui, sans-serif';

export type ToolId =
  | 'select' | 'hand' | 'pen' | 'highlighter' | 'eraser'
  | 'rect' | 'ellipse' | 'triangle' | 'line' | 'arrow' | 'text';

export interface ToolDef {
  id: ToolId;
  label: string;
  key: string;
  color: string;
  fg?: string;
  style?: boolean; // shows the colour/size bubble
  fill?: boolean;  // shows the fill toggle
}

export const TOOLS: (ToolDef | 'sep')[] = [
  { id: 'select', label: 'Select', key: 'V', color: '#FFFFFF' },
  { id: 'hand', label: 'Move around', key: 'H', color: '#FFFFFF' },
  'sep',
  { id: 'pen', label: 'Pen', key: 'P', color: '#FFC93C', style: true },
  { id: 'highlighter', label: 'Highlighter', key: 'M', color: '#FF6FB5', style: true },
  { id: 'eraser', label: 'Eraser', key: 'E', color: '#FF5A4E', fg: '#FFFFFF' },
  'sep',
  { id: 'rect', label: 'Rectangle', key: 'R', color: '#22C1A0', style: true, fill: true },
  { id: 'ellipse', label: 'Circle', key: 'O', color: '#3D8BFF', fg: '#FFFFFF', style: true, fill: true },
  { id: 'triangle', label: 'Triangle', key: 'G', color: '#8B5CF6', fg: '#FFFFFF', style: true, fill: true },
  { id: 'line', label: 'Line', key: 'L', color: '#FF9F1C', style: true },
  { id: 'arrow', label: 'Arrow', key: 'A', color: '#FFC93C', style: true },
  'sep',
  { id: 'text', label: 'Text', key: 'T', color: '#8B5CF6', fg: '#FFFFFF', style: true },
];

export const toolDef = (id: ToolId) => TOOLS.find((t): t is ToolDef => t !== 'sep' && t.id === id);

export const SHAPE_TYPES = new Set<string>(['rect', 'ellipse', 'triangle']);
export const LINE_TYPES = new Set<string>(['line', 'arrow']);
