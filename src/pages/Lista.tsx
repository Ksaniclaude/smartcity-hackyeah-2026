import { useCallback, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { pobierzAktywnosc, pobierzCzolowke, pobierzHistorie, pobierzPytania, szukajGraczy } from "@/api/api";
import { procent } from "@/api/lmsr";
import { useSesja, useUruchomSesje } from "@/api/sesja";
import type { Aktywnosc, Pytanie } from "@/api/types";
import { terminowosc } from "@/dane/terminowosc";
import { usePolling } from "@/ui/hooks";
import { IkPlomien, IkSzewron } from "@/ui/ikony";
import { Awatar, Komunikat, OdznakaMiejsca, Szkielet, Szukajka, opisPrognoz, pasujeDoFrazy } from "@/ui/komponenty";
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

/* ---------- „Hot”: rynki z największym ruchem w ostatniej dobie ---------- */

const HOT_OKNO = 24 * 60 * 60 * 1000;
const HOT_ILE = 16;

/**
 * Najpierw rynki wyróżnione przez admina (najśmieszniejsze, najbardziej viralowe), potem reszta: po liczbie
 * prognoz z ostatniej doby, obrocie i liczbie prognoz; gdy ruchu jest mało, dopełniają najnowsze.
 */
function wybierzHot(otwarte: Pytanie[], aktywnosc: Aktywnosc[], teraz: number): Pytanie[] {
  const ruch = new Map<number, number>();
  for (const a of aktywnosc) {
    const t = new Date(a.czas).getTime();
    if (Number.isFinite(t) && teraz - t <= HOT_OKNO) ruch.set(a.pytanie, (ruch.get(a.pytanie) ?? 0) + 1);
  }
  const r = (p: Pytanie) => ruch.get(p.id) ?? 0;
  return [...otwarte]
    .sort((a, b) => Number(b.wyroznione) - Number(a.wyroznione) || r(b) - r(a) || b.obrot - a.obrot || b.liczba_prognoz - a.liczba_prognoz || czasOtwarcia(b) - czasOtwarcia(a) || a.id - b.id)
    .slice(0, HOT_ILE);
}

/** Miasta z listy rynków: od największej liczby rynków, przy remisie alfabetycznie. */
function miastaZ(lista: Pytanie[]): string[] {
  const ile = new Map<string, number>();
  for (const p of lista) ile.set(p.miasto, (ile.get(p.miasto) ?? 0) + 1);
  return [...ile.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pl")).map(([m]) => m);
}

/* ---------- czołówka: hasło dla gościa, wyróżniony rynek, taśma ostatnich prognoz ---------- */

/** Rynek na czołówkę: otwarty z największym obrotem, a gdy nikt jeszcze nie grał, ten z najbliższym terminem. */
function wybierzWyrozniony(lista: Pytanie[], czolowkaId: number | null): { p: Pytanie; powod: string } | null {
  const otwarte = lista.filter((p) => p.status === "otwarte");
  if (otwarte.length === 0) return null;
  // Rynek wskazany przez admina (ustawienia.rynek_czolowki) ma pierwszeństwo.
  const wybrany = czolowkaId != null ? otwarte.find((p) => p.id === czolowkaId) : undefined;
  if (wybrany) return { p: wybrany, powod: "na czołówce" };
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
              {o0 != null ? <span className="co">kurs otwarcia</span> : null}
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
      {/* bez historii kursu (rynek przed odsłonięciem) nie ma wykresu, a treść zajmuje całą szerokość */}
      {(historia ?? []).length > 0 ? (
        <div className="wyrozniony-wykres">
          <Wykres historia={historia ?? []} odpowiedzi={p.odpowiedzi} wysokosc={250} zywy kompakt />
        </div>
      ) : null}
    </article>
  );
}

const DZIESIEC_MINUT = 10 * 60 * 1000;

/** Taśma świeżych ruchów: ostatnie 5 prognoz i licznik prognoz z ostatnich 10 minut (RPC aktywnosc, co 5 s). Pusta nie zajmuje miejsca. */
function Tasma() {
  const { dane } = usePolling(() => pobierzAktywnosc(null, 100), 5000);
  const wszystkie = dane ?? [];
  const wpisy = wszystkie.slice(0, 5);
  if (wpisy.length === 0) return null;
  const teraz = Date.now();
  const ostatnie10 = wszystkie.filter((a) => a.udzialy > 0 && teraz - new Date(a.czas).getTime() <= DZIESIEC_MINUT).length;
  return (
    <div className="tasma">
      <span className="tasma-etykieta">
        <i className="puls" />
        Na żywo
        <small className="tasma-licznik cyfry">{ostatnie10}</small>
        <small className="tasma-opis">{ostatnie10 === 1 ? "prognoza" : ostatnie10 >= 2 && ostatnie10 <= 4 ? "prognozy" : "prognoz"} w 10 min</small>
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

/** Jeden rząd kart przewijany w poziomie (strzałki na szerokim ekranie); tytuł z licznikiem i linkiem „zobacz wszystkie”. */
function Rzad({ tytul, opis, lista, link, pusto, ...reszta }: PropsListy & { tytul: ReactNode; opis?: string; link?: string; pusto?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const przewin = (kierunek: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    // o szerokość widocznej części rzędu, czyli o pełny komplet kart
    el.scrollBy({ left: kierunek * Math.max(240, el.clientWidth - 32), behavior: "smooth" });
  };
  return (
    <section className="rzad-sekcja">
      <h2 className="sekcja-tytul">
        {tytul} <span className="licznik">{lista.length}</span>
        {opis ? <span className="sekcja-opis">{opis}</span> : null}
        <span className="prawy rzad-akcje">
          {link ? <Link to={link}>Zobacz wszystkie</Link> : null}
          {lista.length > 1 ? (
            <>
              <button type="button" className="przycisk-ikona rzad-strzalka wstecz" aria-label="Przewiń w lewo" onClick={() => przewin(-1)}>
                <IkSzewron />
              </button>
              <button type="button" className="przycisk-ikona rzad-strzalka" aria-label="Przewiń w prawo" onClick={() => przewin(1)}>
                <IkSzewron />
              </button>
            </>
          ) : null}
        </span>
      </h2>
      {lista.length === 0 ? (
        <p className="pusto">{pusto ?? PUSTO_OTWARTE}</p>
      ) : (
        <div className="rzad" ref={ref}>
          {lista.map((p) => (
            <KartaRynku
              key={p.id}
              p={p}
              obserwowany={reszta.obserwowane.includes(p.id)}
              przelaczObserwowanie={reszta.przelaczObserwowanie}
              mojTyp={reszta.typy.get(p.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** Chipy miast nad listą w zakładkach Miasto / Na luzie. */
function ChipyMiast({ miasta, wybrane, naWybor }: { miasta: string[]; wybrane: string; naWybor: (m: string) => void }) {
  if (miasta.length === 0) return null;
  return (
    <div className="chipy chipy-miast" role="group" aria-label="Miasto">
      <button type="button" className={`chip ${wybrane === "" ? "aktywny" : ""}`} onClick={() => naWybor("")}>
        Wszystkie miasta
      </button>
      {miasta.map((m) => (
        <button type="button" key={m} className={`chip ${wybrane === m ? "aktywny" : ""}`} onClick={() => naWybor(m)}>
          {m}
        </button>
      ))}
    </div>
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
  const { pozycje: moje } = useSesja();
  const [obserwowane, setObserwowane] = useState<number[]>(czytajObserwowane);

  const filtr = czytajFiltr(params.get("f"));
  const sortowanie = czytajSortowanie(params.get("s"));
  const q = (params.get("q") ?? "").trim();
  const miastoParam = (params.get("m") ?? "").trim();
  // Rynek na czołówce wskazany przez admina (odpytywany rzadko; zmienia się ręcznie).
  const { dane: czolowkaId } = usePolling(() => (filtr === "wszystkie" && !q ? pobierzCzolowke() : Promise.resolve(null)), 30000, `cz|${filtr}|${q}`);
  // Ruch z ostatniej doby do sekcji „Hot” (tylko strona główna, odpytywane rzadziej niż rynki).
  const { dane: ruch } = usePolling(() => (filtr === "wszystkie" && !q ? pobierzAktywnosc(null, 100) : Promise.resolve([])), 15000, `${filtr}|${q}`);
  // Szukanie obejmuje też graczy (po nicku); lista rynków filtruje się lokalnie, gracze idą z bazy.
  const { dane: graczeZnalezieni } = usePolling(() => (q ? szukajGraczy(q, 12) : Promise.resolve([])), 30000, q);
  const liczbaGraczy = q ? (graczeZnalezieni ?? []).length : 0;

  const ustawParam = (klucz: "f" | "s" | "m", wartosc: string, domyslna: string) => {
    const nowe = new URLSearchParams(params);
    if (wartosc === domyslna) nowe.delete(klucz);
    else nowe.set(klucz, wartosc);
    if (klucz === "f") nowe.delete("m");
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
  const szukane = q ? pytania.filter((p) => pasujeDoFrazy(p, q)) : pytania;
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
  const hot = filtr === "wszystkie" && !q ? wybierzHot(aktywne.filter((p) => p.status === "otwarte"), ruch ?? [], teraz) : [];
  // Zakładki Miasto / Na luzie: podział po miastach (chipy z adresu ?m=).
  const miastaKategorii = filtr === "miasto" || filtr === "luz" ? miastaZ(aktywne.concat(zakonczone)) : [];
  const wybraneMiasto = miastaKategorii.includes(miastoParam) ? miastoParam : "";

  const czolowka = filtr === "wszystkie" && !q;
  const wyrozniony = czolowka ? wybierzWyrozniony(aktywne, czolowkaId ?? null) : null;

  const typy = new Map((moje ?? []).filter((m) => m.udzialy_glowne >= 0.05).map((m) => [m.pytanie, m.odpowiedz_glowna]));
  const listaProps = { obserwowane, przelaczObserwowanie, typy };
  let zawartosc: ReactNode = null;
  if (dane) {
    const pustoAktywne = filtr === "obserwowane" ? PUSTO_OBSERWOWANE : PUSTO_OTWARTE;
    if (q && liczbaWidocznych === 0) {
      zawartosc = <p className="pusto">{liczbaGraczy > 0 ? `Brak rynków dla „${q}”` : `Nic nie znaleziono dla „${q}”`}</p>;
    } else if (filtr === "wszystkie" && q) {
      zawartosc = (
        <>
          {miasto.length > 0 ? <Sekcja tytul="Miasto" pusto={pustoAktywne} lista={miasto} {...listaProps} /> : null}
          {luz.length > 0 ? <Sekcja tytul="Na luzie" pusto={pustoAktywne} lista={luz} {...listaProps} /> : null}
          {zakonczone.length > 0 ? (
            <Sekcja tytul="Rozstrzygnięte" pusto={PUSTO_ROZSTRZYGNIETE} lista={zakonczone} {...listaProps} />
          ) : null}
        </>
      );
    } else if (filtr === "wszystkie") {
      // Strona główna: każda kategoria to jeden rząd przewijany w prawo, od najgorętszych rynków.
      zawartosc = (
        <>
          {hot.length > 0 ? (
            <Rzad
              tytul={
                <>
                  {/* płomień, nie pulsująca kropka: kropka oznacza taśmę „Na żywo” tuż nad tym rzędem */}
                  <span className="hot-ikona" aria-hidden="true">
                    <IkPlomien />
                  </span>
                  Hot
                </>
              }
              opis="wyróżnione i z największym ruchem"
              lista={hot}
              link="/?s=obrot"
              {...listaProps}
            />
          ) : null}
          <Rzad tytul="Miasto" lista={miasto} link="/?f=miasto" pusto={pustoAktywne} {...listaProps} />
          <Rzad tytul="Na luzie" lista={luz} link="/?f=luz" pusto={pustoAktywne} {...listaProps} />
          {zakonczone.length > 0 ? <Rzad tytul="Rozstrzygnięte" lista={zakonczone} link="/?f=rozstrzygniete" {...listaProps} /> : null}
        </>
      );
    } else if (filtr === "miasto" || filtr === "luz") {
      const chipy = <ChipyMiast miasta={miastaKategorii} wybrane={wybraneMiasto} naWybor={(m) => ustawParam("m", m, "")} />;
      if (wybraneMiasto || miastaKategorii.length <= 1) {
        // Jedno miasto (wybrane albo jedyne): zwykła siatka.
        const a = wybraneMiasto ? aktywne.filter((p) => p.miasto === wybraneMiasto) : aktywne;
        const z = wybraneMiasto ? zakonczone.filter((p) => p.miasto === wybraneMiasto) : zakonczone;
        zawartosc = (
          <>
            {chipy}
            {a.length > 0 ? <Siatka lista={a} {...listaProps} /> : <p className="pusto">{pustoAktywne}</p>}
            {z.length > 0 ? <Sekcja tytul="Rozstrzygnięte" pusto={PUSTO_ROZSTRZYGNIETE} lista={z} {...listaProps} /> : null}
          </>
        );
      } else {
        // Wiele miast: rząd na miasto, w kolejności od największej liczby rynków.
        zawartosc = (
          <>
            {chipy}
            {miastaKategorii.map((m) => (
              <Rzad key={m} tytul={m} lista={aktywne.filter((p) => p.miasto === m)} link={`/?f=${filtr}&m=${encodeURIComponent(m)}`} {...listaProps} />
            ))}
            {zakonczone.length > 0 ? <Rzad tytul="Rozstrzygnięte" lista={zakonczone} link="/?f=rozstrzygniete" {...listaProps} /> : null}
          </>
        );
      }
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
                <h1>Polski rynek prognoz</h1>
                <p>
                  Stawiasz punkty zamiast złotówek na to, co wydarzy się w Polsce: od miejskich inwestycji po życie
                  celebrytów. Kurs pokazuje, jak bardzo ludzie w to wierzą.
                </p>
                {odsetek != null ? (
                  <p className="czolowka-liczba">
                    <b className="cyfry">{Math.round(odsetek * 100)}%</b> umów miejskich z próby wykonano w terminie (BZP)
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
            Wyniki dla „{q}”:{" "}
            {[
              liczbaWidocznych > 0 ? odmien(liczbaWidocznych, "rynek", "rynki", "rynków") : "",
              liczbaGraczy > 0 ? odmien(liczbaGraczy, "gracz", "graczy", "graczy") : "",
            ]
              .filter(Boolean)
              .join(" i ") || "nic nie znaleziono"}
          </p>
        ) : null}
        {q && graczeZnalezieni && graczeZnalezieni.length > 0 ? (
          <section aria-label="Znalezieni gracze">
            <h2 className="sekcja-tytul">
              Gracze <span className="licznik cyfry">{graczeZnalezieni.length}</span>
            </h2>
            <div className="gracze-znalezieni">
              {graczeZnalezieni.map((g) => (
                <Link key={g.nick} to={`/u/${encodeURIComponent(g.nick)}`} className="gracz-znaleziony">
                  <Awatar nick={g.nick} />
                  {g.nick}
                  <OdznakaMiejsca miejsce={g.miejsce} />
                  <small>{g.prognozy > 0 ? odmien(g.prognozy, "prognoza", "prognozy", "prognoz") : "bez prognoz"}</small>
                </Link>
              ))}
            </div>
          </section>
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
