// Wgrywa pytania startowe z data/pytania_startowe.csv przez te same funkcje RPC,
// których używa panel admina (więc działają te same sprawdzenia).
//
// Użycie:
//   VITE_SUPABASE_URL=... VITE_SUPABASE_KEY=... ADMIN_HASLO=... npx tsx scripts/pytania_startowe.ts [--otworz] [--plik=data/miasta/polska.csv]
//
// Wiersze z „[UZUPEŁNIJ” są pomijane, żeby nie wgrać wymyślonych pytań.
// Kolumna kurs_otwarcia: procenty rozdzielone średnikiem (np. 41;44;15); pusta =
// dla "miasto" odsetek z src/dane/terminowosc.json, dla "luz" 50;50.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parsujCsv } from "./terminowosc";

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_KEY;
const haslo = process.env.ADMIN_HASLO;
if (!url || !key || !haslo) {
  console.error("Ustaw VITE_SUPABASE_URL, VITE_SUPABASE_KEY i ADMIN_HASLO.");
  process.exit(1);
}
const otworz = process.argv.includes("--otworz");
/** Inny plik CSV (np. data/miasta/polska.csv): --plik=ścieżka. Kolumna `miasto` jest opcjonalna (domyślnie Kraków). */
const plikArg = process.argv.find((a) => a.startsWith("--plik="))?.slice(7);

const ODPOWIEDZI: Record<string, string[]> = {
  miasto: ["w terminie", "po terminie", "wstrzymane lub anulowane"],
  luz: ["tak", "nie"],
};

function kursOtwarcia(kategoria: string, tekst: string): number[] {
  if (tekst.trim()) {
    const p = tekst.split(";").map((x) => Number(x.trim()) / 100);
    return p;
  }
  if (kategoria === "luz") return [0.5, 0.5];
  const plik = path.resolve("src/dane/terminowosc.json");
  const t = JSON.parse(fs.readFileSync(plik, "utf8")) as { ogolem: { odsetek: number | null } };
  const w = t.ogolem.odsetek;
  if (w == null) return [0.34, 0.33, 0.33];
  const wstrzymane = Math.min(0.1, (1 - w) / 3);
  return [w, 1 - w - wstrzymane, wstrzymane];
}

async function main() {
  const plik = path.resolve(plikArg ?? "data/pytania_startowe.csv");
  const [naglowek, ...wiersze] = parsujCsv(fs.readFileSync(plik, "utf8"));
  const idx = new Map(naglowek.map((k, i) => [k.trim(), i]));
  const pole = (w: string[], k: string) => (w[idx.get(k) ?? -1] ?? "").trim();

  const supabase = createClient(url!, key!, { auth: { persistSession: false } });
  const sesja = await supabase.auth.signInAnonymously();
  if (sesja.error) throw sesja.error;
  const login = await supabase.rpc("admin_zaloguj", { p_haslo: haslo });
  if (login.error) throw login.error;
  if (!login.data) throw new Error("Złe hasło admina");

  let dodane = 0;
  for (const w of wiersze) {
    const kategoria = pole(w, "kategoria");
    const tresc = pole(w, "tresc");
    const wszystko = [tresc, pole(w, "kryterium"), pole(w, "link_zrodla"), pole(w, "termin")];
    if (wszystko.some((x) => x.includes("[UZUPEŁNIJ") || x === "")) {
      console.log(`pomijam (niewypełnione): ${tresc}`);
      continue;
    }
    const r = await supabase.rpc("admin_dodaj_pytanie", {
      p_tresc: tresc,
      p_kategoria: kategoria,
      p_odpowiedzi: ODPOWIEDZI[kategoria],
      p_kryterium: pole(w, "kryterium"),
      p_link_zrodla: pole(w, "link_zrodla"),
      p_termin: pole(w, "termin"),
      p_kurs_otwarcia: kursOtwarcia(kategoria, pole(w, "kurs_otwarcia")),
      p_otworz: otworz,
      p_miasto: pole(w, "miasto") || "Kraków",
    });
    if (r.error) {
      console.error(`BŁĄD przy „${tresc}”: ${r.error.message}`);
      continue;
    }
    dodane++;
    console.log(`dodano nr ${r.data}: ${tresc}${otworz ? " (otwarte)" : " (propozycja)"}`);
  }
  console.log(`Gotowe: ${dodane} pytań.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
