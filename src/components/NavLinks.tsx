'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLinks({ isAdmin, dailyPending }: { isAdmin: boolean; dailyPending: boolean }) {
  const pathname = usePathname();
  const links = [
    { href: '/', label: 'Rynki', match: (p: string) => p === '/' || p.startsWith('/rynek') },
    { href: '/dzis', label: 'Wydarzenie dnia', dot: dailyPending },
    { href: '/portfel', label: 'Portfel' },
    { href: '/nos', label: 'Nos' },
    { href: '/puls', label: 'Puls miasta' },
    ...(isAdmin ? [{ href: '/admin', label: 'Admin' }] : []),
  ];
  return (
    <nav
      aria-label="Nawigacja główna"
      className="order-last -mx-1 flex w-full gap-1 overflow-x-auto md:order-none md:mx-0 md:w-auto md:flex-1 md:flex-wrap"
    >
      {links.map((l) => {
        const active = l.match ? l.match(pathname) : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={`relative flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-[10px] px-3.5 text-[15px] ${
              active ? 'bg-[#2a2e37] font-semibold text-white' : 'font-medium text-[#c9cdd8] hover:text-white'
            }`}
          >
            {l.label}
            {'dot' in l && l.dot ? (
              <span className="ml-2 inline-block size-2 rounded-full bg-brick-light" aria-label="masz dziś ruch" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
