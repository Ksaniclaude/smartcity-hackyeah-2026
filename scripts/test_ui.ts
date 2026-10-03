// Test ścieżki gracza w prawdziwym Chromium (playwright-core) na zamockowanym Supabase:
// rynki jako gość → prognoza (nick w modalu) → rynek „miasto” z powodem → komentarz → sprzedaż →
// profil, ranking, aktywność, profil publiczny, /miasto, /admin, /qr. Zrzuty: telefon,
// desktop, jasny motyw. Nie potrzebuje sieci.
//
// Użycie: npm run build && npm run test:ui   (build z VITE_SUPABASE_URL=https://test.supabase.local VITE_SUPABASE_KEY=test)
// Zrzuty trafiają do katalogu z --zrzuty=… (domyślnie data/zrzuty).

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Page, type Route } from "playwright-core";

const PORT = 4173;
const ADRES = `http://127.0.0.1:${PORT}`;
const SUPABASE = "https://test.supabase.local";
const ZRZUTY = path.resolve(process.argv.find((a) => a.startsWith("--zrzuty="))?.slice(9) ?? "data/zrzuty");

function b64url(s: string) {
  return Buffer.from(s).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
const UID = "11111111-1111-4111-8111-111111111111";
function jwt(email?: string) {
  return `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({
      sub: UID, role: "authenticated", is_anonymous: !email, email: email ?? "", aud: "authenticated",
      exp: 4102444800, iat: 1700000000, session_id: "s1",
    }),
  )}.podpis`;
}
function uzytkownik(email?: string) {
  return {
    id: UID, aud: "authenticated", role: "authenticated", is_anonymous: !email, email: email ?? "",
    email_confirmed_at: email ? "2026-10-03T10:00:00Z" : null, app_metadata: {}, user_metadata: {},
    created_at: "2026-10-03T10:00:00Z",
  };
}
function sesja(email?: string) {
  return { access_token: jwt(email), token_type: "bearer", expires_in: 999999, expires_at: 4102444800, refresh_token: "r1", user: uzytkownik(email) };
}

const TERAZ = Date.now();
const iso = (minutTemu: number) => new Date(TERAZ - minutTemu * 60000).toISOString();

const stan = {
  gracz: null as null | { id: string; nick: string; saldo: number; czy_admin: boolean },
  email: undefined as string | undefined,
  prognozy: 0,
  sprzedaze: 0,
  komentarze: [] as { id: number; nick: string; odpowiedz: number | null; odpowiedz_tekst: string | null; powod: string | null; komentarz: string; stawka: number; czas: string }[],
  pozycje: new Map<string, { pytanie: number; odpowiedz: number; udzialy: number; wydane: number }>(),
};

const pytania = [
  {
    id: 1, tresc: "Czy przebudowa węzła Bagatela z torowiskiem na ul. Karmelickiej zakończy się do 31 stycznia 2027?", kategoria: "miasto",
    odpowiedzi: ["w terminie", "po terminie", "wstrzymane lub anulowane"],
    kryterium: "Komunikat ZDMK o zakończeniu robót i przywróceniu ruchu tramwajowego na ul. Karmelickiej.",
    link_zrodla: "https://example.invalid/zdmk", termin: "2027-01-31", status: "otwarte", wynik: null, link_rozstrzygniecia: null,
    komentarz_urzedu: "Trwa procedura odbiorowa.", liczba_prognoz: 12, utworzono: iso(60 * 24 * 3), rozstrzygnieto: null,
    kurs_widoczny: true, kursy: [0.41, 0.44, 0.15], prog_widocznosci: 10, liczba_zmian_terminu: 1,
    obrot: 1240, otwarto: iso(60 * 24 * 3), kursy_otwarcia: [0.34, 0.33, 0.33], kursy_1h: [0.36, 0.45, 0.19], gracze_rynku: null,
  },
  {
    id: 2, tresc: "Czy kładka Kazimierz–Ludwinów zostanie oficjalnie otwarta 4 października 2026?", kategoria: "luz",
    odpowiedzi: ["tak", "nie"], kryterium: "Tak, jeśli krakow.pl lub ZIM potwierdzi uroczyste otwarcie kładki 4.10.2026.",
    link_zrodla: "https://example.invalid/zim", termin: "2026-10-04", status: "otwarte", wynik: null, link_rozstrzygniecia: null,
    komentarz_urzedu: null, liczba_prognoz: 11, utworzono: iso(60 * 24), rozstrzygnieto: null,
    kurs_widoczny: true, kursy: [0.41, 0.59], prog_widocznosci: 10, liczba_zmian_terminu: 0,
    obrot: 530, otwarto: iso(60 * 24), kursy_otwarcia: [0.5, 0.5], kursy_1h: [0.43, 0.57], gracze_rynku: null,
  },
  {
    id: 3, tresc: "Czy wczoraj padało na Rynku Głównym?", kategoria: "luz",
    odpowiedzi: ["tak", "nie"], kryterium: "Dane IMGW.", link_zrodla: "https://example.invalid/imgw", termin: "2026-10-02",
    status: "rozstrzygniete", wynik: 2, link_rozstrzygniecia: "https://example.invalid/imgw/wynik", komentarz_urzedu: null,
    liczba_prognoz: 30, utworzono: iso(60 * 48), rozstrzygnieto: iso(30),
    kurs_widoczny: true, kursy: [0.72, 0.28], prog_widocznosci: 10, liczba_zmian_terminu: 0,
    obrot: 2100, otwarto: iso(60 * 48), kursy_otwarcia: [0.5, 0.5], kursy_1h: null, gracze_rynku: { graczy: 4, trafilo: 1 },
  },
  {
    id: 4, tresc: "Czy lista zwycięskich projektów 13. edycji Budżetu Obywatelskiego Krakowa zostanie opublikowana do 13 listopada 2026?", kategoria: "luz",
    odpowiedzi: ["tak", "nie"], kryterium: "Lista na budzet.krakow.pl do 13.11.2026.", link_zrodla: "https://example.invalid/bo", termin: "2026-11-13",
    status: "otwarte", wynik: null, link_rozstrzygniecia: null, komentarz_urzedu: null, liczba_prognoz: 3, utworzono: iso(50), rozstrzygnieto: null,
    kurs_widoczny: false, kursy: null, prog_widocznosci: 10, liczba_zmian_terminu: 0, obrot: 60, otwarto: iso(50), kursy_otwarcia: [0.5, 0.5],
    kursy_1h: null, gracze_rynku: null,
  },
];
const powody = [
  { pytanie: 1, powod: "wykonawca", liczba: 5, punkty: 120 },
  { pytanie: 1, powod: "pieniadze", liczba: 3, punkty: 60 },
  { pytanie: 1, powod: "formalnosci", liczba: 1, punkty: 10 },
];
const historia: Record<number, { czas: string; kursy: number[] }[]> = {
  1: [
    { czas: iso(60 * 24 * 3), kursy: [0.34, 0.33, 0.33] }, { czas: iso(60 * 40), kursy: [0.38, 0.4, 0.22] },
    { czas: iso(60 * 20), kursy: [0.36, 0.45, 0.19] }, { czas: iso(60 * 5), kursy: [0.41, 0.44, 0.15] },
  ],
  2: [
    { czas: iso(60 * 24), kursy: [0.5, 0.5] }, { czas: iso(60 * 12), kursy: [0.46, 0.54] },
    { czas: iso(60 * 3), kursy: [0.43, 0.57] }, { czas: iso(20), kursy: [0.41, 0.59] },
  ],
  3: [{ czas: iso(60 * 48), kursy: [0.5, 0.5] }, { czas: iso(60 * 30), kursy: [0.72, 0.28] }],
};
const aktywnosc = [
  { id: 1, pytanie: 2, tresc: pytania[1].tresc, kategoria: "luz", nick: "zwierzyniec", odpowiedz: 2, odpowiedz_tekst: "nie", stawka: 25, udzialy: 44.2, kurs_po: 0.59, powod: null, komentarz: "Aneks do umowy był już raz.", czas: iso(20) },
  { id: 2, pytanie: 1, tresc: pytania[0].tresc, kategoria: "miasto", nick: "podgorze_7", odpowiedz: 2, odpowiedz_tekst: "po terminie", stawka: 50, udzialy: 108.3, kurs_po: 0.44, powod: "wykonawca", komentarz: null, czas: iso(60 * 5) },
  { id: 3, pytanie: 1, tresc: pytania[0].tresc, kategoria: "miasto", nick: "nowa_huta", odpowiedz: 1, odpowiedz_tekst: "w terminie", stawka: 10, udzialy: -12.5, kurs_po: 0.36, powod: null, komentarz: null, czas: iso(60 * 20) },
];
const najwieksi = [
  { nick: "podgorze_7", odpowiedz: 2, odpowiedz_tekst: "po terminie", udzialy: 108.3, wydane: 50 },
  { nick: "nowa_huta", odpowiedz: 1, odpowiedz_tekst: "w terminie", udzialy: 61.9, wydane: 25 },
  { nick: "zwierzyniec", odpowiedz: 3, odpowiedz_tekst: "wstrzymane lub anulowane", udzialy: 30.1, wydane: 5 },
];
const ranking = [
  { nick: "podgorze_7", saldo: 950, wartosc_pozycji: 96.4, portfel: 1046.4, zysk: 46.4, prognozy: 4, obrot: 120, trafione: 2, rozstrzygniete: 2 },
  { nick: "zwierzyniec", saldo: 975, wartosc_pozycji: 26.1, portfel: 1001.1, zysk: 1.1, prognozy: 2, obrot: 30, trafione: 1, rozstrzygniete: 2 },
  { nick: "nowa_huta", saldo: 940, wartosc_pozycji: 22.3, portfel: 962.3, zysk: -37.7, prognozy: 3, obrot: 70, trafione: 0, rozstrzygniete: 1 },
];
// rozstrzygnięta pozycja gracza (rynek 3, wynik „nie”): ekran „Rynek rozstrzygnięty” na /profil
stan.pozycje.set("3-2", { pytanie: 3, odpowiedz: 2, udzialy: 61.9, wydane: 40 });
stan.komentarze.push({ id: 1, nick: "zwierzyniec", odpowiedz: 2, odpowiedz_tekst: "nie", powod: null, komentarz: "Aneks do umowy był już raz.", stawka: 25, czas: iso(20) });

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}
function mojePozycje() {
  const wg = new Map<number, { pytanie: number; odpowiedz: number; udzialy: number; wydane: number }[]>();
  for (const z of stan.pozycje.values()) wg.set(z.pytanie, [...(wg.get(z.pytanie) ?? []), z]);
  return [...wg.entries()].map(([pid, lista]) => {
    const p = pytania.find((q) => q.id === pid)!;
    const glowna = [...lista].sort((a, b) => b.wydane - a.wydane)[0];
    const wydane = lista.reduce((s, z) => s + z.wydane, 0);
    const wyplata = p.status === "rozstrzygniete" ? lista.filter((z) => z.odpowiedz === p.wynik).reduce((s, z) => s + z.udzialy, 0) : 0;
    const wartosc = p.status === "rozstrzygniete" ? wyplata : p.kursy ? lista.reduce((s, z) => s + z.udzialy * (p.kursy![z.odpowiedz - 1] ?? 0), 0) : wydane;
    return {
      pytanie: pid, tresc: p.tresc, kategoria: p.kategoria, odpowiedzi: p.odpowiedzi, status: p.status, termin: p.termin, wynik: p.wynik,
      odpowiedz_glowna: glowna.odpowiedz, wydane, wyplata, trafione: p.status === "rozstrzygniete" ? glowna.odpowiedz === p.wynik : null,
      kursy: p.kursy, udzialy_glowne: glowna.udzialy, wartosc,
    };
  });
}
const mojeTransakcje: unknown[] = [];

async function mock(route: Route) {
  const req = route.request();
  const url = new URL(req.url());
  const p = url.pathname;
  const m = req.method();
  if (m === "OPTIONS") return route.fulfill({ status: 204 });
  // --- auth ---
  if (p === "/auth/v1/signup") {
    const body = (req.postDataJSON() ?? {}) as { email?: string };
    if (body.email) stan.email = body.email;
    return json(route, sesja(stan.email));
  }
  if (p === "/auth/v1/token") {
    const body = (req.postDataJSON() ?? {}) as { email?: string; password?: string };
    if (url.searchParams.get("grant_type") === "password") {
      if (body.password !== "haslo123") return json(route, { error: "invalid_grant", error_description: "Invalid login credentials", code: 400, msg: "Invalid login credentials" }, 400);
      stan.email = body.email;
    }
    return json(route, sesja(stan.email));
  }
  if (p === "/auth/v1/user") {
    if (m === "PUT") {
      const body = (req.postDataJSON() ?? {}) as { email?: string };
      if (body.email) stan.email = body.email;
      return json(route, uzytkownik(stan.email));
    }
    return json(route, uzytkownik(stan.email));
  }
  if (p === "/auth/v1/logout") {
    stan.gracz = null;
    stan.email = undefined;
    return route.fulfill({ status: 204 });
  }
  // --- odczyt ---
  if (p === "/rest/v1/gracze") return json(route, stan.gracz ? [stan.gracz] : []);
  if (p === "/rest/v1/v_pytania") {
    const id = url.searchParams.get("id");
    const lista = id ? pytania.filter((q) => String(q.id) === id.replace("eq.", "")) : pytania;
    if (req.headers()["accept"]?.includes("application/vnd.pgrst.object+json")) return json(route, lista[0] ?? null);
    return json(route, lista);
  }
  if (p === "/rest/v1/v_moje_pozycje") return json(route, mojePozycje());
  if (p === "/rest/v1/pozycje") {
    const pid = Number((url.searchParams.get("pytanie") ?? "eq.0").replace("eq.", ""));
    return json(route, [...stan.pozycje.values()].filter((z) => z.pytanie === pid).map((z) => ({ odpowiedz: z.odpowiedz, udzialy: z.udzialy, wydane_punkty: z.wydane })));
  }
  if (p === "/rest/v1/transakcje") return json(route, mojeTransakcje);
  if (p === "/rest/v1/zmiany_terminow") return json(route, []);
  if (p === "/rest/v1/rpc/rozklad_powodow") return json(route, powody);
  if (p === "/rest/v1/rpc/historia_kursu") {
    const body = req.postDataJSON() as { p_pytanie: number };
    return json(route, historia[body.p_pytanie] ?? []);
  }
  if (p === "/rest/v1/rpc/aktywnosc") {
    const body = req.postDataJSON() as { p_pytanie: number | null };
    return json(route, body.p_pytanie == null ? aktywnosc : aktywnosc.filter((a) => a.pytanie === body.p_pytanie));
  }
  if (p === "/rest/v1/rpc/komentarze_rynku") return json(route, stan.komentarze);
  if (p === "/rest/v1/rpc/najwieksi_gracze") return json(route, najwieksi);
  if (p === "/rest/v1/rpc/ranking") return json(route, ranking);
  if (p === "/rest/v1/rpc/profil_publiczny") {
    const body = req.postDataJSON() as { p_nick: string };
    if (body.p_nick !== "podgorze_7") return json(route, null);
    return json(route, {
      nick: "podgorze_7", utworzono: iso(60 * 24 * 10), prognozy: 4, obrot: 120, wartosc_pozycji: 96.4, najwieksza_wygrana: 61.9, trafione: 2, rozstrzygniete: 2, miejsce: 1,
      pozycje: [{ pytanie: 1, tresc: pytania[0].tresc, kategoria: "miasto", odpowiedzi: pytania[0].odpowiedzi, status: "otwarte", wynik: null, odpowiedz: 2, udzialy: 108.3, wydane: 50, kurs: 0.44, wartosc: 47.6 }],
      aktywnosc: aktywnosc.filter((a) => a.nick === "podgorze_7"),
    });
  }
  // --- zapisy ---
  if (p === "/rest/v1/rpc/ustaw_nick") {
    const body = req.postDataJSON() as { p_nick: string };
    stan.gracz = { id: UID, nick: body.p_nick, saldo: stan.gracz?.saldo ?? 1000, czy_admin: stan.gracz?.czy_admin ?? false };
    return json(route, stan.gracz);
  }
  if (p === "/rest/v1/rpc/postaw_prognoze") {
    const body = req.postDataJSON() as { p_pytanie: number; p_odpowiedz: number; p_stawka: number; p_powod: string | null; p_komentarz: string | null };
    if (!stan.gracz) return json(route, { message: "Najpierw podaj nick" }, 400);
    if (body.p_pytanie === 1 && !body.p_powod) return json(route, { message: "Podaj powód" }, 400);
    stan.prognozy++;
    stan.gracz.saldo -= body.p_stawka;
    const klucz = `${body.p_pytanie}-${body.p_odpowiedz}`;
    const z = stan.pozycje.get(klucz) ?? { pytanie: body.p_pytanie, odpowiedz: body.p_odpowiedz, udzialy: 0, wydane: 0 };
    z.udzialy += 23.7;
    z.wydane += body.p_stawka;
    stan.pozycje.set(klucz, z);
    const q = pytania.find((x) => x.id === body.p_pytanie)!;
    mojeTransakcje.unshift({ id: 100 + stan.prognozy, pytanie: body.p_pytanie, odpowiedz: body.p_odpowiedz, stawka: body.p_stawka, udzialy: 23.7, kurs_przed: 0.41, kurs_po: 0.44, powod: body.p_powod, komentarz: body.p_komentarz, typ: "kupno", czas: new Date().toISOString(), pytania: { tresc: q.tresc, odpowiedzi: q.odpowiedzi, status: q.status, wynik: q.wynik } });
    if (body.p_komentarz) stan.komentarze.unshift({ id: 100 + stan.prognozy, nick: stan.gracz.nick, odpowiedz: body.p_odpowiedz, odpowiedz_tekst: q.odpowiedzi[body.p_odpowiedz - 1], powod: body.p_powod, komentarz: body.p_komentarz, stawka: body.p_stawka, czas: new Date().toISOString() });
    return json(route, {
      pytanie: body.p_pytanie, odpowiedz: body.p_odpowiedz, stawka: body.p_stawka, udzialy: 23.7,
      kurs_przed: 0.41, kurs_po: 0.44, kursy: q.odpowiedzi.length === 2 ? [0.44, 0.56] : [0.41, 0.47, 0.12], saldo: stan.gracz.saldo, liczba_prognoz: 12, obrot: q.obrot + body.p_stawka,
      sprzedano: [], zwrot_ze_sprzedazy: 0, miejsce_przed: stan.prognozy === 1 ? null : 3, miejsce_po: stan.prognozy === 1 ? 3 : 2, graczy_w_rankingu: 4,
    });
  }
  if (p === "/rest/v1/rpc/sprzedaj_udzialy") {
    const body = req.postDataJSON() as { p_pytanie: number; p_odpowiedz: number; p_udzialy: number };
    const klucz = `${body.p_pytanie}-${body.p_odpowiedz}`;
    const z = stan.pozycje.get(klucz);
    if (!stan.gracz || !z || z.udzialy <= 0) return json(route, { message: "Nie masz udziałów na tę odpowiedź" }, 400);
    const u = Math.min(body.p_udzialy, z.udzialy);
    const zwrot = Math.round(u * 0.42 * 10000) / 10000;
    z.udzialy -= u;
    stan.gracz.saldo += zwrot;
    stan.sprzedaze++;
    return json(route, { pytanie: body.p_pytanie, odpowiedz: body.p_odpowiedz, udzialy: u, zwrot, kurs_przed: 0.44, kurs_po: 0.42, kursy: [0.42, 0.58], saldo: stan.gracz.saldo, udzialy_pozostale: z.udzialy, miejsce_przed: 2, miejsce_po: 2 });
  }
  if (p === "/rest/v1/rpc/dodaj_komentarz") {
    const body = req.postDataJSON() as { p_pytanie: number; p_tresc: string };
    if (!stan.gracz) return json(route, { message: "Najpierw podaj nick" }, 400);
    stan.komentarze.unshift({ id: -(stan.komentarze.length + 1), nick: stan.gracz.nick, odpowiedz: 1, odpowiedz_tekst: "tak", powod: null, komentarz: body.p_tresc, stawka: 10, czas: new Date().toISOString() });
    return json(route, stan.komentarze.length);
  }
  if (p === "/rest/v1/rpc/admin_zaloguj") {
    const body = req.postDataJSON() as { p_haslo: string };
    const ok = body.p_haslo === "tajne";
    if (ok && stan.gracz) stan.gracz.czy_admin = true;
    return json(route, ok);
  }
  if (p === "/rest/v1/rpc/admin_pytania") return json(route, pytania.map((q) => ({ ...q, q: [0, 0, 0].slice(0, q.odpowiedzi.length), b: 1000, zaproponowal: null, prog_widocznosci: null })));
  if (p === "/rest/v1/rpc/admin_dodaj_pytanie") return json(route, 5);
  if (p === "/rest/v1/rpc/admin_ustaw_prog") return json(route, null);
  if (p === "/rest/v1/rpc/admin_ustaw_prog_domyslny") return json(route, (req.postDataJSON() as { p_prog: number }).p_prog);
  console.log(`  (brak mocka) ${m} ${p}${url.search}`);
  return json(route, { message: `brak mocka dla ${p}` }, 404);
}

async function czekajNaPort(ms = 30000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(ADRES);
      if (r.ok) return;
    } catch {
      /* jeszcze nie */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("Serwer podglądu nie wystartował");
}

function chromiumPath(): string | undefined {
  const kandydaci = ["/opt/pw-browsers/chromium", process.env.CHROMIUM_PATH ?? ""].filter(Boolean);
  for (const k of kandydaci) {
    try {
      const st = fs.statSync(k);
      if (st.isFile()) return k;
      if (st.isDirectory()) {
        const znalezione = fs.readdirSync(k, { recursive: true }) as string[];
        const bin = znalezione.find((f) => /(^|\/)chrome$/.test(f) || /(^|\/)chromium$/.test(f));
        if (bin) return path.join(k, bin);
      }
    } catch {
      /* dalej */
    }
  }
  const baza = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (baza && fs.existsSync(baza)) {
    const kat = fs.readdirSync(baza).find((d) => d.startsWith("chromium"));
    if (kat) {
      const bin = path.join(baza, kat, "chrome-linux", "chrome");
      if (fs.existsSync(bin)) return bin;
    }
  }
  return undefined;
}

let numer = 0;
async function zrzut(page: Page, nazwa: string, fullPage = true) {
  numer++;
  fs.mkdirSync(ZRZUTY, { recursive: true });
  await page.screenshot({ path: path.join(ZRZUTY, `${String(numer).padStart(2, "0")}_${nazwa}.png`), fullPage });
}

async function oczekujNaglowka(page: Page, tekst: string | RegExp, ms = 8000) {
  await page.getByRole("heading", { name: tekst }).first().waitFor({ timeout: ms });
  console.log(`  ✓ nagłówek ${typeof tekst === "string" ? `„${tekst}”` : tekst}`);
}

async function oczekuj(page: Page, tekst: string | RegExp, ms = 8000) {
  await page.getByText(tekst, { exact: false }).first().waitFor({ timeout: ms });
  console.log(`  ✓ ${typeof tekst === "string" ? `„${tekst}”` : tekst}`);
}

let stronaDoZrzutu: Page | null = null;

async function main() {
  const serwer = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
  try {
    await czekajNaPort();
    const browser = await chromium.launch({ executablePath: chromiumPath(), args: ["--no-sandbox"] });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "pl-PL", colorScheme: "dark" });
    const page = await ctx.newPage();
    stronaDoZrzutu = page;
    page.on("pageerror", (e) => console.log(`  błąd strony: ${e.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`  console.error: ${msg.text().slice(0, 200)}`);
    });
    await ctx.route(`${SUPABASE}/**`, mock);
    await ctx.route("https://fonts.googleapis.com/**", (r) => r.abort());
    await ctx.route("https://fonts.gstatic.com/**", (r) => r.abort());

    console.log("1. Strona główna jako gość (rynki bez nicku)");
    await page.goto(`${ADRES}/`);
    await oczekuj(page, "Czy miasto zdąży?");
    await oczekuj(page, "41%");
    await oczekuj(page, "pkt obrotu");
    await oczekuj(page, "tłum się pomylił");
    await oczekuj(page, "Świeże ruchy");
    await oczekuj(page, /prognoz[ya]? w ostatnich 10 minutach/);
    await oczekuj(page, "▼ 2 pp / 1 godz.");
    await zrzut(page, "rynki_gosc");

    console.log("2. Klik „Tak” na karcie → rynek → rejestracja (nick, e-mail, hasło) → prognoza");
    await page.locator(".rynek-przyciski .kup-tak").first().click();
    await oczekuj(page, "Zasady");
    await page.getByRole("button", { name: /Załóż konto, żeby postawić/ }).click();
    await oczekuj(page, "Witaj w Zdążą?");
    await zrzut(page, "modal_konta", false);
    await page.getByPlaceholder("np. krowodrza_42").fill("krowodrza_42");
    await page.getByPlaceholder("ty@przyklad.pl").fill("krowodrza@przyklad.pl");
    await page.getByLabel(/Hasło/).fill("haslo123");
    await page.locator(".modal").getByRole("button", { name: "Załóż konto", exact: true }).click();
    await page.getByRole("button", { name: /^Postaw/ }).first().waitFor({ timeout: 8000 });
    await page.getByRole("group", { name: "Szybka stawka" }).getByRole("button", { name: "50", exact: true }).click();
    await oczekuj(page, "Jeśli trafisz");
    await zrzut(page, "rynek_panel");
    await page.getByRole("button", { name: /^Postaw/ }).first().click();
    await oczekuj(page, "Przesunąłeś kurs 41% → 44%");
    await oczekuj(page, "Jesteś w rankingu: miejsce 3 z 4");
    await zrzut(page, "prognoza_ok");
    await page.getByRole("button", { name: "Udostępnij kartę" }).first().click();
    await oczekuj(page, "Udostępnij prognozę");
    await oczekuj(page, /Daję 44% na to, że kładka/);
    await page.locator("img.karta-udostepniania").waitFor({ timeout: 5000 });
    await zrzut(page, "karta_udostepniania", false);
    await page.getByRole("button", { name: "Zamknij" }).click();

    console.log("3. Rynek „miasto”: powód obowiązkowy, komentarz przy zakładzie");
    await page.goto(`${ADRES}/pytanie/1?odp=2`);
    await oczekuj(page, "Kryterium rozstrzygnięcia");
    await oczekuj(page, "41%");
    await page.getByRole("button", { name: "wykonawca", exact: true }).click();
    await page.getByPlaceholder("Jedno zdanie komentarza (opcjonalnie)").fill("Wykonawca już raz prosił o aneks");
    await page.getByRole("button", { name: /^Postaw/ }).first().click();
    await oczekuj(page, "Przesunąłeś kurs 41% → 44%");
    await oczekuj(page, "Awans w rankingu: 3 → 2");
    await oczekuj(page, "Wykonawca już raz prosił o aneks");
    await oczekuj(page, /stawia 20 na po terminie/);
    await zrzut(page, "rynek_miasto");

    console.log("4. Komentarz bez zakładu");
    await page.getByRole("tab", { name: /^Komentarze/ }).first().click();
    const pole = page.getByPlaceholder("Napisz komentarz…");
    await pole.fill("Trzymam kciuki za ZDMK");
    await page.getByRole("button", { name: "Dodaj komentarz" }).click();
    await oczekuj(page, "Trzymam kciuki za ZDMK");

    console.log("5. Sprzedaż udziałów");
    await page.getByRole("tab", { name: "Sprzedaj", exact: true }).first().click();
    await page.getByRole("button", { name: /Wszystko/ }).first().click();
    await page.getByRole("button", { name: /^Sprzedaj /i }).first().click();
    await oczekuj(page, /Sprzedano/);
    await zrzut(page, "sprzedaz");

    console.log("6. Profil: ekran „Rynek rozstrzygnięty”, portfel na żywo; ranking, aktywność, profil publiczny");
    await page.goto(`${ADRES}/profil`);
    await oczekuj(page, "Rynek rozstrzygnięty");
    await oczekuj(page, "Byłeś lepszy niż 75% graczy", 6000);
    await zrzut(page, "rozstrzygniecie", false);
    await page.getByRole("button", { name: "Jasne" }).click();
    await oczekuj(page, "Wartość portfela");
    await oczekuj(page, "Otwarte pozycje");
    await oczekuj(page, "krowodrza_42");
    await zrzut(page, "profil");
    await page.reload();
    await oczekuj(page, "Wartość portfela");
    if (await page.getByText("Rynek rozstrzygnięty").count()) throw new Error("Ekran rozstrzygnięcia pokazał się drugi raz");
    await page.goto(`${ADRES}/ranking`);
    await oczekujNaglowka(page, "Ranking");
    await oczekuj(page, "podgorze_7");
    await zrzut(page, "ranking");
    await page.goto(`${ADRES}/aktywnosc`);
    await oczekujNaglowka(page, "Aktywność");
    await oczekuj(page, "zwierzyniec");
    await zrzut(page, "aktywnosc");
    await page.goto(`${ADRES}/u/podgorze_7`);
    await oczekuj(page, "Największa wygrana");
    await oczekuj(page, "1. miejsce w rankingu");
    await zrzut(page, "profil_publiczny");

    console.log("7. Desktop: strona główna, rynek, jasny motyw, /miasto");
    const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pl-PL", colorScheme: "dark" });
    await ctx2.route(`${SUPABASE}/**`, mock);
    await ctx2.route("https://fonts.googleapis.com/**", (r) => r.abort());
    await ctx2.route("https://fonts.gstatic.com/**", (r) => r.abort());
    const page2 = await ctx2.newPage();
    page2.on("pageerror", (e) => console.log(`  błąd strony (desktop): ${e.message}`));
    await page2.goto(`${ADRES}/`);
    await oczekuj(page2, "41%");
    await zrzut(page2, "rynki_desktop", false);
    await page2.goto(`${ADRES}/pytanie/1`);
    await oczekuj(page2, "Zasady");
    await zrzut(page2, "rynek_desktop", false);
    await page2.evaluate(() => {
      document.documentElement.dataset.motyw = "jasny";
      localStorage.setItem("motyw", "jasny");
    });
    await zrzut(page2, "rynek_desktop_jasny", false);
    await page2.goto(`${ADRES}/`);
    await oczekuj(page2, "41%");
    await zrzut(page2, "rynki_desktop_jasny", false);
    await page2.goto(`${ADRES}/miasto`);
    await oczekuj(page2, "Termin oficjalny");
    await oczekuj(page2, "Trwa procedura odbiorowa");
    await oczekuj(page2, "wykonawca");
    await zrzut(page2, "miasto");
    await ctx2.close();

    console.log("8. /admin, /qr");
    await page.goto(`${ADRES}/admin`);
    await oczekuj(page, "Panel admina");
    await page.getByLabel("Hasło").fill("zle");
    await page.getByRole("button", { name: "Zaloguj" }).click();
    await oczekuj(page, "Złe hasło");
    await page.getByLabel("Hasło").fill("tajne");
    await page.getByRole("button", { name: "Zaloguj" }).click();
    await oczekuj(page, "Dodaj pytanie");
    await oczekuj(page, "Próg ukrycia kursu");
    await oczekuj(page, "wyniki sportowe");
    await zrzut(page, "admin");
    await page.goto(`${ADRES}/qr`);
    await page.locator("img.qr").waitFor({ timeout: 5000 });

    await browser.close();
    console.log(`\nTEST UI OK (${stan.prognozy} prognozy, ${stan.sprzedaze} sprzedaż przez RPC). Zrzuty: ${ZRZUTY}`);
  } finally {
    serwer.kill();
  }
}

main().catch(async (e) => {
  console.error("TEST UI NIEUDANY:", e);
  if (stronaDoZrzutu) {
    try {
      fs.mkdirSync(ZRZUTY, { recursive: true });
      await stronaDoZrzutu.screenshot({ path: path.join(ZRZUTY, "99_blad.png"), fullPage: true });
      console.error("Tekst strony:", (await stronaDoZrzutu.textContent("body"))?.replace(/\s+/g, " ").slice(0, 1500));
    } catch {
      /* brak zrzutu */
    }
  }
  process.exit(1);
});
