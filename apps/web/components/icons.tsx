import type { ReactNode } from 'react';

const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const HomeIcon = () => <Svg><path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1v-7.5Z" /></Svg>;
export const UsersIcon = () => <Svg><circle cx="9" cy="8.5" r="3.5" /><path d="M2.5 19.5c.8-3.3 3.3-5 6.5-5s5.7 1.7 6.5 5" /><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14.8c1.7.8 2.9 2.4 3.5 4.7" /></Svg>;
export const CalendarIcon = () => <Svg><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></Svg>;
export const WalletIcon = () => <Svg><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" /><rect x="4" y="8" width="16.5" height="11" rx="2.5" /><circle cx="16" cy="13.5" r="1.2" /></Svg>;
export const SparkIcon = () => <Svg><path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></Svg>;
export const PlusIcon = () => <Svg><path d="M12 5v14M5 12h14" /></Svg>;
export const BoardIcon = () => <Svg><path d="M4 20l1-4.5L16 4.5a2.1 2.1 0 0 1 3 3L8 18.5 4 20Z" /><path d="m14 6.5 3 3" /></Svg>;
export const VideoIcon = () => <Svg><rect x="3" y="6.5" width="12.5" height="11" rx="2.5" /><path d="m15.5 10.5 5-3v9l-5-3" /></Svg>;
export const EyeIcon = () => <Svg><circle cx="12" cy="12" r="3.2" /><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /></Svg>;
export const CheckIcon = () => <Svg><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>;
export const XIcon = () => <Svg><path d="M6 6l12 12M18 6 6 18" /></Svg>;
export const UndoIcon = () => <Svg><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Svg>;
export const ArrowLeftIcon = () => <Svg><path d="M19 12H5M11 18l-6-6 6-6" /></Svg>;
export const TrashIcon = () => <Svg><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" /></Svg>;
export const BrandMark = () => (
  <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" aria-hidden="true">
    <path d="M8 21c3-8 6-8 7-3s5 4 8-6" />
  </svg>
);
