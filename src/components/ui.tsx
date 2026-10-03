import Link from 'next/link';
import type { MarketSummary } from '@/lib/queries';
import { fmtDateShort, fmtInt, plural, pct } from '@/lib/format';

export function ProbBar({ prob, className = '' }: { prob: number; className?: string }) {
  return (
    <span className={`block h-1.5 rounded-full bg-yes-tint ${className}`}>
      <span className="block h-1.5 rounded-full bg-yes" style={{ width: `${Math.round(prob * 100)}%` }} />
    </span>
  );
}

export function Change({ value, suffix = ' pkt' }: { value: number; suffix?: string }) {
  const pts = Math.round(value * 100);
  if (pts === 0) return <span className="font-semibold text-muted">bez zmian</span>;
  return (
    <span className={`font-semibold tabular-nums ${pts > 0 ? 'text-yes' : 'text-ink'}`}>
      {pts > 0 ? `+${pts}` : `−${-pts}`}
      {suffix}
    </span>
  );
}

export function CategoryLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">{children}</span>;
}

export function MarketCard({ m }: { m: MarketSummary }) {
  const resolved = m.phase === 'resolved';
  return (
    <Link
      href={`/rynek/${m.id}`}
      className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-[18px] text-ink transition hover:border-line-strong hover:shadow-sm"
    >
      <span className="flex justify-between gap-3 text-xs text-muted">
        <CategoryLabel>{m.category}</CategoryLabel>
        <span>
          {resolved ? 'rozstrzygnięty' : m.phase === 'awaiting' ? 'czeka na wynik' : `do ${fmtDateShort(m.closes_at)}`}
        </span>
      </span>
      <span className="flex-1 font-display text-[19px] font-semibold leading-tight">{m.question}</span>
      {resolved ? (
        <span className="flex items-center gap-3">
          <span
            className={`rounded-md px-2.5 py-1 text-sm font-bold text-white ${m.outcome ? 'bg-yes' : 'bg-ink'}`}
          >
            {m.outcome ? 'TAK' : 'NIE'}
          </span>
          <span className="text-sm text-muted">tłum dawał {pct(m.prob)}% na TAK</span>
        </span>
      ) : (
        <span className="flex items-end gap-3.5">
          <span className="font-display text-[34px] font-extrabold leading-none text-yes tabular-nums">
            {pct(m.prob)}%
          </span>
          <span className="flex flex-1 flex-col gap-1.5 pb-1">
            <span className="flex justify-between text-xs text-muted">
              <span>szans na TAK</span>
              <Change value={m.change7d} />
            </span>
            <ProbBar prob={m.prob} />
          </span>
        </span>
      )}
      <span className="text-[13px] text-muted">
        {fmtInt(m.participants)} {plural(m.participants, 'osoba typuje', 'osoby typują', 'osób typuje')}
      </span>
    </Link>
  );
}

export function Card({
  children,
  className = '',
  tone = 'white',
}: {
  children: React.ReactNode;
  className?: string;
  tone?: 'white' | 'ink' | 'yes' | 'brick';
}) {
  const tones = {
    white: 'border border-line bg-white',
    ink: 'bg-ink text-white',
    yes: 'bg-yes-tint',
    brick: 'bg-brick-tint',
  };
  return <section className={`rounded-2xl p-5 ${tones[tone]} ${className}`}>{children}</section>;
}

export function PageHead({ title, lead, children }: { title: string; lead?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex max-w-[680px] flex-col gap-2">
        <h1 className="font-display text-[clamp(30px,4vw,42px)] font-extrabold leading-[1.05] tracking-tight">{title}</h1>
        {lead ? <p className="text-base leading-relaxed text-muted">{lead}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function FormMessage({ state }: { state: { ok: boolean; message: string } }) {
  if (!state.message) return <p aria-live="polite" className="sr-only" />;
  return (
    <p
      aria-live="polite"
      className={`rounded-xl px-3.5 py-2.5 text-sm font-medium ${
        state.ok ? 'bg-yes-tint text-yes-dark' : 'bg-brick-tint text-brick-ink'
      }`}
    >
      {state.message}
    </p>
  );
}
