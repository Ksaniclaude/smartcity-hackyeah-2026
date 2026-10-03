import { useCallback, useEffect, useRef, useState } from "react";
import { komunikatBledu } from "@/api/api";

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
