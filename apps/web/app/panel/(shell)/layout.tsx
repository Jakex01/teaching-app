import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PanelNav } from '@/components/PanelNav';
import { Avatar } from '@/components/ui';
import { BrandMark, LogoutIcon } from '@/components/icons';
import { logout } from '@/lib/auth-actions';
import { requireTeacher } from '@/lib/session';

export const metadata: Metadata = { title: { template: '%s · Doodle Board', default: 'Panel · Doodle Board' } };

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const teacher = await requireTeacher();

  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl flex-col gap-4 p-3 sm:p-5 lg:flex-row lg:gap-6">
      <aside className="flex flex-col gap-4 rounded-card border-[2.5px] border-ink bg-white p-3 shadow-hard lg:sticky lg:top-5 lg:h-[calc(100dvh-2.5rem)] lg:w-60 lg:shrink-0">
        <Link href="/panel" className="flex items-center gap-2.5 px-1">
          <span className="grid size-9 -rotate-6 place-items-center rounded-xl border-[2.5px] border-ink bg-sun [&_svg]:size-6">
            <BrandMark />
          </span>
          <span className="font-fun text-xl font-bold tracking-tight">Doodle<span className="text-tomato">Board</span></span>
        </Link>

        <PanelNav />

        <div className="mt-auto hidden items-center gap-1 rounded-2xl bg-paper p-2 lg:flex">
          <Link href="/panel/konto" title="Konto" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-0.5 hover:bg-ink/5">
            <Avatar name={teacher.displayName} color="#FFC93C" size="sm" />
            <div className="min-w-0">
              <p className="truncate font-extrabold">{teacher.displayName}</p>
              <p className="truncate text-xs font-bold opacity-50">{teacher.email}</p>
            </div>
          </Link>
          <form action={logout}>
            <button type="submit" title="Wyloguj się" aria-label="Wyloguj się" className="grid size-9 place-items-center rounded-xl hover:bg-ink/10 [&_svg]:size-5">
              <LogoutIcon />
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 pb-10">{children}</main>
    </div>
  );
}
