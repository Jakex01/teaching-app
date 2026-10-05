import type { ReactNode } from 'react';
import { BrandMark } from './icons';

/** The tilted white card used by the sign-in, invitation and password pages. */
export function AuthCard({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-md -rotate-1 rounded-[26px] border-[2.5px] border-ink bg-white p-8 shadow-hard-lg">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="grid size-10 -rotate-6 place-items-center rounded-xl border-[2.5px] border-ink bg-sun [&_svg]:size-7">
            <BrandMark />
          </span>
          <span className="font-fun text-2xl font-bold tracking-tight">Doodle<span className="text-tomato">Board</span></span>
        </div>
        <h1 className="mb-1 font-fun text-3xl font-bold">{title}</h1>
        {subtitle && <p className="mb-6 font-bold opacity-60">{subtitle}</p>}
        {children}
      </div>
    </main>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'ok' | 'error'; children: ReactNode }) {
  const bg = tone === 'error' ? 'bg-tomato text-white' : tone === 'ok' ? 'bg-mint' : 'bg-sun/40';
  return <p role={tone === 'error' ? 'alert' : 'status'} className={`mb-4 rounded-2xl border-[2.5px] border-ink px-4 py-2 font-bold ${bg}`}>{children}</p>;
}
