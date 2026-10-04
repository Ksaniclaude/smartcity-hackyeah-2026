// Render filmu: kompozycja wideo/film.tsx na dev serverze Vite, klatka po klatce w Chromium (kilka kart naraz),
// potem ffmpeg składa MP4 (H.264, 1920×1080, 60 kl./s). Bez materiału z aplikacji najpierw go nagrywa.
//
// Użycie:
//   npm run wideo                              # cały film → wideo/out/zdaza-25s.mp4
//   npm run wideo -- --klatki=0,300,900        # tylko wybrane klatki → wideo/out/podglad/k0300.png
//   npm run wideo -- --od=700 --do=1100        # fragment (klatki do wideo/out/klatki, bez MP4)
// Podgląd na żywo: npm run dev, potem http://localhost:5173/wideo/index.html?graj (albo ?klatka=600).

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";

const arg = (nazwa: string): string | null => {
  const a = process.argv.find((x) => x === `--${nazwa}` || x.startsWith(`--${nazwa}=`));
  if (!a) return null;
  return a.includes("=") ? a.slice(a.indexOf("=") + 1) : "";
};
const PORT = 4177;
const ADRES = `http://127.0.0.1:${PORT}`;
const OUT = path.resolve("wideo/out");
const WYBRANE = (arg("klatki") ?? "").split(",").map((x) => x.trim()).filter(Boolean).map(Number);
const KART = Math.max(1, Math.min(8, Number(arg("karty") ?? Math.max(2, Math.floor(os.cpus().length / 2)))));
const PLIK = path.join(OUT, "zdaza-25s.mp4");

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
      return await chromium.launch({ executablePath, args: ["--no-sandbox", "--force-color-profile=srgb", "--hide-scrollbars"] });
    } catch {
      /* następny kandydat */
    }
  }
  return chromium.launch({ args: ["--force-color-profile=srgb", "--hide-scrollbars"] });
}

async function czekajNaSerwer() {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${ADRES}/wideo/index.html`)).ok) return;
    } catch {
      /* jeszcze nie wstał */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Dev server nie wstał pod ${ADRES}`);
}

async function otworzFilm(browser: Browser): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error(`  ! film: ${e.message}`));
  await page.goto(`${ADRES}/wideo/index.html`);
  await page.waitForFunction(() => (window as unknown as { filmGotowy?: boolean }).filmGotowy === true, null, { timeout: 60000 });
  return page;
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
process.on("SIGINT", () => void sprzatnij().then(() => process.exit(1)));

try {
  if (!fs.existsSync("wideo/kadry/zaklad/opis.json")) {
    console.log("Brak materiału z aplikacji, nagrywam (npm run wideo:nagraj)…");
    const r = spawnSync(path.resolve("node_modules/.bin/tsx"), ["wideo/nagraj.ts"], { stdio: "inherit" });
    if (r.status !== 0) throw new Error("nagranie nieudane");
  }
  serwer = spawn(path.resolve("node_modules/.bin/vite"), ["--port", String(PORT), "--strictPort", "--clearScreen", "false"], {
    cwd: process.cwd(),
    stdio: ["ignore", "ignore", "ignore"],
    detached: true,
    env: { ...process.env, VITE_SUPABASE_URL: "https://test.supabase.local", VITE_SUPABASE_KEY: "test", BROWSER: "none" },
  });
  await czekajNaSerwer();
  browser = await uruchomPrzegladarke();

  const probna = await otworzFilm(browser);
  const KLATEK = await probna.evaluate(() => (window as unknown as { KLATEK: number }).KLATEK);
  const od = Number(arg("od") ?? 0);
  const ku = Math.min(KLATEK, Number(arg("do") ?? KLATEK));
  const lista = WYBRANE.length > 0 ? WYBRANE : Array.from({ length: ku - od }, (_, i) => od + i);
  const katalog = path.join(OUT, WYBRANE.length > 0 ? "podglad" : "klatki");
  if (WYBRANE.length === 0) fs.rmSync(katalog, { recursive: true, force: true });
  fs.mkdirSync(katalog, { recursive: true });

  const strony = [probna];
  for (let i = 1; i < Math.min(KART, lista.length); i++) strony.push(await otworzFilm(browser));
  let gotowe = 0;
  const t0 = Date.now();
  await Promise.all(
    strony.map(async (page, j) => {
      for (let n = j; n < lista.length; n += strony.length) {
        const f = lista[n];
        await page.evaluate((k) => (window as unknown as { ustawKlatke: (k: number) => Promise<void> }).ustawKlatke(k), f);
        await page.screenshot({ path: path.join(katalog, `k${String(f).padStart(4, "0")}.png`), animations: "disabled", caret: "hide" });
        gotowe++;
        if (gotowe % 50 === 0) process.stdout.write(`  ${gotowe}/${lista.length} klatek\r`);
      }
    }),
  );
  console.log(`✓ ${lista.length} klatek w ${((Date.now() - t0) / 1000).toFixed(0)} s → ${path.relative(process.cwd(), katalog)}/`);
  await sprzatnij();

  if (WYBRANE.length === 0 && od === 0 && ku === KLATEK) {
    const r = spawnSync(
      process.env.FFMPEG_PATH ?? "ffmpeg",
      ["-y", "-v", "error", "-framerate", "60", "-i", path.join(katalog, "k%04d.png"), "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", PLIK],
      { stdio: "inherit" },
    );
    if (r.status !== 0) throw new Error("ffmpeg nie złożył filmu (brew install ffmpeg albo FFMPEG_PATH=…)");
    console.log(`✓ film: ${path.relative(process.cwd(), PLIK)} (${(fs.statSync(PLIK).size / 1e6).toFixed(1)} MB)`);
  }
  process.exit(0);
} catch (e) {
  console.error(`RENDER NIEUDANY: ${e instanceof Error ? e.stack : String(e)}`);
  await sprzatnij();
  process.exit(1);
}
