import type { ReactNode } from 'react';
import type { ToolId } from '../constants';

const Svg = ({ children }: { children: ReactNode }) => <svg viewBox="0 0 24 24" aria-hidden="true">{children}</svg>;

export const TOOL_ICONS: Record<ToolId, ReactNode> = {
  select: <path d="M5 3.5 18.5 10l-6 1.8-2.3 6L5 3.5Z" />,
  hand: <path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-6.5V4a1.5 1.5 0 0 1 3 0v7m0-5.5a1.5 1.5 0 0 1 3 0V12m0-3.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.7-2.3L4.5 15.5a1.6 1.6 0 0 1 2.4-2.1L8 14.5" />,
  pen: <><path d="M4 20l1-4.5L16 4.5a2.1 2.1 0 0 1 3 3L8 18.5 4 20Z" /><path d="m14 6.5 3 3" /></>,
  highlighter: <><path d="m9 15-4 4h5l2-2" /><path d="m9 15 3 3 8.5-8.5a2.1 2.1 0 0 0-3-3L9 15Z" /></>,
  eraser: <><path d="M8 20h12" /><path d="M8.5 20 4.2 15.7a1.5 1.5 0 0 1 0-2.1L13.6 4.2a1.5 1.5 0 0 1 2.1 0l4.1 4.1a1.5 1.5 0 0 1 0 2.1L10.3 20" /><path d="m9 9 6 6" /></>,
  rect: <rect x="3.5" y="5.5" width="17" height="13" rx="3" />,
  ellipse: <ellipse cx="12" cy="12" rx="8.5" ry="7" />,
  triangle: <path d="M12 4 21 19.5H3L12 4Z" />,
  line: <path d="M5 19 19 5" />,
  arrow: <><path d="M5 19 19 5" /><path d="M10 5h9v9" /></>,
  text: <path d="M5 6.5V5h14v1.5M12 5v14M9 19h6" />,
};

export const ToolIcon = ({ id }: { id: ToolId }) => <Svg>{TOOL_ICONS[id]}</Svg>;

export const BackIcon = () => <Svg><path d="M19 12H5M11 18l-6-6 6-6" /></Svg>;
export const InviteIcon = () => <Svg><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></Svg>;
export const EyeIcon = () => <Svg><circle cx="12" cy="12" r="3.2" /><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /></Svg>;
export const PdfIcon = () => <Svg><path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5l-5-5Z" /><path d="M14 3.5v5h5M8.5 13h7M8.5 16.5h4.5" /></Svg>;
export const TrashIcon = () => <Svg><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" /></Svg>;
export const UndoIcon = () => <Svg><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Svg>;
export const RedoIcon = () => <Svg><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></Svg>;
export const MinusIcon = () => <Svg><path d="M6 12h12" /></Svg>;
export const PlusIcon = () => <Svg><path d="M6 12h12M12 6v12" /></Svg>;
export const FillIcon = () => <Svg><rect x="4" y="4" width="16" height="16" rx="4" /></Svg>;
export const BrandIcon = () => <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 21c3-8 6-8 7-3s5 4 8-6" /></svg>;
export const CursorIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2.5 19.5 10l-6.8 1.9L9.5 19 4 2.5Z" /></svg>;
