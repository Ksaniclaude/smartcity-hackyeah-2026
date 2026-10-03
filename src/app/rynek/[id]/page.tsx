import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getGame } from '@/lib/session';
import { getMarket, priceHistory, recentTrades, userPosition } from '@/lib/queries';
import { GAME } from '@/lib/config';
import { bricks, fmtDate, fmtInt, fmtRelative, pct } from '@/lib/format';
import { CategoryLabel, Change } from '@/components/ui';
import { PriceChart } from '@/components/PriceChart';
import { BackIcon } from '@/components/icons';
import { TradePanel } from './TradePanel';

export async function generateMetadata(props: PageProps<'/rynek/[id]'>): Promise<Metadata> {
  const { id } = await props.params;
  const m = await getMarket(Number(id));
  return { title: m?.question ?? 'Rynek' };
}

export default async function MarketPage(props: PageProps<'/rynek/[id]'>) {
  const { id } = await props.params;
  const { user: viewer, now: t } = await getGame();
  const m = await getMarket(Number(id));
  if (!m) notFound();

  const [history, trades, pos] = await Promise.all([
    priceHistory(m, t),
    recentTrades(m.id, 6),
    viewer ? userPosition(m.id) : Promise.resolve(null),
  ]);

  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-4 px-4 pb-12 pt-5 sm:px-6">
      <nav aria-label="Ścieżka" className="flex items-center gap-1.5 text-sm text-muted">
        <Link href="/" className="flex min-h-11 items-center gap-1 font-semibold text-yes hover:underline">
          <BackIcon size={18} strokeWidth={2} /> Rynki
        </Link>
        <span aria-hidden="true">/</span>
        <span>{m.category}</span>
      </nav>

      <div className="flex flex-wrap items-start gap-8">
        <article className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
          <div className="flex flex-col gap-2.5">
            <CategoryLabel>{m.category}</CategoryLabel>
            <h1 className="max-w-[780px] font-display text-[clamp(28px,3.6vw,40px)] font-extrabold leading-[1.1] tracking-tight">
              {m.question}
            </h1>
          </div>

          {m.phase === 'resolved' ? (
            <div className="flex flex-wrap items-center gap-4">
              <span className={`rounded-xl px-4 py-2 font-display text-3xl font-extrabold text-white ${m.outcome ? 'bg-yes' : 'bg-ink'}`}>
                Wynik: {m.outcome ? 'TAK' : 'NIE'}
              </span>
              <span className="text-muted">
                Tłum dawał na koniec {pct(m.prob)}% na TAK · rozstrzygnięto {fmtDate(m.resolved_at ?? t)}
              </span>
            </div>
          ) : (
            <div className="flex items-end gap-4">
              <span className="font-display text-[64px] font-extrabold leading-[0.9] text-yes tabular-nums">{pct(m.prob)}%</span>
              <span className="flex flex-col gap-0.5 pb-1">
                <span className="text-[17px] font-semibold">szans na TAK</span>
                <span className="text-sm">
                  <Change value={m.change7d} /> <span className="text-muted">w 7 dni</span>
                </span>
              </span>
            </div>
          )}

          <div className="rounded-2xl border border-line bg-white px-5 pb-3.5 pt-4">
            <p className="mb-2 text-sm font-semibold">Szansa na TAK w czasie</p>
            <PriceChart points={history} />
          </div>

          <dl className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            <Fact label="Termin">{fmtDate(m.closes_at)}</Fact>
            <Fact label="Źródło">{m.source ?? 'wskazane w opisie'}</Fact>
            <Fact label="Typujący">{fmtInt(m.participants)}</Fact>
            <Fact label="W puli">{bricks(m.pool)}</Fact>
          </dl>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] items-start gap-4">
            <section className="flex flex-col gap-2.5 rounded-2xl border border-line bg-white px-5 py-[18px]">
              <h2 className="font-display text-[19px] font-bold">Jak rozstrzygniemy</h2>
              <p className="text-[15px] leading-relaxed text-[#33373f]">{m.criteria}</p>
              <p className="text-sm leading-relaxed text-muted">
                Po terminie moderator sprawdza źródło i ogłasza wynik.
              </p>
            </section>

            <section className="flex flex-col gap-1 rounded-2xl border border-line bg-white px-5 py-[18px]">
              <h2 className="mb-1.5 font-display text-[19px] font-bold">Ostatnie typy</h2>
              {trades.length ? (
                trades.map((tr, i) => (
                  <div key={i} className="flex min-h-12 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-line text-[13px] font-bold uppercase"
                    >
                      {tr.nick[0]}
                    </span>
                    <span className="flex-1 text-sm">
                      <strong>{tr.nick}</strong> · {tr.amount} na {tr.side === 'yes' ? 'TAK' : 'NIE'}
                    </span>
                    <span className="text-[13px] text-muted">{fmtRelative(tr.created_at, t)}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted">Nikt jeszcze nie typował. Bądź pierwszy.</p>
              )}
            </section>
          </div>
        </article>

        <aside className="flex flex-[1_1_340px] flex-col gap-4">
          {m.phase === 'open' ? (
            <TradePanel
              marketId={m.id}
              qYes={m.q_yes}
              qNo={m.q_no}
              b={m.b}
              balance={viewer ? viewer.balance : null}
              maxBet={GAME.maxBet}
            />
          ) : (
            <section className="rounded-[20px] border border-line bg-white p-5">
              <h2 className="font-display text-[22px] font-bold">
                {m.phase === 'awaiting' ? 'Typowanie zamknięte' : 'Rynek rozstrzygnięty'}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {m.phase === 'awaiting'
                  ? 'Termin minął. Czekamy, aż moderator sprawdzi źródło i ogłosi wynik.'
                  : 'Trafione udziały zostały wypłacone, a punkty Nosa naliczone.'}
              </p>
            </section>
          )}

          {pos && (pos.yesStaked > 0 || pos.noStaked > 0) ? (
            <section className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-5 text-sm">
              <h2 className="font-display text-lg font-bold">Twoja pozycja</h2>
              {pos.yesStaked > 0 ? (
                <p>
                  TAK: postawione {pos.yesStaked}, przy wyniku TAK dostajesz <strong>{Math.floor(pos.yesShares)}</strong>
                </p>
              ) : null}
              {pos.noStaked > 0 ? (
                <p>
                  NIE: postawione {pos.noStaked}, przy wyniku NIE dostajesz <strong>{Math.floor(pos.noShares)}</strong>
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="flex flex-col gap-1.5 rounded-2xl bg-yes-tint px-[18px] py-4">
            <h2 className="text-sm font-bold text-yes-dark">Skąd ta cena?</h2>
            <p className="text-sm leading-relaxed text-[#23305e]">
              Cenę ustala automatyczny animator rynku (LMSR). Każdy typ przesuwa szansę, a trafiony udział wypłaca 1
              cegiełkę. Cena udziału to więc prawdopodobieństwo, które daje tłum.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-white px-3.5 py-3">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</dt>
      <dd className="mt-1.5 text-base font-semibold">{children}</dd>
    </div>
  );
}
