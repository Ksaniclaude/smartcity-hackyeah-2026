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

/** Ile dni do terminu (ujemne = po terminie). */
export function dniDo(termin: string, teraz = Date.now()): number {
  const t = new Date(`${termin}T23:59:59`).getTime();
  return Math.ceil((t - teraz) / (24 * 60 * 60 * 1000));
}

/** Inicjały do awatara: "krowodrza_42" → "KR". */
export function inicjaly(nick: string): string {
  const czyste = nick.replace(/[^\p{L}\p{N}]/gu, "");
  return (czyste.slice(0, 2) || "??").toUpperCase();
}
