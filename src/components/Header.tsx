import Link from 'next/link';
import { getGame } from '@/lib/session';
import { tierFor } from '@/lib/game';
import { GAME } from '@/lib/config';
import { fmtInt } from '@/lib/format';
import { logoutAction } from '@/app/actions';
import { NavLinks } from './NavLinks';
import { BrickIcon, TargetIcon } from './icons';

export async function Header() {
  const { user: viewer, nos, daily } = await getGame();
  const acted = !!daily;
  const tier = nos ? tierFor(nos.points) : null;

  return (
    <header className="bg-ink text-white">
      <div className="mx-auto flex min-h-[68px] max-w-[1240px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 sm:px-6">
        <Link
          href="/"
          aria-label="zdążą? — strona główna"
          className="flex min-h-11 items-center font-display text-2xl font-extrabold tracking-tight"
        >
          zdążą<span className="text-brick-light">?</span>
        </Link>
        <NavLinks isAdmin={!!viewer?.is_admin} dailyPending={!!viewer && !acted} />
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          {viewer ? (
            <>
              <Link
                href="/portfel"
                aria-label={`Twoje cegiełki: ${viewer.balance}`}
                className="flex min-h-11 items-center gap-2 rounded-full bg-[#2e1c15] px-3.5 text-[15px] font-bold text-brick-light"
              >
                <BrickIcon />
                <span className="text-white tabular-nums">{fmtInt(viewer.balance)}</span>
                <span className="hidden font-medium text-[#d2ae9c] sm:inline">/ {GAME.balanceCap}</span>
              </Link>
              <Link
                href="/nos"
                aria-label={`Twój Nos: ${tier?.name}, ${nos?.points ?? 0} pkt`}
                className="flex min-h-11 items-center gap-2 rounded-full bg-[#1b2340] py-0 pl-1.5 pr-3.5 text-sm font-semibold"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-yes">
                  <TargetIcon size={18} strokeWidth={2} />
                </span>
                <span className="hidden sm:inline">{tier?.name} ·</span> {fmtInt(nos?.points ?? 0)}
              </Link>
              <form action={logoutAction}>
                <button type="submit" className="min-h-11 px-2 text-sm text-on-dark hover:text-white">
                  Wyloguj
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/logowanie" className="flex min-h-11 items-center px-3 text-[15px] font-medium text-[#c9cdd8] hover:text-white">
                Zaloguj
              </Link>
              <Link
                href="/rejestracja"
                className="flex min-h-11 items-center rounded-xl bg-brick px-4 text-[15px] font-semibold text-white hover:bg-[#9a3616]"
              >
                Dołącz<span className="hidden sm:inline">&nbsp;i odbierz {GAME.signupGrant} cegiełek</span>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
