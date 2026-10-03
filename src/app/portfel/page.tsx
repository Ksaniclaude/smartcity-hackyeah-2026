import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getGame } from '@/lib/session';
import { ledger, openPositions } from '@/lib/queries';
import { GAME } from '@/lib/config';
import { addDays, startOfDayMs, weekKey } from '@/lib/time';
import { fmtDuration, fmtInt, fmtRelative, fmtSigned } from '@/lib/format';
import { Card, PageHead } from '@/components/ui';
import { BrickIcon, SlashIcon } from '@/components/icons';

export const metadata: Metadata = { title: 'Portfel' };

const RULES = [
  ['Nie kupisz', 'Cegiełek nie ma w sprzedaży. Każdy dostaje tyle samo, więc bogatszy nie ma większego głosu.'],
  ['Nie wypłacisz', 'Nie zamienisz ich na pieniądze, vouchery ani nagrody rzeczowe.'],
  ['Nie przelejesz', 'Zostają na Twoim koncie, więc nie da się nimi handlować ani zbierać ich z wielu kont.'],
];

export default async function WalletPage() {
  const { user: viewer, now: t } = await getGame();
  if (!viewer) redirect('/logowanie');
  const nextBoundary = startOfDayMs(addDays(weekKey(t), 7));
  const [positions, history] = await Promise.all([openPositions(), ledger(25)]);
  const staked = positions.reduce((a, p) => a + p.staked, 0);
  const potential = positions.reduce((a, p) => a + Math.floor(p.shares), 0);
  const decayNow = Math.floor(viewer.balance * GAME.decayRate);

  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-7 px-4 pb-12 pt-8 sm:px-6">
      <PageHead
        title="Portfel"
        lead="Cegiełki to waluta bez wartości pieniężnej. Służą tylko do typowania, a nowe zdobywasz trafnymi typami i w wydarzeniu dnia."
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
        <Card tone="ink" className="flex flex-col gap-3.5 rounded-[20px] p-[22px]">
          <h2 className="text-sm font-semibold text-on-dark">Do wydania</h2>
          <div className="flex items-center gap-3 text-brick-light">
            <BrickIcon size={34} />
            <span className="font-display text-[56px] font-extrabold leading-none text-white tabular-nums">
              {fmtInt(viewer.balance)}
            </span>
            <span className="self-end pb-1.5 text-[17px] text-on-dark">/ {GAME.balanceCap}</span>
          </div>
          <div className="h-2 rounded-full bg-ink-3">
            <div
              className="h-2 rounded-full bg-brick-light"
              style={{ width: `${Math.min(100, (viewer.balance / GAME.balanceCap) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-sm text-on-dark">
            <span>W otwartych typach</span>
            <strong className="text-white tabular-nums">{fmtInt(staked)}</strong>
          </div>
        </Card>

        <Card tone="yes" className="flex flex-col gap-2 rounded-[20px] p-[22px]">
          <span className="font-display text-[44px] font-extrabold leading-none text-yes">+{GAME.weeklyDrip}</span>
          <h2 className="mt-1 text-[17px] font-bold">Co tydzień, w nocy z niedzieli</h2>
          <p className="text-sm leading-relaxed text-[#33405f]">
            Przydział dla każdego, ale saldo nie przekroczy {GAME.balanceCap}. Przegrana nie wyrzuca więc z gry, a wygrana
            nie daje przewagi na zawsze. Następny za {fmtDuration(nextBoundary - t)}.
          </p>
        </Card>

        <Card tone="brick" className="flex flex-col gap-2 rounded-[20px] p-[22px]">
          <span className="font-display text-[44px] font-extrabold leading-none text-brick">
            −{Math.round(GAME.decayRate * 100)}%
          </span>
          <h2 className="mt-1 text-[17px] font-bold">Kruszenie, tuż przed przydziałem</h2>
          <p className="text-sm leading-relaxed text-brick-ink">
            Niewydane cegiełki się kruszą. Przy obecnym saldzie to {fmtInt(decayNow)}. Opłaca się typować, nie chomikować.
          </p>
        </Card>
      </div>

      <section className="flex flex-col gap-3.5">
        <h2 className="font-display text-2xl font-bold tracking-tight">Trzy zasady</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
          {RULES.map(([title, body]) => (
            <div key={title} className="flex items-start gap-3.5 rounded-2xl border border-line bg-white p-[18px]">
              <SlashIcon size={28} className="shrink-0 text-brick" />
              <div className="flex flex-col gap-1">
                <h3 className="text-[17px] font-bold">{title}</h3>
                <p className="text-sm leading-relaxed text-muted">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-start gap-6">
        <Card className="flex min-w-0 flex-[3_1_520px] flex-col gap-3">
          <h2 className="font-display text-xl font-bold">Otwarte typy</h2>
          {positions.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.05em] text-muted">
                    <th scope="col" className="border-b border-line py-2.5 pr-2 font-semibold">Rynek</th>
                    <th scope="col" className="border-b border-line px-2 py-2.5 font-semibold">Strona</th>
                    <th scope="col" className="border-b border-line px-2 py-2.5 text-right font-semibold">Postawione</th>
                    <th scope="col" className="border-b border-line px-2 py-2.5 text-right font-semibold">Jeśli trafisz</th>
                    <th scope="col" className="border-b border-line py-2.5 pl-2 text-right font-semibold">Szansa teraz</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={`${p.id}-${p.side}`}>
                      <td className="border-b border-line py-3.5 pr-2">
                        <Link href={`/rynek/${p.id}`} className="font-semibold hover:text-yes hover:underline">
                          {p.question}
                        </Link>
                      </td>
                      <td className="border-b border-line px-2 py-3.5">
                        <span
                          className={`inline-block rounded-md px-2.5 py-0.5 text-xs font-bold text-white ${p.side === 'yes' ? 'bg-yes' : 'bg-ink'}`}
                        >
                          {p.side === 'yes' ? 'TAK' : 'NIE'}
                        </span>
                      </td>
                      <td className="border-b border-line px-2 py-3.5 text-right tabular-nums">{fmtInt(p.staked)}</td>
                      <td className="border-b border-line px-2 py-3.5 text-right font-semibold tabular-nums">
                        {fmtInt(Math.floor(p.shares))}
                      </td>
                      <td className="border-b border-line py-3.5 pl-2 text-right tabular-nums">
                        {Math.round(p.sideProb * 100)}%
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className="pb-1 pr-2 pt-3.5 font-bold">Razem</td>
                    <td />
                    <td className="px-2 pb-1 pt-3.5 text-right font-bold tabular-nums">{fmtInt(staked)}</td>
                    <td className="px-2 pb-1 pt-3.5 text-right font-bold tabular-nums">{fmtInt(potential)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted">
              Nie masz otwartych typów.{' '}
              <Link href="/" className="font-semibold text-yes underline">
                Wybierz rynek
              </Link>
              .
            </p>
          )}
        </Card>

        <Card className="flex min-w-0 flex-[2_1_340px] flex-col">
          <h2 className="mb-2 font-display text-xl font-bold">Historia</h2>
          {history.map((h) => (
            <div key={h.id} className="flex min-h-[52px] items-center justify-between gap-3 border-b border-line py-1.5 last:border-0">
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold">{h.label}</span>
                <span className="text-xs text-muted">{fmtRelative(h.created_at, t)}</span>
              </span>
              <span
                className={`shrink-0 text-[15px] font-bold tabular-nums ${
                  h.kind === 'decay' ? 'text-brick' : h.amount > 0 ? 'text-yes' : 'text-ink'
                }`}
              >
                {fmtSigned(h.amount)}
              </span>
            </div>
          ))}
        </Card>
      </div>
    </main>
  );
}
