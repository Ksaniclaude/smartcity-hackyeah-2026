// Test przebiegu z wideo w prawdziwym Chromium (playwright-core) z zamockowanym
// Supabase: nick → lista → prognoza → komunikat o przesunięciu kursu → /miasto → /admin.
// Nie potrzebuje sieci. Zrzuty ekranu trafiają do katalogu z --zrzuty=... (domyślnie data/zrzuty).
//
// Użycie: npm run build && npm run test:ui
// (build z VITE_SUPABASE_URL=https://test.supabase.local VITE_SUPABASE_KEY=test)

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
const JWT = `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(
  JSON.stringify({ sub: UID, role: "authenticated", is_anonymous: true, aud: "authenticated", exp: 4102444800, iat: 1700000000, session_id: "s1" }),
)}.podpis`;
const sesja = {
  access_token: JWT,
  token_type: "bearer",
  expires_in: 999999,
  expires_at: 4102444800,
  refresh_token: "r1",
  user: { id: UID, aud: "authenticated", role: "authenticated", is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
};

const stan = {
  gracz: null as null | { id: string; nick: string; saldo: number; czy_admin: boolean },
  prognozy: 0,
};

const pytania = [
  {
    id: 1, tresc: "Zdążą z przebudową ul. Testowej do 30 listopada 2026?", kategoria: "miasto",
    odpowiedzi: ["w terminie", "po terminie", "wstrzymane lub anulowane"], kryterium: "Komunikat ZDMK o odbiorze końcowym.",
    link_zrodla: "https://example.invalid/zdmk", termin: "2026-11-30", status: "otwarte", wynik: null, link_rozstrzygniecia: null,
    komentarz_urzedu: "Trwa procedura odbiorowa.", liczba_prognoz: 12, utworzono: "2026-10-01T10:00:00Z", rozstrzygnieto: null,
    kurs_widoczny: true, kursy: [0.41, 0.44, 0.15], prog_widocznosci: 10, liczba_zmian_terminu: 1,
  },
  {
    id: 2, tresc: "Czy jutro o 8:00 indeks jakości powietrza w Krakowie będzie „dobry”?", kategoria: "luz",
    odpowiedzi: ["tak", "nie"], kryterium: "Odczyt stacji Kraków-Kurdwanów w serwisie GIOŚ o 8:00.",
    link_zrodla: "https://example.invalid/gios", termin: "2026-10-04", status: "otwarte", wynik: null, link_rozstrzygniecia: null,
    komentarz_urzedu: null, liczba_prognoz: 11, utworzono: "2026-10-02T10:00:00Z", rozstrzygnieto: null,
    kurs_widoczny: true, kursy: [0.41, 0.59], prog_widocznosci: 10, liczba_zmian_terminu: 0,
  },
  {
    id: 3, tresc: "Czy wczoraj padało na Rynku Głównym?", kategoria: "luz",
    odpowiedzi: ["tak", "nie"], kryterium: "Dane IMGW.", link_zrodla: "https://example.invalid/imgw", termin: "2026-10-02",
    status: "rozstrzygniete", wynik: 2, link_rozstrzygniecia: "https://example.invalid/imgw/wynik", komentarz_urzedu: null,
    liczba_prognoz: 30, utworzono: "2026-10-01T10:00:00Z", rozstrzygnieto: "2026-10-03T02:00:00Z",
    kurs_widoczny: true, kursy: [0.72, 0.28], prog_widocznosci: 10, liczba_zmian_terminu: 0,
  },
];
const powody = [
  { pytanie: 1, powod: "wykonawca", liczba: 5, punkty: 120 },
  { pytanie: 1, powod: "pieniadze", liczba: 3, punkty: 60 },
  { pytanie: 1, powod: "formalnosci", liczba: 1, punkty: 10 },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mock(route: Route) {
  const req = route.request();
  const url = new URL(req.url());
  const p = url.pathname;
  const m = req.method();
  if (p.startsWith("/auth/v1/signup") || p.startsWith("/auth/v1/token")) return json(route, sesja);
  if (p === "/auth/v1/user") return json(route, sesja.user);
  if (p === "/rest/v1/gracze") return json(route, stan.gracz ? [stan.gracz] : []);
  if (p === "/rest/v1/rpc/ustaw_nick") {
    const body = req.postDataJSON() as { p_nick: string };
    stan.gracz = { id: UID, nick: body.p_nick, saldo: 1000, czy_admin: false };
    return json(route, stan.gracz);
  }
  if (p === "/rest/v1/v_pytania") {
    const id = url.searchParams.get("id");
    const lista = id ? pytania.filter((q) => String(q.id) === id.replace("eq.", "")) : pytania;
    if (req.headers()["accept"]?.includes("application/vnd.pgrst.object+json")) return json(route, lista[0] ?? null);
    return json(route, lista);
  }
  if (p === "/rest/v1/rpc/rozklad_powodow") return json(route, powody);
  if (p === "/rest/v1/rpc/komentarze_pytania") return json(route, []);
  if (p === "/rest/v1/v_moje_pozycje") return json(route, []);
  if (p === "/rest/v1/zmiany_terminow") return json(route, []);
  if (p === "/rest/v1/rpc/postaw_prognoze") {
    const body = req.postDataJSON() as { p_pytanie: number; p_odpowiedz: number; p_stawka: number; p_powod: string | null };
    if (body.p_pytanie === 1 && !body.p_powod) return json(route, { message: "Podaj powód" }, 400);
    stan.prognozy++;
    if (stan.gracz) stan.gracz.saldo -= body.p_stawka;
    return json(route, {
      pytanie: body.p_pytanie, odpowiedz: body.p_odpowiedz, stawka: body.p_stawka, udzialy: 23.7,
      kurs_przed: 0.41, kurs_po: 0.44, kursy: [0.44, 0.56], saldo: stan.gracz?.saldo ?? 990, liczba_prognoz: 12,
    });
  }
  if (p === "/rest/v1/rpc/admin_zaloguj") {
    const body = req.postDataJSON() as { p_haslo: string };
    const ok = body.p_haslo === "tajne";
    if (ok && stan.gracz) stan.gracz.czy_admin = true;
    return json(route, ok);
  }
  if (p === "/rest/v1/rpc/admin_pytania") return json(route, pytania.map((q) => ({ ...q, q: [0, 0, 0].slice(0, q.odpowiedzi.length), b: 1000, zaproponowal: null })));
  if (p === "/rest/v1/rpc/admin_dodaj_pytanie") return json(route, 4);
  if (m === "OPTIONS") return route.fulfill({ status: 204 });
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
async function zrzut(page: Page, nazwa: string) {
  numer++;
  fs.mkdirSync(ZRZUTY, { recursive: true });
  await page.screenshot({ path: path.join(ZRZUTY, `${String(numer).padStart(2, "0")}_${nazwa}.png`), fullPage: true });
}

async function oczekuj(page: Page, tekst: string, ms = 8000) {
  await page.getByText(tekst, { exact: false }).first().waitFor({ timeout: ms });
  console.log(`  ✓ „${tekst}”`);
}

let stronaDoZrzutu: Page | null = null;

async function main() {
  const serwer = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
  try {
    await czekajNaPort();
    const browser = await chromium.launch({ executablePath: chromiumPath(), args: ["--no-sandbox"] });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "pl-PL" });
    const page = await ctx.newPage();
    stronaDoZrzutu = page;
    page.on("pageerror", (e) => console.log(`  błąd strony: ${e.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`  console.error: ${msg.text().slice(0, 200)}`);
    });
    await ctx.route(`${SUPABASE}/**`, mock);

    console.log("1. Strona główna jako gość (rynki bez nicku)");
    await page.goto(`${ADRES}/`);
    await oczekuj(page, "Przeglądasz jako gość");
    await oczekuj(page, "41%");
    await oczekuj(page, "tłum się pomylił");
    await zrzut(page, "rynki_gosc");

    console.log("2. Klik „tak” na karcie → pytanie → nick → prognoza");
    await page.getByRole("button", { name: /^tak/ }).first().click();
    await oczekuj(page, "Kryterium rozstrzygnięcia");
    await oczekuj(page, "Żeby postawić, podaj nick");
    await page.getByPlaceholder("np. krowodrza_42").fill("krowodrza_42");
    await page.getByRole("button", { name: "Dalej" }).click();
    await oczekuj(page, "Masz 1000 punktów");
    await page.getByRole("button", { name: /Stawiam/ }).click();
    await oczekuj(page, "przesunęła kurs z 41% na 44%");
    await zrzut(page, "prognoza");
    await oczekuj(page, "krowodrza_42", 8000);

    console.log("3. Lista z nickiem");
    await page.goto(`${ADRES}/`);
    await oczekuj(page, "41%");
    await zrzut(page, "rynki");

    console.log("4. Pytanie „miasto”: zestawienie i powód");
    await page.goto(`${ADRES}/pytanie/1?odp=2`);
    await oczekuj(page, "Oficjalnie");
    await oczekuj(page, "41%, że zdążą");
    const przycisk = page.getByRole("button", { name: /Wybierz powód/ });
    await przycisk.waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: "wykonawca", exact: true }).click();
    await page.getByRole("button", { name: /Stawiam/ }).click();
    await oczekuj(page, "przesunęła kurs z 41% na 44%");
    await zrzut(page, "pytanie_miasto");

    console.log("5. Profil");
    await page.goto(`${ADRES}/profil`);
    await oczekuj(page, "trafił 0 z 0");
    await zrzut(page, "profil");

    console.log("6. /miasto (bez logowania)");
    const ctx2 = await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: "pl-PL" });
    await ctx2.route(`${SUPABASE}/**`, mock);
    const page2 = await ctx2.newPage();
    await page2.goto(`${ADRES}/miasto`);
    await oczekuj(page2, "Termin oficjalny");
    await oczekuj(page2, "Trwa procedura odbiorowa");
    await oczekuj(page2, "wykonawca");
    await zrzut(page2, "miasto");
    await ctx2.close();

    console.log("7. /admin");
    await page.goto(`${ADRES}/admin`);
    await oczekuj(page, "Panel admina");
    await page.getByLabel("Hasło").fill("zle");
    await page.getByRole("button", { name: "Zaloguj" }).click();
    await oczekuj(page, "Złe hasło");
    await page.getByLabel("Hasło").fill("tajne");
    await page.getByRole("button", { name: "Zaloguj" }).click();
    await oczekuj(page, "Dodaj pytanie");
    await oczekuj(page, "wyniki sportowe");
    await oczekuj(page, "Propozycje (kolejka)");
    await zrzut(page, "admin");

    console.log("8. /liczba i /qr");
    await page.goto(`${ADRES}/liczba`);
    await oczekuj(page, "Brak przeliczonych danych");
    await page.goto(`${ADRES}/qr`);
    await page.locator("img.qr").waitFor({ timeout: 5000 });
    await zrzut(page, "qr");

    await browser.close();
    console.log(`\nTEST UI OK (${stan.prognozy} prognozy przez RPC). Zrzuty: ${ZRZUTY}`);
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
