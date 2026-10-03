// Dane z Biuletynu Zamówień Publicznych (ezamowienia.gov.pl): ogłoszenia o
// wykonaniu umowy krakowskich jednostek miejskich → odsetek umów wykonanych
// w pierwotnym terminie (osobno roboty budowlane) + tabela wykonawców.
//
// Nazw parametrów wyszukiwarki ani nazwy typu ogłoszenia NIE zakładamy z góry:
// skrypt je odkrywa, wywołując API, i wypisuje, co znalazł. Każdy etap, którego
// nie da się ustalić automatycznie, kończy się czytelnym komunikatem i poleceniem,
// jak podać wartość ręcznie. Skrypt nigdy nie wymyśla danych: wiersze bez
// jednoznacznej odpowiedzi „w terminie: tak/nie” zostają puste i są pomijane.
//
// Użycie:
//   npm run zamowienia -- --od=2024-01-01 --do=2025-12-31
//   npm run zamowienia -- --tylko-odkrywanie            (etapy 1–3, bez pobierania)
//   npm run zamowienia -- --typ=NazwaTypu --max-stron=200
//   npm run zamowienia -- --szczegoly="https://.../{numer}" (własny adres szczegółów)
//
// Wynik: data/umowy.csv, data/surowe/*.json, src/dane/terminowosc.json.
// Gdy API nie odpowiada: wypełnij data/umowy.csv ręcznie i uruchom `npm run terminowosc`.

import fs from "node:fs";
import path from "node:path";
import { csvPole, KOLUMNY, policzTerminowosc, zapiszTerminowosc, type Umowa } from "./terminowosc";

const BAZA = "https://ezamowienia.gov.pl/mo-board/api/v1";
const SEARCH = `${BAZA}/Board/Search`;
const KANDYDACI_SWAGGER = [
  "https://ezamowienia.gov.pl/mo-board/swagger/v1/swagger.json",
  "https://ezamowienia.gov.pl/mo-board/swagger/swagger.json",
];

// Krakowskie jednostki miejskie: dopasowanie po nazwie zamawiającego (regexy do
// poprawienia po pierwszym uruchomieniu: skrypt wypisuje wszystkie nazwy z Krakowa).
const JEDNOSTKI_MIEJSKIE = [
  /gmina miejska krak[oó]w/i,
  /urz[aą]d miasta krakowa/i,
  /zarz[aą]d dr[oó]g miasta krakowa/i,
  /zarz[aą]d inwestycji miejskich/i,
  /zarz[aą]d zieleni miejskiej/i,
  /zarz[aą]d transportu publicznego/i,
  /zarz[aą]d budynk[oó]w komunalnych/i,
  /zarz[aą]d cmentarzy komunalnych/i,
  /zarz[aą]d infrastruktury sportowej/i,
  /klimat[- ]energia[- ]gospodarka wodna/i,
  /miejski o[sś]rodek pomocy spo[lł]ecznej w krakowie/i,
  /miejskie centrum obs[lł]ugi o[sś]wiaty/i,
  /krakowskie biuro festiwalowe/i,
  /stra[zż] miejska miasta krakowa/i,
  /miejskie przedsi[eę]biorstwo .*krak/i,
  /miejska infrastruktura/i,
];
const WYKLUCZ = /uniwersytet|politechnika|akademia|szpital|wojew[oó]d|powiat|s[aą]d |prokuratura|instytut|narodow|skarb|minister|policj|wojsk|lasy pa[nń]stwowe|izba|gddkia|pkp|ko[sś]ci[oó]|parafia/i;

type Json = Record<string, unknown>;
const arg = (nazwa: string): string | undefined => {
  const a = process.argv.find((x) => x.startsWith(`--${nazwa}=`));
  return a ? a.slice(nazwa.length + 3) : undefined;
};
const flaga = (nazwa: string) => process.argv.includes(`--${nazwa}`);

const OD = arg("od") ?? `${new Date().getFullYear() - 1}-01-01`;
const DO = arg("do") ?? new Date().toISOString().slice(0, 10);
const MAX_STRON = Number(arg("max-stron") ?? 400);
const ROZMIAR = Number(arg("rozmiar") ?? 100);

async function pobierz(url: string, init?: RequestInit, ms = 30000): Promise<{ status: number; tekst: string; json: unknown }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal, headers: { Accept: "application/json, text/html;q=0.5", ...(init?.headers ?? {}) } });
    const tekst = await r.text();
    let json: unknown = null;
    try {
      json = JSON.parse(tekst);
    } catch {
      json = null;
    }
    return { status: r.status, tekst, json };
  } finally {
    clearTimeout(t);
  }
}

function znajdzKlucz(obiekt: Json, wzor: RegExp): string | undefined {
  return Object.keys(obiekt).find((k) => wzor.test(k));
}

function listaZOdpowiedzi(json: unknown): Json[] | null {
  if (Array.isArray(json)) return json as Json[];
  if (json && typeof json === "object") {
    for (const k of ["items", "Items", "data", "Data", "results", "Results", "notices", "Notices", "content"]) {
      const v = (json as Json)[k];
      if (Array.isArray(v)) return v as Json[];
    }
  }
  return null;
}

// --- etap 1: opis API ---------------------------------------------------------
async function etapSwagger() {
  for (const url of KANDYDACI_SWAGGER) {
    try {
      const r = await pobierz(url);
      if (r.status === 200 && r.json && typeof r.json === "object") {
        console.log(`\n[1] Opis API: ${url}`);
        const sw = r.json as Json;
        const paths = (sw.paths ?? {}) as Record<string, Json>;
        for (const [p, metody] of Object.entries(paths)) {
          if (!/search|notice/i.test(p)) continue;
          for (const [m, def] of Object.entries(metody as Record<string, Json>)) {
            const params = (def.parameters ?? []) as Json[];
            console.log(`  ${m.toUpperCase()} ${p}`);
            for (const par of params) {
              const schema = (par.schema ?? {}) as Json;
              const typ = schema.$ref ? String(schema.$ref).split("/").pop() : (schema.type ?? "");
              console.log(`     - ${par.name} (${par.in}) ${typ}${schema.enum ? " enum: " + (schema.enum as string[]).join("|") : ""}`);
            }
          }
        }
        const schemas = ((sw.components as Json | undefined)?.schemas ?? (sw.definitions ?? {})) as Record<string, Json>;
        for (const [nazwa, def] of Object.entries(schemas)) {
          if (/noticetype|type/i.test(nazwa) && Array.isArray(def.enum)) {
            console.log(`  enum ${nazwa}: ${(def.enum as string[]).join(" | ")}`);
          }
        }
        return sw;
      }
      console.log(`[1] ${url}: HTTP ${r.status} (bez opisu API)`);
    } catch (e) {
      console.log(`[1] ${url}: ${(e as Error).message}`);
    }
  }
  console.log("[1] Nie znaleziono opisu API. Idziemy dalej metodą prób.");
  return null;
}

// --- etap 2: które parametry rozumie wyszukiwarka ------------------------------
interface Wariant {
  nazwa: string;
  url: (p: Record<string, string | number>) => string;
  init?: (p: Record<string, string | number>) => RequestInit;
}

function warianty(): Wariant[] {
  const q = (p: Record<string, string | number>) => new URLSearchParams(Object.entries(p).map(([k, v]) => [k, String(v)])).toString();
  return [
    { nazwa: "GET PascalCase", url: (p) => `${SEARCH}?${q(p)}` },
    {
      nazwa: "GET camelCase",
      url: (p) => `${SEARCH}?${q(Object.fromEntries(Object.entries(p).map(([k, v]) => [k[0].toLowerCase() + k.slice(1), v])))}`,
    },
    {
      nazwa: "POST JSON",
      url: () => SEARCH,
      init: (p) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) }),
    },
  ];
}

async function etapProbka(): Promise<{ wariant: Wariant; probka: Json[]; kluczTypu?: string } | null> {
  const bazowe = { PageSize: 20, PageNumber: 1, PublicationDateFrom: `${OD}T00:00:00`, PublicationDateTo: `${DO}T23:59:59` };
  const zestawy: Record<string, string | number>[] = [bazowe, { PageSize: 20, PageNumber: 1 }];
  for (const w of warianty()) {
    for (const z of zestawy) {
      try {
        const r = await pobierz(w.url(z), w.init?.(z));
        const lista = listaZOdpowiedzi(r.json);
        console.log(`[2] ${w.nazwa} ${JSON.stringify(Object.keys(z))}: HTTP ${r.status}${lista ? `, ${lista.length} wyników` : ""}`);
        if (r.status === 200 && lista && lista.length > 0) {
          const pierwsze = lista[0];
          console.log(`[2] Pola ogłoszenia: ${Object.keys(pierwsze).join(", ")}`);
          const kluczTypu = znajdzKlucz(pierwsze, /^noticeType$|noticeType|^type$/i);
          return { wariant: w, probka: lista, kluczTypu };
        }
        if (r.status !== 200 && r.tekst) console.log(`    odpowiedź: ${r.tekst.slice(0, 300).replace(/\s+/g, " ")}`);
      } catch (e) {
        console.log(`[2] ${w.nazwa}: ${(e as Error).message}`);
      }
    }
  }
  return null;
}

// --- etap 3: typ ogłoszenia o wykonaniu umowy -----------------------------------
async function etapTyp(w: Wariant, kluczTypu: string | undefined): Promise<string | null> {
  const podany = arg("typ");
  if (podany) {
    console.log(`[3] Typ ogłoszenia podany ręcznie: ${podany}`);
    return podany;
  }
  if (!kluczTypu) {
    console.log("[3] W ogłoszeniach nie ma pola z typem. Podaj --typ=... (patrz etap 1) albo wypełnij CSV ręcznie.");
    return null;
  }
  const wartosci = new Map<string, number>();
  for (let strona = 1; strona <= 5; strona++) {
    const p = { PageSize: 100, PageNumber: strona, PublicationDateFrom: `${OD}T00:00:00`, PublicationDateTo: `${DO}T23:59:59` };
    const r = await pobierz(w.url(p), w.init?.(p));
    const lista = listaZOdpowiedzi(r.json) ?? [];
    for (const o of lista) {
      const v = String(o[kluczTypu] ?? "");
      wartosci.set(v, (wartosci.get(v) ?? 0) + 1);
    }
    if (lista.length < 100) break;
  }
  console.log(`[3] Wartości pola ${kluczTypu} w próbce: ${[...wartosci.entries()].map(([k, n]) => `${k} (${n})`).join(", ")}`);
  const pasujace = [...wartosci.keys()].filter((v) => /wykonan|execut|perform|realiz/i.test(v));
  if (pasujace.length === 1) {
    console.log(`[3] Wybieram typ: ${pasujace[0]}`);
    return pasujace[0];
  }
  console.log(
    pasujace.length > 1
      ? `[3] Kilka typów pasuje do „wykonanie umowy”: ${pasujace.join(", ")}. Podaj --typ=...`
      : "[3] Żaden typ w próbce nie wygląda na „ogłoszenie o wykonaniu umowy”. Zobacz enum z etapu 1 i podaj --typ=...",
  );
  return null;
}

// --- etap 4: lista ogłoszeń wybranego typu z Krakowa ----------------------------
function zamawiajacy(o: Json): { nazwa: string; miasto: string } {
  const kN = znajdzKlucz(o, /organizationName|organisationName|contractingAuthorityName|zamawiaj|^organization$|^name$/i);
  const kM = znajdzKlucz(o, /organizationCity|city|miejscowo/i);
  const n = kN ? o[kN] : "";
  return {
    nazwa: typeof n === "object" && n ? String((n as Json).name ?? JSON.stringify(n)) : String(n ?? ""),
    miasto: String(kM ? (o[kM] ?? "") : ""),
  };
}

function jednostkaMiejska(nazwa: string, miasto: string): boolean {
  if (WYKLUCZ.test(nazwa)) return false;
  if (JEDNOSTKI_MIEJSKIE.some((re) => re.test(nazwa))) return true;
  return /krak[oó]w/i.test(miasto) && /krak[oó]w/i.test(nazwa) && /gmin|miast|miejsk|zarz[aą]d/i.test(nazwa);
}

async function etapLista(w: Wariant, kluczTypu: string | undefined, typ: string): Promise<Json[]> {
  const wynik: Json[] = [];
  const nazwyKrakow = new Map<string, number>();
  for (let strona = 1; strona <= MAX_STRON; strona++) {
    const p: Record<string, string | number> = {
      PageSize: ROZMIAR,
      PageNumber: strona,
      PublicationDateFrom: `${OD}T00:00:00`,
      PublicationDateTo: `${DO}T23:59:59`,
    };
    p[kluczTypu ? kluczTypu[0].toUpperCase() + kluczTypu.slice(1) : "NoticeType"] = typ;
    const r = await pobierz(w.url(p), w.init?.(p));
    const lista = listaZOdpowiedzi(r.json);
    if (r.status !== 200 || !lista) {
      console.log(`[4] strona ${strona}: HTTP ${r.status}, przerywam. ${r.tekst.slice(0, 200)}`);
      break;
    }
    for (const o of lista) {
      if (kluczTypu && String(o[kluczTypu]) !== typ) continue;
      const z = zamawiajacy(o);
      if (/krak[oó]w/i.test(z.miasto) || /krak[oó]w/i.test(z.nazwa)) nazwyKrakow.set(z.nazwa, (nazwyKrakow.get(z.nazwa) ?? 0) + 1);
      if (jednostkaMiejska(z.nazwa, z.miasto)) wynik.push(o);
    }
    process.stdout.write(`\r[4] strona ${strona}: ${lista.length} ogłoszeń, z jednostek miejskich Krakowa razem: ${wynik.length}   `);
    if (lista.length < ROZMIAR) break;
  }
  console.log();
  console.log("[4] Zamawiający z Krakowa w wynikach (liczba ogłoszeń) — popraw JEDNOSTKI_MIEJSKIE, jeśli trzeba:");
  for (const [n, c] of [...nazwyKrakow.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${jednostkaMiejska(n, "Kraków") ? "✓" : " "} ${n} (${c})`);
  }
  return wynik;
}

// --- etap 5: szczegóły ogłoszenia ----------------------------------------------
function identyfikatory(o: Json): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(o)) {
    if (/noticeNumber|bzpNumber|number|objectId|^id$|noticeId|uuid/i.test(k) && (typeof o[k] === "string" || typeof o[k] === "number")) {
      out[k] = String(o[k]);
    }
  }
  return out;
}

function kandydaciSzczegolow(o: Json): string[] {
  const wlasny = arg("szczegoly");
  const ids = identyfikatory(o);
  const numer = ids.noticeNumber ?? ids.bzpNumber ?? ids.number ?? "";
  const id = ids.objectId ?? ids.id ?? ids.noticeId ?? ids.uuid ?? "";
  const lista: string[] = [];
  if (wlasny) lista.push(wlasny.replace("{numer}", encodeURIComponent(numer)).replace("{id}", encodeURIComponent(id)));
  if (numer) {
    lista.push(`${BAZA}/Board/Notice?noticeNumber=${encodeURIComponent(numer)}`);
    lista.push(`${BAZA}/Notice?noticeNumber=${encodeURIComponent(numer)}`);
    lista.push(`${BAZA}/Board/GetNoticeByNumber?noticeNumber=${encodeURIComponent(numer)}`);
  }
  if (id) {
    lista.push(`${BAZA}/Board/Notice/${encodeURIComponent(id)}`);
    lista.push(`${BAZA}/Notice/${encodeURIComponent(id)}`);
    lista.push(`${BAZA}/Board/${encodeURIComponent(id)}`);
    lista.push(`https://ezamowienia.gov.pl/mo-client-board/api/v1/notice/${encodeURIComponent(id)}`);
  }
  return lista;
}

function wyciagnij(tresc: string, obiekt: Json | null): Partial<Umowa> {
  const plaski = obiekt ? JSON.stringify(obiekt) : tresc;
  const tekst = plaski.replace(/<[^>]+>/g, " ").replace(/\\n|\\t|&nbsp;/g, " ").replace(/\s+/g, " ");
  const out: Partial<Umowa> = {};
  // „Czy umowa została wykonana w (pierwotnie określonym) terminie: Tak/Nie”
  const m = tekst.match(/wykonan[aoe]\s+(w\s+)?(pierwotn\w*\s+(okre[sś]lon\w*\s+)?)?terminie[^a-zA-Z0-9ąćęłńóśźż]{0,60}?(tak|nie)\b/i);
  if (m) out.w_terminie = m[4].toLowerCase();
  if (obiekt) {
    const kT = znajdzKlucz(obiekt, /executedOnTime|onTime|inTime|wTerminie|completedOnTime/i);
    if (kT && typeof obiekt[kT] === "boolean") out.w_terminie = obiekt[kT] ? "tak" : "nie";
    const kR = znajdzKlucz(obiekt, /orderType|contractType|rodzaj/i);
    if (kR && obiekt[kR] != null) out.rodzaj = String(obiekt[kR]);
    const kW = znajdzKlucz(obiekt, /contractor|wykonawc/i);
    if (kW && obiekt[kW] != null) out.wykonawca = typeof obiekt[kW] === "object" ? JSON.stringify(obiekt[kW]) : String(obiekt[kW]);
    const kP = znajdzKlucz(obiekt, /orderObject|orderName|subject|przedmiot|^title$|^name$/i);
    if (kP && obiekt[kP] != null) out.przedmiot = String(obiekt[kP]);
  }
  if (!out.rodzaj) {
    const r = tekst.match(/rodzaj zam[oó]wienia[^a-zA-Z]{0,20}(roboty budowlane|dostawy|us[lł]ugi)/i);
    if (r) out.rodzaj = r[1].toLowerCase();
  }
  if (!out.wykonawca) {
    const r = tekst.match(/nazwa\s*\(firma\)\s*wykonawcy[^:]{0,40}:\s*([^,;]{3,120})/i) ?? tekst.match(/wykonawc[ay][^:]{0,30}:\s*([^,;]{3,120})/i);
    if (r) out.wykonawca = r[1].trim();
  }
  if (out.rodzaj) out.rodzaj = /robot/i.test(out.rodzaj) ? "roboty budowlane" : /dostaw/i.test(out.rodzaj) ? "dostawy" : /us[lł]ug/i.test(out.rodzaj) ? "usługi" : out.rodzaj;
  return out;
}

async function etapSzczegoly(lista: Json[]): Promise<Umowa[]> {
  const katalog = path.resolve("data/surowe");
  fs.mkdirSync(katalog, { recursive: true });
  let dzialajacy: ((o: Json) => string) | null = null;
  const umowy: Umowa[] = [];
  let i = 0;
  for (const o of lista) {
    i++;
    const ids = identyfikatory(o);
    const numer = ids.noticeNumber ?? ids.bzpNumber ?? ids.number ?? ids.objectId ?? ids.id ?? String(i);
    const z = zamawiajacy(o);
    const kD = znajdzKlucz(o, /publicationDate|publishDate|date/i);
    const umowa: Umowa = {
      numer_ogloszenia: numer,
      data_publikacji: String(kD ? (o[kD] ?? "") : "").slice(0, 10),
      zamawiajacy: z.nazwa,
      wykonawca: "",
      przedmiot: "",
      rodzaj: "",
      w_terminie: "",
      link: `https://ezamowienia.gov.pl/mo-client-board/bzp/notice-details/${encodeURIComponent(ids.objectId ?? ids.id ?? numer)}`,
    };
    const zListy = wyciagnij("", o);
    Object.assign(umowa, Object.fromEntries(Object.entries(zListy).filter(([, v]) => v)));

    let szczegoly: { status: number; tekst: string; json: unknown } | null = null;
    const kandydaci = dzialajacy ? [dzialajacy(o)] : kandydaciSzczegolow(o);
    for (const url of kandydaci) {
      try {
        const r = await pobierz(url);
        if (r.status === 200 && r.tekst.length > 200) {
          szczegoly = r;
          if (!dzialajacy) {
            console.log(`[5] Szczegóły działają pod: ${url}`);
            const szablon = url;
            dzialajacy = (x) => {
              const ix = identyfikatory(x);
              return szablon
                .replace(encodeURIComponent(numer), encodeURIComponent(ix.noticeNumber ?? ix.bzpNumber ?? ix.number ?? ix.objectId ?? ix.id ?? ""))
                .replace(encodeURIComponent(ids.objectId ?? ids.id ?? "\u0000"), encodeURIComponent(ix.objectId ?? ix.id ?? ""));
            };
          }
          break;
        }
      } catch {
        /* następny kandydat */
      }
    }
    if (szczegoly) {
      fs.writeFileSync(path.join(katalog, `${numer.replace(/[^\w.-]+/g, "_")}.json`), szczegoly.json ? JSON.stringify(szczegoly.json, null, 2) : szczegoly.tekst);
      const w = wyciagnij(szczegoly.tekst, (szczegoly.json && typeof szczegoly.json === "object" ? (szczegoly.json as Json) : null));
      Object.assign(umowa, Object.fromEntries(Object.entries(w).filter(([, v]) => v)));
    } else if (i === 1) {
      console.log("[5] Żaden adres szczegółów nie odpowiedział. Podaj --szczegoly=\"https://...{numer}...\" (albo {id}).");
    }
    umowy.push(umowa);
    process.stdout.write(`\r[5] ${i}/${lista.length} ogłoszeń, z decyzją w_terminie: ${umowy.filter((u) => u.w_terminie).length}   `);
  }
  console.log();
  return umowy;
}

function zapiszCsv(umowy: Umowa[]) {
  const plik = path.resolve("data/umowy.csv");
  const linie = [KOLUMNY.join(","), ...umowy.map((u) => KOLUMNY.map((k) => csvPole(u[k])).join(","))];
  fs.writeFileSync(plik, linie.join("\n") + "\n");
  return plik;
}

async function main() {
  console.log(`Zakres publikacji: ${OD} – ${DO}. Wyszukiwarka: ${SEARCH}`);
  await etapSwagger();
  const probka = await etapProbka();
  if (!probka) {
    console.error("\nAPI nie odpowiada żadnym znanym wariantem. Wypełnij data/umowy.csv ręcznie i uruchom `npm run terminowosc`.");
    process.exit(2);
  }
  const typ = await etapTyp(probka.wariant, probka.kluczTypu);
  if (flaga("tylko-odkrywanie")) {
    console.log("\nPrzykładowe ogłoszenie z próbki:\n" + JSON.stringify(probka.probka[0], null, 2).slice(0, 2000));
    return;
  }
  if (!typ) process.exit(3);
  const lista = await etapLista(probka.wariant, probka.kluczTypu, typ);
  if (lista.length === 0) {
    console.error("Brak ogłoszeń jednostek miejskich Krakowa w tym zakresie. Zmień --od/--do albo popraw JEDNOSTKI_MIEJSKIE.");
    process.exit(4);
  }
  const umowy = await etapSzczegoly(lista);
  const plik = zapiszCsv(umowy);
  console.log(`Zapisano ${umowy.length} wierszy do ${plik}`);
  const wynik = policzTerminowosc(
    umowy,
    `Biuletyn Zamówień Publicznych, ogłoszenia o wykonaniu umowy (${typ}), publikacja ${OD} – ${DO}, wyszukiwarka ${SEARCH}`,
  );
  const cel = zapiszTerminowosc(wynik);
  console.log(
    `Umów z decyzją: ${wynik.ogolem.liczba}, w terminie: ${wynik.ogolem.w_terminie}` +
      (wynik.ogolem.odsetek != null ? ` (${Math.round(wynik.ogolem.odsetek * 100)}%)` : "") +
      `; roboty budowlane: ${wynik.roboty_budowlane.liczba}` +
      (wynik.roboty_budowlane.odsetek != null ? ` (${Math.round(wynik.roboty_budowlane.odsetek * 100)}% w terminie)` : ""),
  );
  for (const u of wynik.uwagi) console.log(`Uwaga: ${u}`);
  console.log(`Zapisano ${cel}`);
  if (wynik.ogolem.liczba < umowy.length / 2) {
    console.log(
      "Większość ogłoszeń nie ma rozpoznanej odpowiedzi „w terminie”. Zajrzyj do data/surowe/*.json i popraw wzorce w funkcji wyciagnij() albo uzupełnij CSV ręcznie.",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
