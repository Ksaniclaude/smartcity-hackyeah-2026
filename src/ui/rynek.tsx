import { useEffect, useRef, type ReactElement, type ReactNode, type SVGProps } from "react";
import { Link, useNavigate } from "react-router-dom";
import { procent } from "@/api/lmsr";
import type { Kategoria, Pytanie } from "@/api/types";
import {
  IkBudzet,
  IkDokument,
  IkDol,
  IkDroga,
  IkDrzewo,
  IkGmach,
  IkGora,
  IkGwiazdka,
  IkLuz,
  IkMiasto,
  IkMost,
  IkPtaszek,
  IkTramwaj,
  IkZegar,
} from "@/ui/ikony";
import { formatujDate, formatujDateKrotko, opisPrognoz } from "@/ui/komponenty";
import { koniecTerminu, odliczanie, opisTerminu, ulamekCzasu, zmianaPp } from "@/ui/tekst";
import { LiczbaZywa, useTeraz, wystrzel } from "@/ui/zywe";

const DZIEN = 24 * 60 * 60 * 1000;
const KLASY_ODP = ["tak", "nie", "trzeci"] as const;

/** Klasa koloru odpowiedzi wg indeksu 0 | 1 | 2 (tak | nie | trzecia). */
export function klasaOdp(i: number): string {
  return KLASY_ODP[i] ?? "trzeci";
}

/** Format dla `LiczbaZywa`: wartość w procentach (0–100) jako „41%”. */
export const jakoProcent = (n: number) => `${Math.round(n)}%`;

/* ---------- piktogram tematu ---------- */

type Ikona = (p: SVGProps<SVGSVGElement>) => ReactElement;

/** Temat rozpoznawany po słowach z treści pytania; kolejność ma znaczenie (torowisko przed ulicą, ulica przed umową). */
const TEMATY: { wzor: RegExp; Ikona: Ikona }[] = [
  { wzor: /tramwaj|torowisk/, Ikona: IkTramwaj },
  { wzor: /kładk|most/, Ikona: IkMost },
  { wzor: /budżet|głosowan/, Ikona: IkBudzet },
  { wzor: /\bpark(?!ing)|drzew|zielen/, Ikona: IkDrzewo },
  { wzor: /centrum|muze|teatr|bibliotek|szkoł|stadion|basen/, Ikona: IkGmach },
  { wzor: /węz[eł]|\bul\.|ulic|drog|obwodnic|rond|\bs\d/, Ikona: IkDroga },
  { wzor: /przetarg|umow[ayę]|konkurs/, Ikona: IkDokument },
];

/** Kafelek z piktogramem tematu (tramwaj, most, ulica…); bez dopasowania ikona kategorii. */
export function Piktogram({ tresc, kategoria, duzy = false }: { tresc: string; kategoria: Kategoria; duzy?: boolean }) {
  const t = tresc.toLowerCase();
  const Ikona = TEMATY.find((x) => x.wzor.test(t))?.Ikona ?? (kategoria === "miasto" ? IkMiasto : IkLuz);
  return (
    <span className={`piktogram ${duzy ? "piktogram-duzy" : ""}`} aria-hidden="true">
      <Ikona />
    </span>
  );
}

/* ---------- drobne elementy rynku ---------- */

/** Zmiana kursu w punktach procentowych od otwarcia: strzałka i liczba; zero nie jest pokazywane. */
export function Zmiana({ pp, pelna = false }: { pp: number | null; pelna?: boolean }) {
  if (pp == null || pp === 0) return null;
  return (
    <span className={`zmiana ${pp > 0 ? "gora" : "dol"}`} title="Zmiana kursu od otwarcia rynku">
      {pp > 0 ? <IkGora /> : <IkDol />}
      {Math.abs(pp)}
      {pelna ? " pkt proc. od otwarcia" : null}
    </span>
  );
}

/** Termin słowami; z `zegar` w ostatniej dobie dochodzi odliczanie do końca dnia terminu. */
export function Termin({ termin, zegar = false }: { termin: string; zegar?: boolean }) {
  const teraz = useTeraz(zegar ? 1000 : 60000);
  const { tekst, pilnosc } = opisTerminu(termin, teraz);
  const koniec = koniecTerminu(termin);
  return (
    <span className={`termin ${pilnosc}`} title={`Koniec: ${formatujDate(termin)}`}>
      <IkZegar />
      {tekst}
      {zegar && pilnosc === "zaraz" && koniec > teraz ? <b className="cyfry">{odliczanie(koniec, teraz)}</b> : null}
    </span>
  );
}

/** Lont: ile czasu rynku zostało (pełny na otwarciu, znika w dniu terminu). */
export function PasekCzasu({ p }: { p: Pick<Pytanie, "otwarto" | "utworzono" | "termin"> }) {
  const teraz = useTeraz(60000);
  const zostalo = 1 - ulamekCzasu(p.otwarto ?? p.utworzono, p.termin, teraz);
  return (
    <span className={`pasek-czasu ${opisTerminu(p.termin, teraz).pilnosc}`} aria-hidden="true">
      <i style={{ width: `${(zostalo * 100).toFixed(1)}%` }} />
    </span>
  );
}

/** Licznik odsłonięcia: ile prognoz już jest z progu, po którym kurs tłumu staje się widoczny. */
export function Odsloniecie({ p }: { p: Pick<Pytanie, "liczba_prognoz" | "prog_widocznosci"> }) {
  const kropki = Math.max(1, Math.min(p.prog_widocznosci, 20));
  const pelne = Math.min(kropki, Math.round((p.liczba_prognoz / Math.max(1, p.prog_widocznosci)) * kropki));
  // kreski, które doszły od poprzedniego odpytania, zapalają się z podbiciem
  const poprzednie = useRef(pelne);
  const odKtorej = Math.min(poprzednie.current, pelne);
  useEffect(() => {
    poprzednie.current = pelne;
  }, [pelne]);
  return (
    <span className="odsloniecie" title={`Kurs tłumu pokaże się po ${p.prog_widocznosci} prognozach`}>
      {Array.from({ length: kropki }, (_, i) => (
        <i key={i} className={i < pelne ? (i >= odKtorej ? "pelny swiezy" : "pelny") : ""} />
      ))}
    </span>
  );
}

/** Pasek podziału kursu między dwie odpowiedzi. */
export function Podzial({ kursy }: { kursy: number[] }) {
  return (
    <span className="podzial" aria-hidden="true">
      <i className="tak" style={{ flexGrow: kursy[0] }} />
      <i className="nie" style={{ flexGrow: kursy[1] }} />
    </span>
  );
}

/**
 * Odpowiedzi rynku: dwie jako kafle obok siebie, więcej jako wiersze z paskiem kursu. Z `naWybor` są
 * przyciskami; bez niego (rynek zamknięty) tylko pokazują kurs. Gdy kurs tłumu jest ukryty, liczby to
 * kurs otwarcia i są wygaszone.
 */
export function Odpowiedzi({ p, naWybor, mojTyp }: { p: Pytanie; naWybor?: (odp: number) => void; mojTyp?: number | null }) {
  const ukryty = p.kursy == null;
  const pokazane = p.kursy ?? p.kursy_otwarcia;
  const dwie = p.odpowiedzi.length === 2;
  // chwila, w której rynek zebrał dość prognoz i kurs tłumu wychodzi z ukrycia
  const bylUkryty = useRef(ukryty);
  const odsloniety = bylUkryty.current && !ukryty;
  useEffect(() => {
    bylUkryty.current = ukryty;
  }, [ukryty]);
  const pozycje = p.odpowiedzi.map((o, i) => {
    const k = pokazane ? (pokazane[i] ?? null) : null;
    const wnetrze = (
      <>
        {!dwie && k != null && !ukryty ? <span className="pasek" style={{ width: `${Math.round(k * 100)}%` }} /> : null}
        <span className="nazwa">
          {o}
          {mojTyp === i + 1 ? <small>Twój typ</small> : null}
        </span>
        {k != null ? <LiczbaZywa className="cyfry kurs" wartosc={k * 100} format={jakoProcent} /> : null}
      </>
    );
    const klasa = `${dwie ? `kup kup-${klasaOdp(i)}` : `wynik wynik-${klasaOdp(i)}`} ${mojTyp === i + 1 ? "moj" : ""}`;
    return naWybor ? (
      <button type="button" key={i} className={klasa} onClick={() => naWybor(i + 1)}>
        {wnetrze}
      </button>
    ) : (
      <div key={i} className={`${klasa} bez-akcji`}>
        {wnetrze}
      </div>
    );
  });
  return <div className={`${dwie ? "rynek-przyciski" : "wyniki"} ${ukryty ? "ukryte" : ""} ${odsloniety ? "odsloniete" : ""}`}>{pozycje}</div>;
}

/* ---------- karta rynku ---------- */

interface PropsKarty {
  p: Pytanie;
  obserwowany?: boolean;
  /** Bez tej funkcji karta nie pokazuje gwiazdki (np. „Podobne rynki”). */
  przelaczObserwowanie?: (id: number) => void;
  /** Numer odpowiedzi, na którą gracz ma udziały (główny typ); kafel tej odpowiedzi dostaje podpis „Twój typ”. */
  mojTyp?: number | null;
}

/** Karta rynku: piktogram i pytanie, odpowiedzi z kursem jako przyciski, stopka z liczbą prognoz i terminem. */
export function KartaRynku({ p, obserwowany = false, przelaczObserwowanie, mojTyp }: PropsKarty) {
  const navigate = useNavigate();
  const otwarte = p.status === "otwarte";
  const zakonczone = p.status === "rozstrzygniete" || p.status === "uniewaznione";
  const kursy = p.kursy;
  const ukryty = otwarte && kursy == null;
  const otwartoMs = p.otwarto ? new Date(p.otwarto).getTime() : Number.NaN;
  const nowy = otwarte && !ukryty && Number.isFinite(otwartoMs) && Date.now() - otwartoMs < 3 * DZIEN;

  // Rozstrzygnięcie: ile tłum dawał na faktyczny wynik i czy trafił (wynik miał najwyższy kurs).
  const wynik = p.status === "rozstrzygniete" && p.wynik != null ? p.wynik : null;
  const kursWyniku = wynik != null && kursy ? (kursy[wynik - 1] ?? null) : null;
  const tlumTrafil = kursWyniku != null && kursy ? kursWyniku === Math.max(...kursy) : null;

  let srodek: ReactNode;
  if (zakonczone) {
    const klasa = p.status === "uniewaznione" ? "uniewazniony" : tlumTrafil == null ? "" : tlumTrafil ? "trafiony" : "chybiony";
    srodek = (
      <div className={`rynek-wynik ${klasa}`}>
        {p.status === "uniewaznione" ? (
          <span>unieważnione, punkty zwrócone</span>
        ) : (
          <>
            <span className="rynek-wynik-odp">
              <IkPtaszek />
              Wynik: <b>{wynik != null ? p.odpowiedzi[wynik - 1] : "–"}</b>
            </span>
            {tlumTrafil != null ? <span className="rynek-wynik-tlum">{tlumTrafil ? "tłum trafił" : "tłum się pomylił"}</span> : null}
            {kursWyniku != null ? (
              <span className="rynek-wynik-kurs">
                tłum dawał na to <b className="cyfry">{procent(kursWyniku)}</b>
              </span>
            ) : null}
          </>
        )}
      </div>
    );
  } else {
    srodek = (
      <>
        {ukryty && p.kursy_otwarcia ? <span className="rynek-otwarcie">kurs otwarcia</span> : null}
        {kursy && kursy.length === 2 ? <Podzial kursy={kursy} /> : null}
        <Odpowiedzi p={p} mojTyp={mojTyp} naWybor={otwarte ? (odp) => navigate(`/pytanie/${p.id}?odp=${odp}`) : undefined} />
      </>
    );
  }

  return (
    <article className={`rynek ${zakonczone ? "rynek-zakonczony" : ""}`}>
      <div className="rynek-gora">
        <Link to={`/pytanie/${p.id}`} className="rynek-link">
          <Piktogram tresc={p.tresc} kategoria={p.kategoria} />
          <h3 className="rynek-tytul" title={p.tresc}>
            {p.tresc}
          </h3>
        </Link>
        {przelaczObserwowanie ? (
          <button
            type="button"
            className="przycisk-ikona gwiazdka"
            aria-label="Obserwuj"
            aria-pressed={obserwowany}
            title={obserwowany ? "Przestań obserwować" : "Obserwuj"}
            onClick={(e) => {
              if (!obserwowany) wystrzel(e.currentTarget, { ile: 8, moc: 0.45 });
              przelaczObserwowanie(p.id);
            }}
          >
            <IkGwiazdka pelna={obserwowany} />
          </button>
        ) : null}
      </div>
      {srodek}
      <div className="rynek-dol">
        {nowy ? <span className="znacznik znacznik-nowy">nowy</span> : null}
        {p.status === "zamkniete" ? <span className="znacznik znacznik-zamkniety">zamknięte</span> : null}
        {ukryty ? <Odsloniecie p={p} /> : null}
        <span className="rynek-meta" title={ukryty ? `Kurs tłumu pokaże się po ${p.prog_widocznosci} prognozach` : undefined}>
          {opisPrognoz(p)}
        </span>
        {otwarte ? <Zmiana pp={zmianaPp(kursy?.[0], p.kursy_otwarcia?.[0])} /> : null}
        <span className="prawy">
          {otwarte ? <Termin termin={p.termin} /> : <span>do {formatujDateKrotko(p.termin)}</span>}
        </span>
      </div>
      {otwarte ? <PasekCzasu p={p} /> : null}
    </article>
  );
}
