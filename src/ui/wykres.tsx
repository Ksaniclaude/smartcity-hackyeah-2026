import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { PunktHistorii } from "@/api/types";

const KLASY = ["tak", "nie", "trzeci"];
const GODZINA = 60 * 60 * 1000;
/** Krok wykresu: kurs w przedziałach co 15 minut. */
const KROK = 15 * 60 * 1000;

interface Props {
  historia: PunktHistorii[];
  odpowiedzi: string[];
  /** Które serie rysować (indeksy odpowiedzi); domyślnie: tylko pierwsza dla 2 odpowiedzi, wszystkie dla 3. */
  serie?: number[];
  wysokosc?: number;
  /** Rynek otwarty: linia dochodzi do „teraz”, a jej koniec pulsuje. */
  zywy?: boolean;
  /** Bez wiersza z odczytem i bez dat pod osią (wyróżniony rynek na stronie głównej). */
  kompakt?: boolean;
  /** Kurs otwarcia: przy braku historii rysowany przerywaną linią zamiast pustego pola. */
  otwarcie?: number[] | null;
}

type Punkt = { t: number; kursy: number[] };

const takieSame = (a: number[], b: number[]) => a.length === b.length && a.every((k, i) => k === b[i]);

/**
 * Próbkowanie co KROK: na końcu każdego kwadransu ostatni kurs sprzed tej chwili (zmiany w środku kwadransu
 * zlewają się w jeden schodek). Bieżący kwadrans pokazuje ostatnią transakcję od razu.
 */
export function wKrokach(pkt: Punkt[]): Punkt[] {
  if (pkt.length < 2) return pkt;
  const wynik = [pkt[0]];
  const ostatni = pkt[pkt.length - 1];
  let j = 0;
  for (let g = Math.ceil(pkt[0].t / KROK) * KROK; g <= ostatni.t; g += KROK) {
    while (j + 1 < pkt.length && pkt[j + 1].t <= g) j++;
    if (!takieSame(pkt[j].kursy, wynik[wynik.length - 1].kursy)) wynik.push({ t: g, kursy: pkt[j].kursy });
  }
  if (!takieSame(ostatni.kursy, wynik[wynik.length - 1].kursy)) wynik.push(ostatni);
  return wynik;
}

function formatujCzas(t: number): string {
  return new Date(t).toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatujDzien(t: number): string {
  return new Date(t).toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
}

/** Zakres osi Y w procentach: przycięty do okolic kursów (krok 10 albo 20), a przy dużym rozrzucie pełne 0–100. */
function zakresOsi(wartosci: number[]): { od: number; do: number; krok: number } {
  if (wartosci.length === 0) return { od: 0, do: 100, krok: 25 };
  let od = Math.max(0, Math.floor((Math.min(...wartosci) * 100 - 6) / 10) * 10);
  let ku = Math.min(100, Math.ceil((Math.max(...wartosci) * 100 + 6) / 10) * 10);
  while (ku - od < 30) {
    if (od > 0) od -= 10;
    if (ku - od < 30 && ku < 100) ku += 10;
  }
  if (ku - od <= 50) return { od, do: ku, krok: 10 };
  od = Math.floor(od / 20) * 20;
  ku = Math.ceil(ku / 20) * 20;
  if (ku - od <= 80) return { od, do: ku, krok: 20 };
  return { od: 0, do: 100, krok: 25 };
}

/**
 * Wykres kursu w czasie (SVG, bez bibliotek). Linie schodkowe jak na giełdzie prognoz: kurs zmienia się
 * tylko w chwili zakładu. Pojedyncza seria ma wypełnione pole pod linią; kolory serii są w arkuszu.
 */
export function Wykres({ historia, odpowiedzi, serie, wysokosc = 240, zywy = false, kompakt = false, otwarcie = null }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [szer, setSzer] = useState(720);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ustaw = () => setSzer(Math.max(240, Math.round(el.clientWidth)));
    ustaw();
    const ro = new ResizeObserver(ustaw);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pad = { l: 2, r: 40, t: 10, b: kompakt ? 8 : 24 };
  const wybrane = serie ?? (odpowiedzi.length === 2 ? [0] : odpowiedzi.map((_, i) => i));

  // Nowy punkt (po własnej prognozie albo odpytaniu): ostatni odcinek dorysowuje się animacją.
  const liczbaRef = useRef(0);
  const [animacja, setAnimacja] = useState(0);
  useEffect(() => {
    if (liczbaRef.current > 0 && historia.length > liczbaRef.current) setAnimacja((a) => a + 1);
    liczbaRef.current = historia.length;
  }, [historia.length]);

  const { punkty, t0, t1 } = useMemo(() => {
    const pkt = wKrokach(
      historia
        .map((h) => ({ t: new Date(h.czas).getTime(), kursy: h.kursy }))
        .filter((h) => Number.isFinite(h.t))
        .sort((a, b) => a.t - b.t),
    );
    if (pkt.length === 0) return { punkty: pkt, t0: 0, t1: 1 };
    const a = pkt[0].t;
    let b = pkt[pkt.length - 1].t;
    if (zywy) b = Math.max(b, Date.now());
    if (b - a < GODZINA) b = a + GODZINA;
    return { punkty: pkt, t0: a, t1: b };
  }, [historia, zywy]);

  const brakHistorii = punkty.length === 0;
  const wartosci = brakHistorii
    ? wybrane.map((i) => otwarcie?.[i]).filter((k): k is number => k != null)
    : punkty.flatMap((p) => wybrane.map((i) => p.kursy[i] ?? 0));
  const os = zakresOsi(wartosci);
  const podzialki: number[] = [];
  for (let k = os.od; k <= os.do; k += os.krok) podzialki.push(k);

  const x = (t: number) => pad.l + ((t - t0) / (t1 - t0)) * (szer - pad.l - pad.r);
  const y = (k: number) => pad.t + (1 - (Math.max(os.od, Math.min(os.do, k * 100)) - os.od) / (os.do - os.od)) * (wysokosc - pad.t - pad.b);
  const prawy = szer - pad.r;
  const dol = wysokosc - pad.b;

  const siatka = podzialki.map((k) => (
    <g key={k}>
      <line x1={pad.l} x2={prawy} y1={y(k / 100)} y2={y(k / 100)} className="wykres-siatka" />
      <text x={prawy + 8} y={y(k / 100) + 4} className="wykres-os">
        {k}%
      </text>
    </g>
  ));

  if (brakHistorii) {
    return (
      <div className="wykres wykres-bez-historii" ref={ref}>
        <svg viewBox={`0 0 ${szer} ${wysokosc}`} width={szer} height={wysokosc} role="img" aria-label="Wykres kursu: brak historii">
          {siatka}
          {otwarcie
            ? wybrane.map((i) =>
                otwarcie[i] != null ? (
                  <line key={i} x1={pad.l} x2={prawy} y1={y(otwarcie[i])} y2={y(otwarcie[i])} className="wykres-otwarcie" />
                ) : null,
              )
            : null}
        </svg>
        <p className="wykres-uwaga">Kurs jest ukryty, dopóki rynek ma za mało prognoz. Wykres ruszy po odsłonięciu.</p>
      </div>
    );
  }

  const sciezka = (i: number) => {
    let d = "";
    for (let j = 0; j < punkty.length; j++) {
      const px = x(punkty[j].t).toFixed(1);
      const py = y(punkty[j].kursy[i] ?? 0).toFixed(1);
      d += j === 0 ? `M${px},${py}` : ` H${px} V${py}`;
    }
    return `${d} H${prawy.toFixed(1)}`;
  };

  const ostatni = punkty[punkty.length - 1];
  const akt = hover != null ? punkty[hover] : ostatni;
  const xAkt = hover != null ? x(akt.t) : prawy;
  const ostatniOdcinek = (i: number) => {
    if (punkty.length < 2) return "";
    const a = punkty[punkty.length - 2];
    const b = punkty[punkty.length - 1];
    return `M${x(a.t).toFixed(1)},${y(a.kursy[i] ?? 0).toFixed(1)} H${x(b.t).toFixed(1)} V${y(b.kursy[i] ?? 0).toFixed(1)} H${prawy.toFixed(1)}`;
  };

  const naRuch = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * szer;
    let najblizszy = 0;
    for (let j = 0; j < punkty.length; j++) {
      if (x(punkty[j].t) <= px) najblizszy = j;
    }
    setHover(najblizszy);
  };

  return (
    <div className={`wykres ${kompakt ? "wykres-kompakt" : ""}`} ref={ref}>
      {!kompakt ? (
        <div className="wykres-odczyt">
          <span className="wykres-czas">{hover != null ? formatujCzas(akt.t) : "teraz"}</span>
          {wybrane.map((i) => (
            <span key={i} className={`typ-${KLASY[i] ?? "trzeci"}`}>
              {odpowiedzi[i]} <b className="cyfry">{Math.round((akt.kursy[i] ?? 0) * 100)}%</b>
            </span>
          ))}
        </div>
      ) : null}
      <svg
        viewBox={`0 0 ${szer} ${wysokosc}`}
        width={szer}
        height={wysokosc}
        role="img"
        aria-label="Wykres kursu w czasie"
        onPointerMove={naRuch}
        onPointerLeave={() => setHover(null)}
      >
        {siatka}
        {wybrane.length === 1 ? (
          <path d={`${sciezka(wybrane[0])} V${dol} H${pad.l} Z`} className={`wykres-pole seria-${KLASY[wybrane[0]] ?? "trzeci"}`} />
        ) : null}
        {wybrane.map((i) => (
          <path key={i} d={sciezka(i)} className={`wykres-linia seria-${KLASY[i] ?? "trzeci"}`} />
        ))}
        {animacja > 0 && punkty.length >= 2
          ? wybrane.map((i) => (
              <path key={`n${animacja}-${i}`} d={ostatniOdcinek(i)} pathLength={1} className={`wykres-linia wykres-odcinek-nowy seria-${KLASY[i] ?? "trzeci"}`} />
            ))
          : null}
        {hover != null ? <line x1={xAkt} x2={xAkt} y1={pad.t} y2={dol} className="wykres-kursor" /> : null}
        {wybrane.map((i) => (
          <g key={i} className={`wykres-punkt seria-${KLASY[i] ?? "trzeci"}`}>
            {zywy && hover == null ? <circle cx={xAkt} cy={y(akt.kursy[i] ?? 0)} r={5} className="wykres-puls" /> : null}
            <circle cx={xAkt} cy={y(akt.kursy[i] ?? 0)} r={4} />
          </g>
        ))}
        {!kompakt ? (
          <>
            <text x={pad.l} y={wysokosc - 6} className="wykres-os">
              {formatujDzien(t0)}
            </text>
            <text x={prawy} y={wysokosc - 6} className="wykres-os" textAnchor="end">
              {zywy ? "teraz" : formatujDzien(t1)}
            </text>
          </>
        ) : null}
      </svg>
    </div>
  );
}
