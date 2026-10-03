// Liczy odsetek umów wykonanych w pierwotnym terminie z pliku data/umowy.csv
// i zapisuje wynik do src/dane/terminowosc.json (czyta go aplikacja).
//
// Plik CSV wypełnia skrypt zamowienia.ts (API BZP) albo człowiek, ręcznie.
// Kolumny: numer_ogloszenia,data_publikacji,zamawiajacy,wykonawca,przedmiot,rodzaj,w_terminie,link
//   rodzaj:     "roboty budowlane" | "dostawy" | "usługi"
//   w_terminie: "tak" | "nie"   (puste = pomijamy wiersz, nie zgadujemy)
//
// Użycie: npm run terminowosc [-- --plik=data/umowy.csv]

import fs from "node:fs";
import path from "node:path";

export interface Umowa {
  numer_ogloszenia: string;
  data_publikacji: string;
  zamawiajacy: string;
  wykonawca: string;
  przedmiot: string;
  rodzaj: string;
  w_terminie: string;
  link: string;
}

export const KOLUMNY: (keyof Umowa)[] = [
  "numer_ogloszenia",
  "data_publikacji",
  "zamawiajacy",
  "wykonawca",
  "przedmiot",
  "rodzaj",
  "w_terminie",
  "link",
];

/** Prosty parser CSV (przecinek, cudzysłowy, nowe linie w polach). */
export function parsujCsv(tekst: string): string[][] {
  const wiersze: string[][] = [];
  let wiersz: string[] = [];
  let pole = "";
  let wCudzyslowie = false;
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i];
    if (wCudzyslowie) {
      if (c === '"') {
        if (tekst[i + 1] === '"') {
          pole += '"';
          i++;
        } else wCudzyslowie = false;
      } else pole += c;
    } else if (c === '"') wCudzyslowie = true;
    else if (c === ",") {
      wiersz.push(pole);
      pole = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && tekst[i + 1] === "\n") i++;
      wiersz.push(pole);
      pole = "";
      if (wiersz.some((x) => x.trim() !== "")) wiersze.push(wiersz);
      wiersz = [];
    } else pole += c;
  }
  wiersz.push(pole);
  if (wiersz.some((x) => x.trim() !== "")) wiersze.push(wiersz);
  return wiersze;
}

export function csvPole(x: string): string {
  const s = x ?? "";
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function wczytajUmowy(plik: string): Umowa[] {
  if (!fs.existsSync(plik)) return [];
  const [naglowek, ...dane] = parsujCsv(fs.readFileSync(plik, "utf8"));
  if (!naglowek) return [];
  const idx = new Map(naglowek.map((k, i) => [k.trim(), i]));
  const brak = KOLUMNY.filter((k) => !idx.has(k));
  if (brak.length) throw new Error(`W ${plik} brakuje kolumn: ${brak.join(", ")}`);
  return dane.map((w) => {
    const u = {} as Umowa;
    for (const k of KOLUMNY) u[k] = (w[idx.get(k)!] ?? "").trim();
    return u;
  });
}

function tak(x: string): boolean | null {
  const s = x.trim().toLowerCase();
  if (["tak", "t", "yes", "true", "1"].includes(s)) return true;
  if (["nie", "n", "no", "false", "0"].includes(s)) return false;
  return null;
}

export function policzTerminowosc(umowy: Umowa[], zrodloOpis: string) {
  const liczone = umowy.filter((u) => tak(u.w_terminie) !== null);
  const pominiete = umowy.length - liczone.length;
  const grupa = (lista: Umowa[]) => {
    const w_terminie = lista.filter((u) => tak(u.w_terminie) === true).length;
    return { liczba: lista.length, w_terminie, odsetek: lista.length ? w_terminie / lista.length : null };
  };
  const roboty = liczone.filter((u) => /robot/i.test(u.rodzaj));
  const wykonawcy = new Map<string, { umowy: number; w_terminie: number }>();
  for (const u of liczone) {
    const k = u.wykonawca || "(brak wykonawcy)";
    const w = wykonawcy.get(k) ?? { umowy: 0, w_terminie: 0 };
    w.umowy++;
    if (tak(u.w_terminie)) w.w_terminie++;
    wykonawcy.set(k, w);
  }
  const daty = liczone.map((u) => u.data_publikacji).filter(Boolean).sort();
  const uwagi: string[] = [];
  if (pominiete) uwagi.push(`${pominiete} wierszy bez wartości w kolumnie w_terminie pominięto (nie zgadujemy).`);
  if (liczone.length === 0) uwagi.push("Brak danych: plik data/umowy.csv jest pusty.");
  return {
    wygenerowano: liczone.length ? new Date().toISOString() : null,
    zrodlo: zrodloOpis,
    zakres: daty.length ? { od: daty[0], do: daty[daty.length - 1] } : null,
    zamawiajacy: [...new Set(liczone.map((u) => u.zamawiajacy).filter(Boolean))].sort(),
    ogolem: grupa(liczone),
    roboty_budowlane: grupa(roboty),
    wykonawcy: [...wykonawcy.entries()]
      .map(([wykonawca, w]) => ({ wykonawca, ...w }))
      .sort((a, b) => b.umowy - a.umowy || a.wykonawca.localeCompare(b.wykonawca, "pl")),
    uwagi,
  };
}

export function zapiszTerminowosc(wynik: ReturnType<typeof policzTerminowosc>, katalog = process.cwd()) {
  const cel = path.join(katalog, "src", "dane", "terminowosc.json");
  fs.writeFileSync(cel, JSON.stringify(wynik, null, 2) + "\n");
  return cel;
}

function main() {
  const arg = process.argv.find((a) => a.startsWith("--plik="));
  const plik = path.resolve(arg ? arg.slice("--plik=".length) : "data/umowy.csv");
  const umowy = wczytajUmowy(plik);
  const wynik = policzTerminowosc(
    umowy,
    "Biuletyn Zamówień Publicznych, ogłoszenia o wykonaniu umowy (https://ezamowienia.gov.pl/mo-client-board/bzp/list)",
  );
  const cel = zapiszTerminowosc(wynik);
  console.log(`Umów z decyzją: ${wynik.ogolem.liczba}, w terminie: ${wynik.ogolem.w_terminie}` +
    (wynik.ogolem.odsetek != null ? ` (${Math.round(wynik.ogolem.odsetek * 100)}%)` : ""));
  console.log(`Roboty budowlane: ${wynik.roboty_budowlane.liczba}, w terminie: ${wynik.roboty_budowlane.w_terminie}` +
    (wynik.roboty_budowlane.odsetek != null ? ` (${Math.round(wynik.roboty_budowlane.odsetek * 100)}%)` : ""));
  for (const u of wynik.uwagi) console.log(`Uwaga: ${u}`);
  console.log(`Zapisano ${cel}`);
}

if (process.argv[1] && /terminowosc\.ts$/.test(process.argv[1])) main();
