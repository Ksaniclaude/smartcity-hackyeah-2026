import Link from 'next/link';
import type { Metadata } from 'next';
import { getGame } from '@/lib/session';
import { tierFor } from '@/lib/game';
import { ranking, recentScores } from '@/lib/queries';
import { TIERS } from '@/lib/config';
import { fmtDate, fmtInt, fmtSigned } from '@/lib/format';
import { Card, PageHead } from '@/components/ui';

export const metadata: Metadata = { title: 'Nos i ranking' };

export default async function NosPage(props: PageProps<'/nos'>) {
  const { user: viewer, nos } = await getGame();
  const sp = await props.searchParams;
  const cityWide = sp.zakres === 'miasto' || !viewer;
  const [rows, scores] = await Promise.all([
    ranking(cityWide ? null : viewer!.district),
    viewer ? recentScores(6) : Promise.resolve([]),
  ]);
  const top = rows.slice(0, 10);
  const me = viewer ? rows.find((r) => r.id === viewer.id) : undefined;
  const tier = nos ? tierFor(nos.points) : null;

  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 pb-12 pt-8 sm:px-6">
      {viewer && nos && tier ? (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <span
              aria-hidden="true"
              className="flex size-16 items-center justify-center rounded-full bg-ink font-display text-[28px] font-extrabold uppercase text-white"
            >
              {viewer.nick[0]}
            </span>
            <div className="flex flex-col gap-1">
              <h1 className="font-display text-[clamp(26px,3.4vw,36px)] font-extrabold leading-tight tracking-tight">
                @{viewer.nick}
              </h1>
              <span className="text-[15px] text-muted">
                {viewer.district} · gra od {fmtDate(viewer.created_at)}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-stretch gap-6">
            <Card tone="ink" className="flex min-w-0 flex-[1_1_440px] flex-col gap-[18px] rounded-[20px] p-6">
              <div className="flex flex-col gap-1.5">
                <h2 className="text-sm font-semibold text-on-dark">Twój Nos</h2>
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="font-display text-5xl font-extrabold leading-none tracking-tight">{tier.name}</span>
                  <span className="text-lg text-on-dark tabular-nums">{fmtInt(nos.points)} pkt</span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="h-2.5 rounded-full bg-ink-3">
                  <div
                    className="h-2.5 rounded-full bg-yes-light"
                    style={{ width: `${Math.round(tier.progress * 100)}%` }}
                  />
                </div>
                <span className="text-sm text-on-dark">
                  {tier.next ? `${fmtInt(tier.toNext)} pkt do poziomu ${tier.next.name}` : 'Najwyższy poziom w mieście'}
                </span>
              </div>
              <ol className="grid grid-cols-4 gap-2">
                {TIERS.map((tr, i) => (
                  <li key={tr.name} className="flex flex-col gap-2">
                    <span className={`h-1 rounded-sm ${i <= tier.index ? 'bg-yes-light' : 'bg-[#3a3f4a]'}`} />
                    <span className={`text-[13px] font-semibold ${i <= tier.index ? 'text-white' : 'text-[#c9cdd8]'}`}>
                      {tr.name}
                      {i === tier.index ? ' · Ty' : ''}
                    </span>
                    <span className="text-xs text-on-dark">od {tr.min}</span>
                  </li>
                ))}
              </ol>
            </Card>

            <div className="grid min-w-0 flex-[1_1_440px] grid-cols-2 gap-4">
              <Stat value={fmtInt(nos.points)} label="Punkty Nosa" note="Suma przewagi nad tłumem" />
              <Stat
                value={nos.hitRate === null ? '—' : `${Math.round(nos.hitRate * 100)}%`}
                label="Trafionych rynków"
                note={`${nos.hits} z ${nos.resolved} rozstrzygniętych`}
                accent
              />
              <Stat
                value={nos.avgEdge === null ? '—' : fmtSigned(nos.avgEdge)}
                label="Średnio na rynek"
                note="Dodatnio = wiesz lepiej niż tłum"
              />
              <Stat
                value={me ? `#${me.rank}` : '—'}
                label={cityWide ? 'W mieście' : `W dzielnicy ${viewer.district}`}
                note={`na ${rows.length} graczy`}
              />
            </div>
          </div>
        </>
      ) : (
        <PageHead
          title="Ranking Nosa"
          lead="Nos to reputacja za trafne typy. Nie da się go kupić ani przelać."
        >
          <Link
            href="/rejestracja"
            className="flex min-h-12 items-center rounded-xl bg-brick px-5 text-[15px] font-semibold text-white"
          >
            Dołącz do gry
          </Link>
        </PageHead>
      )}

      <div className="flex flex-wrap items-start gap-6">
        <Card className="flex min-w-0 flex-[1_1_440px] flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold">Ranking</h2>
            {viewer ? (
              <div className="flex gap-1">
                <TabLink href="/nos" active={!cityWide}>
                  {viewer.district}
                </TabLink>
                <TabLink href="/nos?zakres=miasto" active={cityWide}>
                  Całe miasto
                </TabLink>
              </div>
            ) : null}
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.05em] text-muted">
                <th scope="col" className="w-8 border-b border-line py-2 pr-2 font-semibold">#</th>
                <th scope="col" className="border-b border-line p-2 font-semibold">Gracz</th>
                <th scope="col" className="border-b border-line p-2 font-semibold">Poziom</th>
                <th scope="col" className="border-b border-line py-2 pl-2 text-right font-semibold">Nos</th>
              </tr>
            </thead>
            <tbody>
              {[...top, ...(me && me.rank > 10 ? [me] : [])].map((r) => {
                const isMe = r.id === viewer?.id;
                return (
                  <tr key={r.id} className={isMe ? 'bg-yes-tint text-yes-dark' : ''}>
                    <td className={`border-b border-line py-3 pr-2 font-bold ${isMe ? 'pl-2.5' : ''}`}>{r.rank}</td>
                    <td className={`border-b border-line p-3 pl-2 ${isMe ? 'font-bold' : 'font-semibold'}`}>
                      {r.nick}
                      {isMe ? ' · Ty' : ''}
                      {cityWide ? <span className="ml-1.5 text-xs font-normal text-muted">{r.district}</span> : null}
                    </td>
                    <td className="border-b border-line p-3 pl-2 text-muted">{tierFor(r.pts).name}</td>
                    <td className={`border-b border-line py-3 pl-2 text-right font-semibold tabular-nums ${isMe ? 'pr-2.5' : ''}`}>
                      {fmtInt(r.pts)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        {viewer ? (
          <Card className="flex min-w-0 flex-[1_1_440px] flex-col gap-1">
            <h2 className="mb-2 font-display text-xl font-bold">Ostatnie rozstrzygnięcia</h2>
            {scores.length ? (
              scores.map((s) => (
                <Link
                  key={s.market_id}
                  href={`/rynek/${s.market_id}`}
                  className="flex min-h-14 items-center justify-between gap-3 border-b border-line py-2 last:border-0 hover:text-yes"
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold leading-snug">{s.question}</span>
                    <span className="text-xs text-muted">
                      Wynik {s.outcome ? 'TAK' : 'NIE'} · postawione {s.spent}, wypłata {s.payout}
                    </span>
                  </span>
                  <span className={`shrink-0 font-bold tabular-nums ${s.points > 0 ? 'text-yes' : 'text-ink'}`}>
                    {fmtSigned(s.points)} pkt
                  </span>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted">Gdy rozstrzygnie się rynek, w którym typujesz, zobaczysz tu punkty.</p>
            )}
          </Card>
        ) : null}
      </div>

      <section className="flex max-w-[900px] flex-col gap-1.5 rounded-2xl bg-yes-tint px-5 py-[18px]">
        <h2 className="text-[15px] font-bold text-yes-dark">Jak liczymy Nos</h2>
        <p className="text-[15px] leading-relaxed text-[#23305e]">
          Za każdy typ w rozstrzygniętym rynku: trafiony daje 100 × (1 − cena), chybiony −100 × cena. Kupując TAK po 23%
          i trafiając, dostajesz 77 pkt; kupując po 90%, tylko 10. Typ „zgodny z tłumem” daje więc średnio zero, a punkty
          zbiera ten, kto wiedział lepiej. Wielkość stawki nie ma znaczenia, a Nosa nie da się kupić ani przelać.
        </p>
      </section>
    </main>
  );
}

function Stat({ value, label, note, accent }: { value: string; label: string; note: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-line bg-white p-[18px]">
      <span className={`font-display text-[40px] font-extrabold leading-none tabular-nums ${accent ? 'text-yes' : ''}`}>
        {value}
      </span>
      <span className="text-[15px] font-semibold">{label}</span>
      <span className="text-[13px] leading-snug text-muted">{note}</span>
    </div>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-10 items-center rounded-[10px] border px-3.5 text-[13px] ${
        active ? 'border-ink bg-ink font-semibold text-white' : 'border-line-strong bg-white font-medium'
      }`}
    >
      {children}
    </Link>
  );
}
