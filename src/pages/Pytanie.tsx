import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  dodajKomentarz,
  pobierzAktywnosc,
  pobierzHistorie,
  pobierzKomentarze,
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
import { useAkcja, useMiejsca, usePolling } from "@/ui/hooks";
import { IkKalendarz, IkLink } from "@/ui/ikony";
import {
  Awatar,
  KafelekKategorii,
  Komunikat,
  Ladowanie,
  OdznakaMiejsca,
  OdznakaStatusu,
  Wskaznik,
  ZyskStrata,
  formatujDate,
  formatujDateKrotko,
} from "@/ui/komponenty";
import { EkranRozstrzygniecia, useRozstrzygniecieDoPokazania } from "@/ui/rozstrzygniecie";
import { czasTemu, liczba, odmien, pkt, punkty } from "@/ui/tekst";
import { PrzyciskUdostepnij, type DaneKarty } from "@/ui/udostepnij";
import { Wykres } from "@/ui/wykres";

const LIMIT_NA_PYTANIE = 200;
/** Szybkie stawki: jeden klik zamiast wpisywania liczby. */
const SZYBKIE_STAWKI = [20, 50, 100, 200];
const KLASY = ["tak", "nie", "trzeci"] as const;
const KOLORY_LINII = ["var(--tak)", "var(--nie)", "var(--trzeci)"];
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
  return `typ-${KLASY[i] ?? "trzeci"}`;
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

function IkGwiazdka({ pelna }: { pelna: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={pelna ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3 2.8 5.9 6.4.8-4.7 4.5 1.2 6.4L12 17.5l-5.7 3.1 1.2-6.4L2.8 9.7l6.4-.8L12 3z" />
    </svg>
  );
}

/* ---------- zakładki pod rynkiem ---------- */

function WpisAktywnosci({ a, miejsce }: { a: Aktywnosc; miejsce?: number | null }) {
  const sprzedaz = a.udzialy < 0;
  return (
    <div className="wpis">
      <Awatar nick={a.nick} />
      <div>
        <div className="kto">
          <b>
            <Link to={`/u/${encodeURIComponent(a.nick)}`}>{a.nick}</Link>
          </b>
          <OdznakaMiejsca miejsce={miejsce} />
          {sprzedaz ? (
            <span>
              sprzedał {liczba(-a.udzialy, 1)} udz. na <span className={klasaTypu(a.odpowiedz - 1)}>{a.odpowiedz_tekst}</span> za{" "}
              {liczba(a.stawka)} pkt
            </span>
          ) : (
            <span>
              postawił {liczba(a.stawka)} pkt na <span className={klasaTypu(a.odpowiedz - 1)}>{a.odpowiedz_tekst}</span>
            </span>
          )}
          {a.kurs_po != null ? <span>· kurs {procent(a.kurs_po)}</span> : null}
          <span className="prawy">{czasTemu(a.czas)}</span>
        </div>
        {a.komentarz ? <div className="tresc">„{a.komentarz}”</div> : null}
      </div>
    </div>
  );
}

function WpisKomentarza({ k, miejsce }: { k: Komentarz; miejsce?: number | null }) {
  return (
    <div className="wpis">
      <Awatar nick={k.nick} />
      <div>
        <div className="kto">
          <b>
            <Link to={`/u/${encodeURIComponent(k.nick)}`}>{k.nick}</Link>
          </b>
          <OdznakaMiejsca miejsce={miejsce} />
          {k.odpowiedz != null && k.odpowiedz_tekst ? (
            <span className={`odznaka-pozycji ${klasaTypu(k.odpowiedz - 1)}`}>
              {k.stawka > 0 ? `stawia ${liczba(k.stawka)} na ${k.odpowiedz_tekst}` : `typ: ${k.odpowiedz_tekst}`}
            </span>
          ) : null}
          {k.powod ? <span>· {POWODY.find((r) => r.wartosc === k.powod)?.etykieta ?? k.powod}</span> : null}
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
  miejsca,
}: {
  pid: number;
  komentarze: Komentarz[];
  odswiez: () => Promise<void>;
  miejsca: Map<string, number>;
}) {
  const { stan, konto, otworzModal } = useSesja();
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
          className="karta"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (tekst.trim().length > 0) void dodaj.wykonaj();
          }}
        >
          <label className="pole" style={{ margin: 0 }}>
            <span className="etykieta">Twój komentarz</span>
            <textarea
              value={tekst}
              maxLength={500}
              onChange={(e) => setTekst(e.target.value)}
              placeholder="Napisz komentarz…"
              rows={2}
            />
          </label>
          {dodaj.blad ? <Komunikat typ="blad">{dodaj.blad}</Komunikat> : null}
          <div className="przyciski">
            <button type="submit" className="przycisk przycisk-maly" disabled={dodaj.trwa || tekst.trim().length === 0}>
              {dodaj.trwa ? "Chwila…" : "Dodaj komentarz"}
            </button>
            <span className="mala" style={{ alignSelf: "center" }}>
              {tekst.length}/500
            </span>
          </div>
        </form>
      ) : stan === "laduje" || stan === "nowa" ? null : (
        <div className="panel-info">
          {konto ? "Podaj nick, żeby komentować." : "Załóż konto, żeby komentować."}{" "}
          <button
            type="button"
            className="przycisk przycisk-maly przycisk-drugi"
            onClick={() => (konto ? otworzModal("nick") : otworzModal("konto", "rejestracja"))}
          >
            {konto ? "Podaj nick" : "Załóż konto"}
          </button>
        </div>
      )}
      {komentarze.length === 0 ? <p className="pusto">Jeszcze nikt nie skomentował. Napisz pierwszy.</p> : null}
      {komentarze.map((k) => (
        <WpisKomentarza key={k.id} k={k} miejsce={miejsca.get(k.nick)} />
      ))}
    </div>
  );
}

function NajwieksiGracze({ odpowiedzi, lista, miejsca }: { odpowiedzi: string[]; lista: NajwiekszyGracz[]; miejsca: Map<string, number> }) {
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
                    <OdznakaMiejsca miejsce={miejsca.get(g.nick)} />
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

/** Komunikat o zmianie miejsca w rankingu po transakcji (null, gdy bez zmian). */
function Awans({ przed, po, graczy }: { przed: number | null; po: number | null; graczy?: number }) {
  if (po == null || przed === po) return null;
  if (przed == null)
    return (
      <span className="awans gora">
        Jesteś w rankingu: miejsce {po}
        {graczy ? ` z ${graczy}` : ""}
      </span>
    );
  if (po < przed) return <span className="awans gora">Awans w rankingu: {przed} → {po}</span>;
  return <span className="awans dol">Ranking: {przed} → {po}</span>;
}

interface PanelProps {
  p: Rynek;
  odp: number | null;
  setOdp: (i: number) => void;
  udzialyMoje: { odpowiedz: number; udzialy: number; wydane: number }[];
  wydaneRazem: number;
  poZmianie: () => Promise<void>;
  url: string;
}

function Panel({ p, odp, setOdp, udzialyMoje, wydaneRazem, poZmianie, url }: PanelProps) {
  const { gracz, konto, stan, otworzModal, uruchom, odswiezGracza } = useSesja();
  const [tryb, setTryb] = useState<"kup" | "sprzedaj">("kup");
  const [stawka, setStawka] = useState(SZYBKIE_STAWKI[0]);
  const [powod, setPowod] = useState<Powod | null>(null);
  const [komentarz, setKomentarz] = useState("");
  const [wynik, setWynik] = useState<WynikZakladu | null>(null);
  const [odpSprzedaz, setOdpSprzedaz] = useState<number | null>(null);
  const [udzialySprzedaz, setUdzialySprzedaz] = useState(0);
  const [wynikSprzedazy, setWynikSprzedazy] = useState<WynikSprzedazy | null>(null);
  const kup = useAkcja(postawPrognoze);
  const sprzedaj = useAkcja(sprzedajUdzialy);

  const otwarte = p.status === "otwarte";
  const miasto = p.kategoria === "miasto";
  const saldo = Math.floor(gracz?.saldo ?? 0);
  const maks = Math.max(0, Math.min(LIMIT_NA_PYTANIE - Math.floor(wydaneRazem), saldo));
  const stawkaOk = Math.max(1, Math.min(Math.round(stawka) || 1, Math.max(1, maks)));
  const kursWybranej = odp != null && p.kursy ? p.kursy[odp - 1] : null;
  const podglad = kursWybranej != null ? podgladZakladu(kursWybranej, stawkaOk) : null;
  const mnoznik = podglad ? podglad.udzialy / stawkaOk : null;
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
      await Promise.all([odswiezGracza(), poZmianie()]);
    }
  };

  const mojaPozycja = posiadane.length
    ? posiadane
        .map((z) => `${liczba(z.udzialy, 1)} udz. na „${p.odpowiedzi[z.odpowiedz - 1]}”`)
        .join(", ")
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
        <span style={{ color: "var(--tekst)", fontWeight: 700, fontSize: "1rem" }}>Prognoza</span>
        {mojaPozycja ? <span>Masz {mojaPozycja}</span> : null}
      </div>
      {posiadane.length > 0 ? (
        <div className="modal-zakladki" role="tablist">
          <button type="button" role="tab" className={tryb === "kup" ? "aktywna" : ""} onClick={() => setTryb("kup")}>
            Kup
          </button>
          <button type="button" role="tab" className={tryb === "sprzedaj" ? "aktywna" : ""} onClick={() => setTryb("sprzedaj")}>
            Sprzedaj
          </button>
        </div>
      ) : null}

      {wynik ? (
        <div className="panel-sukces" data-test="po-transakcji">
          <b>
            Przesunąłeś kurs {procent(wynik.kurs_przed)} → {procent(wynik.kurs_po)}
          </b>
          Masz {liczba(wynik.udzialy, 1)} udz. na „{p.odpowiedzi[wynik.odpowiedz - 1]}”. Jeśli trafisz: <b className="inline">+{liczba(wynik.udzialy, 1)} pkt</b>{" "}
          (×{liczba(wynik.udzialy / wynik.stawka, 2)}). Saldo: {punkty(wynik.saldo)}.
          {wynik.sprzedano.length > 0 ? (
            <div className="mala" style={{ marginTop: 4 }}>
              Jedna strona rynku: sprzedano{" "}
              {wynik.sprzedano.map((z) => `${liczba(z.udzialy, 1)} udz. na „${z.odpowiedz_tekst}” za ${liczba(z.zwrot, 1)} pkt`).join(", ")}.
            </div>
          ) : null}
          <Awans przed={wynik.miejsce_przed} po={wynik.miejsce_po} graczy={wynik.graczy_w_rankingu} />
          <div className="przyciski" style={{ marginTop: 8 }}>
            <PrzyciskUdostepnij
              dane={{
                tresc: p.tresc,
                odpowiedz: p.odpowiedzi[wynik.odpowiedz - 1],
                indeks: wynik.odpowiedz - 1,
                kurs: wynik.kurs_po,
                nick: gracz?.nick ?? null,
                url,
              }}
            />
          </div>
        </div>
      ) : null}
      {wynikSprzedazy ? (
        <div className="panel-sukces">
          <b>
            Sprzedano {liczba(wynikSprzedazy.udzialy, 1)} udz. za {liczba(wynikSprzedazy.zwrot, 1)} pkt
          </b>
          Kurs „{p.odpowiedzi[wynikSprzedazy.odpowiedz - 1]}” spadł {procent(wynikSprzedazy.kurs_przed)} → {procent(wynikSprzedazy.kurs_po)}.
          Saldo: {punkty(wynikSprzedazy.saldo)}.
          <Awans przed={wynikSprzedazy.miejsce_przed} po={wynikSprzedazy.miejsce_po} />
        </div>
      ) : null}

      {tryb === "kup" ? (
        <form onSubmit={wyslij}>
          <div className={`wybor-odp ${p.odpowiedzi.length === 2 ? "o2" : ""}`}>
            {p.odpowiedzi.map((o, i) => (
              <button
                type="button"
                key={i}
                className={`odp-przycisk ${KLASY[i] ?? "trzeci"} ${odp === i + 1 ? "wybrana" : ""}`}
                onClick={() => setOdp(i + 1)}
              >
                {o}
                {p.kursy ? <small>{procent(p.kursy[i])}</small> : null}
              </button>
            ))}
          </div>

          {stan === "gotowy" ? (
            maks < 1 ? (
              <Komunikat typ="ostrz">
                {saldo < 1
                  ? "Nie masz już punktów. Poczekaj na rozstrzygnięcia albo sprzedaj udziały."
                  : `Na jeden rynek można wydać najwyżej ${LIMIT_NA_PYTANIE} punktów, a Ty masz już ${Math.floor(wydaneRazem)}.`}
              </Komunikat>
            ) : (
              <div className="stawka-pole">
                <div className="etykieta">
                  <span>Stawka</span>
                  <span>masz {pkt(saldo)}</span>
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
                <div className="stawka-chipy stawka-szybkie" role="group" aria-label="Szybka stawka">
                  {SZYBKIE_STAWKI.map((c) => (
                    <button
                      type="button"
                      key={c}
                      className={stawkaOk === Math.min(c, maks) && c <= maks ? "wybrany" : ""}
                      disabled={c > maks && stawkaOk === maks}
                      onClick={() => setStawka(Math.min(maks, c))}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <input type="range" min={1} max={maks} value={stawkaOk} aria-label="Suwak stawki" onChange={(e) => setStawka(Number(e.target.value))} />
              </div>
            )
          ) : null}

          {miasto ? (
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
          <label className="pole">
            <span className="etykieta">Komentarz (opcjonalnie)</span>
            <input
              type="text"
              maxLength={200}
              value={komentarz}
              onChange={(e) => setKomentarz(e.target.value)}
              placeholder="Jedno zdanie komentarza (opcjonalnie)"
            />
          </label>

          {odp != null && stan === "gotowy" && maks >= 1 ? (
            <div className="podsumowanie">
              {podglad ? (
                <>
                  <div className="wiersz-pod">
                    <span>Udziały</span>
                    <b>≈ {liczba(podglad.udzialy, 1)}</b>
                  </div>
                  <div className="wiersz-pod">
                    <span>Kurs po transakcji</span>
                    <b>
                      {kursWybranej != null ? `${procent(kursWybranej)} → ` : ""}
                      {procent(podglad.kursPo)}
                    </b>
                  </div>
                  <div className="wiersz-pod wygrana do-wygrania">
                    <span>Jeśli trafisz</span>
                    <b>
                      +{liczba(podglad.udzialy, 1)} pkt <small>(×{liczba(mnoznik ?? 0, 2)})</small>
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

          {stan === "gotowy" ? (
            <button
              type="submit"
              className={`przycisk-postaw ${odp != null ? KLASY[odp - 1] ?? "trzeci" : ""}`}
              disabled={kup.trwa || odp == null || maks < 1 || brakPowodu}
            >
              {kup.trwa
                ? "Zapisuję…"
                : odp == null
                  ? "Wybierz odpowiedź"
                  : brakPowodu
                    ? "Wybierz powód"
                    : odp === 3
                      ? `Postaw: ${p.odpowiedzi[2]}`
                      : `Postaw ${p.odpowiedzi[odp - 1]}`}
            </button>
          ) : stan === "brak_nicku" ? (
            <button
              type="button"
              className="przycisk-postaw"
              onClick={() => (konto ? otworzModal("nick") : otworzModal("konto", "rejestracja"))}
            >
              {konto ? "Podaj nick, żeby postawić" : "Załóż konto, żeby postawić"}
            </button>
          ) : stan === "blad" ? null : (
            <button type="button" className="przycisk-postaw" disabled>
              Łączę z miastem…
            </button>
          )}
          <p className="zastrzezenie">Gra o punkty. Punktów nie da się kupić ani wymienić.</p>
        </form>
      ) : (
        <form onSubmit={wyslijSprzedaz}>
          <div className={`wybor-odp ${posiadane.length === 2 ? "o2" : ""}`}>
            {posiadane.map((z) => (
              <button
                type="button"
                key={z.odpowiedz}
                className={`odp-przycisk ${KLASY[z.odpowiedz - 1] ?? "trzeci"} ${pozycjaSprzedaz?.odpowiedz === z.odpowiedz ? "wybrana" : ""}`}
                onClick={() => {
                  setOdpSprzedaz(z.odpowiedz);
                  setUdzialySprzedaz(Math.round(z.udzialy * 10) / 10);
                }}
              >
                {p.odpowiedzi[z.odpowiedz - 1]}
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
                  <button type="button" key={proc} onClick={() => setUdzialySprzedaz(Math.round(pozycjaSprzedaz.udzialy * proc) / 1000)}>
                    {proc}%
                  </button>
                ))}
                <button type="button" onClick={() => setUdzialySprzedaz(pozycjaSprzedaz.udzialy)}>
                  Wszystko
                </button>
              </div>
              <input
                type="range"
                min={0.1}
                step={0.1}
                max={pozycjaSprzedaz.udzialy}
                value={uSprzedaz}
                aria-label="Suwak udziałów"
                onChange={(e) => setUdzialySprzedaz(Number(e.target.value))}
              />
            </div>
          ) : null}
          <div className="podsumowanie">
            {podgladS ? (
              <>
                <div className="wiersz-pod wygrana">
                  <span>Zwrot</span>
                  <b>≈ {liczba(podgladS.zwrot, 1)} pkt</b>
                </div>
                <div className="wiersz-pod">
                  <span>Kurs po sprzedaży</span>
                  <b>{procent(podgladS.kursPo)}</b>
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
  const { stan, gracz, pozycje: moje } = useSesja();
  const zalogowany = stan === "gotowy";
  const miejsca = useMiejsca();

  const { dane: p, blad: bladPytania, laduje } = usePolling(() => pobierzPytanie(pid), 5000, pid);
  const { dane: historia, odswiez: odswiezHistorie } = usePolling(() => pobierzHistorie(pid), 10000, pid);
  const { dane: komentarze, odswiez: odswiezKomentarze } = usePolling(() => pobierzKomentarze(pid), 10000, pid);
  const { dane: aktywnosc, odswiez: odswiezAktywnosc } = usePolling(() => pobierzAktywnosc(pid, 30), 10000, pid);
  const { dane: najwieksi, odswiez: odswiezNajwiekszych } = usePolling(() => pobierzNajwiekszych(pid), 15000, pid);
  const { dane: wszystkie } = usePolling(pobierzPytania, 30000, "podobne");
  const { dane: udzialyMoje, odswiez: odswiezUdzialy } = usePolling(
    () => (zalogowany ? pobierzMojeUdzialy(pid) : Promise.resolve([])),
    5000,
    `${pid}-${zalogowany}-u`,
  );

  const [odp, setOdp] = useState<number | null>(null);
  const [okres, setOkres] = useState<Okres>("all");
  const [skopiowano, setSkopiowano] = useState(false);
  const [obserwowane, setObserwowane] = useState<number[]>(() => czytajObserwowane());
  const t = params.get("tab");
  const zakladka: Zakladka = t === "gracze" || t === "moje" || t === "aktywnosc" ? t : "komentarze";
  const rozstrzygniecie = useRozstrzygniecieDoPokazania(gracz?.nick ?? null, moje, pid);

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
  const zmiana = kurs0 != null && pierwszy != null ? Math.round((kurs0 - pierwszy) * 100) : null;
  const kurs1h = p.kursy_1h ? p.kursy_1h[0] : null;
  const zmiana1h = kurs0 != null && kurs1h != null ? Math.round((kurs0 - kurs1h) * 100) : null;
  const moja = moje?.find((m) => m.pytanie === pid);
  const wydaneRazem = (udzialyMoje ?? []).reduce((s, z) => s + z.wydane, 0);
  const url = `${window.location.origin}/pytanie/${pid}`;
  // karta do udostępnienia: mój główny typ, a bez pozycji pierwsza odpowiedź
  const indeksKarty = moja ? moja.odpowiedz_glowna - 1 : 0;
  const kursKarty = p.kursy ? p.kursy[indeksKarty] : p.kursy_otwarcia ? p.kursy_otwarcia[indeksKarty] : null;
  const daneKarty: DaneKarty | null =
    kursKarty != null ? { tresc: p.tresc, odpowiedz: p.odpowiedzi[indeksKarty], indeks: indeksKarty, kurs: kursKarty, nick: gracz?.nick ?? null, url } : null;
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
  // Zaraz po RPC: własny nick od razu w „Najwięksi gracze” i w aktywności, wykres dorysowuje punkt.
  const poZmianie = async () => {
    await Promise.all([odswiezUdzialy(), odswiezHistorie(), odswiezAktywnosc(), odswiezKomentarze(), odswiezNajwiekszych()]);
  };

  return (
    <main className="kontener">
      <div className="rynek-strona">
        <div>
          <nav className="okruszki" aria-label="Okruszki">
            <Link to="/">Rynki</Link>
            <span>›</span>
            <Link to={miasto ? "/?f=miasto" : "/?f=luz"}>{miasto ? "Miasto" : "Na luzie"}</Link>
          </nav>
          <header className="naglowek-rynku">
            <KafelekKategorii kategoria={p.kategoria} duzy />
            <div>
              <h1>{p.tresc}</h1>
              <div className="meta">
                <span>
                  <b>{liczba(p.obrot)}</b> pkt obrotu
                </span>
                <span>
                  <IkKalendarz />
                  Koniec <b>{formatujDate(p.termin)}</b>
                </span>
                {p.liczba_zmian_terminu > 0 ? <span>termin zmieniany {odmien(p.liczba_zmian_terminu, "raz", "razy", "razy")}</span> : null}
                <span>{odmien(p.liczba_prognoz, "prognoza", "prognozy", "prognoz")}</span>
                <OdznakaStatusu status={p.status} />
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
                {daneKarty ? <PrzyciskUdostepnij dane={daneKarty} etykieta="Karta „Daję X%”" klasa="przycisk-tekst niebieski" /> : null}
              </div>
            </div>
          </header>

          <div className="kurs-naglowek">
            {kurs0 != null ? (
              <>
                <b>{procent(kurs0)}</b>
                <span className="co">{miasto ? `szans, że ${p.odpowiedzi[0]}` : `szans na „${p.odpowiedzi[0]}”`}</span>
                {zmiana != null ? (
                  <span className={`zmiana ${zmiana > 0 ? "gora" : zmiana < 0 ? "dol" : "zero"}`}>
                    {zmiana > 0 ? `▲ ${zmiana} pp od otwarcia` : zmiana < 0 ? `▼ ${-zmiana} pp od otwarcia` : "bez zmian od otwarcia"}
                  </span>
                ) : null}
                {zmiana1h != null && otwarte ? (
                  <span className={`zmiana ${zmiana1h > 0 ? "gora" : zmiana1h < 0 ? "dol" : "zero"}`}>
                    {zmiana1h > 0 ? `▲ ${zmiana1h} pp / 1 godz.` : zmiana1h < 0 ? `▼ ${-zmiana1h} pp / 1 godz.` : "bez zmian / 1 godz."}
                  </span>
                ) : null}
              </>
            ) : (
              <>
                <b className="ukryty">{kursOtwarcia0 != null ? procent(kursOtwarcia0) : "–"}</b>
                <span className="co">
                  {kursOtwarcia0 != null ? "kurs otwarcia · " : ""}kurs tłumu ukryty do {p.prog_widocznosci} prognoz ({p.liczba_prognoz}/{p.prog_widocznosci})
                </span>
              </>
            )}
          </div>

          <div className="wykres-karta">
            <div className="wykres-naglowek">
              {p.odpowiedzi.length === 3 ? (
                <div className="legenda-wykresu">
                  {p.odpowiedzi.map((o, i) => (
                    <span key={i}>
                      <i style={{ background: KOLORY_LINII[i] }} />
                      {o}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="legenda-wykresu">
                  <span>
                    <i style={{ background: KOLORY_LINII[0] }} />
                    {p.odpowiedzi[0]}
                  </span>
                </div>
              )}
              <div className="okresy" role="tablist">
                {(["1d", "1t", "1m", "all"] as Okres[]).map((o) => (
                  <button type="button" key={o} role="tab" className={okres === o ? "aktywny" : ""} onClick={() => setOkres(o)}>
                    {o === "1d" ? "1D" : o === "1t" ? "1T" : o === "1m" ? "1M" : "Wszystko"}
                  </button>
                ))}
              </div>
            </div>
            <Wykres historia={historiaOkres} odpowiedzi={p.odpowiedzi} />
          </div>

          <div className="wyniki-tabela">
            <div className="naglowek-tab">
              <span>Odpowiedź</span>
              <span style={{ textAlign: "right" }}>Kurs</span>
              <span />
            </div>
            {p.odpowiedzi.map((o, i) => {
              const k = p.kursy ? p.kursy[i] : null;
              const ko = p.kursy_otwarcia ? p.kursy_otwarcia[i] : null;
              const mojeU = (udzialyMoje ?? []).find((z) => z.odpowiedz === i + 1);
              return (
                <div key={i} className={`wynik-wiersz ${odp === i + 1 ? "wybrany" : ""} ${p.wynik === i + 1 ? "trafiony" : ""}`}>
                  <div className="nazwa">
                    {o}
                    {mojeU && mojeU.udzialy > 0.005 ? <small>{liczba(mojeU.udzialy, 1)} udz. · Twój typ</small> : null}
                    {p.wynik === i + 1 ? <small className="typ-tak">wynik</small> : null}
                  </div>
                  {k != null ? (
                    <div className={`kurs ${klasaTypu(i)}`}>{procent(k)}</div>
                  ) : (
                    <div className="kurs ukryty" title="kurs otwarcia">
                      {ko != null ? procent(ko) : "–"}
                    </div>
                  )}
                  {otwarte ? (
                    <button type="button" className={`kup kup-${KLASY[i] ?? "trzeci"}`} onClick={() => wybierz(i + 1)}>
                      Tak
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              );
            })}
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

          <section className="karta zasady">
            <h3>Zasady</h3>
            <div className="etykieta">Kryterium rozstrzygnięcia</div>
            <p>{p.kryterium}</p>
            <div className="etykieta">Źródło</div>
            <p>
              <a href={p.link_zrodla} target="_blank" rel="noreferrer">
                <IkLink style={{ width: 14, height: 14, verticalAlign: -2, marginRight: 4 }} />
                {p.link_zrodla}
              </a>
            </p>
            {p.komentarz_urzedu ? (
              <>
                <div className="etykieta">Komentarz urzędu</div>
                <p>{p.komentarz_urzedu}</p>
              </>
            ) : null}
            <div className="etykieta">Otwarto</div>
            <p>{formatujDate(p.otwarto ?? p.utworzono)}</p>
            <p className="mala" style={{ marginBottom: 0 }}>
              Rozstrzyga zespół Zdążą? według publicznego źródła po terminie {formatujDateKrotko(p.termin)}. Unieważniony rynek
              zwraca punkty.
            </p>
          </section>

          <div className="zakladki" role="tablist">
            <button type="button" role="tab" className={zakladka === "komentarze" ? "aktywna" : ""} onClick={() => ustawZakladke("komentarze")}>
              Komentarze<span className="licznik">{komentarze ? komentarze.length : ""}</span>
            </button>
            <button type="button" role="tab" className={zakladka === "gracze" ? "aktywna" : ""} onClick={() => ustawZakladke("gracze")}>
              Najwięksi gracze
            </button>
            {zalogowany ? (
              <button type="button" role="tab" className={zakladka === "moje" ? "aktywna" : ""} onClick={() => ustawZakladke("moje")}>
                Moje pozycje
              </button>
            ) : null}
            <button type="button" role="tab" className={zakladka === "aktywnosc" ? "aktywna" : ""} onClick={() => ustawZakladke("aktywnosc")}>
              Aktywność
            </button>
          </div>
          {zakladka === "komentarze" ? <Komentarze pid={pid} komentarze={komentarze ?? []} odswiez={odswiezKomentarze} miejsca={miejsca} /> : null}
          {zakladka === "gracze" ? <NajwieksiGracze odpowiedzi={p.odpowiedzi} lista={najwieksi ?? []} miejsca={miejsca} /> : null}
          {zakladka === "moje" ? (
            moja ? (
              <div className="tabela-owijka">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Odpowiedź</th>
                      <th className="liczba">Udziały</th>
                      <th className="liczba">Koszt</th>
                      <th className="liczba">Kurs</th>
                      <th className="liczba">Wartość</th>
                      <th className="liczba">Zysk/strata</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(udzialyMoje ?? [])
                      .filter((z) => z.udzialy > 0.005 || z.wydane > 0)
                      .map((z) => {
                        const k = p.kursy ? p.kursy[z.odpowiedz - 1] : null;
                        const wartosc =
                          p.status === "rozstrzygniete" ? (p.wynik === z.odpowiedz ? z.udzialy : 0) : k != null ? z.udzialy * k : z.wydane;
                        return (
                          <tr key={z.odpowiedz}>
                            <td className={klasaTypu(z.odpowiedz - 1)}>{p.odpowiedzi[z.odpowiedz - 1]}</td>
                            <td className="liczba">{liczba(z.udzialy, 1)}</td>
                            <td className="liczba">{pkt(z.wydane)}</td>
                            <td className="liczba">{k != null ? procent(k) : "ukryty"}</td>
                            <td className="liczba">{liczba(wartosc, 1)} pkt</td>
                            <td className="liczba">
                              <ZyskStrata wartosc={wartosc - z.wydane} miejsca={1} />
                            </td>
                          </tr>
                        );
                      })}
                    <tr>
                      <td>
                        <b>Razem</b>
                      </td>
                      <td className="liczba">{liczba(moja.udzialy_glowne, 1)} (główny typ)</td>
                      <td className="liczba">{pkt(moja.wydane)}</td>
                      <td className="liczba" />
                      <td className="liczba">{liczba(moja.wartosc, 1)} pkt</td>
                      <td className="liczba">
                        <ZyskStrata wartosc={moja.wartosc - moja.wydane} miejsca={1} />
                      </td>
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
                  <WpisAktywnosci key={a.id} a={a} miejsce={miejsca.get(a.nick)} />
                ))}
              </div>
            )
          ) : null}

          {podobne.length > 0 ? (
            <>
              <h2 className="sekcja-tytul">Podobne rynki</h2>
              <div className="siatka">
                {podobne.map((q) => {
                  const kq = q.kursy ? q.kursy[0] : null;
                  const kqo = q.kursy_otwarcia ? q.kursy_otwarcia[0] : null;
                  return (
                    <article className="rynek rynek-kompakt" key={q.id}>
                      <Link to={`/pytanie/${q.id}`} className="rynek-gora">
                        <KafelekKategorii kategoria={q.kategoria} />
                        <h3 className="rynek-tytul">{q.tresc}</h3>
                        {kq != null ? (
                          <Wskaznik kurs={kq} etykieta={q.kategoria === "miasto" ? "w terminie" : "szansa"} />
                        ) : (
                          <Wskaznik kurs={kqo} etykieta="kurs otwarcia" kolor="mute" />
                        )}
                      </Link>
                      <div className="rynek-dol">
                        <span>{pkt(q.obrot)} obrotu</span>
                        <span className="prawy">do {formatujDateKrotko(q.termin)}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>

        <aside className="panel-kolumna">
          <Panel p={p} odp={odp} setOdp={wybierz} udzialyMoje={udzialyMoje ?? []} wydaneRazem={wydaneRazem} poZmianie={poZmianie} url={url} />
        </aside>
      </div>
      {rozstrzygniecie.pozycja ? (
        <EkranRozstrzygniecia moja={rozstrzygniecie.pozycja} pytanie={p} onClose={() => rozstrzygniecie.oznacz(rozstrzygniecie.pozycja!.pytanie)} />
      ) : null}
    </main>
  );
}
