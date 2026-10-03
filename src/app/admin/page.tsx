import Link from 'next/link';
import type { Metadata } from 'next';
import { getGame } from '@/lib/session';
import { listMarkets, todayProposals } from '@/lib/queries';
import { dayKey } from '@/lib/time';
import { fmtDate, fmtDuration, pct } from '@/lib/format';
import { Card, PageHead } from '@/components/ui';
import {
  adminHideProposalAction,
  adminResetAction,
  adminResolveAction,
  adminTimeAction,
} from '@/app/actions';
import { ActionButton, ResetForm } from './forms';

export const metadata: Metadata = { title: 'Panel admina' };

const timeFmt = new Intl.DateTimeFormat('pl-PL', {
  timeZone: 'Europe/Warsaw',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

export default async function AdminPage() {
  const { user: viewer, now: t, offset } = await getGame();
  if (!viewer?.is_admin) {
    return (
      <main className="mx-auto max-w-[640px] px-4 pt-12">
        <h1 className="font-display text-3xl font-extrabold">Brak dostępu</h1>
        <p className="mt-2 text-muted">
          Ta strona jest tylko dla administratora.{' '}
          <Link href="/logowanie" className="font-semibold text-yes underline">
            Zaloguj się jako admin
          </Link>
          .
        </p>
      </main>
    );
  }

  const [awaiting, open, proposals, resolved] = await Promise.all([
    listMarkets({ phase: 'awaiting' }),
    listMarkets({ phase: 'open' }),
    todayProposals(dayKey(t), null),
    listMarkets({ phase: 'resolved', limit: 3 }),
  ]);

  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 pb-12 pt-8 sm:px-6">
      <PageHead
        title="Panel admina"
        lead="Moderacja i narzędzia do demo: przesuwanie czasu gry, rozstrzyganie rynków, ukrywanie propozycji."
      />

      <Card className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-bold">Czas gry</h2>
        <p className="text-sm">
          Teraz w grze: <strong>{timeFmt.format(new Date(t))}</strong>
          {offset > 0 ? <span className="text-muted"> (przesunięty o {fmtDuration(offset)})</span> : null}
        </p>
        <p className="text-sm text-muted">
          Przesunięcie rozlicza wszystko, co w tym czasie by się wydarzyło: wynik wydarzenia dnia, nagrody, kruszenie i
          tygodniowy przydział. Czas można tylko przesuwać do przodu (reset demo wraca do teraz).
        </p>
        <div className="flex flex-wrap gap-3">
          <ActionButton action={adminTimeAction} fields={{ mode: 'midnight' }} label="Zakończ dzisiejsze głosowanie (do północy)" variant="brick" />
          <ActionButton action={adminTimeAction} fields={{ mode: 'day' }} label="+1 dzień" variant="outline" />
          <ActionButton action={adminTimeAction} fields={{ mode: 'week' }} label="+7 dni (kruszenie i przydział)" variant="outline" />
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-bold">Rozstrzygnij rynki</h2>
        <p className="text-sm text-muted">
          Najpierw te, którym minął termin. Otwarte też można rozstrzygnąć wcześniej, gdy wynik jest już pewny.
        </p>
        {resolved.length ? (
          <ul className="flex flex-col gap-1 rounded-xl bg-paper px-4 py-3 text-sm">
            <li className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Ostatnio rozstrzygnięte</li>
            {resolved.map((m) => (
              <li key={m.id}>
                <strong className={m.outcome ? 'text-yes' : ''}>{m.outcome ? 'TAK' : 'NIE'}</strong> · {m.question}{' '}
                <span className="text-muted">({fmtDate(m.resolved_at ?? t)})</span>
              </li>
            ))}
          </ul>
        ) : null}
        {[...awaiting, ...open].map((m) => (
          <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-0.5">
              <Link href={`/rynek/${m.id}`} className="font-semibold hover:text-yes hover:underline">
                {m.question}
              </Link>
              <span className="text-xs text-muted">
                {m.phase === 'awaiting' ? 'termin minął' : 'otwarty'} · termin {fmtDate(m.closes_at)} · tłum {pct(m.prob)}%
                na TAK
              </span>
            </div>
            <div className="flex gap-2">
              <ActionButton action={adminResolveAction} fields={{ marketId: m.id, outcome: 'yes' }} label="Wynik TAK" variant="yes" />
              <ActionButton action={adminResolveAction} fields={{ marketId: m.id, outcome: 'no' }} label="Wynik NIE" />
            </div>
          </div>
        ))}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-bold">Dzisiejsze propozycje</h2>
        {proposals.length ? (
          proposals.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
              <span className="min-w-0 flex-[1_1_360px] text-sm">
                <strong>{p.question}</strong> <span className="text-muted">· {p.author}</span>
              </span>
              <ActionButton action={adminHideProposalAction} fields={{ proposalId: p.id }} label="Ukryj" variant="outline" />
            </div>
          ))
        ) : (
          <p className="text-sm text-muted">Brak propozycji.</p>
        )}
      </Card>

      <Card tone="brick" className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-bold">Dane demo</h2>
        <p className="text-sm text-brick-ink">
          Usuwa wszystkie konta, rynki i typy, wgrywa świeże dane demo i cofa czas gry do teraz. Wylogowuje wszystkich.
        </p>
        <ResetForm action={adminResetAction} />
      </Card>
    </main>
  );
}
