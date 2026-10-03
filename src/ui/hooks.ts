import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { komunikatBledu, pobierzRanking } from "@/api/api";

/**
 * Odpytywanie: woła fn od razu i potem co `interval` ms (tylko gdy karta jest widoczna).
 * Bez połączeń realtime, zgodnie z założeniami projektu.
 */
export function usePolling<T>(fn: () => Promise<T>, interval = 5000, klucz: string | number = "") {
  const [dane, setDane] = useState<T | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [laduje, setLaduje] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const odswiez = useCallback(async () => {
    try {
      const d = await fnRef.current();
      setDane(d);
      setBlad(null);
    } catch (e) {
      setBlad(komunikatBledu(e));
    } finally {
      setLaduje(false);
    }
  }, []);

  useEffect(() => {
    let aktywne = true;
    const tick = () => {
      if (aktywne && document.visibilityState === "visible") void odswiez();
    };
    setLaduje(true);
    void odswiez();
    const id = window.setInterval(tick, interval);
    return () => {
      aktywne = false;
      window.clearInterval(id);
    };
  }, [odswiez, interval, klucz]);

  return { dane, blad, laduje, odswiez };
}

/** Stan prostego formularza: wysyłanie, błąd, sukces. */
export function useAkcja<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [trwa, setTrwa] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);
  const wykonaj = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setTrwa(true);
      setBlad(null);
      try {
        return await fn(...args);
      } catch (e) {
        setBlad(komunikatBledu(e));
        return undefined;
      } finally {
        setTrwa(false);
      }
    },
    [fn],
  );
  return { wykonaj, trwa, blad, setBlad };
}

/** Miejsca w rankingu (nick → miejsce), odpytywane co 15 s; do odznak przy nickach. */
export function useMiejsca(interval = 15000): Map<string, number> {
  const { dane } = usePolling(() => pobierzRanking(200), interval, "miejsca");
  return useMemo(() => new Map((dane ?? []).map((w, i) => [w.nick, i + 1] as const)), [dane]);
}

/**
 * Błysk po zmianie wartości: zwraca "gora" | "dol" przez `ms` milisekund po tym, jak `wartosc`
 * wzrosła albo spadła wobec poprzedniego odczytu (np. kurs między odpytaniami).
 */
export function useBlysk(wartosc: number | null | undefined, ms = 1000): "gora" | "dol" | null {
  const poprzednia = useRef<number | null | undefined>(undefined);
  const [blysk, setBlysk] = useState<"gora" | "dol" | null>(null);
  useEffect(() => {
    const prev = poprzednia.current;
    poprzednia.current = wartosc;
    if (prev === undefined || prev == null || wartosc == null || Math.abs(wartosc - prev) < 0.0005) return;
    setBlysk(wartosc > prev ? "gora" : "dol");
    const id = window.setTimeout(() => setBlysk(null), ms);
    return () => window.clearTimeout(id);
  }, [wartosc, ms]);
  return blysk;
}

/** Licznik bijący od 0 do `cel` przez `ms` milisekund (ease-out); start po `opoznienie` ms. */
export function useLicznik(cel: number, ms = 1200, opoznienie = 0, aktywny = true): number {
  const [wartosc, setWartosc] = useState(0);
  useEffect(() => {
    if (!aktywny) return;
    let raf = 0;
    let start = 0;
    const krok = (t: number) => {
      if (!start) start = t;
      const u = Math.min(1, (t - start) / ms);
      setWartosc(cel * (1 - Math.pow(1 - u, 3)));
      if (u < 1) raf = window.requestAnimationFrame(krok);
    };
    const id = window.setTimeout(() => {
      raf = window.requestAnimationFrame(krok);
    }, opoznienie);
    return () => {
      window.clearTimeout(id);
      window.cancelAnimationFrame(raf);
    };
  }, [cel, ms, opoznienie, aktywny]);
  return wartosc;
}
