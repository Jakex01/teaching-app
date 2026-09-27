// Small UI kit in the "playful bold" style: thick ink borders, hard shadows, bouncy motion.

import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

// ---------- Buttons ----------
const variants = {
  primary: 'bg-tomato text-white',
  secondary: 'bg-white text-ink',
  sun: 'bg-sun text-ink',
  mint: 'bg-mint text-ink',
  sky: 'bg-sky text-white',
  ghost: 'bg-transparent text-ink border-transparent shadow-none hover:bg-ink/5',
} as const;
type Variant = keyof typeof variants;

const sizes = {
  sm: 'gap-1.5 px-3 py-1 text-sm',
  md: 'gap-2 px-4 py-2 text-[15px]',
  lg: 'gap-2 px-5 py-3 text-lg font-fun',
} as const;
type Size = keyof typeof sizes;

const buttonClass = (variant: Variant, size: Size, className?: string) => cn(
  'inline-flex items-center justify-center rounded-full border-[2.5px] border-ink font-extrabold whitespace-nowrap shadow-hard-sm',
  'transition-[transform,box-shadow,background-color] duration-150 ease-bounce',
  'hover:-translate-x-px hover:-translate-y-px hover:shadow-[3px_3px_0_var(--color-ink)]',
  'active:translate-x-0.5 active:translate-y-0.5 active:shadow-none',
  'disabled:pointer-events-none disabled:opacity-50',
  '[&_svg]:size-[18px]',
  variants[variant], sizes[size], className,
);

type ButtonProps = ComponentProps<'button'> & { variant?: Variant; size?: Size };
export function Button({ variant = 'secondary', size = 'md', className, ...props }: ButtonProps) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

type LinkButtonProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size };
export function LinkButton({ variant = 'secondary', size = 'md', className, ...props }: LinkButtonProps) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

/** Link to another site (video call). Always opens in a new tab without giving it access to this page. */
export function ExternalButton({ variant = 'secondary', size = 'md', className, ...props }: ComponentProps<'a'> & { variant?: Variant; size?: Size }) {
  return <a target="_blank" rel="noopener noreferrer" className={buttonClass(variant, size, className)} {...props} />;
}

// ---------- Surfaces ----------
/** `bg` is separate from className so a background colour never fights the default white. */
export function Card({ className, bg = 'bg-white', ...props }: ComponentProps<'div'> & { bg?: string }) {
  return <div className={cn('rounded-card border-[2.5px] border-ink shadow-hard', bg, className)} {...props} />;
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-fun text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 font-bold opacity-60 first-letter:uppercase">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="font-fun text-xl font-semibold">{children}</h2>
      {action}
    </div>
  );
}

export function EmptyState({ emoji, title, children }: { emoji: string; title: string; children?: ReactNode }) {
  return (
    <div className="rounded-card border-[2.5px] border-dashed border-ink/30 px-6 py-10 text-center">
      <div className="mb-2 text-4xl">{emoji}</div>
      <p className="font-fun text-lg font-semibold">{title}</p>
      {children && <div className="mt-2 font-bold opacity-60">{children}</div>}
    </div>
  );
}

export function Badge({ className, ...props }: ComponentProps<'span'>) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full border-2 border-ink px-2.5 py-0.5 text-xs font-extrabold', className)} {...props} />;
}

// Fixed classes per palette colour: the CSP forbids inline style="" attributes in server-rendered HTML.
const COLOR_CLASS: Record<string, string> = {
  '#FF5A4E': 'bg-tomato', '#FF9F1C': 'bg-tangerine', '#FFC93C': 'bg-sun', '#22C1A0': 'bg-mint',
  '#3D8BFF': 'bg-sky', '#8B5CF6': 'bg-grape', '#FF6FB5': 'bg-bubble', '#1E1B3A': 'bg-ink',
};
export const colorClass = (hex: string) => COLOR_CLASS[hex.toUpperCase()] ?? 'bg-ink';

export function Avatar({ name, color, size = 'md' }: { name: string; color: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join('') || '?';
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center rounded-full border-[2.5px] border-ink font-fun font-bold text-white',
        size === 'sm' && 'size-8 text-xs', size === 'md' && 'size-11 text-base', size === 'lg' && 'size-16 text-2xl',
        colorClass(color),
      )}
    >
      {initials}
    </span>
  );
}

// ---------- Form fields ----------
const fieldClass = 'w-full rounded-2xl border-[2.5px] border-ink bg-paper px-3.5 py-2.5 font-bold text-ink outline-none transition-shadow placeholder:opacity-40 focus:bg-white focus:shadow-hard-sm';

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-extrabold tracking-wider uppercase opacity-70">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-sm font-bold text-tomato">{error}</span>
        : hint ? <span className="mt-1 block text-sm font-bold opacity-50">{hint}</span> : null}
    </label>
  );
}

export const Input = ({ className, ...props }: ComponentProps<'input'>) => <input className={cn(fieldClass, className)} {...props} />;
export const Textarea = ({ className, ...props }: ComponentProps<'textarea'>) => <textarea className={cn(fieldClass, 'min-h-28 resize-y', className)} {...props} />;
export const Select = ({ className, ...props }: ComponentProps<'select'>) => <select className={cn(fieldClass, 'appearance-none', className)} {...props} />;

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return <p role="alert" className="rounded-2xl border-[2.5px] border-ink bg-tomato px-4 py-2 font-bold text-white">{message}</p>;
}
