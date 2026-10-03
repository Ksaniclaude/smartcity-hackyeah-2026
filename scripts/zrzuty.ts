// Podgląd aplikacji bez sieci: dev server Vite + Chromium (playwright-core) na zamockowanym Supabase.
// Robi zrzuty wybranych stron na desktopie i telefonie do stałych plików, więc da się je otwierać
// w kółko po każdej zmianie. W trybie --watch pilnuje katalogu src/ i po każdym zapisie odnawia
// zrzuty (HMR Vite, bez builda), zwykle w sekundę.
//
// Użycie:
//   npm run zrzuty                       # jednorazowo: strony domyślne, dane „żywe”, gość, oba urządzenia
//   npm run zrzuty -- --watch            # trzyma przeglądarkę i odświeża zrzuty po każdej zmianie w src/
//   npm run zrzuty -- --dane=pusty       # stan jak na starcie produkcji: rynki bez prognoz, kursy otwarcia
//   npm run zrzuty -- --gracz            # zalogowany gracz z nickiem i saldem
//   npm run zrzuty -- --motyw=jasny
//   npm run zrzuty -- --strony=/,/pytanie/1,/profil --urzadzenia=desktop
//   npm run zrzuty -- --out=data/zrzuty_dev
//
// Pliki: <out>/<urzadzenie>_<strona>.png, np. data/zrzuty_dev/desktop_rynki.png (nadpisywane).

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright-core";

/* ---------- argumenty ---------- */

const arg = (nazwa: string): string | null => {
  const a = process.argv.find((x) => x === `--${nazwa}` || x.startsWith(`--${nazwa}=`));
  if (!a) return null;
  return a.includes("=") ? a.slice(a.indexOf("=") + 1) : "";
};
const WATCH = arg("watch") != null;
const DANE: "pusty" | "zywy" = arg("dane") === "pusty" ? "pusty" : "zywy";
const GRACZ = arg("gracz") != null;
const MOTYW = arg("motyw") ?? "";
const STRONY = (arg("strony") ?? "/,/pytanie/1,/pytanie/4").split(",").map((s) => s.trim()).filter(Boolean);
const URZADZENIA = (arg("urzadzenia") ?? "desktop,tel").split(",").map((s) => s.trim()).filter(Boolean);
const OUT = path.resolve(arg("out") ?? "data/zrzuty_dev");
const PORT = 4175;
const ADRES = `http://127.0.0.1:${PORT}`;
const SUPABASE = "https://test.supabase.local";

const WYMIARY: Record<string, { width: number; height: number; cala: boolean }> = {
  desktop: { width: 1440, height: 900, cala: false },
  tel: { width: 390, height: 844, cala: true },
};

/* ---------- dane ---------- */

const teraz = Date.now();
const iso = (minTemu: number) => new Date(teraz - minTemu * 60000).toISOString();
const UID = "11111111-1111-4111-8111-111111111111";

const wspolne = {
  kryterium: "Komunikat jednostki miejskiej o zakończeniu robót i oddaniu do użytku.",
  link_zrodla: "https://zdmk.krakow.pl/",
  wynik: null as number | null,
  link_rozstrzygniecia: null as string | null,
  komentarz_urzedu: null as string | null,
  liczba_prognoz: 0,
  rozstrzygnieto: null as string | null,
  kurs_widoczny: false,
  kursy: null as number[] | null,
  prog_widocznosci: 10,
  liczba_zmian_terminu: 0,
  obrot: 0,
  status: "otwarte",
  utworzono: iso(60 * 20),
  otwarto: iso(60 * 20),
};
const TRZY = ["w terminie", "po terminie", "wstrzymane lub anulowane"];
const DWIE = ["tak", "nie"];
const pytania = [
  { id: 1, tresc: "Czy przebudowa węzła Bagatela z torowiskiem na ul. Karmelickiej zakończy się do 31 stycznia 2027?", kategoria: "miasto", odpowiedzi: TRZY, termin: "2027-01-31", kursy_otwarcia: [0.34, 0.33, 0.33] },
  { id: 2, tresc: "Czy budowa ul. 8 Pułku Ułanów na Ruczaju zakończy się do 31 stycznia 2027? (ZIM, umowa z 2024)", kategoria: "miasto", odpowiedzi: TRZY, termin: "2027-01-31", kursy_otwarcia: [0.34, 0.33, 0.33] },
  { id: 3, tresc: "Czy Krakowskie Centrum Muzyki przy ul. Piastowskiej otworzy się dla publiczności do 30 kwietnia 2027?", kategoria: "miasto", odpowiedzi: TRZY, termin: "2027-04-30", kursy_otwarcia: [0.34, 0.33, 0.33] },
  { id: 4, tresc: "Czy kładka Kazimierz–Ludwinów zostanie oficjalnie otwarta 4 października 2026?", kategoria: "luz", odpowiedzi: DWIE, termin: "2026-10-04", kursy_otwarcia: [0.5, 0.5] },
  { id: 5, tresc: "Czy lista zwycięskich projektów 13. edycji Budżetu Obywatelskiego Krakowa zostanie opublikowana do 13 listopada 2026?", kategoria: "luz", odpowiedzi: DWIE, termin: "2026-11-13", kursy_otwarcia: [0.5, 0.5] },
  { id: 6, tresc: "Czy I etap remontu ul. Starowiślnej (sieci podziemne i torowisko) zakończy się do 30 listopada 2026?", kategoria: "luz", odpowiedzi: DWIE, termin: "2026-11-30", kursy_otwarcia: [0.5, 0.5] },
  { id: 7, tresc: "Czy ZIM ogłosi przetarg na budowę linii tramwajowej Krowodrza Górka – Azory do 31 grudnia 2026?", kategoria: "luz", odpowiedzi: DWIE, termin: "2026-12-31", kursy_otwarcia: [0.5, 0.5] },
  { id: 8, tresc: "Czy węzeł Mistrzejowice na S7 zostanie otwarty dla ruchu do 31 grudnia 2026?", kategoria: "luz", odpowiedzi: DWIE, termin: "2026-12-31", kursy_otwarcia: [0.5, 0.5] },
].map((p) => ({ ...wspolne, ...p }));

if (DANE === "zywy") {
  Object.assign(pytania[0], { kursy: [0.41, 0.44, 0.15], kurs_widoczny: true, liczba_prognoz: 12, obrot: 1240, liczba_zmian_terminu: 1, komentarz_urzedu: "Trwa procedura odbiorowa.", otwarto: iso(60 * 24 * 3) });
  Object.assign(pytania[3], { kursy: [0.41, 0.59], kurs_widoczny: true, liczba_prognoz: 11, obrot: 530, otwarto: iso(60 * 24) });
  Object.assign(pytania[4], { liczba_prognoz: 3, obrot: 60 });
  Object.assign(pytania[6], { status: "rozstrzygniete", wynik: 2, kursy: [0.72, 0.28], kurs_widoczny: true, liczba_prognoz: 30, obrot: 2100, rozstrzygnieto: iso(30), link_rozstrzygniecia: "https://krakow.pl/" });
  Object.assign(pytania[7], { status: "zamkniete", kursy: [0.3, 0.7], kurs_widoczny: true, liczba_prognoz: 15, obrot: 400, otwarto: iso(60 * 24 * 10) });
}

const historia: Record<number, { czas: string; kursy: number[] }[]> = {
  1: [
    { czas: iso(60 * 24 * 3), kursy: [0.34, 0.33, 0.33] }, { czas: iso(60 * 40), kursy: [0.38, 0.4, 0.22] },
    { czas: iso(60 * 20), kursy: [0.36, 0.45, 0.19] }, { czas: iso(60 * 5), kursy: [0.41, 0.44, 0.15] },
  ],
  4: [
    { czas: iso(60 * 24), kursy: [0.5, 0.5] }, { czas: iso(60 * 12), kursy: [0.46, 0.54] },
    { czas: iso(60 * 3), kursy: [0.43, 0.57] }, { czas: iso(20), kursy: [0.41, 0.59] },
  ],
  7: [{ czas: iso(60 * 48), kursy: [0.5, 0.5] }, { czas: iso(60 * 30), kursy: [0.72, 0.28] }],
};
const aktywnosc = [
  { id: 1, pytanie: 4, tresc: pytania[3].tresc, kategoria: "luz", nick: "zwierzyniec", odpowiedz: 2, odpowiedz_tekst: "nie", stawka: 25, udzialy: 44.2, kurs_po: 0.59, powod: null, komentarz: "Aneks do umowy był już raz.", czas: iso(20) },
  { id: 2, pytanie: 1, tresc: pytania[0].tresc, kategoria: "miasto", nick: "podgorze_7", odpowiedz: 2, odpowiedz_tekst: "po terminie", stawka: 50, udzialy: 108.3, kurs_po: 0.44, powod: "wykonawca", komentarz: null, czas: iso(60 * 5) },
  { id: 3, pytanie: 1, tresc: pytania[0].tresc, kategoria: "miasto", nick: "nowa_huta", odpowiedz: 1, odpowiedz_tekst: "w terminie", stawka: 10, udzialy: -12.5, kurs_po: 0.36, powod: null, komentarz: null, czas: iso(60 * 20) },
];
const komentarze = [
  { id: 1, nick: "zwierzyniec", odpowiedz: 2, odpowiedz_tekst: "nie", powod: null, komentarz: "Aneks do umowy był już raz.", stawka: 25, czas: iso(20) },
];
const najwieksi = [
  { nick: "podgorze_7", odpowiedz: 2, odpowiedz_tekst: "po terminie", udzialy: 108.3, wydane: 50 },
  { nick: "nowa_huta", odpowiedz: 1, odpowiedz_tekst: "w terminie", udzialy: 61.9, wydane: 25 },
];
const ranking = [
  { nick: "podgorze_7", saldo: 950, wartosc_pozycji: 96.4, portfel: 1046.4, zysk: 46.4, prognozy: 4, obrot: 120, trafione: 2, rozstrzygniete: 2 },
  { nick: "zwierzyniec", saldo: 975, wartosc_pozycji: 26.1, portfel: 1001.1, zysk: 1.1, prognozy: 2, obrot: 30, trafione: 1, rozstrzygniete: 2 },
  { nick: "nowa_huta", saldo: 940, wartosc_pozycji: 22.3, portfel: 962.3, zysk: -37.7, prognozy: 3, obrot: 70, trafione: 0, rozstrzygniete: 1 },
];
const powody = [
  { pytanie: 1, powod: "wykonawca", liczba: 5, punkty: 120 },
  { pytanie: 1, powod: "pieniadze", liczba: 3, punkty: 60 },
];
const gracz = { id: UID, nick: "krowodrza_42", saldo: 940, czy_admin: false };

/* ---------- mock Supabase (auth + PostgREST) ---------- */

function b64url(s: string) {
  return Buffer.from(s).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
const jwt = `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(
  JSON.stringify({ sub: UID, role: "authenticated", is_anonymous: true, email: "", aud: "authenticated", exp: 4102444800, iat: 1700000000, session_id: "s1" }),
)}.podpis`;
const uzytkownik = { id: UID, aud: "authenticated", role: "authenticated", is_anonymous: true, email: "", email_confirmed_at: null, app_metadata: {}, user_metadata: {}, created_at: iso(60 * 24) };
const sesja = { access_token: jwt, token_type: "bearer", expires_in: 999999, expires_at: 4102444800, refresh_token: "r1", user: uzytkownik };

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mock(route: Route) {
  const req = route.request();
  const url = new URL(req.url());
  const p = url.pathname;
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204 });
  if (p.startsWith("/auth/v1/")) {
    if (p === "/auth/v1/logout") return route.fulfill({ status: 204 });
    if (p === "/auth/v1/user") return json(route, uzytkownik);
    return json(route, sesja);
  }
  if (p === "/rest/v1/gracze") return json(route, GRACZ ? [gracz] : []);
  if (p === "/rest/v1/v_pytania") {
    const id = url.searchParams.get("id")?.replace("eq.", "");
    const lista = id ? pytania.filter((q) => String(q.id) === id) : pytania;
    if (req.headers()["accept"]?.includes("pgrst.object")) return json(route, lista[0] ?? null);
    return json(route, lista);
  }
  if (p === "/rest/v1/rpc/historia_kursu") {
    const body = (req.postDataJSON() ?? {}) as { p_pytanie?: number };
    return json(route, DANE === "zywy" ? (historia[body.p_pytanie ?? 0] ?? []) : []);
  }
  if (p === "/rest/v1/rpc/aktywnosc") {
    const body = (req.postDataJSON() ?? {}) as { p_pytanie?: number | null };
    const lista = DANE === "zywy" ? aktywnosc : [];
    return json(route, body.p_pytanie == null ? lista : lista.filter((a) => a.pytanie === body.p_pytanie));
  }
  if (p === "/rest/v1/rpc/komentarze_rynku") return json(route, DANE === "zywy" ? komentarze : []);
  if (p === "/rest/v1/rpc/najwieksi_gracze") return json(route, DANE === "zywy" ? najwieksi : []);
  if (p === "/rest/v1/rpc/ranking") return json(route, DANE === "zywy" ? ranking : []);
  if (p === "/rest/v1/rpc/rozklad_powodow") return json(route, DANE === "zywy" ? powody : []);
  if (p === "/rest/v1/rpc/profil_publiczny") return json(route, { nick: "podgorze_7", saldo: 950, prognozy: 4, trafione: 2, rozstrzygniete: 2, zysk: 46.4, od: iso(60 * 24 * 9) });
  if (p.startsWith("/rest/v1/rpc/")) return json(route, {});
  return json(route, []);
}

/* ---------- serwer, przeglądarka, zrzuty ---------- */

function slug(strona: string): string {
  if (strona === "/") return "rynki";
  return strona.replace(/^\//, "").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/_+$/, "");
}

async function czekajNaSerwer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(ADRES);
      if (r.ok) return;
    } catch {
      /* jeszcze nie wstał */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Dev server nie wstał pod ${ADRES}`);
}

async function otworz(browser: Browser, urzadzenie: string): Promise<{ ctx: BrowserContext; strony: Map<string, Page> }> {
  const w = WYMIARY[urzadzenie];
  if (!w) throw new Error(`Nieznane urządzenie „${urzadzenie}”; dostępne: ${Object.keys(WYMIARY).join(", ")}`);
  const ctx = await browser.newContext({ viewport: { width: w.width, height: w.height }, deviceScaleFactor: 1, locale: "pl-PL" });
  await ctx.addInitScript((m: string) => {
    if (m) localStorage.setItem("motyw", m);
  }, MOTYW);
  await ctx.route(`${SUPABASE}/**`, mock);
  const strony = new Map<string, Page>();
  for (const s of STRONY) {
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error(`  ! ${urzadzenie} ${s}: ${e.message}`));
    await page.goto(`${ADRES}${s}`);
    strony.set(s, page);
  }
  return { ctx, strony };
}

async function zrzuty(konteksty: Map<string, { strony: Map<string, Page> }>) {
  fs.mkdirSync(OUT, { recursive: true });
  const pliki: string[] = [];
  for (const [urzadzenie, { strony }] of konteksty) {
    for (const [s, page] of strony) {
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await page.waitForTimeout(300);
      const plik = path.join(OUT, `${urzadzenie}_${slug(s)}.png`);
      await page.screenshot({ path: plik, fullPage: WYMIARY[urzadzenie].cala });
      pliki.push(path.relative(process.cwd(), plik));
    }
  }
  return pliki;
}

let serwer: ChildProcess | null = null;
let browser: Browser | null = null;
const sprzatnij = async () => {
  await browser?.close().catch(() => undefined);
  if (serwer?.pid) {
    try {
      process.kill(-serwer.pid, "SIGTERM");
    } catch {
      serwer.kill();
    }
  }
};
process.on("SIGINT", () => void sprzatnij().then(() => process.exit(0)));
process.on("SIGTERM", () => void sprzatnij().then(() => process.exit(0)));

try {
  // vite odpalony wprost (nie przez npx) i w osobnej grupie procesów, żeby na koniec zabić go razem z potomkami.
  serwer = spawn(path.resolve("node_modules/.bin/vite"), ["--port", String(PORT), "--strictPort", "--clearScreen", "false"], {
    cwd: process.cwd(),
    stdio: ["ignore", "ignore", "ignore"],
    detached: true,
    env: { ...process.env, VITE_SUPABASE_URL: SUPABASE, VITE_SUPABASE_KEY: "test", BROWSER: "none" },
  });
  await czekajNaSerwer();
  browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const konteksty = new Map<string, { ctx: BrowserContext; strony: Map<string, Page> }>();
  for (const u of URZADZENIA) konteksty.set(u, await otworz(browser, u));

  const opis = `dane=${DANE}${GRACZ ? ", gracz" : ", gość"}${MOTYW ? `, motyw=${MOTYW}` : ""}`;
  const pliki = await zrzuty(konteksty);
  console.log(`✓ ${new Date().toLocaleTimeString("pl-PL")} zrzuty (${opis}):\n  ${pliki.join("\n  ")}`);

  if (!WATCH) {
    await sprzatnij();
    process.exit(0);
  }

  console.log("Pilnuję src/ (Ctrl+C kończy)…");
  let licznik: NodeJS.Timeout | null = null;
  let trwa = false;
  let ponow = false;
  const odnow = async () => {
    if (trwa) {
      ponow = true;
      return;
    }
    trwa = true;
    try {
      await new Promise((r) => setTimeout(r, 600)); // HMR Vite
      const lista = await zrzuty(konteksty);
      console.log(`✓ ${new Date().toLocaleTimeString("pl-PL")} odświeżono ${lista.length} zrzutów`);
    } catch (e) {
      console.error(`! zrzuty nieudane: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      trwa = false;
      if (ponow) {
        ponow = false;
        void odnow();
      }
    }
  };
  fs.watch(path.resolve("src"), { recursive: true }, () => {
    if (licznik) clearTimeout(licznik);
    licznik = setTimeout(() => void odnow(), 400);
  });
  await new Promise(() => undefined);
} catch (e) {
  console.error(`ZRZUTY NIEUDANE: ${e instanceof Error ? e.message : String(e)}`);
  await sprzatnij();
  process.exit(1);
}
