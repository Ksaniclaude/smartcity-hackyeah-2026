import Link from 'next/link';
import type { Metadata } from 'next';
import { getGame } from '@/lib/session';
import { dayStats, lastRound, recentWinners, todayProposals } from '@/lib/queries';
import { CATEGORIES, GAME } from '@/lib/config';
import { addDays, dayKey, startOfDayMs } from '@/lib/time';
import { fmtDayKey, fmtDuration, plural } from '@/lib/format';
import { Card, CategoryLabel, PageHead } from '@/components/ui';
import { BallotIcon, ClockIcon } from '@/components/icons';
import { ProposeForm, VoteButton } from './forms';

export const metadata: Metadata = { title: 'Wydarzenie dnia' };

export default async function TodayPage() {
  const { user: viewer, now: t, daily: action } = await getGame();
  const today = dayKey(t);
  const left = startOfDayMs(addDays(today, 1)) - t;
  const [proposals, stats, round, winners] = await Promise.all([
    todayProposals(today, viewer?.id ?? null),
    dayStats(),
    lastRound(),
    recentWinners(5),
  ]);

  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 pb-12 pt-8 sm:px-6">
      <PageHead
        title="Wydarzenie dnia"
        lead={
          <>
            Codziennie masz jeden ruch: zaproponuj własne pytanie o miasto albo zagłosuj na cudzą propozycję. O północy
            propozycja z największą liczbą głosów staje się rynkiem. Jej autor dostaje <strong>+{GAME.authorReward}</strong>,
            a każdy, kto na nią głosował, <strong>+{GAME.voterReward}</strong> cegiełek.
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl bg-ink px-5 py-4 text-white">
        <span className="flex items-center gap-2 font-semibold">
          <ClockIcon className="text-brick-light" /> Głosowanie kończy się o północy · zostało {fmtDuration(left)}
        </span>
        <span className="text-on-dark">
          {stats.proposals} {plural(stats.proposals, 'propozycja', 'propozycje', 'propozycji')} ·{' '}
          {stats.participants} {plural(stats.participants, 'osoba zagrała', 'osoby zagrały', 'osób zagrało')}
        </span>
        <span className="text-on-dark">
          Wygrać może propozycja z co najmniej {GAME.minVotesToWin} głosami (głos autora się liczy).
        </span>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <section aria-label="Dzisiejsze propozycje" className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-[22px] font-bold tracking-tight">Dzisiejsze propozycje</h2>
            <span className="text-[13px] text-muted">Liczba głosów jest ukryta do północy, kolejność losowa.</span>
          </div>

          {viewer && action ? (
            <p className="rounded-xl bg-yes-tint px-4 py-3 text-sm text-yes-dark">
              Twój dzisiejszy ruch: <strong>{action.kind === 'propose' ? 'propozycja' : 'głos na'}</strong> „{action.question}”.
              Jeśli wygra, dostaniesz +{action.kind === 'propose' ? GAME.authorReward : GAME.voterReward} cegiełek.
            </p>
          ) : null}

          {proposals.length ? (
            proposals.map((p) => {
              const mine = viewer?.id === p.author_id;
              const chosen = action?.proposal_id === p.id;
              return (
                <article
                  key={p.id}
                  className={`flex flex-col gap-3 rounded-2xl border bg-white p-[18px] ${chosen ? 'border-yes ring-2 ring-yes-tint' : 'border-line'}`}
                >
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-muted">
                    <CategoryLabel>{p.category}</CategoryLabel>
                    <span>
                      zgłasza <strong className="text-ink">{p.author}</strong> · rozstrzygnięcie {fmtDayKey(p.closes_on)}
                    </span>
                  </div>
                  <h3 className="font-display text-[20px] font-semibold leading-tight">{p.question}</h3>
                  <p className="text-sm leading-relaxed text-[#33373f]">{p.criteria}</p>
                  {viewer ? (
                    mine ? (
                      <span className="text-sm font-semibold text-yes-dark">Twoja propozycja</span>
                    ) : chosen ? (
                      <span className="text-sm font-semibold text-yes-dark">Twój głos</span>
                    ) : (
                      <VoteButton proposalId={p.id} disabled={!!action} label="Głosuję na to" />
                    )
                  ) : null}
                </article>
              );
            })
          ) : (
            <p className="rounded-2xl border border-dashed border-line-strong p-6 text-muted">
              Nikt jeszcze dziś niczego nie zaproponował. Twoje pytanie może wygrać jednym głosem więcej.
            </p>
          )}
        </section>

        <aside className="flex flex-[1_1_340px] flex-col gap-4">
          <Card className="flex flex-col gap-4">
            <h2 className="flex items-center gap-2 font-display text-xl font-bold">
              <BallotIcon className="text-brick" /> Zaproponuj pytanie
            </h2>
            {!viewer ? (
              <p className="text-sm text-muted">
                <Link href="/rejestracja" className="font-semibold text-yes underline">
                  Załóż konto
                </Link>{' '}
                albo{' '}
                <Link href="/logowanie" className="font-semibold text-yes underline">
                  zaloguj się
                </Link>
                , żeby zagrać.
              </p>
            ) : action ? (
              <p className="text-sm text-muted">Dzisiejszy ruch już wykorzystany. Jutro możesz zgłosić własne pytanie.</p>
            ) : (
              <ProposeForm
                categories={CATEGORIES}
                minDate={addDays(today, GAME.proposalMinDaysAhead)}
                maxDate={addDays(today, GAME.proposalMaxDaysAhead)}
              />
            )}
          </Card>

          {round ? (
            <Card tone="brick" className="flex flex-col gap-3">
              <h2 className="font-display text-lg font-bold">Wynik z {fmtDayKey(round.day)}</h2>
              {round.winner ? (
                <>
                  <p className="text-sm text-brick-ink">
                    Wygrało pytanie od <strong className="text-ink">{round.winner.author}</strong> ({round.votes}{' '}
                    {plural(round.votes, 'głos', 'głosy', 'głosów')}):
                  </p>
                  <Link href={`/rynek/${round.winner.market_id}`} className="font-display text-lg font-semibold leading-snug underline">
                    {round.winner.question}
                  </Link>
                  {round.viewerWon ? (
                    <p className="rounded-xl bg-white px-3.5 py-2.5 text-sm font-semibold text-brick">
                      Twój ruch trafił w zwycięzcę: +
                      {round.mine?.kind === 'propose' ? GAME.authorReward : GAME.voterReward} cegiełek jest już w portfelu.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-brick-ink">
                  Żadna propozycja nie zebrała {GAME.minVotesToWin} głosów, więc tego dnia nie powstał nowy rynek.
                </p>
              )}
              {round.ranked.length > 1 ? (
                <ol className="flex flex-col gap-1.5 border-t border-[#f0cdbd] pt-3 text-[13px] text-brick-ink">
                  {round.ranked.map((r, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span>{r.question}</span>
                      <span className="shrink-0 font-semibold tabular-nums">{r.votes}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </Card>
          ) : null}

          {winners.length ? (
            <Card className="flex flex-col gap-1">
              <h2 className="mb-2 font-display text-lg font-bold">Poprzednie wydarzenia dnia</h2>
              {winners.map((w) => (
                <Link
                  key={w.day_key}
                  href={`/rynek/${w.market_id}`}
                  className="flex min-h-12 flex-col justify-center border-b border-line py-2 last:border-0 hover:text-yes"
                >
                  <span className="text-sm font-semibold leading-snug">{w.question}</span>
                  <span className="text-xs text-muted">
                    {fmtDayKey(w.day_key)} · {w.author} · {w.votes} {plural(w.votes, 'głos', 'głosy', 'głosów')}
                  </span>
                </Link>
              ))}
            </Card>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
