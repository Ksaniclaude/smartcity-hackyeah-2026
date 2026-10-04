// Materiał do filmu prosto z aplikacji: zrzuty ekranów (telefon w 3x, komputer w 2x), karty rynków i animacja
// zakładu nagrana klatka po klatce w 60 kl./s. Aplikacja chodzi na dev serverze Vite z zamockowanym Supabase
// (stan z wideo/dane.ts), a czas strony jest sztuczny: zegar Playwrighta przesuwa timery, requestAnimationFrame
// i performance.now, a animacje Web Animations i CSS są co klatkę zatrzymywane i ustawiane na ten sam czas.
// Dzięki temu monety, kupon, fala i licznik doświadczenia wyglądają w filmie dokładnie jak w aplikacji.
//
// Użycie: npm run wideo:nagraj [-- --tylko=zrzuty|zaklad]   → pliki w wideo/kadry/ (poza repo)

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright-core";
import { NICK, UID, stan } from "./dane";

const arg = (nazwa: string): string | null => {
  const a = process.argv.find((x) => x === `--${nazwa}` || x.startsWith(`--${nazwa}=`));
  if (!a) return null;
  return a.includes("=") ? a.slice(a.indexOf("=") + 1) : "";
};
const TYLKO = arg("tylko");
const PORT = 4176;
const ADRES = `http://127.0.0.1:${PORT}`;
const SUPABASE = "https://test.supabase.local";
const OUT = path.resolve("wideo/kadry");
const FPS = 60;

const teraz = Date.now();
const S = stan(teraz);

/* ---------- mock Supabase ---------- */

function b64url(s: string) {
  return Buffer.from(s).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
const jwt = `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(
  JSON.stringify({ sub: UID, role: "authenticated", is_anonymous: false, email: "kasztan@przyklad.pl", aud: "authenticated", exp: 4102444800, iat: 1700000000, session_id: "s1" }),
)}.podpis`;
const uzytkownik = { id: UID, aud: "authenticated", role: "authenticated", is_anonymous: false, email: "kasztan@przyklad.pl", email_confirmed_at: new Date(teraz - 864e5).toISOString(), app_metadata: {}, user_metadata: {}, created_at: new Date(teraz - 864e5 * 5).toISOString() };
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
  const cialo = () => (req.postDataJSON() ?? {}) as Record<string, number | string | null | undefined>;
  switch (p) {
    case "/rest/v1/gracze":
      return json(route, [S.gracz]);
    case "/rest/v1/v_moje_pozycje":
      return json(route, S.pozycje);
    case "/rest/v1/transakcje":
      return json(route, S.transakcje);
    case "/rest/v1/pozycje": {
      const pid = Number(url.searchParams.get("pytanie")?.replace("eq.", ""));
      return json(route, S.pozycje.filter((z) => z.pytanie === pid).map((z) => ({ odpowiedz: z.odpowiedz_glowna, udzialy: z.udzialy_glowne, wydane_punkty: z.wydane })));
    }
    case "/rest/v1/v_pytania": {
      const id = url.searchParams.get("id")?.replace("eq.", "");
      const lista = id ? S.pytania.filter((q) => String(q.id) === id) : S.pytania;
      if (req.headers()["accept"]?.includes("pgrst.object")) return json(route, lista[0] ?? null);
      return json(route, lista);
    }
    case "/rest/v1/rpc/historia_kursu":
      return json(route, S.historia[Number(cialo().p_pytanie)] ?? []);
    case "/rest/v1/rpc/aktywnosc": {
      const pid = cialo().p_pytanie;
      return json(route, pid == null ? S.aktywnosc : S.aktywnosc.filter((a) => a.pytanie === Number(pid)));
    }
    case "/rest/v1/rpc/komentarze_rynku":
      return json(route, Number(cialo().p_pytanie) === 48 ? S.komentarze : []);
    case "/rest/v1/rpc/najwieksi_gracze":
      return json(route, Number(cialo().p_pytanie) === 48 ? S.najwieksi : []);
    case "/rest/v1/rpc/ranking":
      return json(route, S.ranking);
    case "/rest/v1/rpc/szukaj_graczy":
      return json(route, []);
    case "/rest/v1/rpc/rozklad_powodow":
      return json(route, []);
    case "/rest/v1/rpc/profil_publiczny":
      return json(route, { nick: NICK, saldo: S.gracz.saldo, prognozy: S.transakcje.length, trafione: 0, rozstrzygniete: 0, zysk: 172.3, od: new Date(teraz - 864e5 * 5).toISOString() });
    case "/rest/v1/rpc/postaw_prognoze":
      return json(route, postaw(cialo()));
  }
  if (p.startsWith("/rest/v1/rpc/")) return json(route, {});
  return json(route, []);
}

/** Zakład liczony tym samym wzorem LMSR co panel (b = 1000); rynek, saldo, transakcje i wykres pamiętają wynik. */
function postaw(b: Record<string, number | string | null | undefined>) {
  const q = S.pytania.find((x) => x.id === Number(b.p_pytanie))!;
  const i = Number(b.p_odpowiedz ?? 1) - 1;
  const stawka = Number(b.p_stawka ?? 10);
  const kurs = q.kursy[i];
  const e = Math.exp(stawka / 1000);
  const kursPo = (e - 1 + kurs) / e;
  const udzialy = 1000 * Math.log((e - 1 + kurs) / kurs);
  const noweKursy = q.kursy.map((k, j) => (j === i ? kursPo : (k * (1 - kursPo)) / (1 - kurs)));
  q.kursy = noweKursy;
  q.liczba_prognoz += 1;
  q.obrot += stawka;
  S.gracz.saldo -= stawka;
  const czas = new Date().toISOString();
  S.historia[q.id]?.push({ czas, kursy: noweKursy });
  S.transakcje.unshift({
    id: 100 + S.transakcje.length, pytanie: q.id, odpowiedz: i + 1, stawka, udzialy, kurs_przed: kurs, kurs_po: kursPo, powod: null, komentarz: null,
    typ: "kupno", czas, pytania: { tresc: q.tresc, odpowiedzi: q.odpowiedzi, status: "otwarte", wynik: null },
  });
  S.pozycje.unshift({
    pytanie: q.id, tresc: q.tresc, kategoria: q.kategoria, odpowiedzi: q.odpowiedzi, status: "otwarte", termin: q.termin, wynik: null,
    odpowiedz_glowna: i + 1, wydane: stawka, wyplata: 0, trafione: null, kursy: noweKursy, udzialy_glowne: udzialy, wartosc: stawka,
  });
  return {
    pytanie: q.id, odpowiedz: i + 1, stawka, udzialy, kurs_przed: kurs, kurs_po: kursPo, kursy: noweKursy, saldo: S.gracz.saldo,
    liczba_prognoz: q.liczba_prognoz, obrot: q.obrot, sprzedano: [], zwrot_ze_sprzedazy: 0, miejsce_przed: 5, miejsce_po: 4,
  };
}

/* ---------- czas strony pod kontrolą nagrania ---------- */

/** Wstrzykiwane do strony: przewijanie bez wygładzania (zegar przeglądarki go nie słucha) i synchronizacja animacji. */
function przygotujStrone() {
  const bezWygladzania = (o: unknown) => (o && typeof o === "object" ? { ...(o as object), behavior: "instant" } : o);
  const sIV = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (o?: boolean | ScrollIntoViewOptions) {
    return sIV.call(this, bezWygladzania(o) as ScrollIntoViewOptions);
  };
  const eS = Element.prototype.scrollTo as (this: Element, ...args: unknown[]) => void;
  Element.prototype.scrollTo = function (this: Element, a?: ScrollToOptions | number, b?: number) {
    return typeof a === "object" ? eS.call(this, bezWygladzania(a)) : eS.call(this, a ?? 0, b ?? 0);
  } as typeof Element.prototype.scrollTo;
  const wS = window.scrollTo.bind(window);
  window.scrollTo = ((a?: ScrollToOptions | number, b?: number) =>
    typeof a === "object" ? wS(bezWygladzania(a) as ScrollToOptions) : wS(a ?? 0, b ?? 0)) as typeof window.scrollTo;

  // Każda animacja dostaje start w czasie zegara strony (chwila poprzedniej synchronizacji) i co klatkę
  // jest ustawiana na „teraz − start”; skończona kończy się naprawdę (onfinish sprząta monety i drobiny).
  const starty = new WeakMap<Animation, number>();
  let ostatni = performance.now();
  (window as unknown as { __synchronizuj: () => void }).__synchronizuj = () => {
    const t = performance.now();
    for (const a of document.getAnimations()) {
      if (!starty.has(a)) starty.set(a, ostatni);
      const uplynelo = t - starty.get(a)!;
      const koniec = a.effect?.getComputedTiming().endTime;
      const k = typeof koniec === "number" ? koniec : Infinity;
      if (uplynelo >= k) {
        if (a.playState !== "finished") a.finish();
      } else {
        a.pause();
        a.currentTime = uplynelo;
      }
    }
    ostatni = t;
  };
}

/* ---------- przeglądarka i serwer ---------- */

async function uruchomPrzegladarke(): Promise<Browser> {
  const kandydaci = [
    process.env.CHROMIUM_PATH ?? "",
    "/opt/pw-browsers/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter((k) => k && fs.existsSync(k));
  for (const executablePath of kandydaci) {
    try {
      return await chromium.launch({ executablePath, args: ["--no-sandbox", "--force-color-profile=srgb"] });
    } catch {
      /* następny kandydat */
    }
  }
  return chromium.launch({ args: ["--force-color-profile=srgb"] });
}

async function czekajNaSerwer() {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(ADRES)).ok) return;
    } catch {
      /* jeszcze nie wstał */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Dev server nie wstał pod ${ADRES}`);
}

const URZADZENIA = {
  tel: { width: 390, height: 844, dpr: 3 },
  telSekwencja: { width: 390, height: 844, dpr: 2 },
  desktop: { width: 1440, height: 900, dpr: 2 },
};

async function kontekst(browser: Browser, u: keyof typeof URZADZENIA): Promise<BrowserContext> {
  const w = URZADZENIA[u];
  const ctx = await browser.newContext({ viewport: { width: w.width, height: w.height }, deviceScaleFactor: w.dpr, locale: "pl-PL", timezoneId: "Europe/Warsaw" });
  await ctx.addInitScript(
    ({ zapisanaSesja, postep }: { zapisanaSesja: string; postep: string }) => {
      localStorage.setItem("sb-test-auth-token", zapisanaSesja);
      localStorage.setItem("zdaza.postep", postep);
    },
    { zapisanaSesja: JSON.stringify(sesja), postep: JSON.stringify(S.zapisPostepu) },
  );
  // tsx dokleja do funkcji wywołania __name (nazwy funkcji); w przeglądarce trzeba je podstawić
  await ctx.addInitScript("globalThis.__name = (f) => f;");
  await ctx.addInitScript(przygotujStrone);
  await ctx.route(`${SUPABASE}/**`, mock);
  return ctx;
}

async function wczytaj(page: Page, adres: string) {
  page.on("pageerror", (e) => console.error(`  ! ${adres}: ${e.message}`));
  await page.goto(`${ADRES}${adres}`);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);
}

/* ---------- zrzuty ---------- */

async function zrzuty(browser: Browser) {
  const tel = await kontekst(browser, "tel");
  for (const [adres, plik, cala] of [
    ["/", "tel_rynki", false],
    ["/pytanie/60", "tel_rynek", false],
    ["/pytanie/48", "tel_koncert", false],
    ["/profil", "tel_profil", false],
    ["/profil", "tel_profil_cala", true],
    ["/ranking", "tel_ranking", false],
  ] as const) {
    const page = await tel.newPage();
    await wczytaj(page, adres);
    await page.screenshot({ path: path.join(OUT, `${plik}.png`), fullPage: cala });
    console.log(`  ${plik}.png`);
    await page.close();
  }
  // odznaki: pasek poziomu u góry ekranu, pod nim tablica odznak
  const odznaki = await tel.newPage();
  await wczytaj(odznaki, "/profil?tab=odznaki");
  await odznaki.evaluate(() => {
    const pasek = [...document.querySelectorAll("h2, h3, b, strong, span")].find((el) => /^Poziom \d/.test(el.textContent ?? ""));
    const naglowek = document.querySelector(".naglowek")?.getBoundingClientRect().height ?? 58;
    if (pasek) window.scrollTo(0, pasek.getBoundingClientRect().top + window.scrollY - naglowek - 24);
  });
  await odznaki.waitForTimeout(300);
  await odznaki.screenshot({ path: path.join(OUT, "tel_odznaki.png") });
  console.log("  tel_odznaki.png");
  await tel.close();

  // strona główna w całości (2x), do przewijania na ekranie telefonu w filmie
  const telCala = await kontekst(browser, "telSekwencja");
  const glowna = await telCala.newPage();
  await wczytaj(glowna, "/");
  // dolna nawigacja jest przyklejona do ekranu; w filmie leży nad przewijaną treścią jako osobna warstwa
  await glowna.addStyleTag({ content: ".dol-nav { display: none !important; }" });
  await glowna.screenshot({ path: path.join(OUT, "tel_rynki_cala.png"), fullPage: true });
  console.log("  tel_rynki_cala.png");
  await telCala.close();

  const desk = await kontekst(browser, "desktop");
  for (const [adres, plik] of [
    ["/", "desktop_rynki"],
    ["/pytanie/60", "desktop_rynek"],
    ["/ranking", "desktop_ranking"],
  ] as const) {
    const page = await desk.newPage();
    await wczytaj(page, adres);
    await page.screenshot({ path: path.join(OUT, `${plik}.png`) });
    console.log(`  ${plik}.png`);
    if (adres === "/") {
      // pojedyncze karty rynków (do latających kart w filmie)
      fs.mkdirSync(path.join(OUT, "karty"), { recursive: true });
      const karty = page.locator("article.rynek");
      const ile = await karty.count();
      const zrobione = new Set<string>();
      for (let i = 0; i < ile; i++) {
        const karta = karty.nth(i);
        const href = await karta.locator("a.rynek-link").first().getAttribute("href");
        const id = href?.split("/").pop() ?? String(i);
        if (zrobione.has(id) || !(await karta.isVisible())) continue;
        zrobione.add(id);
        await karta.scrollIntoViewIfNeeded();
        await page.waitForTimeout(150);
        await karta.screenshot({ path: path.join(OUT, "karty", `karta_${id}.png`) });
      }
      console.log(`  karty/ (${zrobione.size})`);
    }
    await page.close();
  }
  await desk.close();
}

/* ---------- sekwencja zakładu klatka po klatce ---------- */

async function zaklad(browser: Browser) {
  const ctx = await kontekst(browser, "telSekwencja");
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date(teraz) });
  await wczytaj(page, "/pytanie/48");
  // panel prognozy tuż pod nagłówkiem: cały zakład dzieje się na jednym ekranie
  await page.evaluate(() => {
    const panel = document.getElementById("panel");
    const naglowek = document.querySelector(".naglowek")?.getBoundingClientRect().height ?? 58;
    if (panel) window.scrollTo(0, panel.getBoundingClientRect().top + window.scrollY - naglowek - 6);
  });
  await page.waitForTimeout(400);
  await page.clock.pauseAt(new Date(Date.now() + 1500));

  const katalog = path.join(OUT, "zaklad");
  fs.rmSync(katalog, { recursive: true, force: true });
  fs.mkdirSync(katalog, { recursive: true });

  const klik = async (selektor: string, tekst?: string) => {
    let el = page.locator(selektor);
    if (tekst) el = el.filter({ hasText: new RegExp(`^${tekst}$`) });
    const box = await el.first().boundingBox();
    if (!box) throw new Error(`Nie widać ${selektor}`);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.click(x, y);
    return { x, y };
  };
  const akcje: Record<number, (() => Promise<{ x: number; y: number }>) | undefined> = {
    30: () => klik("#panel .odp-przycisk.tak"),
    84: () => klik("#panel .stawka-szybkie button", "100"),
    150: () => klik("#panel .przycisk-postaw"),
  };
  const KLATEK = 150 + 6 * FPS;
  const klikniecia: { klatka: number; x: number; y: number }[] = [];
  const synchronizuj = () => page.evaluate(() => (window as unknown as { __synchronizuj: () => void }).__synchronizuj());
  await synchronizuj();
  for (let k = 0; k < KLATEK; k++) {
    if (k > 0) {
      await page.clock.runFor(Math.round((k * 1000) / FPS) - Math.round(((k - 1) * 1000) / FPS));
      await synchronizuj();
    }
    const akcja = akcje[k];
    if (akcja) klikniecia.push({ klatka: k, ...(await akcja()) });
    await page.waitForTimeout(akcja ? 60 : 6); // React i odpowiedzi mocka idą w czasie rzeczywistym
    await synchronizuj();
    await page.screenshot({ path: path.join(katalog, `k${String(k).padStart(4, "0")}.jpg`), type: "jpeg", quality: 90 });
    if (k % 60 === 0) process.stdout.write(`  zakład: ${k}/${KLATEK}\r`);
  }
  const w = URZADZENIA.telSekwencja;
  fs.writeFileSync(path.join(katalog, "opis.json"), JSON.stringify({ fps: FPS, klatek: KLATEK, szer: w.width, wys: w.height, dpr: w.dpr, klikniecia }, null, 2));
  console.log(`  zaklad/ (${KLATEK} klatek)        `);
  await ctx.close();
}

/* ---------- start ---------- */

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
process.on("SIGINT", () => void sprzatnij().then(() => process.exit(1)));

try {
  fs.mkdirSync(OUT, { recursive: true });
  serwer = spawn(path.resolve("node_modules/.bin/vite"), ["--port", String(PORT), "--strictPort", "--clearScreen", "false"], {
    cwd: process.cwd(),
    stdio: ["ignore", "ignore", "ignore"],
    detached: true,
    env: { ...process.env, VITE_SUPABASE_URL: SUPABASE, VITE_SUPABASE_KEY: "test", BROWSER: "none" },
  });
  await czekajNaSerwer();
  browser = await uruchomPrzegladarke();
  if (!TYLKO || TYLKO === "zrzuty") await zrzuty(browser);
  if (!TYLKO || TYLKO === "zaklad") await zaklad(browser);
  console.log(`✓ materiał w ${path.relative(process.cwd(), OUT)}/`);
  await sprzatnij();
  process.exit(0);
} catch (e) {
  console.error(`NAGRANIE NIEUDANE: ${e instanceof Error ? e.stack : String(e)}`);
  await sprzatnij();
  process.exit(1);
}
