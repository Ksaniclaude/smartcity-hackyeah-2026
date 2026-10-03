/** Polska odmiana: odmien(3, "prognoza", "prognozy", "prognoz") → "3 prognozy". */
export function odmien(n: number, jeden: string, kilka: string, wiele: string): string {
  const abs = Math.abs(n);
  const r10 = abs % 10;
  const r100 = abs % 100;
  let forma = wiele;
  if (abs === 1) forma = jeden;
  else if (r10 >= 2 && r10 <= 4 && (r100 < 12 || r100 > 14)) forma = kilka;
  return `${n} ${forma}`;
}

/** Próg odsłonięcia kursu słowami: „po pierwszej prognozie”, „po 10 prognozach”. */
export function poPrognozach(n: number): string {
  return n === 1 ? "po pierwszej prognozie" : `po ${n} prognozach`;
}

export function punkty(n: number): string {
  return odmien(Math.round(n), "punkt", "punkty", "punktów");
}

/** Liczba z odstępem tysięcy, bez miejsc po przecinku: 1240 → "1 240". */
export function liczba(n: number, miejsca = 0): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: miejsca, minimumFractionDigits: miejsca }).format(n);
}

/** "1 240 pkt" */
export function pkt(n: number, miejsca = 0): string {
  return `${liczba(n, miejsca)} pkt`;
}

/** Względny czas po polsku: "przed chwilą", "5 min temu", "2 godz. temu", "3 dni temu". */
export function czasTemu(iso: string, teraz = Date.now()): string {
  const s = Math.max(0, Math.round((teraz - new Date(iso).getTime()) / 1000));
  if (s < 45) return "przed chwilą";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min temu`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} godz. temu`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} ${d === 1 ? "dzień" : "dni"} temu`;
  return new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" });
}

const DZIEN = 24 * 60 * 60 * 1000;

/** Koniec dnia terminu w czasie lokalnym (rynek trwa do końca tego dnia). */
export function koniecTerminu(termin: string): number {
  return new Date(`${termin}T23:59:59`).getTime();
}

/** Dni kalendarzowe do terminu: 0 = dziś, 1 = jutro, ujemne = po terminie. */
export function dniDo(termin: string, teraz = Date.now()): number {
  const dzis = new Date(teraz);
  dzis.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${termin}T00:00:00`).getTime() - dzis.getTime()) / DZIEN);
}

/** Pilność terminu: steruje kolorem zegara i paska czasu. */
export type Pilnosc = "spokojnie" | "wkrotce" | "zaraz" | "minal";

/** Termin słowami: „kończy się jutro”, „jeszcze 12 dni”, a dla odległych sama data. */
export function opisTerminu(termin: string, teraz = Date.now()): { tekst: string; pilnosc: Pilnosc } {
  const d = dniDo(termin, teraz);
  if (d < 0) return { tekst: "termin minął", pilnosc: "minal" };
  if (d === 0) return { tekst: "kończy się dziś", pilnosc: "zaraz" };
  if (d === 1) return { tekst: "kończy się jutro", pilnosc: "zaraz" };
  if (d <= 45) return { tekst: `jeszcze ${d} dni`, pilnosc: d <= 7 ? "wkrotce" : "spokojnie" };
  const data = new Date(`${termin}T12:00:00`).toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" });
  return { tekst: `do ${data.replace(".", "")}`, pilnosc: "spokojnie" };
}

/** Jaka część czasu rynku już minęła (0–1): od otwarcia do końca dnia terminu. */
export function ulamekCzasu(odKiedy: string, termin: string, teraz = Date.now()): number {
  const start = new Date(odKiedy).getTime();
  const koniec = koniecTerminu(termin);
  if (!Number.isFinite(start) || koniec <= start) return 1;
  return Math.max(0, Math.min(1, (teraz - start) / (koniec - start)));
}

/** Odliczanie „GG:MM:SS” do podanej chwili (godziny mogą przekroczyć 24). */
export function odliczanie(doKiedy: number, teraz = Date.now()): string {
  const s = Math.max(0, Math.floor((doKiedy - teraz) / 1000));
  const dwa = (n: number) => String(n).padStart(2, "0");
  return `${dwa(Math.floor(s / 3600))}:${dwa(Math.floor((s % 3600) / 60))}:${dwa(s % 60)}`;
}

/** Zmiana kursu w punktach procentowych (zaokrąglona); null, gdy nie ma czego porównać. */
export function zmianaPp(teraz: number | null | undefined, wczesniej: number | null | undefined): number | null {
  if (teraz == null || wczesniej == null) return null;
  return Math.round((teraz - wczesniej) * 100);
}

/** Numer koloru awatara (1–6) wyliczony z nicku, żeby ten sam gracz miał zawsze ten sam kolor. */
export function kolorAwatara(nick: string): number {
  let h = 0;
  for (const z of nick) h = (h * 31 + (z.codePointAt(0) ?? 0)) % 9973;
  return (h % 6) + 1;
}

/** Inicjały do awatara: "krowodrza_42" → "KR". */
export function inicjaly(nick: string): string {
  const czyste = nick.replace(/[^\p{L}\p{N}]/gu, "");
  return (czyste.slice(0, 2) || "??").toUpperCase();
}
