import { useEffect, useRef, useState } from "react";

/** Czy gracz prosi system o ograniczenie ruchu (wtedy liczby zmieniają się skokowo, a efekty są pomijane). */
export function bezRuchu(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Liczba, która po zmianie wartości dochodzi płynnie do nowej i na chwilę dostaje klasę kierunku
 * (`gora` / `dol`), więc zmiana kursu z odpytywania jest widoczna. Pierwsze wyświetlenie jest bez animacji,
 * chyba że podano `od`: wtedy liczba startuje od tej wartości (np. saldo od zera po rejestracji).
 */
export function LiczbaZywa({
  wartosc,
  format,
  className = "",
  czas = 450,
  od,
}: {
  wartosc: number;
  format: (n: number) => string;
  className?: string;
  czas?: number;
  od?: number;
}) {
  const start = od ?? wartosc;
  const [pokazana, setPokazana] = useState(start);
  const [kierunek, setKierunek] = useState<"gora" | "dol" | null>(null);
  /** Wartość, która jest teraz na ekranie: od niej rusza każda kolejna animacja (także przerwana w połowie). */
  const biezaca = useRef(start);

  useEffect(() => {
    const skad = biezaca.current;
    if (skad === wartosc) return;
    setKierunek(wartosc > skad ? "gora" : "dol");
    const gasnie = window.setTimeout(() => setKierunek(null), Math.max(1100, czas + 300));
    if (bezRuchu()) {
      biezaca.current = wartosc;
      setPokazana(wartosc);
      return () => window.clearTimeout(gasnie);
    }
    const poczatek = performance.now();
    let klatka = 0;
    const krok = (t: number) => {
      const u = Math.min(1, (t - poczatek) / czas);
      const v = u < 1 ? skad + (wartosc - skad) * (1 - Math.pow(1 - u, 3)) : wartosc;
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

/* ---------- efekty wartości ----------
 * Odpowiedź interfejsu na kliknięcia, które kosztują albo dają punkty: monety przelatujące między saldem
 * a zakładem, fala uderzenia, drobiny, unoszona liczba, podbicie elementu. Wszystko dzieje się na jednej warstwie
 * nad stroną (.efekty) i tylko w reakcji na akcję gracza; kolory są w arkuszu, tutaj sama geometria.
 */

type Punkt = { x: number; y: number };
type Cel = Element | Punkt;

function srodek(cel: Cel): Punkt {
  if (!(cel instanceof Element)) return cel;
  const r = cel.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function warstwa(): HTMLElement {
  let w = document.querySelector<HTMLElement>(".efekty");
  if (!w) {
    w = document.createElement("div");
    w.className = "efekty";
    w.setAttribute("aria-hidden", "true");
    document.body.appendChild(w);
  }
  return w;
}

const los = (od: number, ku: number) => od + Math.random() * (ku - od);

/** Krótka wibracja na telefonie (tam, gdzie przeglądarka ją udostępnia). */
export function wibruj(wzor: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(wzor);
}

const podbicia = new WeakMap<Element, Animation>();

/** Podbicie: element na moment rośnie i wraca. `moc` 1 to zwykłe kliknięcie, więcej dla większych stawek. */
export function podbij(el: Element | null, moc = 1) {
  if (!el || bezRuchu()) return;
  podbicia.get(el)?.cancel();
  const skala = 1 + 0.07 * moc;
  podbicia.set(
    el,
    el.animate([{ transform: "scale(1)" }, { transform: `scale(${skala})`, offset: 0.35 }, { transform: "scale(1)" }], {
      duration: 260 + 60 * moc,
      easing: "cubic-bezier(0.2, 0.9, 0.3, 1.3)",
    }),
  );
}

/** Krótkie drgnięcie w poziomie: uderzenie, gdy zakład ląduje w panelu. */
export function wstrzasnij(el: Element | null) {
  if (!el || bezRuchu()) return;
  el.animate(
    [0, -5, 4, -3, 2, 0].map((x) => ({ transform: `translateX(${x}px)` })),
    { duration: 280, easing: "ease-out" },
  );
}

/** Fala uderzenia: pierścień rozchodzący się z punktu do `promien` px (kolor wg klasy: tak, nie, trzeci albo żółty). */
export function fala(cel: Cel, klasa = "", promien = 110) {
  if (bezRuchu()) return;
  const p = srodek(cel);
  const el = document.createElement("i");
  el.className = `fala ${klasa}`;
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;
  const anim = el.animate(
    [
      { width: "16px", height: "16px", margin: "-8px 0 0 -8px", opacity: 1 },
      { opacity: 0.9, offset: 0.3 },
      { width: `${promien * 2}px`, height: `${promien * 2}px`, margin: `${-promien}px 0 0 ${-promien}px`, opacity: 0 },
    ],
    { duration: 620, easing: "cubic-bezier(0.1, 0.7, 0.3, 1)", fill: "both" },
  );
  anim.onfinish = () => el.remove();
  warstwa().appendChild(el);
}

/** Drobiny wyrzucone z punktu, głównie w górę, opadające z obrotem. `ile` i `moc` rosną ze stawką. */
export function wystrzel(cel: Cel, { ile = 16, moc = 1, klasa = "" }: { ile?: number; moc?: number; klasa?: string } = {}) {
  if (bezRuchu()) return;
  const p = srodek(cel);
  const w = warstwa();
  for (let i = 0; i < ile; i++) {
    const el = document.createElement("i");
    // co trzecia drobina w kolorze odpowiedzi, reszta żółta i jasna; co druga okrągła
    el.className = `drobina ${i % 3 === 0 ? klasa : i % 3 === 1 ? "" : "jasna"} ${i % 2 === 0 ? "okragla" : ""}`;
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    const kat = Math.random() < 0.8 ? los(-Math.PI, 0) : los(0, Math.PI);
    const zasieg = los(50, 150) * moc;
    const dx = Math.cos(kat) * zasieg;
    const dy = Math.sin(kat) * zasieg;
    const obrot = los(-360, 360);
    const anim = el.animate(
      [
        { transform: "translate(0, 0) rotate(0deg) scale(1)", opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) rotate(${obrot}deg) scale(1)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx * 1.15}px, ${dy + los(60, 130)}px) rotate(${obrot * 1.6}deg) scale(0.4)`, opacity: 0 },
      ],
      { duration: los(750, 1150), easing: "cubic-bezier(0.1, 0.8, 0.3, 1)", fill: "both" },
    );
    anim.onfinish = () => el.remove();
    w.appendChild(el);
  }
}

/**
 * Monety lecące łukiem z jednego miejsca w drugie (saldo → zakład, sprzedaż → saldo). Obietnica spełnia się,
 * gdy doleci połowa, żeby dalszy ciąg (kupon, podbicie salda) trafił w moment uderzenia.
 */
export function lecPunkty(od: Cel, dokad: Cel, ile = 10, klasa = ""): Promise<void> {
  if (bezRuchu()) return Promise.resolve();
  const a = srodek(od);
  const b = srodek(dokad);
  const w = warstwa();
  const n = Math.max(4, Math.min(22, Math.round(ile)));
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dl = Math.hypot(dx, dy) || 1;
  return new Promise((gotowe) => {
    let dolecialo = 0;
    for (let i = 0; i < n; i++) {
      const el = document.createElement("i");
      el.className = `moneta ${klasa}`;
      // punkt kontrolny łuku odchylony prostopadle do toru, losowo w obie strony
      const odchyl = los(-0.5, 0.5) * Math.min(240, dl * 0.8);
      const cx = a.x + dx / 2 - (dy / dl) * odchyl;
      const cy = a.y + dy / 2 + (dx / dl) * odchyl;
      el.style.offsetPath = `path("M ${a.x + los(-14, 14)} ${a.y + los(-8, 8)} Q ${cx} ${cy} ${b.x + los(-10, 10)} ${b.y + los(-6, 6)}")`;
      el.style.offsetRotate = "0deg";
      const anim = el.animate(
        [
          { offsetDistance: "0%", transform: "scale(0.3)", opacity: 0 },
          { transform: "scale(1.1)", opacity: 1, offset: 0.18 },
          { offsetDistance: "100%", transform: "scale(0.75)", opacity: 1 },
        ],
        { duration: los(430, 620), delay: i * 26, easing: "cubic-bezier(0.5, 0, 0.3, 1)", fill: "both" },
      );
      anim.onfinish = () => {
        el.remove();
        dolecialo++;
        if (dolecialo === Math.ceil(n / 2)) gotowe();
      };
      w.appendChild(el);
    }
    window.setTimeout(gotowe, 1500); // karta w tle wstrzymuje animacje; nie blokujemy kuponu
  });
}

/**
 * Liczba albo krótki tekst unoszący się znad elementu i znikający („+25”, „+3 pkt proc.”). Z `wDol` tekst
 * wychodzi spod elementu i opada (dla rzeczy przy górnej krawędzi ekranu, np. awatara w nagłówku).
 */
export function uniesTekst(cel: Cel, tekst: string, klasa = "", wDol = false) {
  if (bezRuchu()) return;
  const r = cel instanceof Element ? cel.getBoundingClientRect() : null;
  const p = r ? { x: Math.min(window.innerWidth - 90, r.left + r.width / 2), y: wDol ? r.bottom + 14 : r.top } : (cel as Punkt);
  const k = wDol ? -1 : 1;
  const el = document.createElement("span");
  el.className = `unoszony cyfry ${klasa}`;
  el.textContent = tekst;
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;
  const anim = el.animate(
    [
      { transform: "translate(-50%, 0) scale(0.7)", opacity: 0 },
      { transform: `translate(-50%, ${-14 * k}px) scale(1.15)`, opacity: 1, offset: 0.2 },
      { transform: `translate(-50%, ${-30 * k}px) scale(1)`, opacity: 1, offset: 0.65 },
      { transform: `translate(-50%, ${-46 * k}px) scale(1)`, opacity: 0 },
    ],
    { duration: 1000, easing: "ease-out", fill: "both" },
  );
  anim.onfinish = () => el.remove();
  warstwa().appendChild(el);
}

/** Przyciski, które odpowiadają pluskiem (kręgiem rozchodzącym się spod palca) na dotknięcie. */
const DOTYKALNE =
  ".kup:not(.bez-akcji), .odp-przycisk, .przycisk-postaw, .przycisk, .pigulka, .stawka-chipy button, .powody button, button.wynik, .chip, .zakladka, .przelacznik button, .modal-zakladki button";

/** Jeden nasłuch na całą aplikację: każde dotknięcie przycisku z listy zostawia w nim plusk w miejscu palca. */
export function useEfektyDotyku() {
  useEffect(() => {
    const naDotyk = (e: PointerEvent) => {
      if (bezRuchu() || !(e.target instanceof Element)) return;
      const el = e.target.closest<HTMLElement>(DOTYKALNE);
      if (!el || el.matches(":disabled")) return;
      const r = el.getBoundingClientRect();
      const plusk = document.createElement("span");
      plusk.className = "plusk";
      plusk.setAttribute("aria-hidden", "true");
      plusk.style.left = `${e.clientX - r.left}px`;
      plusk.style.top = `${e.clientY - r.top}px`;
      plusk.addEventListener("animationend", () => plusk.remove(), { once: true });
      el.appendChild(plusk);
    };
    document.addEventListener("pointerdown", naDotyk);
    return () => document.removeEventListener("pointerdown", naDotyk);
  }, []);
}
