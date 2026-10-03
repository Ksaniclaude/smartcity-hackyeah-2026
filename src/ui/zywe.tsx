import { useEffect, useRef, useState } from "react";

/** Czy gracz prosi system o ograniczenie ruchu (wtedy liczby zmieniają się skokowo). */
function bezRuchu(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Liczba, która po zmianie wartości dochodzi płynnie do nowej i na chwilę dostaje klasę kierunku
 * (`gora` / `dol`), więc zmiana kursu z odpytywania jest widoczna. Pierwsze wyświetlenie jest bez animacji.
 */
export function LiczbaZywa({
  wartosc,
  format,
  className = "",
  czas = 450,
}: {
  wartosc: number;
  format: (n: number) => string;
  className?: string;
  czas?: number;
}) {
  const [pokazana, setPokazana] = useState(wartosc);
  const [kierunek, setKierunek] = useState<"gora" | "dol" | null>(null);
  const cel = useRef(wartosc);
  const biezaca = useRef(wartosc);

  useEffect(() => {
    if (cel.current === wartosc) return;
    const od = biezaca.current;
    setKierunek(wartosc > cel.current ? "gora" : "dol");
    cel.current = wartosc;
    const gasnie = window.setTimeout(() => setKierunek(null), 1100);
    if (bezRuchu()) {
      biezaca.current = wartosc;
      setPokazana(wartosc);
      return () => window.clearTimeout(gasnie);
    }
    const start = performance.now();
    let klatka = 0;
    const krok = (t: number) => {
      const u = Math.min(1, (t - start) / czas);
      const v = od + (wartosc - od) * (1 - Math.pow(1 - u, 3));
      biezaca.current = v;
      setPokazana(v);
      if (u < 1) klatka = requestAnimationFrame(krok);
    };
    klatka = requestAnimationFrame(krok);
    return () => {
      cancelAnimationFrame(klatka);
      window.clearTimeout(gasnie);
    };
  }, [wartosc, czas]);

  return <span className={`zywa ${kierunek ?? ""} ${className}`}>{format(pokazana)}</span>;
}

/** Bieżący czas odświeżany co `co` ms (zegary odliczające do terminu). */
export function useTeraz(co = 1000): number {
  const [teraz, setTeraz] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setTeraz(Date.now()), co);
    return () => window.clearInterval(id);
  }, [co]);
  return teraz;
}

/** Czy element jest teraz w oknie przeglądarki (np. panel prognozy na telefonie). Zwraca ref do podpięcia i stan. */
export function useWidoczny<T extends Element>(): [(el: T | null) => void, boolean] {
  const [el, setEl] = useState<T | null>(null);
  const [widoczny, setWidoczny] = useState(true);
  useEffect(() => {
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([wpis]) => setWidoczny(wpis.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [el]);
  return [setEl, widoczny];
}

/** Rozbłysk po przyjętej prognozie: kilkanaście drobin rozchodzących się z jednego punktu (ruch w arkuszu). */
export function Iskry() {
  return (
    <span className="iskry" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}
