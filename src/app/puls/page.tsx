import Link from 'next/link';
import type { Metadata } from 'next';
import { getGame } from '@/lib/session';
import { listMarkets, pulseStats } from '@/lib/queries';
import { fmtDate, fmtInt, pct } from '@/lib/format';
import { Card, Change, PageHead, ProbBar } from '@/components/ui';
import { DownloadIcon } from '@/components/icons';

export const metadata: Metadata = { title: 'Puls miasta' };

export default async function PulsePage() {
  await getGame();
  const [open, stats] = await Promise.all([listMarkets({ phase: 'open' }), pulseStats()]);
  const markets = open.sort((a, b) => b.participants - a.participants);
  const doubtful = markets.filter((m) => m.category === 'Inwestycje' && m.prob < 0.3).sort((a, b) => a.prob - b.prob);
  const movers = [...markets].sort((a, b) => Math.abs(b.change7d) - Math.abs(a.change7d)).slice(0, 4);

  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 pb-12 pt-8 sm:px-6">
      <PageHead
        title="Puls miasta"
        lead="Jak mieszkańcy oceniają szanse miejskich spraw. Dla urzędu, radnych i mediów, a dane są otwarte."
      >
        <a
          href="/puls/csv"
          className="flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-white hover:bg-ink-2"
        >
          <DownloadIcon size={16} strokeWidth={2} /> Eksportuj CSV
        </a>
      </PageHead>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">
        <Kpi label="Aktywne rynki" value={fmtInt(stats.active)} />
        <Kpi label="Aktywni mieszkańcy (7 dni)" value={fmtInt(stats.people)} />
        <Kpi
          label="Trafność tłumu"
          value={stats.resolved ? `${stats.crowdHits}/${stats.resolved}` : '—'}
          note="rozstrzygnięte rynki, w których faworyt tłumu wygrał"
        />
        <Kpi
          label="Brier tłumu"
          value={stats.crowdBrier === null ? '—' : stats.crowdBrier.toFixed(2).replace('.', ',')}
          note="niżej = lepiej · rzut monetą daje 0,25"
          accent
        />
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <Card className="flex min-w-0 flex-[999_1_600px] flex-col gap-3">
          <h2 className="font-display text-xl font-bold">Prognozy mieszkańców</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.05em] text-muted">
                  <th scope="col" className="border-b border-line py-2.5 pr-3 font-semibold">Pytanie</th>
                  <th scope="col" className="border-b border-line px-3 py-2.5 font-semibold">Kategoria</th>
                  <th scope="col" className="border-b border-line px-3 py-2.5 font-semibold">Szansa na TAK</th>
                  <th scope="col" className="border-b border-line px-3 py-2.5 text-right font-semibold">7 dni</th>
                  <th scope="col" className="border-b border-line px-3 py-2.5 text-right font-semibold">Typujący</th>
                  <th scope="col" className="border-b border-line py-2.5 pl-3 font-semibold">Termin</th>
                </tr>
              </thead>
              <tbody>
                {markets.map((m) => (
                  <tr key={m.id}>
                    <td className="border-b border-line py-3.5 pr-3 font-semibold leading-snug">
                      <Link href={`/rynek/${m.id}`} className="hover:text-yes hover:underline">
                        {m.question}
                      </Link>
                    </td>
                    <td className="border-b border-line px-3 py-3.5 text-muted">{m.category}</td>
                    <td className="border-b border-line px-3 py-3.5">
                      <span className="flex items-center gap-2.5">
                        <strong className="w-10 tabular-nums">{pct(m.prob)}%</strong>
                        <ProbBar prob={m.prob} className="w-[90px]" />
                      </span>
                    </td>
                    <td className="border-b border-line px-3 py-3.5 text-right">
                      <Change value={m.change7d} suffix="" />
                    </td>
                    <td className="border-b border-line px-3 py-3.5 text-right tabular-nums">{fmtInt(m.participants)}</td>
                    <td className="border-b border-line py-3.5 pl-3 text-muted">{fmtDate(m.closes_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <aside className="flex flex-[1_1_300px] flex-col gap-4">
          <Card tone="brick" className="flex flex-col gap-3">
            <h2 className="font-display text-[19px] font-bold">Mieszkańcy nie wierzą w termin</h2>
            <p className="text-sm leading-relaxed text-brick-ink">
              Inwestycje, którym tłum daje mniej niż 30% szans na ukończenie w terminie.
            </p>
            {doubtful.length ? (
              doubtful.map((m) => (
                <Link
                  key={m.id}
                  href={`/rynek/${m.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white px-3.5 py-3 hover:ring-2 hover:ring-[#f0cdbd]"
                >
                  <span className="text-sm font-semibold leading-snug">{m.question}</span>
                  <span className="font-display text-2xl font-extrabold text-brick tabular-nums">{pct(m.prob)}%</span>
                </Link>
              ))
            ) : (
              <p className="text-sm font-semibold text-brick-ink">Brak — mieszkańcy wierzą we wszystkie terminy.</p>
            )}
          </Card>

          <Card className="flex flex-col gap-1">
            <h2 className="mb-2 font-display text-[19px] font-bold">Największe zmiany (7 dni)</h2>
            {movers.map((m) => (
              <Link
                key={m.id}
                href={`/rynek/${m.id}`}
                className="flex min-h-12 items-center justify-between gap-3 border-b border-line py-2 last:border-0 hover:text-yes"
              >
                <span className="text-sm font-semibold leading-snug">{m.question}</span>
                <span className="shrink-0 text-[15px]">
                  <Change value={m.change7d} />
                </span>
              </Link>
            ))}
          </Card>
        </aside>
      </div>

      <p className="max-w-[760px] text-[13px] leading-relaxed text-muted">
        Prognozy to sygnał od mieszkańców grających cegiełkami bez wartości pieniężnej, nie oficjalne dane miasta.
      </p>
    </main>
  );
}

function Kpi({ label, value, note, accent }: { label: string; value: string; note?: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-line bg-white p-[18px]">
      <span className="text-[13px] font-semibold text-muted">{label}</span>
      <span className={`font-display text-[38px] font-extrabold leading-none tabular-nums ${accent ? 'text-yes' : ''}`}>
        {value}
      </span>
      {note ? <span className="text-xs text-muted">{note}</span> : null}
    </div>
  );
}
