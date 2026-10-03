import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  dodajKomentarz,
  pobierzAktywnosc,
  pobierzHistorie,
  pobierzKomentarze,
  pobierzMojePozycje,
  pobierzMojeUdzialy,
  pobierzNajwiekszych,
  pobierzPytania,
  pobierzPytanie,
  postawPrognoze,
  sprzedajUdzialy,
} from "@/api/api";
import { podgladSprzedazy, podgladZakladu, procent } from "@/api/lmsr";
import { useSesja, useUruchomSesje } from "@/api/sesja";
import {
  POWODY,
  type Aktywnosc,
  type Komentarz,
  type NajwiekszyGracz,
  type Powod,
  type PunktHistorii,
  type Pytanie as Rynek,
  type WynikSprzedazy,
  type WynikZakladu,
} from "@/api/types";
import { useAkcja, usePolling } from "@/ui/hooks";
import { IkGwiazdka, IkLink, IkPtaszek, IkStrzalka } from "@/ui/ikony";
import { Awatar, Komunikat, Ladowanie, OdznakaStatusu, formatujDate, formatujDateKrotko, opisPrognoz } from "@/ui/komponenty";
import { KartaRynku, Odsloniecie, Piktogram, Podzial, Termin, Zmiana, jakoProcent, klasaOdp } from "@/ui/rynek";
import { czasTemu, dniDo, liczba, odmien, pkt, punkty, zmianaPp } from "@/ui/tekst";
import { Wykres } from "@/ui/wykres";
import { Iskry, LiczbaZywa, useWidoczny } from "@/ui/zywe";

const LIMIT_NA_PYTANIE = 200;
/** Punkty na start: goście liczą nimi podgląd wygranej, zanim założą konto. */
const PUNKTY_NA_START = 1000;
const CHIPY = [10, 25, 50, 100];
type Okres = "1d" | "1t" | "1m" | "all";
type Zakladka = "komentarze" | "gracze" | "moje" | "aktywnosc";
const KLUCZ_OBSERWOWANE = "zdaza.obserwowane";

function czytajObserwowane(): number[] {
  try {
    const s = JSON.parse(localStorage.getItem(KLUCZ_OBSERWOWANE) ?? "[]");
    return Array.isArray(s) ? s.filter((x): x is number => typeof x === "number") : [];
  } catch {
    return [];
  }
}
function zapiszObserwowane(lista: number[]) {
  try {
    localStorage.setItem(KLUCZ_OBSERWOWANE, JSON.stringify(lista));
  } catch {
    /* prywatne okno */
  }
}

function klasaTypu(i: number) {
  return `typ-${klasaOdp(i)}`;
}

/** Zawęża historię do okresu; pierwszy punkt to stan na początku okna. */
function wytnijOkres(h: PunktHistorii[], okres: Okres): PunktHistorii[] {
  if (okres === "all" || h.length === 0) return h;
  const ms = { "1d": 864e5, "1t": 7 * 864e5, "1m": 30 * 864e5 }[okres];
  const od = Date.now() - ms;
  const przed = h.filter((x) => new Date(x.czas).getTime() < od);
  const po = h.filter((x) => new Date(x.czas).getTime() >= od);
  const start = przed.length ? [{ czas: new Date(od).toISOString(), kursy: przed[przed.length - 1].kursy }] : [];
  return [...start, ...po];
}

/* ---------- zakładki pod rynkiem ---------- */

function WpisAktywnosci({ a }: { a: Aktywnosc }) {
  const sprzedaz = a.udzialy < 0;
  return (
    <div className="wpis">
      <Awatar nick={a.nick} />
      <div>
        <div className="kto">
          <b>
            <Link to={`/u/${encodeURIComponent(a.nick)}`}>{a.nick}</Link>
          </b>
          {sprzedaz ? (
            <span>
              sprzedaje {liczba(-a.udzialy, 1)} udz. na <span className={klasaTypu(a.odpowiedz - 1)}>{a.odpowiedz_tekst}</span> za{" "}
              {liczba(a.stawka)} pkt
            </span>
          ) : (
            <span>
              stawia {liczba(a.stawka)} pkt na <span className={klasaTypu(a.odpowiedz - 1)}>{a.odpowiedz_tekst}</span>
            </span>
          )}
          {a.kurs_po != null ? <span className="znacznik">kurs {procent(a.kurs_po)}</span> : null}
          <span className="prawy">{czasTemu(a.czas)}</span>
        </div>
        {a.komentarz ? <div className="tresc">„{a.komentarz}”</div> : null}
      </div>
    </div>
  );
}

function WpisKomentarza({ k }: { k: Komentarz }) {
  return (
    <div className="wpis">
      <Awatar nick={k.nick} />
      <div>
        <div className="kto">
          <b>
            <Link to={`/u/${encodeURIComponent(k.nick)}`}>{k.nick}</Link>
          </b>
          {k.odpowiedz != null && k.odpowiedz_tekst ? (
            <span>
              {k.stawka > 0 ? `${liczba(k.stawka)} pkt na ` : "typ: "}
              <span className={klasaTypu(k.odpowiedz - 1)}>{k.odpowiedz_tekst}</span>
            </span>
          ) : null}
          {k.powod ? <span className="znacznik">{POWODY.find((r) => r.wartosc === k.powod)?.etykieta ?? k.powod}</span> : null}
          <span className="prawy">{czasTemu(k.czas)}</span>
        </div>
        <div className="tresc">{k.komentarz}</div>
      </div>
    </div>
  );
}

function Komentarze({
  pid,
  komentarze,
  odswiez,
}: {
  pid: number;
  komentarze: Komentarz[];
  odswiez: () => Promise<void>;
}) {
  const { stan, otworzModal } = useSesja();
  const [tekst, setTekst] = useState("");
  const dodaj = useAkcja(async () => {
    await dodajKomentarz(pid, tekst.trim());
    setTekst("");
    await odswiez();
  });
  return (
    <div>
      {stan === "gotowy" ? (
        <form
          className="komentarz-form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (tekst.trim().length > 0) void dodaj.wykonaj();
          }}
        >
          <textarea
            value={tekst}
            maxLength={500}
            onChange={(e) => setTekst(e.target.value)}
            placeholder="Napisz komentarz…"
            aria-label="Twój komentarz"
            rows={1}
          />
          <button type="submit" className="przycisk przycisk-maly" disabled={dodaj.trwa || tekst.trim().length === 0}>
            {dodaj.trwa ? "Chwila…" : "Dodaj komentarz"}
          </button>
          {tekst.length > 0 ? <span className="mala">{tekst.length}/500</span> : null}
          {dodaj.blad ? <Komunikat typ="blad">{dodaj.blad}</Komunikat> : null}
        </form>
      ) : (
        <div className="panel-info">
          Zaloguj się, żeby komentować.{" "}
          <button type="button" className="przycisk przycisk-maly przycisk-drugi" onClick={() => otworzModal("konto", "rejestracja")}>
            Zaloguj się
          </button>
        </div>
      )}
      {komentarze.length === 0 ? <p className="pusto">Jeszcze nikt nie skomentował. Twój komentarz może być pierwszy.</p> : null}
      {komentarze.map((k) => (
        <WpisKomentarza key={k.id} k={k} />
      ))}
    </div>
  );
}

function NajwieksiGracze({ odpowiedzi, lista }: { odpowiedzi: string[]; lista: NajwiekszyGracz[] }) {
  if (lista.length === 0) return <p className="pusto">Nikt jeszcze nie ma udziałów.</p>;
  return (
    <div className="najwieksi">
      {odpowiedzi.map((o, i) => {
        const gracze = lista.filter((g) => g.odpowiedz === i + 1).slice(0, 5);
        return (
          <div key={i}>
            <h4 className={klasaTypu(i)}>{o}</h4>
            {gracze.length === 0 ? <p className="mala">nikt</p> : null}
            <ol>
              {gracze.map((g) => (
                <li key={g.nick}>
                  <span className="gracz-kom">
                    <Awatar nick={g.nick} />
                    <Link to={`/u/${encodeURIComponent(g.nick)}`}>{g.nick}</Link>
                  </span>
                  <b>{liczba(g.udzialy, 1)} udz.</b>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- panel prognozy ---------- */

/** Suwak z torem wypełnionym do bieżącej wartości (szerokość wypełnienia idzie do arkusza jako zmienna). */
function Suwak({ min, max, step, wartosc, etykieta, naZmiane }: { min: number; max: number; step?: number; wartosc: number; etykieta: string; naZmiane: (n: number) => void }) {
  const wypelnienie = max > min ? ((wartosc - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={wartosc}
      aria-label={etykieta}
      style={{ "--wypelnienie": `${wypelnienie.toFixed(1)}%` } as CSSProperties}
      onChange={(e) => naZmiane(Number(e.target.value))}
    />
  );
}

interface PanelProps {
  p: Rynek;
  odp: number | null;
  setOdp: (i: number) => void;
  udzialyMoje: { odpowiedz: number; udzialy: number; wydane: number }[];
  wydaneRazem: number;
  poZmianie: () => Promise<void>;
}

/** Kurs na kuponie: startuje od kursu sprzed prognozy i dochodzi do nowego, żeby było widać własny ruch. */
function KursPoZmianie({ przed, po }: { przed: number; po: number }) {
  const [kurs, setKurs] = useState(przed);
  useEffect(() => {
    const id = window.setTimeout(() => setKurs(po), 200);
    return () => window.clearTimeout(id);
  }, [po]);
  return <LiczbaZywa wartosc={kurs * 100} format={jakoProcent} czas={700} />;
}

function Panel({ p, odp, setOdp, udzialyMoje, wydaneRazem, poZmianie }: PanelProps) {
  const { gracz, stan, otworzModal, uruchom, odswiezGracza } = useSesja();
  const [tryb, setTryb] = useState<"kup" | "sprzedaj">("kup");
  const [stawka, setStawka] = useState(10);
  const [powod, setPowod] = useState<Powod | null>(null);
  const [komentarz, setKomentarz] = useState("");
  const [wynik, setWynik] = useState<WynikZakladu | null>(null);
  const [odpSprzedaz, setOdpSprzedaz] = useState<number | null>(null);
  const [udzialySprzedaz, setUdzialySprzedaz] = useState(0);
  const [wynikSprzedazy, setWynikSprzedazy] = useState<WynikSprzedazy | null>(null);
  const [nrKuponu, setNrKuponu] = useState(0);
  const kup = useAkcja(postawPrognoze);
  const sprzedaj = useAkcja(sprzedajUdzialy);

  const otwarte = p.status === "otwarte";
  const miasto = p.kategoria === "miasto";
  const gotowy = stan === "gotowy";
  const saldo = Math.floor(gracz?.saldo ?? 0);
  // Gość liczy podgląd tak, jakby miał już punkty na start; postawić może dopiero po założeniu konta.
  const maks = Math.max(0, Math.min(LIMIT_NA_PYTANIE - Math.floor(wydaneRazem), gotowy ? saldo : PUNKTY_NA_START));
  const stawkaOk = Math.max(1, Math.min(Math.round(stawka) || 1, Math.max(1, maks)));
  const kursWybranej = odp != null && p.kursy ? p.kursy[odp - 1] : null;
  const podglad = kursWybranej != null ? podgladZakladu(kursWybranej, stawkaOk) : null;
  const brakPowodu = miasto && !powod;
  const posiadane = udzialyMoje.filter((z) => z.udzialy > 0.005);
  const pozycjaSprzedaz = posiadane.find((z) => z.odpowiedz === odpSprzedaz) ?? posiadane[0] ?? null;
  const kursSprzedazy = pozycjaSprzedaz && p.kursy ? p.kursy[pozycjaSprzedaz.odpowiedz - 1] : null;
  const uSprzedaz = pozycjaSprzedaz ? Math.max(0, Math.min(udzialySprzedaz, pozycjaSprzedaz.udzialy)) : 0;
  const podgladS = kursSprzedazy != null && uSprzedaz > 0 ? podgladSprzedazy(kursSprzedazy, uSprzedaz) : null;

  useEffect(() => {
    if (posiadane.length === 0 && tryb === "sprzedaj") setTryb("kup");
  }, [posiadane.length, tryb]);
  useEffect(() => {
    if (pozycjaSprzedaz && udzialySprzedaz === 0) setUdzialySprzedaz(Math.round(pozycjaSprzedaz.udzialy * 10) / 10);
  }, [pozycjaSprzedaz, udzialySprzedaz]);

  const potwierdz = () => {
    setNrKuponu((n) => n + 1);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(12);
  };
  const wyslij = async (e: FormEvent) => {
    e.preventDefault();
    if (odp == null || maks < 1 || brakPowodu) return;
    const w = await kup.wykonaj({
      pytanie: p.id,
      odpowiedz: odp,
      stawka: stawkaOk,
      powod: miasto ? powod : null,
      komentarz: komentarz.trim(),
    });
    if (w) {
      setWynik(w);
      setWynikSprzedazy(null);
      setKomentarz("");
      potwierdz();
      await Promise.all([odswiezGracza(), poZmianie()]);
    }
  };
  const wyslijSprzedaz = async (e: FormEvent) => {
    e.preventDefault();
    if (!pozycjaSprzedaz || uSprzedaz <= 0) return;
    const w = await sprzedaj.wykonaj({ pytanie: p.id, odpowiedz: pozycjaSprzedaz.odpowiedz, udzialy: uSprzedaz });
    if (w) {
      setWynikSprzedazy(w);
      setWynik(null);
      setUdzialySprzedaz(0);
      potwierdz();
      await Promise.all([odswiezGracza(), poZmianie()]);
    }
  };

  const mojaPozycja = posiadane.length
    ? posiadane.map((z) => `${liczba(z.udzialy, 1)} udz. na „${p.odpowiedzi[z.odpowiedz - 1]}”`).join(", ")
    : null;

  if (!otwarte) {
    return (
      <div className="panel" id="panel">
        <div className="panel-naglowek">Prognoza</div>
        <div className="panel-info">
          {p.status === "zamkniete"
            ? "Rynek zamknięty, czeka na rozstrzygnięcie. Prognoz już nie przyjmujemy."
            : p.status === "rozstrzygniete"
              ? `Rynek rozstrzygnięty: „${p.wynik ? p.odpowiedzi[p.wynik - 1] : ""}”. Udziały trafionej odpowiedzi wypłaciły po 1 punkcie.`
              : "Rynek unieważniony, wydane punkty wróciły do graczy."}
        </div>
        {mojaPozycja ? (
          <div className="moja-pozycja">
            Masz <b>{mojaPozycja}</b>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="panel" id="panel">
      <div className="panel-naglowek">
        Prognoza
        {mojaPozycja ? <span>Masz {mojaPozycja}</span> : null}
      </div>
      {posiadane.length > 0 ? (
        <div className="przelacznik" role="tablist">
          <button type="button" role="tab" aria-selected={tryb === "kup"} className={tryb === "kup" ? "aktywna" : ""} onClick={() => setTryb("kup")}>
            Kup
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tryb === "sprzedaj"}
            className={tryb === "sprzedaj" ? "aktywna" : ""}
            onClick={() => setTryb("sprzedaj")}
          >
            Sprzedaj
          </button>
        </div>
      ) : null}

      {wynik ? (
        <div className="kupon" role="status" key={nrKuponu}>
          <Iskry />
          <div className="kupon-gora">
            <IkPtaszek />
            Prognoza przyjęta
          </div>
          <div className="kupon-kurs cyfry">
            <span className="przed">{procent(wynik.kurs_przed)}</span>
            <IkStrzalka />
            <KursPoZmianie przed={wynik.kurs_przed} po={wynik.kurs_po} />
          </div>
          <p>
            Twoja prognoza przesunęła kurs z {procent(wynik.kurs_przed)} na {procent(wynik.kurs_po)}.
          </p>
          <p>
            Masz <b>{liczba(wynik.udzialy, 1)} udziałów</b> na „{p.odpowiedzi[wynik.odpowiedz - 1]}”. Jeśli trafisz, każdy udział
            wypłaci 1 punkt. Saldo: {punkty(wynik.saldo)}.
          </p>
        </div>
      ) : null}
      {wynikSprzedazy ? (
        <div className="kupon" role="status" key={nrKuponu}>
          <div className="kupon-gora">
            <IkPtaszek />
            Sprzedano {liczba(wynikSprzedazy.udzialy, 1)} udz. za {liczba(wynikSprzedazy.zwrot, 1)} pkt
          </div>
          <p>
            Kurs „{p.odpowiedzi[wynikSprzedazy.odpowiedz - 1]}” spadł z {procent(wynikSprzedazy.kurs_przed)} na{" "}
            {procent(wynikSprzedazy.kurs_po)}. Saldo: {punkty(wynikSprzedazy.saldo)}.
          </p>
        </div>
      ) : null}

      {tryb === "kup" ? (
        <form onSubmit={wyslij}>
          <div className={`wybor-odp ${p.odpowiedzi.length === 2 ? "o2" : ""}`}>
            {p.odpowiedzi.map((o, i) => (
              <button
                type="button"
                key={i}
                className={`odp-przycisk ${klasaOdp(i)} ${odp === i + 1 ? "wybrana" : ""}`}
                aria-pressed={odp === i + 1}
                onClick={() => setOdp(i + 1)}
              >
                <span className="nazwa">{o}</span>
                {p.kursy ? <LiczbaZywa className="cyfry" wartosc={p.kursy[i] * 100} format={jakoProcent} /> : null}
              </button>
            ))}
          </div>

          {stan === "blad" ? null : maks < 1 ? (
            <Komunikat typ="ostrz">
              {saldo < 1
                ? "Nie masz już punktów. Poczekaj na rozstrzygnięcia albo sprzedaj udziały."
                : `Na jeden rynek można wydać najwyżej ${LIMIT_NA_PYTANIE} punktów, a Ty masz już ${Math.floor(wydaneRazem)}.`}
            </Komunikat>
          ) : (
            <div className="stawka-pole">
              <div className="etykieta">
                <span>Stawka</span>
                <span>{gotowy ? `masz ${pkt(saldo)}` : `na start dostajesz ${pkt(PUNKTY_NA_START)}`}</span>
              </div>
              <div className="stawka-wejscie">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={maks}
                  value={stawkaOk}
                  aria-label="Stawka w punktach"
                  onChange={(e) => setStawka(Number(e.target.value))}
                />
                <span>pkt</span>
              </div>
              <div className="stawka-chipy">
                {CHIPY.map((c) => (
                  <button type="button" key={c} onClick={() => setStawka(Math.min(maks, stawkaOk + c))} disabled={stawkaOk >= maks}>
                    +{c}
                  </button>
                ))}
                <button type="button" className={stawkaOk === maks ? "wybrany" : ""} onClick={() => setStawka(maks)}>
                  Maks
                </button>
              </div>
              <Suwak min={1} max={maks} wartosc={stawkaOk} etykieta="Suwak stawki" naZmiane={setStawka} />
            </div>
          )}

          {gotowy && miasto ? (
            <div className="pole">
              <span className="etykieta">Dlaczego tak myślisz?</span>
              <div className="powody">
                {POWODY.map((r) => (
                  <button type="button" key={r.wartosc} className={powod === r.wartosc ? "wybrany" : ""} onClick={() => setPowod(r.wartosc)}>
                    {r.etykieta}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {gotowy ? (
            <div className="pole">
              <input
                type="text"
                maxLength={200}
                value={komentarz}
                aria-label="Komentarz do prognozy"
                onChange={(e) => setKomentarz(e.target.value)}
                placeholder="Jedno zdanie komentarza (opcjonalnie)"
              />
            </div>
          ) : null}

          {odp != null && stan !== "blad" && maks >= 1 ? (
            <div className="wygrana">
              {podglad ? (
                <>
                  <div className="wygrana-glowna">
                    <span>Wygrasz, jeśli trafisz</span>
                    <span className="cyfry">
                      <LiczbaZywa wartosc={podglad.udzialy} format={(n) => `≈ ${liczba(n, 1)}`} czas={220} />
                      <small>pkt</small>
                    </span>
                  </div>
                  <div className="wiersz-pod">
                    <span>Zysk ponad stawkę</span>
                    <b className="zysk">
                      +{liczba(podglad.udzialy - stawkaOk, 1)} pkt (+{Math.round((podglad.udzialy / stawkaOk - 1) * 100)}%)
                    </b>
                  </div>
                  <div className="wiersz-pod">
                    <span>Kurs po Twojej prognozie</span>
                    <b>
                      {procent(kursWybranej)} → {procent(podglad.kursPo)}
                    </b>
                  </div>
                </>
              ) : (
                <div className="wiersz-pod">
                  <span>Kurs jest ukryty</span>
                  <b>udziały poznasz po prognozie</b>
                </div>
              )}
            </div>
          ) : null}

          {kup.blad ? <Komunikat typ="blad">{kup.blad}</Komunikat> : null}
          {stan === "blad" ? (
            <Komunikat typ="blad">
              Brak połączenia z sesją gracza.{" "}
              <button type="button" className="przycisk przycisk-maly przycisk-drugi" onClick={uruchom}>
                Spróbuj ponownie
              </button>
            </Komunikat>
          ) : null}

          <div className="panel-stopka">
          {gotowy ? (
            <button
              type="submit"
              className={`przycisk-postaw ${odp != null ? klasaOdp(odp - 1) : ""}`}
              disabled={kup.trwa || odp == null || maks < 1 || brakPowodu}
            >
              {kup.trwa
                ? "Zapisuję…"
                : odp == null
                  ? "Wybierz odpowiedź"
                  : brakPowodu
                    ? "Wybierz powód"
                    : `Postaw ${liczba(stawkaOk)} pkt: ${p.odpowiedzi[odp - 1]}`}
            </button>
          ) : stan === "brak_nicku" ? (
            <button type="button" className="przycisk-postaw" onClick={() => otworzModal("konto", "rejestracja")}>
              Zaloguj się, żeby postawić
            </button>
          ) : stan === "blad" ? null : (
            <button type="button" className="przycisk-postaw" disabled>
              Łączę z miastem…
            </button>
          )}
          <p className="zastrzezenie">Gra o punkty. Punktów nie da się kupić ani wymienić.</p>
          </div>
        </form>
      ) : (
        <form onSubmit={wyslijSprzedaz}>
          <div className={`wybor-odp ${posiadane.length === 2 ? "o2" : ""}`}>
            {posiadane.map((z) => (
              <button
                type="button"
                key={z.odpowiedz}
                className={`odp-przycisk ${klasaOdp(z.odpowiedz - 1)} ${pozycjaSprzedaz?.odpowiedz === z.odpowiedz ? "wybrana" : ""}`}
                aria-pressed={pozycjaSprzedaz?.odpowiedz === z.odpowiedz}
                onClick={() => {
                  setOdpSprzedaz(z.odpowiedz);
                  setUdzialySprzedaz(Math.round(z.udzialy * 10) / 10);
                }}
              >
                <span className="nazwa">{p.odpowiedzi[z.odpowiedz - 1]}</span>
                <small>{liczba(z.udzialy, 1)} udz.</small>
              </button>
            ))}
          </div>
          {pozycjaSprzedaz ? (
            <div className="stawka-pole">
              <div className="etykieta">
                <span>Ile udziałów sprzedać</span>
                <span>masz {liczba(pozycjaSprzedaz.udzialy, 1)}</span>
              </div>
              <div className="stawka-wejscie">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0.1}
                  step={0.1}
                  max={pozycjaSprzedaz.udzialy}
                  value={uSprzedaz}
                  aria-label="Liczba udziałów do sprzedania"
                  onChange={(e) => setUdzialySprzedaz(Number(e.target.value))}
                />
                <span>udz.</span>
              </div>
              <div className="stawka-chipy">
                {[25, 50, 75].map((proc) => (
                  <button type="button" key={proc} onClick={() => setUdzialySprzedaz(Math.round(pozycjaSprzedaz.udzialy * proc) / 100)}>
                    {proc}%
                  </button>
                ))}
                <button type="button" onClick={() => setUdzialySprzedaz(pozycjaSprzedaz.udzialy)}>
                  Wszystko
                </button>
              </div>
              <Suwak min={0.1} max={pozycjaSprzedaz.udzialy} step={0.1} wartosc={uSprzedaz} etykieta="Suwak udziałów" naZmiane={setUdzialySprzedaz} />
            </div>
          ) : null}
          <div className="wygrana">
            {podgladS ? (
              <>
                <div className="wygrana-glowna">
                  <span>Zwrot</span>
                  <span className="cyfry">
                    <LiczbaZywa wartosc={podgladS.zwrot} format={(n) => `≈ ${liczba(n, 1)}`} czas={220} />
                    <small>pkt</small>
                  </span>
                </div>
                <div className="wiersz-pod">
                  <span>Kurs po sprzedaży</span>
                  <b>
                    {procent(kursSprzedazy)} → {procent(podgladS.kursPo)}
                  </b>
                </div>
              </>
            ) : (
              <div className="wiersz-pod">
                <span>Kurs jest ukryty</span>
                <b>zwrot poznasz po sprzedaży</b>
              </div>
            )}
          </div>
          {sprzedaj.blad ? <Komunikat typ="blad">{sprzedaj.blad}</Komunikat> : null}
          <button type="submit" className="przycisk-postaw" disabled={sprzedaj.trwa || !pozycjaSprzedaz || uSprzedaz < 0.01}>
            {sprzedaj.trwa ? "Sprzedaję…" : `Sprzedaj ${liczba(uSprzedaz, 1)} udz.`}
          </button>
          <p className="zastrzezenie">Sprzedaż po bieżącym kursie: zwrot = C(q) − C(q′). Punkty wracają na saldo.</p>
        </form>
      )}
    </div>
  );
}

/* ---------- strona rynku ---------- */

export default function Pytanie() {
  useUruchomSesje();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const pid = Number(id);
  const { stan } = useSesja();
  const zalogowany = stan === "gotowy";

  const { dane: p, blad: bladPytania, laduje } = usePolling(() => pobierzPytanie(pid), 5000, pid);
  const { dane: historia, odswiez: odswiezHistorie } = usePolling(() => pobierzHistorie(pid), 10000, pid);
  const { dane: komentarze, odswiez: odswiezKomentarze } = usePolling(() => pobierzKomentarze(pid), 10000, pid);
  const { dane: aktywnosc, odswiez: odswiezAktywnosc } = usePolling(() => pobierzAktywnosc(pid, 30), 10000, pid);
  const { dane: najwieksi, odswiez: odswiezNajwiekszych } = usePolling(() => pobierzNajwiekszych(pid), 15000, pid);
  const { dane: wszystkie } = usePolling(pobierzPytania, 30000, "podobne");
  const { dane: moje, odswiez: odswiezMoje } = usePolling(
    () => (zalogowany ? pobierzMojePozycje() : Promise.resolve([])),
    5000,
    `${pid}-${zalogowany}`,
  );
  const { dane: udzialyMoje, odswiez: odswiezUdzialy } = usePolling(
    () => (zalogowany ? pobierzMojeUdzialy(pid) : Promise.resolve([])),
    5000,
    `${pid}-${zalogowany}-u`,
  );

  const [odp, setOdp] = useState<number | null>(null);
  const [okres, setOkres] = useState<Okres>("all");
  const [skopiowano, setSkopiowano] = useState(false);
  const [obserwowane, setObserwowane] = useState<number[]>(() => czytajObserwowane());
  const [refPanelu, panelWidoczny] = useWidoczny<HTMLElement>();
  const t = params.get("tab");
  const zakladka: Zakladka = t === "gracze" || t === "moje" || t === "aktywnosc" ? t : "komentarze";

  useEffect(() => {
    const z = Number(params.get("odp"));
    if (z >= 1 && z <= 3) setOdp(z);
  }, [params]);

  const historiaOkres = useMemo(() => wytnijOkres(historia ?? [], okres), [historia, okres]);

  if (!p) {
    if (laduje) return <Ladowanie />;
    return (
      <main className="kontener">
        <Komunikat typ="blad">{bladPytania ?? "Nie ma takiego rynku."}</Komunikat>
        <Link to="/">← Wróć do rynków</Link>
      </main>
    );
  }

  const miasto = p.kategoria === "miasto";
  const otwarte = p.status === "otwarte";
  const kurs0 = p.kursy ? p.kursy[0] : null;
  const kursOtwarcia0 = p.kursy_otwarcia ? p.kursy_otwarcia[0] : null;
  const pierwszy = historia && historia.length > 0 ? historia[0].kursy[0] : null;
  const zmiana = zmianaPp(kurs0, pierwszy);
  const brakuje = Math.max(0, p.prog_widocznosci - p.liczba_prognoz);
  const moja = moje?.find((m) => m.pytanie === pid);
  const wydaneRazem = (udzialyMoje ?? []).reduce((s, z) => s + z.wydane, 0);
  const podobne = (wszystkie ?? []).filter((q) => q.id !== pid && q.kategoria === p.kategoria && q.status === "otwarte").slice(0, 3);
  const obserwowany = obserwowane.includes(pid);

  const ustawZakladke = (z: Zakladka) => {
    const n = new URLSearchParams(params);
    if (z === "komentarze") n.delete("tab");
    else n.set("tab", z);
    setParams(n, { replace: true });
  };
  const wybierz = (i: number) => {
    setOdp(i);
    if (window.innerWidth < 1000) document.getElementById("panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const udostepnij = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setSkopiowano(true);
      window.setTimeout(() => setSkopiowano(false), 2000);
    } catch {
      /* brak schowka */
    }
  };
  const przelaczObserwowanie = () => {
    const nowe = obserwowany ? obserwowane.filter((x) => x !== pid) : [...obserwowane, pid];
    setObserwowane(nowe);
    zapiszObserwowane(nowe);
  };
  const poZmianie = async () => {
    await Promise.all([odswiezMoje(), odswiezUdzialy(), odswiezHistorie(), odswiezAktywnosc(), odswiezKomentarze(), odswiezNajwiekszych()]);
  };

  return (
    <main className="kontener">
      <div className="rynek-strona">
        <div className="rynek-glowna">
          <nav className="okruszki" aria-label="Okruszki">
            <Link to="/">Rynki</Link>
            <span>›</span>
            <Link to={miasto ? "/?f=miasto" : "/?f=luz"}>{miasto ? "Miasto" : "Na luzie"}</Link>
          </nav>
          <header className="naglowek-rynku">
            <Piktogram tresc={p.tresc} kategoria={p.kategoria} duzy />
            <h1>{p.tresc}</h1>
            <div className="meta">
              {otwarte && dniDo(p.termin) <= 45 ? <Termin termin={p.termin} zegar /> : null}
              <OdznakaStatusu status={p.status} />
              <span>
                Koniec <b>{formatujDate(p.termin)}</b>
              </span>
              {p.liczba_zmian_terminu > 0 ? <span>termin zmieniany {odmien(p.liczba_zmian_terminu, "raz", "razy", "razy")}</span> : null}
              <span>{opisPrognoz(p)}</span>
              {p.obrot > 0 ? (
                <span>
                  <b>{liczba(p.obrot)}</b> pkt obrotu
                </span>
              ) : null}
              <button type="button" className="przycisk-ikona" onClick={() => void udostepnij()} aria-label="Udostępnij" title="Skopiuj link">
                <IkLink />
              </button>
              <button
                type="button"
                className="przycisk-ikona"
                onClick={przelaczObserwowanie}
                aria-label="Obserwuj"
                aria-pressed={obserwowany}
                title={obserwowany ? "Przestań obserwować" : "Obserwuj"}
              >
                <IkGwiazdka pelna={obserwowany} />
              </button>
              {skopiowano ? <span className="typ-tak">Skopiowano link</span> : null}
            </div>
          </header>

          <div className="kurs-naglowek">
            {kurs0 != null ? (
              <>
                <LiczbaZywa className="cyfry kurs-duzy" wartosc={kurs0 * 100} format={jakoProcent} />
                <span className="co">{miasto ? `szans, że ${p.odpowiedzi[0]}` : `szans na „${p.odpowiedzi[0]}”`}</span>
                {zmiana === 0 ? <span className="zmiana zero">bez zmian od otwarcia</span> : <Zmiana pp={zmiana} pelna />}
              </>
            ) : (
              <>
                <span className="cyfry kurs-duzy ukryty">{kursOtwarcia0 != null ? procent(kursOtwarcia0) : "–"}</span>
                <span className="co">{kursOtwarcia0 != null ? "kurs otwarcia" : "kurs ukryty"}</span>
              </>
            )}
          </div>
          {kurs0 == null && otwarte ? (
            <p className="odsloniecie-opis">
              <Odsloniecie p={p} />
              <span>
                Kurs tłumu odsłoni się po {p.prog_widocznosci} prognozach.{" "}
                {p.liczba_prognoz === 0 ? "Na razie bez prognoz." : `Brakuje ${brakuje}.`}
              </span>
            </p>
          ) : null}

          <div className="wykres-karta">
            {(historia ?? []).length > 0 ? (
              <div className="wykres-naglowek">
                <div className="okresy" role="tablist">
                  {(["1d", "1t", "1m", "all"] as Okres[]).map((o) => (
                    <button type="button" key={o} role="tab" aria-selected={okres === o} className={okres === o ? "aktywny" : ""} onClick={() => setOkres(o)}>
                      {o === "1d" ? "1D" : o === "1t" ? "1T" : o === "1m" ? "1M" : "Wszystko"}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <Wykres historia={historiaOkres} odpowiedzi={p.odpowiedzi} zywy={otwarte} otwarcie={p.kursy_otwarcia} />
          </div>

          {/* Dwie odpowiedzi: pojedynek po dwóch stronach jednego paska. Więcej: wiersze z paskami. */}
          <div className={p.odpowiedzi.length === 2 ? "pojedynek" : "rozklad"}>
            {p.odpowiedzi.map((o, i) => {
              const k = p.kursy ? p.kursy[i] : null;
              const ko = p.kursy_otwarcia ? p.kursy_otwarcia[i] : null;
              const mojeU = (udzialyMoje ?? []).find((z) => z.odpowiedz === i + 1);
              const nazwa = (
                <div className="nazwa">
                  {o}
                  {p.wynik === i + 1 ? <small className="typ-tak">wynik</small> : null}
                  {mojeU && mojeU.udzialy > 0.005 ? <small>Twój typ: {liczba(mojeU.udzialy, 1)} udz.</small> : null}
                  {k == null && ko != null ? <small>kurs otwarcia</small> : null}
                </div>
              );
              const kurs =
                k != null ? (
                  <LiczbaZywa className="cyfry kurs" wartosc={k * 100} format={jakoProcent} />
                ) : (
                  <span className="cyfry kurs ukryty">{ko != null ? procent(ko) : "–"}</span>
                );
              const wybrany = odp === i + 1 ? "wybrany" : "";
              if (p.odpowiedzi.length === 2) {
                return otwarte ? (
                  <button type="button" key={i} className={`pojedynek-strona ${klasaOdp(i)} ${wybrany}`} onClick={() => wybierz(i + 1)}>
                    {nazwa}
                    {kurs}
                  </button>
                ) : (
                  <div key={i} className={`pojedynek-strona ${klasaOdp(i)}`}>
                    {nazwa}
                    {kurs}
                  </div>
                );
              }
              return (
                <div key={i} className={`rozklad-wiersz ${klasaOdp(i)} ${wybrany}`}>
                  {nazwa}
                  {kurs}
                  {otwarte ? (
                    <button type="button" className={`kup kup-${klasaOdp(i)}`} onClick={() => wybierz(i + 1)}>
                      Wybierz
                    </button>
                  ) : (
                    <span />
                  )}
                  <span className="slupek">
                    <i style={{ width: `${Math.round((k ?? 0) * 100)}%` }} />
                  </span>
                </div>
              );
            })}
            {p.odpowiedzi.length === 2 && p.kursy ? <Podzial kursy={p.kursy} /> : null}
          </div>

          {p.status === "rozstrzygniete" && p.wynik ? (
            <Komunikat typ="info">
              Rozstrzygnięte: <b>{p.odpowiedzi[p.wynik - 1]}</b>. Mieszkańcy dawali na to <b>{procent(p.kursy ? p.kursy[p.wynik - 1] : null)}</b>.{" "}
              {p.link_rozstrzygniecia ? (
                <a href={p.link_rozstrzygniecia} target="_blank" rel="noreferrer">
                  Źródło rozstrzygnięcia
                </a>
              ) : null}
            </Komunikat>
          ) : null}
          {p.status === "uniewaznione" ? <Komunikat typ="ostrz">Rynek unieważniony, wydane punkty wróciły do graczy.</Komunikat> : null}
          {p.status === "zamkniete" ? <Komunikat typ="info">Rynek zamknięty, czeka na rozstrzygnięcie.</Komunikat> : null}
        </div>

        <aside className="panel-kolumna" ref={refPanelu}>
          <Panel p={p} odp={odp} setOdp={wybierz} udzialyMoje={udzialyMoje ?? []} wydaneRazem={wydaneRazem} poZmianie={poZmianie} />
        </aside>

        <div className="rynek-reszta">
          <section className="zasady">
            <h2 className="sekcja-tytul">Zasady</h2>
            <dl>
              <dt>Kryterium rozstrzygnięcia</dt>
              <dd>{p.kryterium}</dd>
              <dt>Źródło</dt>
              <dd>
                <a href={p.link_zrodla} target="_blank" rel="noreferrer">
                  <IkLink />
                  {p.link_zrodla}
                </a>
              </dd>
              {p.komentarz_urzedu ? (
                <>
                  <dt>Komentarz urzędu</dt>
                  <dd>{p.komentarz_urzedu}</dd>
                </>
              ) : null}
              <dt>Otwarto</dt>
              <dd>{formatujDate(p.otwarto ?? p.utworzono)}</dd>
            </dl>
            <p className="mala">
              Rozstrzyga zespół Zdążą? według publicznego źródła po terminie {formatujDateKrotko(p.termin)}. Unieważniony rynek
              zwraca punkty.
            </p>
          </section>

          <div className="zakladki" role="tablist">
            <button type="button" role="tab" aria-selected={zakladka === "komentarze"} className={zakladka === "komentarze" ? "aktywna" : ""} onClick={() => ustawZakladke("komentarze")}>
              Komentarze{komentarze && komentarze.length > 0 ? <span className="licznik">{komentarze.length}</span> : null}
            </button>
            <button type="button" role="tab" aria-selected={zakladka === "gracze"} className={zakladka === "gracze" ? "aktywna" : ""} onClick={() => ustawZakladke("gracze")}>
              Najwięksi gracze
            </button>
            {zalogowany ? (
              <button type="button" role="tab" aria-selected={zakladka === "moje"} className={zakladka === "moje" ? "aktywna" : ""} onClick={() => ustawZakladke("moje")}>
                Moje pozycje
              </button>
            ) : null}
            <button type="button" role="tab" aria-selected={zakladka === "aktywnosc"} className={zakladka === "aktywnosc" ? "aktywna" : ""} onClick={() => ustawZakladke("aktywnosc")}>
              Aktywność
            </button>
          </div>
          {zakladka === "komentarze" ? <Komentarze pid={pid} komentarze={komentarze ?? []} odswiez={odswiezKomentarze} /> : null}
          {zakladka === "gracze" ? <NajwieksiGracze odpowiedzi={p.odpowiedzi} lista={najwieksi ?? []} /> : null}
          {zakladka === "moje" ? (
            moja ? (
              <div className="tabela-owijka">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Odpowiedź</th>
                      <th className="liczba">Udziały</th>
                      <th className="liczba">Wydane</th>
                      <th className="liczba">Kurs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(udzialyMoje ?? [])
                      .filter((z) => z.udzialy > 0.005 || z.wydane > 0)
                      .map((z) => (
                        <tr key={z.odpowiedz}>
                          <td className={klasaTypu(z.odpowiedz - 1)}>{p.odpowiedzi[z.odpowiedz - 1]}</td>
                          <td className="liczba">{liczba(z.udzialy, 1)}</td>
                          <td className="liczba">{pkt(z.wydane)}</td>
                          <td className="liczba">{p.kursy ? procent(p.kursy[z.odpowiedz - 1]) : "ukryty"}</td>
                        </tr>
                      ))}
                    <tr>
                      <td>
                        <b>Razem</b>
                      </td>
                      <td className="liczba">{liczba(moja.udzialy_glowne, 1)} (główny typ)</td>
                      <td className="liczba">{pkt(moja.wydane)}</td>
                      <td className="liczba">wartość {liczba(moja.wartosc, 1)} pkt</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="pusto">Nie masz jeszcze pozycji na tym rynku.</p>
            )
          ) : null}
          {zakladka === "aktywnosc" ? (
            (aktywnosc ?? []).length === 0 ? (
              <p className="pusto">Jeszcze nikt nie postawił punktów.</p>
            ) : (
              <div>
                {(aktywnosc ?? []).map((a) => (
                  <WpisAktywnosci key={a.id} a={a} />
                ))}
              </div>
            )
          ) : null}

          {podobne.length > 0 ? (
            <>
              <h2 className="sekcja-tytul">Podobne rynki</h2>
              <div className="siatka">
                {podobne.map((q) => (
                  <KartaRynku key={q.id} p={q} />
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {otwarte ? (
        <div className={`szybki-pasek ${panelWidoczny ? "schowany" : ""}`} aria-hidden={panelWidoczny}>
          {p.odpowiedzi.map((o, i) => (
            <button type="button" key={i} className={`kup kup-${klasaOdp(i)}`} tabIndex={panelWidoczny ? -1 : 0} onClick={() => wybierz(i + 1)}>
              <span className="nazwa">{o}</span>
              {p.kursy ? <span className="cyfry kurs">{procent(p.kursy[i])}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </main>
  );
}
