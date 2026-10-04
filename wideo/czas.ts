// Czas filmu: wszystko jest funkcją numeru klatki, więc każdą klatkę da się wyrenderować osobno i zawsze tak samo.

export const FPS = 60;
export const SZER = 1920;
export const WYS = 1080;

/** Sekundy na klatki. */
export const s = (sek: number) => Math.round(sek * FPS);

export type Easing = (t: number) => number;

/** Krzywa Béziera jak w CSS (`cubic-bezier(x1, y1, x2, y2)`). */
export function bezier(x1: number, y1: number, x2: number, y2: number): Easing {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const x = (t: number) => ((ax * t + bx) * t + cx) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const y = (t: number) => ((ay * t + by) * t + cy) * t;
  return (p: number) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let t = p;
    for (let i = 0; i < 8; i++) {
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= (x(t) - p) / d;
    }
    t = Math.min(1, Math.max(0, t));
    return y(t);
  };
}

export const liniowo: Easing = (t) => t;
export const wyjscie = bezier(0.2, 0.8, 0.2, 1);
export const wyjscieMocne = bezier(0.1, 0.9, 0.1, 1);
export const wejscie = bezier(0.6, 0, 0.9, 0.3);
export const wejscieWyjscie = bezier(0.7, 0, 0.2, 1);
/** Sprężyste przestrzelenie, jak `--sprezyscie` w arkuszu aplikacji. */
export const sprezyscie = bezier(0.2, 0.9, 0.3, 1.3);

/** Wartość z przedziału `wej` przeniesiona na `wyj` (przycięta), z krzywą. */
export function interp(x: number, wej: [number, number], wyj: [number, number], e: Easing = liniowo): number {
  const [a, b] = wej;
  const t = b === a ? (x >= b ? 1 : 0) : Math.min(1, Math.max(0, (x - a) / (b - a)));
  return wyj[0] + (wyj[1] - wyj[0]) * e(t);
}

/** Tłumiona sprężyna 0 → 1 od klatki 0 (domyślnie lekko przestrzela i szybko siada). */
export function sprezyna(klatka: number, { sztywnosc = 220, tlumienie = 20, masa = 1 } = {}): number {
  if (klatka <= 0) return 0;
  const t = klatka / FPS;
  const w0 = Math.sqrt(sztywnosc / masa);
  const zeta = tlumienie / (2 * Math.sqrt(sztywnosc * masa));
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}

/** Powtarzalny „los” z ziarna (te same drobiny w każdym renderze). */
export function los(ziarno: number): number {
  const x = Math.sin(ziarno * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
