import { fmtDateShort } from '@/lib/format';

const W = 700;
const H = 170;
const LEFT = 40;
const RIGHT = 680;
const TOP = 10;
const BOTTOM = 150;

/** Wykres szansy na TAK w czasie (schodkowy — cena zmienia się tylko przy typie). */
export function PriceChart({ points }: { points: { t: number; p: number }[] }) {
  if (points.length < 2) return null;
  const t0 = points[0].t;
  const t1 = Math.max(points[points.length - 1].t, t0 + 1);
  const ps = points.map((pt) => pt.p);
  let lo = Math.max(0, Math.floor((Math.min(...ps) - 0.05) * 10) / 10);
  let hi = Math.min(1, Math.ceil((Math.max(...ps) + 0.05) * 10) / 10);
  if (hi - lo < 0.3) {
    const mid = (hi + lo) / 2;
    lo = Math.max(0, mid - 0.15);
    hi = Math.min(1, lo + 0.3);
    lo = hi - 0.3;
  }
  const x = (t: number) => LEFT + ((t - t0) / (t1 - t0)) * (RIGHT - LEFT);
  const y = (p: number) => BOTTOM - ((p - lo) / (hi - lo)) * (BOTTOM - TOP);

  let d = `M${x(points[0].t).toFixed(1)},${y(points[0].p).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` H${x(points[i].t).toFixed(1)} V${y(points[i].p).toFixed(1)}`;
  }
  const area = `${d} V${BOTTOM} H${LEFT} Z`;
  const last = points[points.length - 1];
  const grid = [lo, (lo + hi) / 2, hi];

  return (
    <figure className="m-0 flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Szansa na TAK zmieniła się z ${Math.round(points[0].p * 100)}% do ${Math.round(last.p * 100)}%`}
        className="block h-auto w-full"
      >
        {grid.map((g) => (
          <g key={g}>
            <line x1={LEFT} x2={RIGHT} y1={y(g)} y2={y(g)} stroke="#E1E4EA" />
            <text x={LEFT - 8} y={y(g) + 4} fontSize="11" fill="#565B6A" textAnchor="end">
              {Math.round(g * 100)}%
            </text>
          </g>
        ))}
        <path d={area} fill="#E7ECFB" />
        <path d={d} fill="none" stroke="#2647D6" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx={x(last.t)} cy={y(last.p)} r="6" fill="#2647D6" stroke="#fff" strokeWidth="2.5" />
      </svg>
      <figcaption className="flex justify-between pl-[6%] text-xs text-muted">
        <span>{fmtDateShort(t0)}</span>
        <span>{fmtDateShort(t1)}</span>
      </figcaption>
    </figure>
  );
}
