import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { PunktHistorii } from "@/api/types";

const KOLORY = ["var(--tak)", "var(--nie)", "var(--trzeci)"];

interface Props {
  historia: PunktHistorii[];
  odpowiedzi: string[];
  /** Które serie rysować (indeksy odpowiedzi); domyślnie: tylko pierwsza dla 2 odpowiedzi, wszystkie dla 3. */
  serie?: number[];
  wysokosc?: number;
}

function formatujCzas(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * Wykres kursu w czasie (SVG, bez bibliotek). Linie schodkowe jak na giełdzie
 * prognoz: kurs zmienia się tylko w chwili zakładu. Oś Y: 0–100 %.
 */
export function Wykres({ historia, odpowiedzi, serie, wysokosc = 220 }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [szer, setSzer] = useState(720);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ustaw = () => setSzer(Math.max(280, Math.round(el.clientWidth)));
    ustaw();
    const ro = new ResizeObserver(ustaw);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pad = { l: 8, r: 44, t: 12, b: 24 };
  const wybrane = serie ?? (odpowiedzi.length === 2 ? [0] : odpowiedzi.map((_, i) => i));

  // Nowy punkt (po własnej prognozie albo odpytaniu): ostatni odcinek rysuje się animacją, punkt pulsuje.
  const liczbaRef = useRef(0);
  const [animacja, setAnimacja] = useState(0);
  useEffect(() => {
    if (liczbaRef.current > 0 && historia.length > liczbaRef.current) setAnimacja((a) => a + 1);
    liczbaRef.current = historia.length;
  }, [historia.length]);

  const { punkty, t0, t1 } = useMemo(() => {
    const pkt = historia
      .map((h) => ({ t: new Date(h.czas).getTime(), kursy: h.kursy }))
      .filter((h) => Number.isFinite(h.t));
    if (pkt.length === 0) return { punkty: pkt, t0: 0, t1: 1 };
    const a = pkt[0].t;
    let b = pkt[pkt.length - 1].t;
    if (b - a < 60 * 60 * 1000) b = a + 60 * 60 * 1000;
    return { punkty: pkt, t0: a, t1: b };
  }, [historia]);

  if (punkty.length === 0) {
    return (
      <div className="wykres" ref={ref}>
        <div className="wykres-pusty">Kurs jest ukryty, dopóki rynek ma za mało prognoz.</div>
      </div>
    );
  }

  const x = (t: number) => pad.l + ((t - t0) / (t1 - t0)) * (szer - pad.l - pad.r);
  const y = (k: number) => pad.t + (1 - Math.max(0, Math.min(1, k))) * (wysokosc - pad.t - pad.b);

  const sciezka = (i: number) => {
    let d = "";
    for (let j = 0; j < punkty.length; j++) {
      const p = punkty[j];
      const px = x(p.t);
      const py = y(p.kursy[i] ?? 0);
      if (j === 0) d += `M${px.toFixed(1)},${py.toFixed(1)}`;
      else d += ` H${px.toFixed(1)} V${py.toFixed(1)}`;
    }
    d += ` H${(szer - pad.r).toFixed(1)}`;
    return d;
  };

  const ostatni = punkty[punkty.length - 1];
  const akt = hover != null ? punkty[hover] : ostatni;
  const ostatniOdcinek = (i: number) => {
    if (punkty.length < 2) return "";
    const a = punkty[punkty.length - 2];
    const b = punkty[punkty.length - 1];
    return `M${x(a.t).toFixed(1)},${y(a.kursy[i] ?? 0).toFixed(1)} H${x(b.t).toFixed(1)} V${y(b.kursy[i] ?? 0).toFixed(1)} H${(szer - pad.r).toFixed(1)}`;
  };

  const naRuch = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * szer;
    let najblizszy = 0;
    for (let j = 0; j < punkty.length; j++) {
      if (x(punkty[j].t) <= px) najblizszy = j;
    }
    setHover(najblizszy);
  };

  return (
    <div className="wykres" ref={ref}>
      <div className="wykres-tooltip">
        <span className="wykres-czas">{formatujCzas(new Date(akt.t).toISOString())}</span>
        {wybrane.map((i) => (
          <span key={i} style={{ color: KOLORY[i] }}>
            {odpowiedzi[i]} <b>{Math.round((akt.kursy[i] ?? 0) * 100)}%</b>
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${szer} ${wysokosc}`}
        width={szer}
        height={wysokosc}
        role="img"
        aria-label="Wykres kursu w czasie"
        onMouseMove={naRuch}
        onMouseLeave={() => setHover(null)}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((k) => (
          <g key={k}>
            <line x1={pad.l} x2={szer - pad.r} y1={y(k)} y2={y(k)} className="wykres-siatka" />
            <text x={szer - pad.r + 8} y={y(k) + 4} className="wykres-os">
              {Math.round(k * 100)}%
            </text>
          </g>
        ))}
        {wybrane.map((i) => (
          <path key={i} d={sciezka(i)} fill="none" stroke={KOLORY[i]} strokeWidth={2.2} strokeLinejoin="round" />
        ))}
        {animacja > 0 && punkty.length >= 2
          ? wybrane.map((i) => (
              <path
                key={`n${animacja}-${i}`}
                d={ostatniOdcinek(i)}
                pathLength={1}
                className="wykres-odcinek-nowy"
                fill="none"
                stroke={KOLORY[i]}
                strokeWidth={3.2}
                strokeLinejoin="round"
              />
            ))
          : null}
        {hover != null ? (
          <line x1={x(akt.t)} x2={x(akt.t)} y1={pad.t} y2={wysokosc - pad.b} className="wykres-kursor" />
        ) : null}
        {wybrane.map((i) => (
          <circle key={i} cx={x(akt.t)} cy={y(akt.kursy[i] ?? 0)} r={4} fill={KOLORY[i]} />
        ))}
        {animacja > 0 && hover == null
          ? wybrane.map((i) => (
              <circle key={`p${animacja}-${i}`} cx={x(ostatni.t)} cy={y(ostatni.kursy[i] ?? 0)} r={4} fill="none" stroke={KOLORY[i]} strokeWidth={2} className="wykres-punkt-nowy" />
            ))
          : null}
        <text x={pad.l} y={wysokosc - 6} className="wykres-os">
          {new Date(t0).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}
        </text>
        <text x={szer - pad.r} y={wysokosc - 6} className="wykres-os" textAnchor="end">
          {new Date(t1).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}
        </text>
      </svg>
    </div>
  );
}
