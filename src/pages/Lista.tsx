import { useCallback, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { pobierzAktywnosc, pobierzPytania } from "@/api/api";
import { procent } from "@/api/lmsr";
import { useSesja, useUruchomSesje } from "@/api/sesja";
import type { Aktywnosc, Pytanie } from "@/api/types";
import { terminowosc } from "@/dane/terminowosc";
import { useBlysk, usePolling } from "@/ui/hooks";
import { Awatar, KafelekKategorii, Komunikat, OdznakaStatusu, Szkielet, Szukajka, Wskaznik, formatujDateKrotko } from "@/ui/komponenty";
import { czasTemu, liczba, odmien, pkt } from "@/ui/tekst";
import { klasaTypu } from "@/pages/Aktywnosc";

/* ---------- filtry i sortowanie (stan trzymany w adresie: ?f= ?s= ?q=) ---------- */

type Filtr = "wszystkie" | "miasto" | "luz" | "nowe" | "rozstrzygniete" | "obserwowane";
type Sortowanie = "termin" | "obrot" | "nowe" | "prognozy";

const FILTRY: { klucz: Filtr; etykieta: string }[] = [
  { klucz: "wszystkie", etykieta: "Wszystkie" },
  { klucz: "miasto", etykieta: "Miasto" },
  { klucz: "luz", etykieta: "Na luzie" },
  { klucz: "nowe", etykieta: "Nowe" },
  { klucz: "rozstrzygniete", etykieta: "Rozstrzygnięte" },
  { klucz: "obserwowane", etykieta: "Obserwowane" },
];

const SORTOWANIA: { klucz: Sortowanie; etykieta: string }[] = [
  { klucz: "termin", etykieta: "Kończą się najwcześniej" },
  { klucz: "obrot", etykieta: "Największy obrót" },
  { klucz: "nowe", etykieta: "Najnowsze" },
  { klucz: "prognozy", etykieta: "Najwięcej prognoz" },
];

const DZIEN = 24 * 60 * 60 * 1000;
/** localStorage: JSON tablica id obserwowanych rynków. */
const KLUCZ_OBSERWOWANYCH = "zdaza.obserwowane";

function czytajFiltr(v: string | null): Filtr {
  return FILTRY.some((f) => f.klucz === v) ? (v as Filtr) : "wszystkie";
}

function czytajSortowanie(v: string | null): Sortowanie {
  return SORTOWANIA.some((s) => s.klucz === v) ? (v as Sortowanie) : "termin";
}

function czytajObserwowane(): number[] {
  try {
    const surowe = localStorage.getItem(KLUCZ_OBSERWOWANYCH);
    const lista: unknown = surowe ? JSON.parse(surowe) : [];
    return Array.isArray(lista) ? lista.filter((x): x is number => typeof x === "number") : [];
  } catch {
    return [];
  }
}

function zapiszObserwowane(lista: number[]) {
  try {
    localStorage.setItem(KLUCZ_OBSERWOWANYCH, JSON.stringify(lista));
  } catch {
    /* prywatne okno albo pełna pamięć: gwiazdka działa do odświeżenia */
  }
}

/* ---------- pomocnicze ---------- */

function czyAktywne(p: Pytanie): boolean {
  return p.status === "otwarte" || p.status === "zamkniete";
}

function czyZakonczone(p: Pytanie): boolean {
  return p.status === "rozstrzygniete" || p.status === "uniewaznione";
}

/** Czas otwarcia (do sortowania „Najnowsze”); starsze wiersze bez `otwarto` liczą się od utworzenia. */
function czasOtwarcia(p: Pytanie): number {
  return new Date(p.otwarto ?? p.utworzono).getTime();
}

/** Ile dni temu otwarto rynek; null, gdy brak daty otwarcia. */
function dniOdOtwarcia(p: Pytanie, teraz: number): number | null {
  if (!p.otwarto) return null;
  const t = new Date(p.otwarto).getTime();
  return Number.isFinite(t) ? (teraz - t) / DZIEN : null;
}

function czasRozstrzygniecia(p: Pytanie): number {
  const t = p.rozstrzygnieto ? new Date(p.rozstrzygnieto).getTime() : Number.NaN;
  return Number.isFinite(t) ? t : 0;
}

function porownanie(s: Sortowanie): (a: Pytanie, b: Pytanie) => number {
  switch (s) {
    case "obrot":
      return (a, b) => b.obrot - a.obrot || a.termin.localeCompare(b.termin) || a.id - b.id;
    case "nowe":
      return (a, b) => czasOtwarcia(b) - czasOtwarcia(a) || b.id - a.id;
    case "prognozy":
      return (a, b) => b.liczba_prognoz - a.liczba_prognoz || a.termin.localeCompare(b.termin) || a.id - b.id;
    default:
      return (a, b) => a.termin.localeCompare(b.termin) || a.id - b.id;
  }
}

/** Rozstrzygnięte: domyślnie od ostatnio rozstrzygniętych; inne sortowania jak dla otwartych. */
function porownanieZakonczonych(s: Sortowanie): (a: Pytanie, b: Pytanie) => number {
  if (s !== "termin") return porownanie(s);
  return (a, b) => czasRozstrzygniecia(b) - czasRozstrzygniecia(a) || b.id - a.id;
}

function IkGwiazdka({ pelna }: { pelna: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={pelna ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ width: 16, height: 16 }}
    >
      <path d="m12 3 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.4l-5.7 3.1 1.2-6.4L2.8 9.7l6.4-.8L12 3z" />
    </svg>
  );
}

/* ---------- karta rynku ---------- */

interface PropsKarty {
  p: Pytanie;
  obserwowany: boolean;
  przelaczObserwowanie: (id: number) => void;
}

/** Zmiana kursu pierwszej odpowiedzi w punktach procentowych od godziny (albo od otwarcia, gdy rynek młodszy). */
function zmianaOdGodziny(p: Pytanie): number | null {
  if (!p.kursy || !p.kursy_1h) return null;
  return Math.round((p.kursy[0] - p.kursy_1h[0]) * 100);
}

/** Karta jak na giełdzie prognoz: kafelek, tytuł, wskaźnik kursu, przyciski Tak/Nie albo lista odpowiedzi, stopka.
 *  Zmiana kursu między odpytaniami podświetla kartę na zielono/czerwono przez ok. 1 s. */
function Rynek({ p, obserwowany, przelaczObserwowanie }: PropsKarty) {
  const navigate = useNavigate();
  const otwarte = p.status === "otwarte";
  const zakonczone = czyZakonczone(p);
  const dwie = p.odpowiedzi.length === 2;
  const kursy = p.kursy;
  const kursyOtwarcia = p.kursy_otwarcia ?? null;
  const nowy = otwarte && (dniOdOtwarcia(p, Date.now()) ?? Number.POSITIVE_INFINITY) < 3;
  const blysk = useBlysk(kursy ? kursy[0] : null);
  const zmiana1h = otwarte ? zmianaOdGodziny(p) : null;

  // Rozstrzygnięcie: ile tłum dawał na faktyczny wynik i czy trafił (wynik miał najwyższy kurs).
  const wynik = p.status === "rozstrzygniete" && p.wynik != null ? p.wynik : null;
  const kursWyniku = wynik != null && kursy ? (kursy[wynik - 1] ?? null) : null;
  const tlumTrafil = kursWyniku != null && kursy ? kursWyniku === Math.max(...kursy) : null;

  let wskaznik: ReactNode = null;
  if (zakonczone) {
    if (kursWyniku != null) {
      wskaznik = <Wskaznik kurs={kursWyniku} etykieta="na wynik" kolor={tlumTrafil ? "tak" : "nie"} />;
    }
  } else if (dwie) {
    if (kursy) wskaznik = <Wskaznik kurs={kursy[0]} />;
    else if (kursyOtwarcia) wskaznik = <Wskaznik kurs={kursyOtwarcia[0]} kolor="mute" etykieta="kurs otwarcia" />;
    else wskaznik = <Wskaznik kurs={null} />;
  }

  let tresc: ReactNode = null;
  if (zakonczone) {
    const klasa =
      p.status === "uniewaznione" ? "uniewazniony" : tlumTrafil == null ? "" : tlumTrafil ? "trafiony" : "chybiony";
    tresc = (
      <div className={`wynik-pigulka ${klasa}`}>
        {p.status === "uniewaznione" ? (
          <span>unieważnione, punkty zwrócone</span>
        ) : (
          <>
            <span>
              Wynik: <b>{wynik != null ? p.odpowiedzi[wynik - 1] : "–"}</b>
            </span>
            {tlumTrafil != null ? <span>{tlumTrafil ? "tłum trafił" : "tłum się pomylił"}</span> : null}
          </>
        )}
      </div>
    );
  } else if (dwie) {
    if (otwarte) {
      tresc = (
        <div className="rynek-przyciski">
          <button type="button" className="kup kup-tak" onClick={() => navigate(`/pytanie/${p.id}?odp=1`)}>
            Tak{kursy ? <small>{procent(kursy[0])}</small> : null}
          </button>
          <button type="button" className="kup kup-nie" onClick={() => navigate(`/pytanie/${p.id}?odp=2`)}>
            Nie{kursy ? <small>{procent(kursy[1])}</small> : null}
          </button>
        </div>
      );
    }
  } else {
    tresc = (
      <ul className="wyniki">
        {p.odpowiedzi.map((o, i) => (
          <li className="wynik" key={i}>
            <span className="nazwa">{o}</span>
            {kursy ? (
              <span className="kurs">{procent(kursy[i])}</span>
            ) : (
              <span className="kurs ukryty">{kursyOtwarcia ? procent(kursyOtwarcia[i]) : "–"}</span>
            )}
            {otwarte ? (
              <button type="button" className="kup kup-tak kup-mini" onClick={() => navigate(`/pytanie/${p.id}?odp=${i + 1}`)}>
                Tak
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <article className={`rynek ${blysk ? `blysk-${blysk}` : ""}`}>
      <Link to={`/pytanie/${p.id}`} className={`rynek-gora ${wskaznik ? "" : "bez-wskaznika"}`}>
        <KafelekKategorii kategoria={p.kategoria} />
        <h3 className="rynek-tytul">
          {p.status === "zamkniete" ? (
            <>
              <OdznakaStatusu status={p.status} />{" "}
            </>
          ) : null}
          {nowy ? (
            <>
              <span className="odznaka odznaka-nowe">Nowe</span>{" "}
            </>
          ) : null}
          {p.tresc}
        </h3>
        {wskaznik}
      </Link>
      {tresc}
      <div className="rynek-dol" style={{ flexWrap: "wrap" }}>
        {zmiana1h != null ? (
          <span className={`zmiana-1h ${zmiana1h > 0 ? "gora" : zmiana1h < 0 ? "dol" : "zero"}`} title="zmiana kursu od godziny">
            {zmiana1h > 0 ? `▲ ${zmiana1h} pp` : zmiana1h < 0 ? `▼ ${-zmiana1h} pp` : "= 0 pp"} / 1 godz.
          </span>
        ) : null}
        <span>{pkt(p.obrot)} obrotu</span>
        <span aria-hidden="true">·</span>
        {otwarte && kursy == null ? (
          <span>
            kurs po {p.prog_widocznosci} prognozach ({p.liczba_prognoz}/{p.prog_widocznosci})
          </span>
        ) : (
          <span>{odmien(p.liczba_prognoz, "prognoza", "prognozy", "prognoz")}</span>
        )}
        <span className="prawy">
          <button
            type="button"
            className="przycisk-ikona"
            aria-label="Obserwuj"
            aria-pressed={obserwowany}
            title={obserwowany ? "Przestań obserwować" : "Obserwuj"}
            style={{ width: 28, height: 28, margin: "-6px 0", color: obserwowany ? "var(--akcent)" : undefined }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              przelaczObserwowanie(p.id);
            }}
          >
            <IkGwiazdka pelna={obserwowany} />
          </button>
          <span>do {formatujDateKrotko(p.termin)}</span>
        </span>
      </div>
    </article>
  );
}

/* ---------- siatka i sekcje ---------- */

interface PropsListy {
  lista: Pytanie[];
  obserwowane: number[];
  przelaczObserwowanie: (id: number) => void;
}

function Siatka({ lista, obserwowane, przelaczObserwowanie }: PropsListy) {
  return (
    <div className="siatka">
      {lista.map((p) => (
        <Rynek key={p.id} p={p} obserwowany={obserwowane.includes(p.id)} przelaczObserwowanie={przelaczObserwowanie} />
      ))}
    </div>
  );
}

function Sekcja({ tytul, pusto, lista, obserwowane, przelaczObserwowanie }: PropsListy & { tytul: string; pusto: string }) {
  return (
    <section>
      <h2 className="sekcja-tytul">
        {tytul} <span className="licznik">{lista.length}</span>
      </h2>
      {lista.length === 0 ? (
        <p className="pusto">{pusto}</p>
      ) : (
        <Siatka lista={lista} obserwowane={obserwowane} przelaczObserwowanie={przelaczObserwowanie} />
      )}
    </section>
  );
}

/* ---------- ticker świeżych ruchów ---------- */

const DZIESIEC_MINUT = 10 * 60 * 1000;

/** Ostatnie 5 ruchów i licznik prognoz z ostatnich 10 minut (dane z RPC aktywnosc, odpytywane co 5 s). */
function Ticker({ ruchy, laduje }: { ruchy: Aktywnosc[] | null; laduje: boolean }) {
  if (!ruchy) return laduje ? <div className="ticker szkielet-ticker" aria-hidden="true" /> : null;
  const teraz = Date.now();
  const ostatnie10 = ruchy.filter((r) => r.udzialy > 0 && teraz - new Date(r.czas).getTime() <= DZIESIEC_MINUT).length;
  const piec = ruchy.slice(0, 5);
  return (
    <section className="ticker" aria-label="Świeże ruchy">
      <div className="ticker-naglowek">
        <span className="ticker-kropka" aria-hidden="true" />
        <b>Świeże ruchy</b>
        <span className="ticker-licznik">{odmien(ostatnie10, "prognoza", "prognozy", "prognoz")} w ostatnich 10 minutach</span>
        <Link to="/aktywnosc" className="prawy">
          Cała aktywność
        </Link>
      </div>
      {piec.length === 0 ? (
        <p className="ticker-pusto">Jeszcze nikt nie postawił punktów.</p>
      ) : (
        <ul className="ticker-lista">
          {piec.map((r) => (
            <li key={r.id}>
              <Awatar nick={r.nick} />
              <span className="ticker-kto">
                <Link to={`/u/${encodeURIComponent(r.nick)}`}>{r.nick}</Link>{" "}
                {r.udzialy < 0 ? (
                  <>
                    sprzedał {liczba(-r.udzialy, 1)} udz. na <span className={klasaTypu(r.odpowiedz - 1)}>{r.odpowiedz_tekst}</span>
                  </>
                ) : (
                  <>
                    {liczba(r.stawka)} pkt na <span className={klasaTypu(r.odpowiedz - 1)}>{r.odpowiedz_tekst}</span>
                  </>
                )}
              </span>
              <Link to={`/pytanie/${r.pytanie}`} className="ticker-rynek">
                {r.tresc}
              </Link>
              <span className="ticker-czas">{czasTemu(r.czas)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- strona główna ---------- */

const PUSTO_OTWARTE = "Na razie brak otwartych rynków";
const PUSTO_OBSERWOWANE = "Nie obserwujesz jeszcze żadnego rynku. Kliknij gwiazdkę na karcie.";
const PUSTO_ROZSTRZYGNIETE = "Jeszcze nic nie rozstrzygnięto";

export default function Lista() {
  useUruchomSesje();
  const { stan, gracz, konto, otworzModal } = useSesja();
  const [params, setParams] = useSearchParams();
  const { dane, blad, laduje } = usePolling(pobierzPytania, 5000);
  const { dane: ruchy, laduje: ladujeRuchy } = usePolling(() => pobierzAktywnosc(null, 100), 5000, "ticker");
  const [obserwowane, setObserwowane] = useState<number[]>(czytajObserwowane);

  const filtr = czytajFiltr(params.get("f"));
  const sortowanie = czytajSortowanie(params.get("s"));
  const q = (params.get("q") ?? "").trim();

  const ustawParam = (klucz: "f" | "s", wartosc: string, domyslna: string) => {
    const nowe = new URLSearchParams(params);
    if (wartosc === domyslna) nowe.delete(klucz);
    else nowe.set(klucz, wartosc);
    setParams(nowe, { replace: true });
  };

  const przelaczObserwowanie = useCallback((id: number) => {
    setObserwowane((lista) => {
      const nowa = lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id];
      zapiszObserwowane(nowa);
      return nowa;
    });
  }, []);

  // Gość: brak gracza po ustaleniu stanu sesji (przed uruchomieniem i w trakcie łączenia nic nie zakładamy).
  const gosc = !gracz && stan !== "laduje" && stan !== "nowa";
  const odsetek = terminowosc.ogolem.odsetek;

  const teraz = Date.now();
  const pytania = dane ?? [];
  const szukane = q ? pytania.filter((p) => p.tresc.toLowerCase().includes(q.toLowerCase())) : pytania;
  const pasuje = (p: Pytanie): boolean => {
    switch (filtr) {
      case "miasto":
      case "luz":
        return p.kategoria === filtr;
      case "nowe": {
        const dni = dniOdOtwarcia(p, teraz);
        return dni != null && dni <= 7;
      }
      case "obserwowane":
        return obserwowane.includes(p.id);
      default:
        return true;
    }
  };
  const przefiltrowane = szukane.filter(pasuje);
  const aktywne = przefiltrowane.filter(czyAktywne).sort(porownanie(sortowanie));
  const zakonczone = przefiltrowane.filter(czyZakonczone).sort(porownanieZakonczonych(sortowanie));
  const miasto = aktywne.filter((p) => p.kategoria === "miasto");
  const luz = aktywne.filter((p) => p.kategoria === "luz");
  const liczbaWidocznych = filtr === "rozstrzygniete" ? zakonczone.length : aktywne.length + zakonczone.length;

  const listaProps = { obserwowane, przelaczObserwowanie };
  let zawartosc: ReactNode = null;
  if (dane) {
    const pustoAktywne = filtr === "obserwowane" ? PUSTO_OBSERWOWANE : PUSTO_OTWARTE;
    if (q && liczbaWidocznych === 0) {
      zawartosc = <p className="pusto">Nic nie znaleziono dla „{q}”</p>;
    } else if (filtr === "wszystkie") {
      zawartosc = (
        <>
          {!q || miasto.length > 0 ? <Sekcja tytul="Miasto" pusto={pustoAktywne} lista={miasto} {...listaProps} /> : null}
          {!q || luz.length > 0 ? <Sekcja tytul="Na luzie" pusto={pustoAktywne} lista={luz} {...listaProps} /> : null}
          {zakonczone.length > 0 ? (
            <Sekcja tytul="Rozstrzygnięte" pusto={PUSTO_ROZSTRZYGNIETE} lista={zakonczone} {...listaProps} />
          ) : null}
        </>
      );
    } else if (filtr === "rozstrzygniete") {
      zawartosc = <Sekcja tytul="Rozstrzygnięte" pusto={PUSTO_ROZSTRZYGNIETE} lista={zakonczone} {...listaProps} />;
    } else {
      zawartosc = (
        <>
          {aktywne.length > 0 ? <Siatka lista={aktywne} {...listaProps} /> : <p className="pusto">{pustoAktywne}</p>}
          {zakonczone.length > 0 ? (
            <Sekcja tytul="Rozstrzygnięte" pusto={PUSTO_ROZSTRZYGNIETE} lista={zakonczone} {...listaProps} />
          ) : null}
        </>
      );
    }
  }

  return (
    <>
      <div className="kategorie">
        <div className="kategorie-wnetrze">
          {FILTRY.map((f) => (
            <button
              type="button"
              key={f.klucz}
              className={`zakladka ${filtr === f.klucz ? "aktywna" : ""}`}
              aria-pressed={filtr === f.klucz}
              onClick={() => ustawParam("f", f.klucz, "wszystkie")}
            >
              {f.etykieta}
            </button>
          ))}
          <div className="sortowanie">
            <label htmlFor="sortowanie-rynkow">Sortuj</label>
            <select id="sortowanie-rynkow" value={sortowanie} onChange={(e) => ustawParam("s", e.target.value, "termin")}>
              {SORTOWANIA.map((s) => (
                <option key={s.klucz} value={s.klucz}>
                  {s.etykieta}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <main className="kontener">
        <div className="szukaj-mobil">
          <Szukajka />
        </div>

        {gosc ? (
          <section className="hero">
            <div>
              <h1>
                Czy miasto zdąży<em>?</em>
              </h1>
              <p>
                Rynek prognoz dla Krakowa: mieszkańcy stawiają punkty na to, czy urząd dotrzyma terminu, a kurs pokazuje, ile w
                to wierzą.
              </p>
            </div>
            {odsetek != null ? (
              <div className="hero-liczba">
                <b>{Math.round(odsetek * 100)}%</b>
                <span>umów miejskich wykonano w terminie (BZP)</span>
              </div>
            ) : null}
            <div className="akcje">
              <button
                type="button"
                className="przycisk przycisk-glowny"
                onClick={() => (konto ? otworzModal("nick") : otworzModal("konto", "rejestracja"))}
              >
                {konto ? "Podaj nick" : "Zacznij grać"}
              </button>
              <button type="button" className="przycisk przycisk-glowny przycisk-drugi" onClick={() => otworzModal("jak")}>
                Jak to działa
              </button>
            </div>
          </section>
        ) : null}

        {!q && filtr === "wszystkie" ? <Ticker ruchy={ruchy} laduje={ladujeRuchy} /> : null}

        {q && dane ? (
          <p className="wynik-szukania">
            Wyniki dla „{q}”: {odmien(liczbaWidocznych, "rynek", "rynki", "rynków")}
          </p>
        ) : null}

        {blad ? <Komunikat typ="blad">{blad}</Komunikat> : null}
        {laduje && !dane ? (
          <div className="siatka">
            <Szkielet ile={8} />
          </div>
        ) : null}

        {zawartosc}
      </main>
    </>
  );
}
