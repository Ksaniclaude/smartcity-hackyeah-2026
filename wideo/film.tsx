// Zdążą? — film 25 s (1920×1080, 60 kl./s). Każdy kadr jest funkcją numeru klatki `f`; renderuj.ts ustawia klatkę
// przez window.ustawKlatke(f) i robi zrzut. Materiał z aplikacji (zrzuty, nagranie zakładu) jest w wideo/kadry/
// (npm run wideo:nagraj), a plansza do relacji rysuje się tą samą funkcją co w aplikacji (rysujRelacje).
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource-variable/bricolage-grotesque/wdth.css";
import "@/ui/styles.css";
import "./film.css";
import { useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { IkKopiuj, IkRelacja, IkTelegram, IkWhatsApp, IkX } from "@/ui/ikony";
import { rysujRelacje } from "@/ui/udostepnij";
import { krzywa } from "@/ui/wykres";
import { FPS, interp, lerp, los, s, sprezyna, wejscie, wejscieWyjscie, wyjscie, wyjscieMocne } from "./czas";

const KADRY = "/wideo/kadry";
export const KLATEK = s(25);

/** Sceny jako [pierwsza klatka, klatka po ostatniej]; sąsiednie zachodzą na siebie na czas przejścia. */
const SCENY = {
  pytania: [0, 186],
  logo: [186, 294],
  polska: [290, 480],
  wykres: [474, 726],
  zaklad: [720, 986],
  postep: [980, 1124],
  dalej: [1118, 1250],
  koniec: [1244, KLATEK],
} as const satisfies Record<string, readonly [number, number]>;

interface Opis {
  fps: number;
  klatek: number;
  klikniecia: { klatka: number; x: number; y: number }[];
}
let opisZakladu: Opis = { fps: FPS, klatek: 1, klikniecia: [] };
let plansza = "";

/* ---------- drobne klocki ---------- */

const pad4 = (n: number) => String(n).padStart(4, "0");

/** Tekst wjeżdżający słowo po słowie spod maski; *gwiazdki* barwią słowo na żółto. `wyj` to klatka wyjazdu w górę. */
function Slowa({ tekst, l, start = 0, odstep = 3, wyj, klasa = "" }: { tekst: string; l: number; start?: number; odstep?: number; wyj?: number; klasa?: string }) {
  const slowa = tekst.split(" ");
  return (
    <span className={klasa}>
      {slowa.map((w, i) => {
        const akcent = w.startsWith("*");
        const czyste = w.replace(/\*/g, "");
        const p = sprezyna(l - start - i * odstep, { sztywnosc: 260, tlumienie: 24 });
        const out = wyj != null ? interp(l, [wyj + i * 1.5, wyj + i * 1.5 + 12], [0, 1], wejscie) : 0;
        const y = (1 - p) * 110 - out * 115;
        return (
          <span key={i}>
            {i > 0 ? " " : null}
            <span className="slowo-maska">
              <span className={`slowo ${akcent ? "akcent" : ""}`} style={{ transform: `translateY(${y}%)` }}>
                {czyste}
              </span>
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Zegar ze znaku (favicon): wskazówki obracają się o podane kąty. */
function Zegar({ minuta = 0, godzina = 0 }: { minuta?: number; godzina?: number }) {
  return (
    <svg viewBox="0 0 30 30" aria-hidden="true">
      <circle cx="15" cy="15" r="7.6" fill="none" stroke="currentColor" strokeWidth="2.6" />
      <path d="M15 15V10.6" transform={`rotate(${minuta} 15 15)`} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M15 15l-3.1-5" transform={`rotate(${godzina} 15 15)`} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

/** Pierścień kresek wokół znaku (motyw z planszy og.png); `ile` to odsłonięta część obwodu. */
function Tarcza({ r, ile, obrot = 0, grubosc = 4, dlugosc = 18 }: { r: number; ile: number; obrot?: number; grubosc?: number; dlugosc?: number }) {
  const n = 60;
  const rozmiar = (r + dlugosc) * 2 + 8;
  const c = rozmiar / 2;
  return (
    <svg width={rozmiar} height={rozmiar} style={{ position: "absolute", left: "50%", top: "50%", margin: `${-c}px 0 0 ${-c}px`, transform: `rotate(${obrot}deg)` }} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => {
        if (i / n >= ile) return null;
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const dl = i % 5 === 0 ? dlugosc : dlugosc * 0.55;
        return (
          <line
            key={i}
            x1={c + Math.cos(a) * r}
            y1={c + Math.sin(a) * r}
            x2={c + Math.cos(a) * (r + dl)}
            y2={c + Math.sin(a) * (r + dl)}
            stroke={i % 5 === 0 ? "var(--akcent)" : "var(--linia-2)"}
            strokeWidth={grubosc}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

function Znak({ rozmiar, styl, minuta = 0, godzina = 0, children }: { rozmiar: number; styl?: CSSProperties; minuta?: number; godzina?: number; children?: ReactNode }) {
  return (
    <div className="znak" style={{ width: rozmiar, height: rozmiar, ...styl }}>
      {children}
      <Zegar minuta={minuta} godzina={godzina} />
    </div>
  );
}

function IkonaZegara() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function Telefon({ src, styl, children, klasa = "" }: { src: string; styl?: CSSProperties; children?: ReactNode; klasa?: string }) {
  return (
    <div className={`telefon ${klasa}`} style={styl}>
      <div className="film-ekran">
        <img src={src} alt="" />
        {children}
      </div>
    </div>
  );
}

function Podzial({ kursy, szer }: { kursy: number[]; szer: number }) {
  const klasy = ["tak", "nie", "trzeci"];
  return (
    <div className="film-podzial" style={{ width: szer }}>
      {kursy.map((k, i) => (
        <i key={i} className={klasy[i]} style={{ flexGrow: k, flexBasis: 0 }} />
      ))}
    </div>
  );
}

/** Monety lecące łukiem jak lecPunkty z aplikacji, tylko z czasem liczonym z klatki. */
function Monety({ l, od, dokad, ile, start = 0, skala = 1, ziarno = 1, odstep = 1.6 }: { l: number; od: (i: number) => [number, number]; dokad: (i: number) => [number, number]; ile: number; start?: number; skala?: number; ziarno?: number; odstep?: number }) {
  return (
    <>
      {Array.from({ length: ile }, (_, i) => {
        const czas = 26 + los(ziarno + i) * 12;
        const t = (l - start - i * odstep) / czas;
        if (t <= 0 || t >= 1) return null;
        const [ax, ay] = od(i);
        const [bx, by] = dokad(i);
        const odchyl = (los(ziarno * 7 + i) - 0.5) * 360;
        const dx = bx - ax;
        const dy = by - ay;
        const dl = Math.hypot(dx, dy) || 1;
        const cx = ax + dx / 2 - (dy / dl) * odchyl;
        const cy = ay + dy / 2 + (dx / dl) * odchyl;
        const u = wejscieWyjscie(t);
        const x = (1 - u) * (1 - u) * ax + 2 * (1 - u) * u * cx + u * u * bx;
        const y = (1 - u) * (1 - u) * ay + 2 * (1 - u) * u * cy + u * u * by;
        const sk = (t < 0.18 ? lerp(0.3, 1.1, t / 0.18) : lerp(1.1, 0.75, (t - 0.18) / 0.82)) * skala;
        return <i key={i} className="moneta" style={{ transform: `translate(${x - 8}px, ${y - 8}px) scale(${sk})`, opacity: t < 0.18 ? t / 0.18 : 1 }} />;
      })}
    </>
  );
}

/** Fala uderzenia i drobiny (fala/wystrzel z aplikacji) od klatki `start`. */
function Wybuch({ l, x, y, start, promien = 160, ile = 26, moc = 1.4, ziarno = 3 }: { l: number; x: number; y: number; start: number; promien?: number; ile?: number; moc?: number; ziarno?: number }) {
  const t = l - start;
  if (t < 0 || t > 80) return null;
  const pf = interp(t, [0, 37], [0, 1], wyjscie);
  const r = lerp(8, promien, pf);
  const klasy = ["", "jasna", "tak"];
  return (
    <>
      {t <= 37 ? <i className="fala" style={{ left: x, top: y, width: r * 2, height: r * 2, margin: `${-r}px 0 0 ${-r}px`, opacity: t < 11 ? 1 : interp(t, [11, 37], [0.9, 0]) }} /> : null}
      {Array.from({ length: ile }, (_, i) => {
        const czas = 45 + los(ziarno + i * 3) * 24;
        const u = t / czas;
        if (u >= 1) return null;
        const kat = los(ziarno + i) < 0.8 ? -Math.PI * los(ziarno * 5 + i) : Math.PI * los(ziarno * 5 + i);
        const zasieg = (60 + los(ziarno * 9 + i) * 140) * moc;
        const dx = Math.cos(kat) * zasieg;
        const dy = Math.sin(kat) * zasieg;
        const opad = 60 + los(ziarno * 11 + i) * 80;
        const e = wyjscieMocne(Math.min(1, u / 0.55));
        const xx = u < 0.55 ? dx * e : lerp(dx, dx * 1.15, (u - 0.55) / 0.45);
        const yy = u < 0.55 ? dy * e : lerp(dy, dy + opad, (u - 0.55) / 0.45);
        const obr = (los(ziarno * 13 + i) - 0.5) * 720 * u;
        const sk = u < 0.55 ? 1.6 : lerp(1.6, 0.6, (u - 0.55) / 0.45);
        return (
          <i
            key={i}
            className={`drobina ${klasy[i % 3]} ${i % 2 === 0 ? "okragla" : ""}`}
            style={{ left: x, top: y, transform: `translate(${xx}px, ${yy}px) rotate(${obr}deg) scale(${sk})`, opacity: u < 0.55 ? 1 : 1 - (u - 0.55) / 0.45 }}
          />
        );
      })}
    </>
  );
}

/* ---------- scena 1: pytania (prawdziwe rynki z zdaza.com, skrócone do hasła) ---------- */

const PYTANIA = [
  { tekst: "Podcast Chajzerów przebije *milion?*", miasto: "Polska", termin: "do 31 paź", kursy: [0.31, 0.69], etykieta: "szans na „tak”" },
  { tekst: "Behemoth wyprzeda *Spodek?*", miasto: "Katowice", termin: "do 25 paź", kursy: [0.47, 0.53], etykieta: "szans na „tak”" },
  { tekst: "Kibice Wisły wejdą na *Łazienkowską?*", miasto: "Warszawa", termin: "11 paź", kursy: [0.22, 0.78], etykieta: "szans na „tak”" },
  { tekst: "Tramwaje wrócą na *Podwale?*", miasto: "Gdańsk", termin: "5 paź", kursy: [0.71, 0.24, 0.05], etykieta: "szans, że w terminie" },
  { tekst: "Benzyna poniżej *7 zł?*", miasto: "Polska", termin: "do 31 paź", kursy: [0.57, 0.43], etykieta: "szans na „tak”" },
];
const ODSTEP_PYTAN = 36;

function Pytania({ l }: { l: number }) {
  return (
    <div className="warstwa">
      {PYTANIA.map((p, i) => {
        const li = l - i * ODSTEP_PYTAN;
        if (li < 0 || li > 40) return null;
        const wej = sprezyna(li, { sztywnosc: 300, tlumienie: 26 });
        const wejKursu = sprezyna(li - 5, { sztywnosc: 300, tlumienie: 26 });
        const wyj = interp(li, [28, 38], [0, 1], wejscie);
        const kurs = lerp(50, p.kursy[0] * 100, interp(li, [4, 26], [0, 1], wyjscie));
        const rozklad = p.kursy.map((k) => lerp(1 / p.kursy.length, k, interp(li, [4, 26], [0, 1], wyjscie)));
        return (
          <div key={i} className="warstwa" style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 150px" }}>
            <div style={{ display: "flex", gap: 16, opacity: wej * (1 - wyj), transform: `translateY(${(1 - wej) * 30 - wyj * 60}px)` }}>
              <span className="film-chip">{p.miasto}</span>
              <span className="film-chip czas">
                <IkonaZegara />
                {p.termin}
              </span>
            </div>
            <div className="wysw" style={{ fontSize: 150, marginTop: 34, maxWidth: 1640 }}>
              <Slowa tekst={p.tekst} l={li} odstep={2} wyj={28} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 40, marginTop: 48, opacity: wejKursu * (1 - wyj), transform: `translateY(${(1 - wejKursu) * 40 - wyj * 60}px)` }}>
              <span className="film-cyfry tak-tekst" style={{ fontSize: 150 }}>
                {Math.round(kurs)}%
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <span className="mute" style={{ fontSize: 36, fontWeight: 600 }}>
                  {p.etykieta}
                </span>
                <Podzial kursy={rozklad} szer={560} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- scena 2: znak ---------- */

function Logo({ l }: { l: number }) {
  const znak = sprezyna(l - 2, { sztywnosc: 240, tlumienie: 15 });
  const wyj = interp(l, [94, 108], [0, 1], wejscie);
  const minuta = interp(l, [2, 56], [-720, 0], wyjscieMocne);
  const godzina = interp(l, [2, 56], [-150, 0], wyjscieMocne);
  const litery = ["Z", "d", "ą", "ż", "ą", "?"];
  return (
    <div className="warstwa" style={{ opacity: 1 - wyj, transform: `scale(${1 + l * 0.0005 - wyj * 0.06})` }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 300, display: "flex", justifyContent: "center", alignItems: "center", gap: 56 }}>
        <div style={{ position: "relative", width: 210, height: 210, transform: `scale(${znak}) rotate(${(1 - znak) * -40}deg)` }}>
          <Tarcza r={142} ile={interp(l, [8, 44], [0, 1], wyjscie)} obrot={l * 0.25} />
          <Znak rozmiar={210} minuta={minuta} godzina={godzina} />
        </div>
        <div className="wysw" style={{ fontSize: 236, display: "flex" }}>
          {litery.map((z, i) => {
            const p = sprezyna(l - 4 - i * 2.5, { sztywnosc: 280, tlumienie: 20 });
            const ostatni = i === litery.length - 1;
            const kiwniecie = ostatni ? Math.sin(Math.max(0, l - 24) / 5) * Math.exp(-Math.max(0, l - 24) / 14) * 14 : 0;
            return (
              <span key={i} className="slowo-maska">
                <span className={`slowo ${ostatni ? "akcent" : ""}`} style={{ transform: `translateY(${(1 - p) * 110}%) rotate(${kiwniecie}deg)`, transformOrigin: "50% 80%" }}>
                  {z}
                </span>
              </span>
            );
          })}
        </div>
      </div>
      <div className="wysw" style={{ position: "absolute", left: 0, right: 0, top: 640, textAlign: "center", fontSize: 92 }}>
        <Slowa tekst="Polski rynek prognoz" l={l} start={22} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 772, textAlign: "center", fontSize: 46, fontWeight: 600 }} className="mute">
        <Slowa tekst="bez złotówek, na punkty" l={l} start={34} odstep={2} />
      </div>
    </div>
  );
}

/* ---------- scena 3: cała Polska, dowolne tematy ---------- */

const KARTY = [60, 40, 48, 38, 4, 28, 37, 51, 46, 39, 58, 41, 47, 43, 63, 59];
const TEMATY = ["celebryci", "mecze", "koncerty", "tramwaje", "ceny paliw", "polityka"];

/** Telefon z przewijaną stroną: nagłówek i dolna nawigacja stoją, treść jedzie (jak w aplikacji). */
function TelefonPrzewijany({ src, ekran, przewiniecie, styl }: { src: string; ekran: string; przewiniecie: number; styl?: CSSProperties }) {
  return (
    <div className="telefon" style={styl}>
      <div className="film-ekran">
        <img src={src} alt="" className="dlugi" style={{ transform: `translateY(${-przewiniecie}px)` }} />
        <div className="pasek-gora" style={{ backgroundImage: `url(${ekran})` }} />
        <div className="pasek-dol" style={{ backgroundImage: `url(${ekran})` }} />
      </div>
    </div>
  );
}

function Polska({ l }: { l: number }) {
  const sciana = interp(l, [0, 16], [0, 1], wyjscie);
  const tel = sprezyna(l - 4, { sztywnosc: 170, tlumienie: 19 });
  const wyj = interp(l, [176, 190], [0, 1], wejscie);
  const najazd = interp(l, [0, 190], [0, 1]);
  const przewiniecie = interp(l, [44, 172], [0, 700], wejscieWyjscie);
  const kolumny = [0, 1, 2].map((c) => KARTY.filter((_, i) => i % 3 === c));
  return (
    <div className="warstwa" style={{ opacity: 1 - wyj, transform: `scale(${1 + wyj * 0.12})` }}>
      {/* ściana kart rynków, przesuwana w kolumnach w przeciwne strony */}
      <div style={{ position: "absolute", left: 1040, top: -330, width: 1500, height: 1800, transform: "perspective(2200px) rotateX(16deg) rotateZ(-11deg)", opacity: 0.3 * sciana }}>
        {kolumny.map((karty, c) => {
          const h = 289 + 26;
          const dlugosc = karty.length * h;
          const przesuniecie = (((c % 2 === 0 ? -1 : 1) * (l + 40) * 3.4 + c * 140) % dlugosc + dlugosc) % dlugosc;
          return (
            <div key={c} style={{ position: "absolute", left: c * 450, top: -przesuniecie, width: 414 }}>
              {[...karty, ...karty, ...karty].map((id, i) => (
                <img key={i} src={`${KADRY}/karty/karta_${id}.png`} alt="" style={{ display: "block", width: 414, height: 289, marginBottom: 26, borderRadius: 16 }} />
              ))}
            </div>
          );
        })}
      </div>
      <TelefonPrzewijany
        src={`${KADRY}/tel_rynki_cala.png`}
        ekran={`${KADRY}/tel_rynki.png`}
        przewiniecie={przewiniecie}
        styl={{
          left: 1250,
          top: 104,
          transform: `perspective(2400px) translateX(${(1 - tel) * 700}px) rotateY(${-15 + 7 * najazd - (1 - tel) * 18}deg) rotateZ(${(1 - tel) * 4}deg) scale(${0.95 + 0.07 * najazd})`,
        }}
      />
      <div className="wysw" style={{ position: "absolute", left: 150, top: 190, fontSize: 104, width: 1050 }}>
        <div>
          <Slowa tekst="Stawiasz *punkty*" l={l} start={8} />
        </div>
        <div>
          <Slowa tekst="na to, co wydarzy się" l={l} start={14} />
        </div>
        <div>
          <Slowa tekst="w Polsce." l={l} start={22} />
        </div>
      </div>
      <div className="mute" style={{ position: "absolute", left: 150, top: 590, fontSize: 46, fontWeight: 600 }}>
        <Slowa tekst="od miejskich inwestycji po celebrytów" l={l} start={34} odstep={2} />
      </div>
      <div style={{ position: "absolute", left: 150, top: 690, width: 1000, display: "flex", flexWrap: "wrap", gap: 14 }}>
        {TEMATY.map((m, i) => {
          const p = sprezyna(l - 54 - i * 5, { sztywnosc: 320, tlumienie: 18 });
          return (
            <span key={m} className={`film-chip ${i === 0 ? "czas" : "obrys"}`} style={{ transform: `scale(${0.6 + 0.4 * p})`, opacity: Math.min(1, p * 1.4) }}>
              {m}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- scena 4: kurs i wykres ---------- */

// historia rynku 60 z wideo/dane.ts (benzyna): ten sam przebieg co na zrzutach aplikacji
const BENZYNA = [0.5, 0.47, 0.44, 0.41, 0.38, 0.4, 0.43, 0.42, 0.46, 0.45, 0.49, 0.52, 0.5, 0.54, 0.57];
const RYSOWANIE: [number, number] = [18, 128];
const WYKRES = { szer: 940, wys: 600, pad: { l: 4, r: 80, t: 16, b: 16 }, od: 30, do: 70 };
const postepWykresu = (l: number) => interp(l, RYSOWANIE, [0, 1], wejscieWyjscie);
const wykresX = (i: number) => WYKRES.pad.l + (i / (BENZYNA.length - 1)) * (WYKRES.szer - WYKRES.pad.l - WYKRES.pad.r);
const wykresY = (k: number) => WYKRES.pad.t + (1 - (k * 100 - WYKRES.od) / (WYKRES.do - WYKRES.od)) * (WYKRES.wys - WYKRES.pad.t - WYKRES.pad.b);
/** Linia tą samą funkcją co wykres w aplikacji (gładka, monotoniczna między próbkami). */
const KRZYWA = krzywa(BENZYNA.map((k, i) => ({ x: wykresX(i), y: wykresY(k) })));
/** Punkty krzywej co kawałek długości (z prawdziwej ścieżki SVG), żeby głowa linii i liczba szły dokładnie po niej. */
let probkiKrzywej: { x: number; y: number }[] = [];

function przygotujKrzywa() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const sciezka = document.createElementNS("http://www.w3.org/2000/svg", "path");
  sciezka.setAttribute("d", KRZYWA);
  svg.appendChild(sciezka);
  svg.style.position = "absolute";
  svg.style.visibility = "hidden";
  document.body.appendChild(svg);
  const dl = sciezka.getTotalLength();
  probkiKrzywej = Array.from({ length: 1201 }, (_, i) => {
    const pt = sciezka.getPointAtLength((i / 1200) * dl);
    return { x: pt.x, y: pt.y };
  });
  svg.remove();
}

function yKrzywej(x: number): number {
  const p = probkiKrzywej;
  if (p.length === 0) return wykresY(BENZYNA[0]);
  if (x <= p[0].x) return p[0].y;
  let a = 0;
  let b = p.length - 1;
  while (b - a > 1) {
    const m = (a + b) >> 1;
    if (p[m].x <= x) a = m;
    else b = m;
  }
  const t = p[b].x === p[a].x ? 0 : (x - p[a].x) / (p[b].x - p[a].x);
  return lerp(p[a].y, p[b].y, Math.min(1, Math.max(0, t)));
}

const glowaWykresu = (l: number) => WYKRES.pad.l + postepWykresu(l) * (WYKRES.szer - WYKRES.pad.l - WYKRES.pad.r);
/** Kurs pod głową linii (0–1). */
const kursGlowy = (l: number) => (WYKRES.od + (1 - (yKrzywej(glowaWykresu(l)) - WYKRES.pad.t) / (WYKRES.wys - WYKRES.pad.t - WYKRES.pad.b)) * (WYKRES.do - WYKRES.od)) / 100;

function WykresFilmowy({ l }: { l: number }) {
  const { szer, wys, pad } = WYKRES;
  const prawy = szer - pad.r;
  const postep = postepWykresu(l);
  const glowa = glowaWykresu(l);
  const yGlowy = yKrzywej(glowa);
  const puls = postep >= 1 ? (l % 108) / 108 : 0;
  return (
    <svg className="film-wykres" width={szer} height={wys} viewBox={`0 0 ${szer} ${wys}`} style={{ overflow: "visible" }}>
      <defs>
        <clipPath id="odslona">
          <rect x={0} y={-20} width={glowa} height={wys + 40} />
        </clipPath>
      </defs>
      {[30, 40, 50, 60, 70].map((k) => (
        <g key={k}>
          <line x1={pad.l} x2={prawy} y1={wykresY(k / 100)} y2={wykresY(k / 100)} className="siatka" />
          <text x={prawy + 16} y={wykresY(k / 100) + 8} className="os">
            {k}%
          </text>
        </g>
      ))}
      <g clipPath="url(#odslona)">
        <path d={`${KRZYWA} V${wys - pad.b} H${pad.l} Z`} className="pole" opacity={interp(glowa, [pad.l, pad.l + 60], [0, 1])} />
        <path d={KRZYWA} className="linia" />
      </g>
      {postep > 0 ? (
        <g>
          {postep >= 1 ? <circle cx={glowa} cy={yGlowy} r={10 + puls * 26} className="puls" opacity={0.55 * (1 - puls)} /> : null}
          <circle cx={glowa} cy={yGlowy} r={11} className="punkt" />
        </g>
      ) : null}
    </svg>
  );
}

function Wykres({ l }: { l: number }) {
  const kurs = kursGlowy(l);
  // liczba barwi się jak LiczbaZywa: zielona, gdy kurs rośnie, czerwona, gdy spada
  const ruch = kurs - kursGlowy(l - 5);
  const kierunek = Math.abs(ruch) > 0.0015 ? Math.sign(ruch) : 0;
  const blysk = kierunek !== 0 ? 1 : 0;
  const kolor = kierunek > 0 ? "var(--tak-tekst)" : kierunek < 0 ? "var(--nie-tekst)" : "var(--tekst)";
  const przeg = sprezyna(l - 146, { sztywnosc: 150, tlumienie: 20 });
  const wyj = interp(l, [236, 252], [0, 1], wejscie);
  const zoom = interp(l, [154, 252], [1, 1.05], wyjscie);
  const wej = interp(l, [0, 14], [0, 1], wyjscie);
  return (
    <div className="warstwa" style={{ transform: `translateX(${-wyj * 1920}px)` }}>
      <div className="warstwa" style={{ opacity: wej * (1 - interp(l, [146, 172], [0, 1])), transform: `scale(${lerp(0.94, 1, wej)})` }}>
        <div className="wysw" style={{ position: "absolute", left: 150, top: 110, fontSize: 88, width: 1600 }}>
          <div>
            <Slowa tekst="Kurs pokazuje, jak bardzo" l={l} start={2} odstep={2} />
          </div>
          <div>
            <Slowa tekst="ludzie w to *wierzą.*" l={l} start={10} odstep={2} />
          </div>
        </div>
        <div style={{ position: "absolute", left: 150, top: 352, width: 620, opacity: interp(l, [16, 30], [0, 1]) }}>
          <div style={{ display: "flex", gap: 12 }}>
            <span className="film-chip" style={{ height: 46, fontSize: 24, padding: "0 20px" }}>
              Polska
            </span>
            <span className="film-chip czas" style={{ height: 46, fontSize: 24, padding: "0 20px" }}>
              <IkonaZegara />
              jeszcze 27 dni
            </span>
          </div>
          <p className="wysw" style={{ fontSize: 38, lineHeight: 1.18, color: "var(--tekst-2)", margin: "22px 0 0", fontWeight: 700 }}>
            Czy średnia cena benzyny 95 wg <span style={{ whiteSpace: "nowrap" }}>e-petrol.pl</span> spadnie poniżej 7,00 zł/l do 31 października 2026?
          </p>
        </div>
        <div style={{ position: "absolute", left: 150, top: 590, display: "flex", flexDirection: "column", gap: 22, opacity: interp(l, [18, 30], [0, 1]) }}>
          <span className="film-cyfry" style={{ fontSize: 250, color: kolor, transform: `translateY(${blysk * (kierunek > 0 ? 6 : -6)}px)` }}>
            {Math.round(kurs * 100)}%
          </span>
          <span className="mute" style={{ fontSize: 36, fontWeight: 600 }}>
            szans na „tak”
          </span>
          <Podzial kursy={[kurs, 1 - kurs]} szer={600} />
        </div>
        <div style={{ position: "absolute", left: 860, top: 330 }}>
          <WykresFilmowy l={l} />
        </div>
      </div>
      {/* ten sam rynek w aplikacji */}
      {l >= 140 ? (
        <div className="przegladarka" style={{ left: 240, top: 66, transform: `translateY(${(1 - przeg) * 1100}px) scale(${zoom})` }}>
          <div className="przegladarka-pasek">
            <div className="kropki">
              <i />
              <i />
              <i />
            </div>
            <div className="adres">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              zdaza.com/pytanie/60
            </div>
            <div style={{ width: 78 }} />
          </div>
          <img src={`${KADRY}/desktop_rynek.png`} alt="" />
        </div>
      ) : null}
    </div>
  );
}

/* ---------- scena 5: zakład (nagranie z aplikacji) ---------- */

const PRZED_POSTAW = 90;

/** Klatka nagrania dla klatki sceny: początek przyspieszony (wybór i stawka), od „Postaw” czas rzeczywisty. */
function klatkaNagrania(l: number): number {
  const START = 14;
  const POSTAW = 150;
  const k = l < PRZED_POSTAW ? START + (l * (POSTAW - START)) / PRZED_POSTAW : POSTAW + (l - PRZED_POSTAW);
  return Math.max(0, Math.min(opisZakladu.klatek - 1, Math.round(k)));
}

const KROKI = [
  { tekst: "Wybierasz odpowiedź", pod: "tak 47% · nie 53%", od: 14 },
  { tekst: "Stawiasz punkty", pod: "100 pkt z 860", od: 44 },
  { tekst: "Ruszasz kurs", pod: "47% → 52%", od: 96, klasa: "tak-tekst" },
  { tekst: "Wbijasz poziom", pod: "+35 doświadczenia · poziom 4", od: 152, klasa: "akcent" },
];

function Zaklad({ l }: { l: number }) {
  const k = klatkaNagrania(l);
  const wej = sprezyna(l, { sztywnosc: 170, tlumienie: 20 });
  // kamera: zbliżenie na kupon w chwili zakładu, potem oddech, żeby było widać nagrodę na dole ekranu
  const zblizenie = interp(l, [PRZED_POSTAW, PRZED_POSTAW + 26], [0, 1], wejscieWyjscie) * (1 - interp(l, [166, 194], [0, 1], wejscieWyjscie));
  const skala = lerp(1.06, 1.42, zblizenie) + interp(l, [194, 266], [0, 0.04]);
  const przesuniecieY = lerp(0, 300, zblizenie);
  return (
    <div className="warstwa">
      <div style={{ position: "absolute", left: 150, top: 120, width: 820, opacity: interp(l, [12, 24], [0, 1]) }} className="mute">
        <span style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.35 }}>Czy koncert Behemoth + Dimmu Borgir w Spodku 25.10.2026 zostanie wyprzedany?</span>
      </div>
      {KROKI.map((kr, i) => {
        const p = sprezyna(l - kr.od, { sztywnosc: 260, tlumienie: 22 });
        const nastepny = KROKI[i + 1];
        const przygasa = nastepny ? interp(l, [nastepny.od, nastepny.od + 10], [0, 1]) : 0;
        if (l < kr.od) return null;
        return (
          <div key={i} className={`film-krok ${przygasa < 0.5 ? "aktywny" : ""}`} style={{ top: 270 + i * 168, opacity: Math.min(1, p) * (1 - 0.55 * przygasa), transform: `translateX(${(1 - p) * -80}px)` }}>
            <span className="film-krok-nr">{i + 1}</span>
            <div>
              <div className="film-krok-tekst wysw">{kr.tekst}</div>
              <div className={`film-cyfry ${kr.klasa ?? "mute"}`} style={{ fontSize: 46, marginTop: 10, fontStretch: "88%" }}>
                {kr.pod}
              </div>
            </div>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 1121, top: 104, width: 418, height: 872, transform: `translateX(${(1 - wej) * 900}px) translateY(${przesuniecieY}px) scale(${skala})`, transformOrigin: "50% 0%" }}>
        <Telefon src={`${KADRY}/zaklad/k${pad4(k)}.jpg`} styl={{ left: 0, top: 0 }}>
          {opisZakladu.klikniecia.map((c) => {
            const d = k - c.klatka;
            if (d < -10 || d > 30) return null;
            const palec = d < 0 ? interp(d, [-10, -2], [0, 1]) : interp(d, [2, 10], [1, 0]);
            const r = interp(d, [0, 26], [10, 46], wyjscie);
            return (
              <span key={c.klatka}>
                {palec > 0 ? <i className="dotyk palec" style={{ left: c.x, top: c.y, opacity: palec, transform: `scale(${d < 0 ? 1.15 : 0.9})` }} /> : null}
                {d >= 0 ? <i className="dotyk krag" style={{ left: c.x - r, top: c.y - r, width: r * 2, height: r * 2, opacity: interp(d, [0, 26], [0.9, 0]) }} /> : null}
              </span>
            );
          })}
        </Telefon>
      </div>
    </div>
  );
}

/* ---------- scena 6: odznaki i ranking ---------- */

function Postep({ l }: { l: number }) {
  const wyj = interp(l, [130, 144], [0, 1], wejscie);
  const telefony = [
    { x: 1230, obrot: -4, src: `${KADRY}/tel_odznaki.png`, opoznienie: 6 },
    { x: 1620, obrot: 4, src: `${KADRY}/tel_ranking.png`, opoznienie: 14 },
  ];
  return (
    <div className="warstwa" style={{ transform: `translateX(${-wyj * 1920}px)` }}>
      <div className="wysw" style={{ position: "absolute", left: 150, top: 250, fontSize: 108, width: 900 }}>
        <div>
          <Slowa tekst="Zbierasz odznaki," l={l} start={6} />
        </div>
        <div>
          <Slowa tekst="wspinasz się" l={l} start={12} />
        </div>
        <div>
          <Slowa tekst="w *rankingu.*" l={l} start={18} />
        </div>
      </div>
      <div className="mute" style={{ position: "absolute", left: 150, top: 640, fontSize: 44, fontWeight: 600 }}>
        <Slowa tekst="od Sekundnika do Zegara atomowego" l={l} start={30} odstep={2} />
      </div>
      {telefony.map((t, i) => {
        const p = sprezyna(l - t.opoznienie, { sztywnosc: 150, tlumienie: 17 });
        const dryf = interp(l, [0, 144], [0, -30]) * (i === 0 ? 1 : 1.6);
        return (
          <Telefon
            key={i}
            src={t.src}
            styl={{ left: t.x - 209, top: 104, transform: `translateY(${(1 - p) * 1000 + dryf}px) rotate(${t.obrot * p}deg) scale(0.86)`, zIndex: 2 - i }}
          />
        );
      })}
    </div>
  );
}

/* ---------- scena 7: plansza do relacji ---------- */

const CELE = [
  { nazwa: "Relacja", Ikona: IkRelacja },
  { nazwa: "WhatsApp", Ikona: IkWhatsApp },
  { nazwa: "X", Ikona: IkX },
  { nazwa: "Telegram", Ikona: IkTelegram },
  { nazwa: "Link", Ikona: IkKopiuj },
];

function Dalej({ l }: { l: number }) {
  const wej = sprezyna(l - 2, { sztywnosc: 140, tlumienie: 17 });
  const wyj = interp(l, [118, 132], [0, 1], wejscie);
  const unos = Math.sin(l / 30) * 8;
  return (
    <div className="warstwa" style={{ opacity: 1 - wyj, transform: `scale(${1 - wyj * 0.05})` }}>
      <div className="wysw" style={{ position: "absolute", left: 150, top: 300, fontSize: 120 }}>
        <div>
          <Slowa tekst="Pochwal się" l={l} start={8} />
        </div>
        <div>
          <Slowa tekst="*prognozą.*" l={l} start={14} />
        </div>
      </div>
      <div className="mute" style={{ position: "absolute", left: 150, top: 600, width: 760, fontSize: 42, fontWeight: 600, lineHeight: 1.3 }}>
        <Slowa tekst="Plansza 9:16 do relacji na Instagramie i Facebooku" l={l} start={22} odstep={1.5} />
      </div>
      <div className="plansza" style={{ left: 1100, top: 132, transform: `perspective(2200px) translateX(${(1 - wej) * 900}px) translateY(${unos}px) rotateY(${(1 - wej) * 40 - 8}deg) scale(1.2)`, transformOrigin: "50% 50%" }}>
        {plansza ? <img src={plansza} alt="" /> : null}
      </div>
      {CELE.map((c, i) => {
        const p = sprezyna(l - 30 - i * 6, { sztywnosc: 300, tlumienie: 16 });
        const glowny = i === 0;
        return (
          <div key={c.nazwa} className={`cel ${glowny ? "glowny" : ""}`} style={{ top: 238 + i * 128, transform: `scale(${p})`, opacity: Math.min(1, p * 1.5) }}>
            <span className="cel-ikona">
              <c.Ikona />
            </span>
            <span className="cel-nazwa">{c.nazwa}</span>
          </div>
        );
      })}
      <div className="efekty">
        <Wybuch l={l} x={1689} y={286} start={70} promien={120} ile={18} moc={1.1} ziarno={31} />
      </div>
      {l >= 60 && l < 84 ? <i className="dotyk palec" style={{ left: 1689, top: 286, opacity: interp(l, [60, 66], [0, 1]) * (1 - interp(l, [74, 84], [0, 1])) }} /> : null}
    </div>
  );
}

/* ---------- scena 8: na start i adres ---------- */

function Koniec({ l }: { l: number }) {
  const licznik = Math.round(interp(l, [8, 54], [0, 1000], wyjscie));
  const wej = sprezyna(l, { sztywnosc: 220, tlumienie: 18 });
  const odjazd = interp(l, [104, 120], [0, 1], wejscie);
  const znak = sprezyna(l - 116, { sztywnosc: 220, tlumienie: 15 });
  const adres = sprezyna(l - 134, { sztywnosc: 260, tlumienie: 16 });
  const cx = 960;
  const cy = 360;
  const zrodla = (i: number): [number, number] => {
    const kat = los(i * 17 + 5) * Math.PI * 2;
    return [cx + Math.cos(kat) * 1150, cy + Math.sin(kat) * 700];
  };
  return (
    <div className="warstwa">
      <div className="warstwa" style={{ opacity: 1 - odjazd, transform: `translateY(${-odjazd * 120}px)` }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 170, textAlign: "center", transform: `scale(${0.7 + 0.3 * wej})` }}>
          <span className="film-cyfry akcent" style={{ fontSize: 330 }}>
            {licznik}
          </span>
        </div>
        <div className="wysw" style={{ position: "absolute", left: 0, right: 0, top: 520, textAlign: "center", fontSize: 84 }}>
          <Slowa tekst="punktów na start" l={l} start={12} />
        </div>
        <div className="mute" style={{ position: "absolute", left: 0, right: 0, top: 650, textAlign: "center", fontSize: 50, fontWeight: 600 }}>
          <Slowa tekst="Za darmo. Bez złotówek." l={l} start={40} odstep={2} />
        </div>
        <div className="efekty">
          <Monety l={l} od={zrodla} dokad={(i) => [cx + (los(i * 5 + 2) - 0.5) * 420, cy + (los(i * 3 + 7) - 0.5) * 120]} ile={22} start={0} skala={2.6} ziarno={9} odstep={1.1} />
          <Wybuch l={l} x={cx} y={cy} start={54} promien={300} ile={34} moc={2.2} ziarno={4} />
        </div>
      </div>
      {l >= 112 ? (
        <>
          <div style={{ position: "absolute", left: 0, right: 0, top: 250, display: "flex", justifyContent: "center", alignItems: "center", gap: 44 }}>
            <div style={{ position: "relative", width: 160, height: 160, transform: `scale(${znak})` }}>
              <Tarcza r={108} ile={interp(l, [120, 166], [0, 1], wyjscie)} obrot={l * 0.2} grubosc={3.5} dlugosc={14} />
              <Znak rozmiar={160} minuta={interp(l, [116, 166], [-360, 0], wyjscieMocne) + (l > 200 ? 30 : 0)} godzina={interp(l, [116, 166], [-80, 0], wyjscieMocne)} />
            </div>
            <div className="wysw" style={{ fontSize: 180 }}>
              <Slowa tekst="Zdążą?" l={l} start={120} />
            </div>
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 560, display: "flex", justifyContent: "center" }}>
            <div className="adres-duzy wysw" style={{ transform: `scale(${adres})`, opacity: Math.min(1, adres * 1.5) }}>
              zdaza.com
            </div>
          </div>
          <div className="mute" style={{ position: "absolute", left: 0, right: 0, top: 790, textAlign: "center", fontSize: 44, fontWeight: 600 }}>
            <Slowa tekst="Polski rynek prognoz na punkty" l={l} start={148} odstep={2} />
          </div>
          <div className="efekty">
            <Wybuch l={l} x={960} y={635} start={140} promien={420} ile={30} moc={2} ziarno={21} />
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ---------- przejścia i marka ---------- */

/** Żółta kurtyna: zakrywa kadr i odsłania następny (w górę albo w prawo). */
function Kurtyna({ f, od, kierunek }: { f: number; od: number; kierunek: "gora" | "prawo" }) {
  const t = f - od;
  if (t < 0 || t > 32) return null;
  const zakryte = interp(t, [0, 14], [0, 1], wejscieWyjscie);
  const odkryte = interp(t, [16, 32], [0, 1], wejscieWyjscie);
  const poz = (1 - zakryte) * 100 - odkryte * 100;
  const transform = kierunek === "gora" ? `translateY(${poz}%)` : `translateX(${-poz}%)`;
  return (
    <div className="warstwa" style={{ background: "var(--akcent)", transform, zIndex: 20 }}>
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 180, height: 180, margin: "-90px 0 0 -90px", color: "var(--na-akcencie)" }}>
        <Zegar minuta={t * 24} godzina={t * 2} />
      </div>
    </div>
  );
}

function StopkaMarki({ f }: { f: number }) {
  const widac = interp(f, [310, 330], [0, 1]) * (1 - interp(f, [1228, 1244], [0, 1]));
  if (widac <= 0) return null;
  return (
    <div className="stopka-marki" style={{ opacity: widac, zIndex: 15 }}>
      <Znak rozmiar={40} />
      zdaza.com
    </div>
  );
}

const w = (f: number, [a, b]: readonly [number, number]) => f >= a && f < b;

function Film({ f }: { f: number }) {
  return (
    <div className="scena">
      {w(f, SCENY.pytania) ? <Pytania l={f - SCENY.pytania[0]} /> : null}
      {w(f, SCENY.logo) ? <Logo l={f - SCENY.logo[0]} /> : null}
      {w(f, SCENY.polska) ? <Polska l={f - SCENY.polska[0]} /> : null}
      {w(f, SCENY.wykres) ? <Wykres l={f - SCENY.wykres[0]} /> : null}
      {w(f, SCENY.zaklad) ? <Zaklad l={f - SCENY.zaklad[0]} /> : null}
      {w(f, SCENY.postep) ? <Postep l={f - SCENY.postep[0]} /> : null}
      {w(f, SCENY.dalej) ? <Dalej l={f - SCENY.dalej[0]} /> : null}
      {w(f, SCENY.koniec) ? <Koniec l={f - SCENY.koniec[0]} /> : null}
      <Kurtyna f={f} od={278} kierunek="gora" />
      <Kurtyna f={f} od={970} kierunek="prawo" />
      <StopkaMarki f={f} />
    </div>
  );
}

/* ---------- start: podgląd w przeglądarce albo sterowanie z renderuj.ts ---------- */

let ustaw: (f: number) => void = () => undefined;

function Odtwarzacz({ poczatek }: { poczatek: number }) {
  const [f, setF] = useState(poczatek);
  ustaw = setF;
  return <Film f={f} />;
}

async function obrazyGotowe() {
  const obrazy = [...document.images];
  await Promise.all(
    obrazy.map((img) =>
      img.complete && img.naturalWidth > 0
        ? img.decode().catch(() => undefined)
        : new Promise<void>((r) => {
            img.addEventListener("load", () => void img.decode().then(() => r(), () => r()), { once: true });
            img.addEventListener("error", () => r(), { once: true });
          }),
    ),
  );
}

async function start() {
  const params = new URLSearchParams(location.search);
  try {
    opisZakladu = await (await fetch(`${KADRY}/zaklad/opis.json`)).json();
  } catch {
    console.warn("Brak wideo/kadry/zaklad/opis.json: uruchom npm run wideo:nagraj");
  }
  await document.fonts.load('800 100px "Bricolage Grotesque Variable"');
  await document.fonts.load('600 100px "IBM Plex Sans Variable"');
  await document.fonts.ready;
  przygotujKrzywa();
  // plansza do relacji rysowana tą samą funkcją co w aplikacji (prognoza z nagrania: 52% na „tak”)
  const plotno = rysujRelacje({
    tresc: "Czy koncert Behemoth + Dimmu Borgir w Spodku 25.10.2026 zostanie wyprzedany?",
    odpowiedz: "tak",
    indeks: 0,
    kurs: 0.52,
    url: "https://zdaza.com/pytanie/48",
    rodzaj: "moja",
  });
  plansza = plotno?.toDataURL("image/png") ?? "";

  const korzen = createRoot(document.getElementById("film")!);
  const poczatek = Number(params.get("klatka") ?? 0);
  flushSync(() => korzen.render(<Odtwarzacz poczatek={poczatek} />));

  const okno = window as unknown as { ustawKlatke: (f: number) => Promise<void>; filmGotowy: boolean; KLATEK: number };
  okno.KLATEK = KLATEK;
  okno.ustawKlatke = async (f: number) => {
    flushSync(() => ustaw(f));
    await obrazyGotowe();
  };
  await obrazyGotowe();
  okno.filmGotowy = true;

  if (params.has("graj")) {
    const t0 = performance.now();
    const krok = () => {
      const f = Math.floor(((performance.now() - t0) / 1000) * FPS) % KLATEK;
      ustaw(f);
      requestAnimationFrame(krok);
    };
    requestAnimationFrame(krok);
  }
}

void start();
