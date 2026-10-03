import Link from 'next/link';
import { getGame } from '@/lib/session';
import { listMarkets, lastRound, dayStats } from '@/lib/queries';
import { tierFor } from '@/lib/game';
import { CATEGORIES, GAME } from '@/lib/config';
import { fmtInt, plural } from '@/lib/format';
import { Card, MarketCard, PageHead } from '@/components/ui';
import { BallotIcon, BrickIcon, ClockIcon, PlusIcon } from '@/components/icons';

export default async function Home(props: PageProps<'/'>) {
  const { user: viewer, nos, daily: action } = await getGame();
  const sp = await props.searchParams;
  const category = typeof sp.kategoria === 'string' && (CATEGORIES as readonly string[]).includes(sp.kategoria)
    ? sp.kategoria
    : null;
  const [open, awaiting, resolved, today, round] = await Promise.all([
    listMarkets({ phase: 'open', category }),
    listMarkets({ phase: 'awaiting', category }),
    listMarkets({ phase: 'resolved', category, limit: 3 }),
    dayStats(),
    lastRound(),
  ]);
  const tier = nos ? tierFor(nos.points) : null;

  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 pb-12 pt-8 sm:px-6">
      <PageHead
        title="Zdążą czy nie zdążą?"
        lead="Miasto obiecuje terminy, mieszkańcy typują, czy zostaną dotrzymane. Gra się cegiełkami, których nie da się kupić ani wypłacić, więc liczy się tylko to, czy masz nosa."
      >
        <Link
          href="/dzis"
          className="flex min-h-12 items-center gap-2 rounded-xl bg-brick px-5 text-[15px] font-semibold text-white hover:bg-[#9a3616]"
        >
          <PlusIcon size={18} strokeWidth={2} />
          Zaproponuj wydarzenie dnia
        </Link>
      </PageHead>

      <div className="flex flex-wrap items-start gap-6">
        <section aria-label="Rynki" className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            <FilterChip href="/" active={!category}>
              Wszystkie
            </FilterChip>
            {CATEGORIES.map((c) => (
              <FilterChip key={c} href={`/?kategoria=${encodeURIComponent(c)}`} active={category === c}>
                {c}
              </FilterChip>
            ))}
          </div>

          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-[22px] font-bold tracking-tight">Otwarte rynki</h2>
            <span className="text-[13px] text-muted">
              {open.length} {plural(open.length, 'aktywny', 'aktywne', 'aktywnych')}
            </span>
          </div>
          {open.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
              {open.map((m) => (
                <MarketCard key={m.id} m={m} />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-line-strong p-6 text-muted">
              Brak otwartych rynków w tej kategorii. Zaproponuj pytanie w wydarzeniu dnia.
            </p>
          )}

          {awaiting.length ? (
            <>
              <h2 className="mt-4 font-display text-[22px] font-bold tracking-tight">Czekają na rozstrzygnięcie</h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
                {awaiting.map((m) => (
                  <MarketCard key={m.id} m={m} />
                ))}
              </div>
            </>
          ) : null}

          {resolved.length ? (
            <>
              <h2 className="mt-4 font-display text-[22px] font-bold tracking-tight">Ostatnio rozstrzygnięte</h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
                {resolved.map((m) => (
                  <MarketCard key={m.id} m={m} />
                ))}
              </div>
            </>
          ) : null}
        </section>

        <aside className="flex flex-[1_1_300px] flex-col gap-4">
          <Card tone="brick" className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold">
              <BallotIcon className="text-brick" /> Wydarzenie dnia
            </h2>
            <p className="text-sm leading-relaxed text-brick-ink">
              Codziennie jeden ruch: zaproponuj pytanie albo zagłosuj na cudze. Zwycięzca o północy staje się rynkiem,
              autor dostaje +{GAME.authorReward}, a każdy, kto na niego głosował, +{GAME.voterReward} cegiełek.
            </p>
            <p className="text-sm font-semibold">
              Dziś: {today.proposals} {plural(today.proposals, 'propozycja', 'propozycje', 'propozycji')} ·{' '}
              {today.participants} {plural(today.participants, 'osoba zagrała', 'osoby zagrały', 'osób zagrało')}
            </p>
            {viewer ? (
              action ? (
                <p className="text-sm text-brick-ink">
                  Twój dzisiejszy ruch: {action.kind === 'propose' ? 'propozycja' : 'głos na'} „{action.question}”
                </p>
              ) : (
                <Link href="/dzis" className="flex min-h-11 items-center font-semibold text-brick hover:underline">
                  Masz jeszcze dzisiejszy ruch →
                </Link>
              )
            ) : (
              <Link href="/rejestracja" className="flex min-h-11 items-center font-semibold text-brick hover:underline">
                Dołącz, żeby zagrać →
              </Link>
            )}
            {round?.winner ? (
              <p className="border-t border-[#f0cdbd] pt-3 text-[13px] text-brick-ink">
                Ostatnio wygrało:{' '}
                <Link href={`/rynek/${round.winner.market_id}`} className="font-semibold text-ink underline">
                  {round.winner.question}
                </Link>{' '}
                ({round.votes} {plural(round.votes, 'głos', 'głosy', 'głosów')})
              </p>
            ) : null}
          </Card>

          {viewer ? (
            <Card className="flex flex-col gap-3.5">
              <h2 className="text-sm font-semibold text-muted">Twoje cegiełki</h2>
              <div className="flex items-center gap-2.5 text-brick">
                <BrickIcon size={30} />
                <span className="font-display text-[44px] font-extrabold leading-none text-ink tabular-nums">
                  {fmtInt(viewer.balance)}
                </span>
                <span className="self-end pb-1 text-muted">/ {GAME.balanceCap}</span>
              </div>
              <div className="h-2 rounded-full bg-brick-tint">
                <div
                  className="h-2 rounded-full bg-brick"
                  style={{ width: `${Math.min(100, (viewer.balance / GAME.balanceCap) * 100)}%` }}
                />
              </div>
              <p className="flex gap-2.5 text-sm leading-snug">
                <ClockIcon className="mt-0.5 shrink-0 text-brick" />
                <span>
                  <strong>−{fmtInt(Math.floor(viewer.balance * GAME.decayRate))} w nocy z niedzieli</strong>
                  <br />
                  <span className="text-muted">
                    Niewydane kruszą się o {Math.round(GAME.decayRate * 100)}%, potem przydział +{GAME.weeklyDrip}.
                  </span>
                </span>
              </p>
              <Link href="/portfel" className="flex min-h-11 items-center text-sm font-semibold text-yes hover:underline">
                Otwórz portfel
              </Link>
            </Card>
          ) : null}

          {viewer && tier && nos ? (
            <Card tone="ink" className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-on-dark">Twój Nos</h2>
              <div className="flex items-baseline gap-2.5">
                <span className="font-display text-3xl font-extrabold tracking-tight">{tier.name}</span>
                <span className="text-on-dark">{fmtInt(nos.points)} pkt</span>
              </div>
              <div className="h-2 rounded-full bg-ink-3">
                <div className="h-2 rounded-full bg-yes-light" style={{ width: `${Math.round(tier.progress * 100)}%` }} />
              </div>
              <span className="text-[13px] text-on-dark">
                {tier.next ? `${fmtInt(tier.toNext)} pkt do: ${tier.next.name}` : 'Najwyższy poziom'}
                {nos.hitRate !== null ? ` · trafność ${Math.round(nos.hitRate * 100)}%` : ''}
              </span>
              <Link href="/nos" className="flex min-h-11 items-center text-sm font-semibold text-[#b9c6f5] hover:underline">
                Zobacz ranking
              </Link>
            </Card>
          ) : null}
        </aside>
      </div>
    </main>
  );
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-sm ${
        active ? 'border-ink bg-ink font-semibold text-white' : 'border-line-strong bg-white font-medium hover:border-ink'
      }`}
    >
      {children}
    </Link>
  );
}
