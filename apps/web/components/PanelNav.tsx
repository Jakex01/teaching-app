'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from './ui';
import { CalendarIcon, HomeIcon, KeyIcon, SparkIcon, UsersIcon, WalletIcon } from './icons';

const ITEMS: { href: string; label: string; icon: ReactNode; color: string; soon?: boolean }[] = [
  { href: '/panel', label: 'Pulpit', icon: <HomeIcon />, color: 'bg-sun' },
  { href: '/panel/uczniowie', label: 'Uczniowie', icon: <UsersIcon />, color: 'bg-mint' },
  { href: '/panel/lekcje', label: 'Lekcje', icon: <CalendarIcon />, color: 'bg-sky text-white' },
  { href: '/panel/platnosci', label: 'Płatności', icon: <WalletIcon />, color: 'bg-bubble', soon: true },
  { href: '/panel/ai', label: 'Raporty AI', icon: <SparkIcon />, color: 'bg-grape text-white', soon: true },
  { href: '/panel/konto', label: 'Konto', icon: <KeyIcon />, color: 'bg-white' },
];

export function PanelNav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/panel' ? pathname === href : pathname.startsWith(href));

  return (
    <nav aria-label="Panel" className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] lg:flex-col lg:overflow-visible">
      {ITEMS.map(item => item.soon ? (
        <span
          key={item.href}
          title="Wkrótce"
          className="flex shrink-0 items-center gap-3 rounded-2xl border-[2.5px] border-transparent px-3 py-2 font-extrabold opacity-40 [&_svg]:size-5"
        >
          {item.icon}
          <span className="hidden whitespace-nowrap sm:inline">{item.label}</span>
          <span className="ml-auto hidden rounded-full bg-ink/10 px-1.5 text-[9px] tracking-wider uppercase lg:inline">wkrótce</span>
        </span>
      ) : (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(item.href) ? 'page' : undefined}
          className={cn(
            'flex shrink-0 items-center gap-3 rounded-2xl border-[2.5px] px-3 py-2 font-extrabold transition-transform duration-200 ease-bounce [&_svg]:size-5',
            isActive(item.href)
              ? cn('-rotate-1 border-ink shadow-hard-sm', item.color)
              : 'border-transparent hover:-translate-y-0.5 hover:bg-ink/5',
          )}
        >
          {item.icon}
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
