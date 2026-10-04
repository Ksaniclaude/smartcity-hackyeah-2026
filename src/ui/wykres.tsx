import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { PunktHistorii } from "@/api/types";

const KLASY = ["tak", "nie", "trzeci"];
const MINUTA = 60 * 1000;
const GODZINA = 60 * MINUTA;
/** Dozwolone kroki próbkowania; wykres bierze najdrobniejszy, przy którym próbek nie jest więcej, niż mieści szerokość. */
const KROKI = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440].map((m) => m * MINUTA);
/** Jedna próbka na tyle pikseli szerokości: zmiana kursu ma wtedy widoczny, łagodny skos zamiast pionowej kreski. */
const PIKSELI_NA_PROBKE = 10;

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
}

type Punkt = { t: number; kursy: number[] };

const takieSame = (a: number[], b: number[]) => a.length === b.length && a.every((k, i) => k === b[i]);

/** Krok próbkowania dla zakresu czasu i liczby próbek: na szerokim wykresie godzina idzie co minutę, doba co kwadrans. */
export function krokDla(zakres: number, maksProbek: number): number {
  return KROKI.find((k) => zakres / k <= maksProbek) ?? KROKI[KROKI.length - 1];
}

/**
 * Próbkowanie w równych krokach od t0 do t1: w każdym kroku ostatni kurs sprzed tej chwili. Krok zależy od zakresu
 * i szerokości wykresu (`krokDla`), więc młody rynek z kilkoma prognozami na godzinę ma gęste próbki i zwykłą linię,
 * a nie parę klocków. Kupno i sprzedaż w tym samym kroku nie zostawiają igły. Ostatnia próbka to koniec zakresu
 * z bieżącym kursem.
 */
export function probkuj(pkt: Punkt[], t0: number, t1: number, maksProbek: number): Punkt[] {
  if (pkt.length === 0) return [];
  const krok = krokDla(t1 - t0, maksProbek);
  const wynik: Punkt[] = [{ t: t0, kursy: pkt[0].kursy }];
  let j = 0;
  for (let g = Math.floor(t0 / krok) * krok + krok; g < t1; g += krok) {
    while (j + 1 < pkt.length && pkt[j + 1].t <= g) j++;
    wynik.push({ t: g, kursy: pkt[j].kursy });
  }
  wynik.push({ t: t1, kursy: pkt[pkt.length - 1].kursy });
  return wynik;
}

/**
 * Gładka linia przez punkty: odcinki Béziera ze stycznymi Fritscha–Carlsona (interpolacja monotoniczna), więc krzywa
 * nie wychodzi poza kursy sąsiednich próbek. Płaskie odcinki zostają prostymi.
 */
function krzywa(p: { x: number; y: number }[]): string {
  const n = p.length;
  if (n === 0) return "";
  let d = `M${p[0].x.toFixed(1)},${p[0].y.toFixed(1)}`;
  if (n === 1) return d;
  const h: number[] = [];
  const nachylenie: number[] = [];
  for (let k = 0; k < n - 1; k++) {
    h.push(p[k + 1].x - p[k].x);
    nachylenie.push(h[k] > 0 ? (p[k + 1].y - p[k].y) / h[k] : 0);
  }
  const m: number[] = new Array<number>(n).fill(0);
  m[0] = nachylenie[0];
  m[n - 1] = nachylenie[n - 2];
  for (let k = 1; k < n - 1; k++) {
    const a = nachylenie[k - 1];
    const b = nachylenie[k];
    m[k] = a * b <= 0 ? 0 : (3 * (h[k - 1] + h[k])) / ((2 * h[k] + h[k - 1]) / a + (h[k] + 2 * h[k - 1]) / b);
  }
  for (let k = 0; k < n - 1; k++) {
    const x1 = p[k + 1].x.toFixed(1);
    if (nachylenie[k] === 0) {
      d += ` H${x1}`;
      continue;
    }
    const c1 = `${(p[k].x + h[k] / 3).toFixed(1)},${(p[k].y + (m[k] * h[k]) / 3).toFixed(1)}`;
    const c2 = `${(p[k + 1].x - h[k] / 3).toFixed(1)},${(p[k + 1].y - (m[k + 1] * h[k]) / 3).toFixed(1)}`;
    d += ` C${c1} ${c2} ${x1},${p[k + 1].y.toFixed(1)}`;
  }
  return d;
}

function formatujCzas(t: number): string {
  return new Date(t).toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Podpis początku i końca osi czasu: w obrębie doby godzina, przy dłuższym zakresie dzień. */
function formatujOs(t: number, zakres: number): string {
  if (zakres <= 24 * GODZINA) return new Date(t).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  return new Date(t).toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
}

/**
 * Zakres osi Y w procentach: przycięty do okolic kursów, a przy dużym rozrzucie pełne 0–100. Gdy kurs ruszył się
 * tylko o kilka punktów, oś jest ciasna (krok 5, co najmniej 20 punktów), żeby taki ruch było widać.
 */
function zakresOsi(wartosci: number[]): { od: number; do: number; krok: number } {
  if (wartosci.length === 0) return { od: 0, do: 100, krok: 25 };
  const min = Math.min(...wartosci) * 100;
  const max = Math.max(...wartosci) * 100;
  if (max - min <= 12) {
    let od = Math.max(0, Math.floor((min - 3) / 5) * 5);
    let ku = Math.min(100, Math.ceil((max + 3) / 5) * 5);
    while (ku - od < 20) {
      if (od > 0) od -= 5;
      if (ku - od < 20 && ku < 100) ku += 5;
    }
    return { od, do: ku, krok: 5 };
  }
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
 * Wykres kursu w czasie (SVG, bez bibliotek). Linia przez próbki w równych krokach: zmiana kursu to odcinek między
 * sąsiednimi próbkami. Pojedyncza seria ma wypełnione pole pod linią; kolory serii są w arkuszu.
 * Bez historii (kurs jeszcze nieodsłonięty, rynek bez prognoz) wykres się nie rysuje i nic o tym nie pisze.
 */
export function Wykres({ historia, odpowiedzi, serie, wysokosc = 240, zywy = false, kompakt = false }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [szer, setSzer] = useState(720);
  const pusty = historia.length === 0;
  // szerokość mierzona od chwili, gdy wykres jest na stronie (bez historii nie ma go wcale)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ustaw = () => setSzer(Math.max(240, Math.round(el.clientWidth)));
    ustaw();
    const ro = new ResizeObserver(ustaw);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pusty]);
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
    const pkt = historia
      .map((h) => ({ t: new Date(h.czas).getTime(), kursy: h.kursy }))
      .filter((h) => Number.isFinite(h.t))
      .sort((a, b) => a.t - b.t);
    if (pkt.length === 0) return { punkty: pkt, t0: 0, t1: 1 };
    const a = pkt[0].t;
    let b = pkt[pkt.length - 1].t;
    if (zywy) b = Math.max(b, Date.now());
    if (b - a < GODZINA) b = a + GODZINA;
    return { punkty: probkuj(pkt, a, b, Math.max(24, Math.round((szer - pad.l - pad.r) / PIKSELI_NA_PROBKE))), t0: a, t1: b };
  }, [historia, zywy, szer, pad.l, pad.r]);

  if (punkty.length === 0) return null;
  const wartosci = punkty.flatMap((p) => wybrane.map((i) => p.kursy[i] ?? 0));
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

  /** Gładka linia przez próbki od indeksu `od`; środkowe punkty płaskich odcinków są pomijane. */
  const sciezka = (i: number, od = 0) => {
    const wezly: { x: number; y: number }[] = [];
    for (let j = od; j < punkty.length; j++) {
      const k = punkty[j].kursy[i] ?? 0;
      if (j > od && j < punkty.length - 1 && (punkty[j - 1].kursy[i] ?? 0) === k && (punkty[j + 1].kursy[i] ?? 0) === k) continue;
      wezly.push({ x: x(punkty[j].t), y: y(k) });
    }
    return krzywa(wezly);
  };

  const ostatni = punkty[punkty.length - 1];
  const akt = hover != null ? punkty[hover] : ostatni;
  const xAkt = hover != null ? x(akt.t) : prawy;
  // Ostatni ruch kursu: od próbki tuż przed ostatnią zmianą do końca linii (dorysowywany animacją po nowej prognozie).
  let przedZmiana = punkty.length - 1;
  while (przedZmiana > 0 && takieSame(punkty[przedZmiana].kursy, ostatni.kursy)) przedZmiana--;
  const ostatniOdcinek = (i: number) => sciezka(i, przedZmiana);

  const naRuch = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * szer;
    let najblizszy = 0;
    for (let j = 0; j < punkty.length; j++) {
      if (Math.abs(x(punkty[j].t) - px) < Math.abs(x(punkty[najblizszy].t) - px)) najblizszy = j;
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
              {formatujOs(t0, t1 - t0)}
            </text>
            <text x={prawy} y={wysokosc - 6} className="wykres-os" textAnchor="end">
              {zywy ? "teraz" : formatujOs(t1, t1 - t0)}
            </text>
          </>
        ) : null}
      </svg>
    </div>
  );
}
