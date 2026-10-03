import { useCallback, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { pobierzAktywnosc, pobierzHistorie, pobierzMojePozycje, pobierzPytania } from "@/api/api";
import { procent } from "@/api/lmsr";
import { useSesja, useUruchomSesje } from "@/api/sesja";
import type { Pytanie } from "@/api/types";
import { terminowosc } from "@/dane/terminowosc";
import { usePolling } from "@/ui/hooks";
import { Awatar, Komunikat, Szkielet, Szukajka, opisPrognoz } from "@/ui/komponenty";
import { KartaRynku, Odpowiedzi, Odsloniecie, Termin, Zmiana, jakoProcent, klasaOdp } from "@/ui/rynek";
import { czasTemu, liczba, odmien, pkt, zmianaPp } from "@/ui/tekst";
import { Wykres } from "@/ui/wykres";
import { LiczbaZywa } from "@/ui/zywe";

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

/* ---------- czołówka: hasło dla gościa, wyróżniony rynek, taśma ostatnich prognoz ---------- */

/** Rynek na czołówkę: otwarty z największym obrotem, a gdy nikt jeszcze nie grał, ten z najbliższym terminem. */
function wybierzWyrozniony(lista: Pytanie[]): { p: Pytanie; powod: string } | null {
  const otwarte = lista.filter((p) => p.status === "otwarte");
  if (otwarte.length === 0) return null;
  const grane = otwarte.filter((p) => p.obrot > 0 && p.kursy != null);
  if (grane.length > 0) return { p: [...grane].sort((a, b) => b.obrot - a.obrot || a.id - b.id)[0], powod: "największy obrót" };
  return { p: [...otwarte].sort((a, b) => a.termin.localeCompare(b.termin) || a.id - b.id)[0], powod: "najbliższy termin" };
}

function Wyrozniony({ p, powod }: { p: Pytanie; powod: string }) {
  const navigate = useNavigate();
  const { dane: historia } = usePolling(() => pobierzHistorie(p.id), 15000, p.id);
  const k0 = p.kursy ? p.kursy[0] : null;
  const o0 = p.kursy_otwarcia ? p.kursy_otwarcia[0] : null;
  return (
    <article className="wyrozniony">
      <div className="wyrozniony-nad">
        <span className="znacznik znacznik-akcent">{powod}</span>
        <Termin termin={p.termin} zegar />
      </div>
      <h2 className="wyrozniony-tytul">
        <Link to={`/pytanie/${p.id}`}>{p.tresc}</Link>
      </h2>
      <div className="wyrozniony-tresc">
        <div className="kurs-naglowek">
          {k0 != null ? (
            <>
              <LiczbaZywa className="cyfry kurs-duzy" wartosc={k0 * 100} format={jakoProcent} />
              <span className="co">{p.kategoria === "miasto" ? `szans, że ${p.odpowiedzi[0]}` : `szans na „${p.odpowiedzi[0]}”`}</span>
              <Zmiana pp={zmianaPp(k0, o0)} pelna />
            </>
          ) : (
            <>
              <span className="cyfry kurs-duzy ukryty">{o0 != null ? procent(o0) : "–"}</span>
              <span className="co">{o0 != null ? "kurs otwarcia, " : ""}kurs tłumu jeszcze ukryty</span>
            </>
          )}
        </div>
        <Odpowiedzi p={p} naWybor={(odp) => navigate(`/pytanie/${p.id}?odp=${odp}`)} />
        <div className="rynek-dol">
          {p.kursy == null ? <Odsloniecie p={p} /> : null}
          <span className="rynek-meta">{opisPrognoz(p)}</span>
          {p.obrot > 0 ? <span>{pkt(p.obrot)} obrotu</span> : null}
        </div>
      </div>
      <div className="wyrozniony-wykres">
        <Wykres historia={historia ?? []} odpowiedzi={p.odpowiedzi} wysokosc={250} zywy kompakt otwarcie={p.kursy_otwarcia} />
      </div>
    </article>
  );
}

/** Taśma ostatnich prognoz wszystkich graczy (odpytywana co 10 s); pusta nie zajmuje miejsca. */
function Tasma() {
  const { dane } = usePolling(() => pobierzAktywnosc(null, 8), 10000);
  const wpisy = dane ?? [];
  if (wpisy.length === 0) return null;
  return (
    <div className="tasma">
      <span className="tasma-etykieta">
        <i className="puls" />
        Na żywo
      </span>
      <div className="tasma-wpisy">
        {wpisy.map((a) => (
          <Link key={a.id} to={`/pytanie/${a.pytanie}`} className="tasma-wpis" title={a.tresc}>
            <Awatar nick={a.nick} />
            <span>
              <b>{a.nick}</b>{" "}
              {a.udzialy < 0 ? `sprzedaje ${liczba(-a.udzialy, 1)} udz. na ` : `stawia ${liczba(a.stawka)} pkt na `}
              <span className={`typ-${klasaOdp(a.odpowiedz - 1)}`}>{a.odpowiedz_tekst}</span>
            </span>
            <span className="tasma-czas">{czasTemu(a.czas)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ---------- siatka i sekcje ---------- */

interface PropsListy {
  lista: Pytanie[];
  obserwowane: number[];
  przelaczObserwowanie: (id: number) => void;
  /** Główny typ gracza wg id rynku (pusta mapa dla gościa). */
  typy: Map<number, number>;
}

function Siatka({ lista, obserwowane, przelaczObserwowanie, typy }: PropsListy) {
  return (
    <div className="siatka">
      {lista.map((p) => (
        <KartaRynku
          key={p.id}
          p={p}
          obserwowany={obserwowane.includes(p.id)}
          przelaczObserwowanie={przelaczObserwowanie}
          mojTyp={typy.get(p.id)}
        />
      ))}
    </div>
  );
}

function Sekcja({ tytul, pusto, lista, ...reszta }: PropsListy & { tytul: string; pusto: string }) {
  return (
    <section>
      <h2 className="sekcja-tytul">
        {tytul} <span className="licznik">{lista.length}</span>
      </h2>
      {lista.length === 0 ? (
        <p className="pusto">{pusto}</p>
      ) : (
        <Siatka lista={lista} {...reszta} />
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
  const { dane: moje } = usePolling(() => (gracz ? pobierzMojePozycje() : Promise.resolve([])), 10000, gracz?.id ?? "");
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

  const czolowka = filtr === "wszystkie" && !q;
  const wyrozniony = czolowka ? wybierzWyrozniony(aktywne) : null;

  const typy = new Map((moje ?? []).filter((m) => m.udzialy_glowne > 0.005).map((m) => [m.pytanie, m.odpowiedz_glowna]));
  const listaProps = { obserwowane, przelaczObserwowanie, typy };
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

        {czolowka ? (
          <section className={`czolowka ${gosc ? "z-haslem" : ""}`}>
            {gosc ? (
              <div className="czolowka-haslo">
                <h1>Czy miasto zdąży?</h1>
                <p>
                  Rynek prognoz dla Krakowa: mieszkańcy stawiają punkty na to, czy urząd dotrzyma terminu, a kurs pokazuje, ile w
                  to wierzą.
                </p>
                {odsetek != null ? (
                  <p className="czolowka-liczba">
                    <b className="cyfry">{Math.round(odsetek * 100)}%</b> umów miejskich wykonano w terminie (BZP)
                  </p>
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
                <p className="czolowka-drobne">Na start dostajesz 1000 punktów. Punktów nie da się kupić ani wymienić.</p>
              </div>
            ) : null}
            {wyrozniony ? (
              <Wyrozniony p={wyrozniony.p} powod={wyrozniony.powod} />
            ) : laduje && !dane ? (
              <span className="szkielet szkielet-wyrozniony" />
            ) : null}
          </section>
        ) : null}
        {czolowka ? <Tasma /> : null}

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
