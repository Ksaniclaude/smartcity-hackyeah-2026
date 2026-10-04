import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  adminUsunKomentarz,
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
import { IkGwiazdka, IkLink, IkPtaszek, IkStrzalka } from "@/ui/ikony";
import { Awatar, Komunikat, Ladowanie, OdznakaMiejsca, OdznakaStatusu, ZyskStrata, formatujDate, formatujDateKrotko, opisPrognoz } from "@/ui/komponenty";
import { EkranRozstrzygniecia, useRozstrzygniecieDoPokazania } from "@/ui/rozstrzygniecie";
import { KartaRynku, Piktogram, Podzial, Termin, Zmiana, ZmianaOdGodziny, jakoProcent, klasaOdp } from "@/ui/rynek";
import { czasTemu, dniDo, liczba, linkHttp, odmien, pkt, punkty, udzialyTekst, wDol, zmianaPp } from "@/ui/tekst";
import { PasekUdostepniania, PrzyciskUdostepnij, type DaneKarty } from "@/ui/udostepnij";
import { Wykres } from "@/ui/wykres";
import { usePostep } from "@/ui/postep";
import { LiczbaZywa, fala, lecPunkty, podbij, uniesTekst, useWidoczny, wibruj, wstrzasnij, wystrzel } from "@/ui/zywe";

const LIMIT_NA_PYTANIE = 200;
/** Punkty na start: goście liczą nimi podgląd wygranej, zanim założą konto. */
const PUNKTY_NA_START = 1000;
/** Szybkie stawki: jeden klik zamiast wpisywania liczby. */
const SZYBKIE_STAWKI = [20, 50, 100, 200];
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

/** Komentarz z odznaką pozycji autora („stawia 120 na tak”, z już zapisanej stawki) i miejscem w rankingu.
 *  Admin widzi przy nim „Usuń” (moderacja). */
function WpisKomentarza({
  k,
  miejsce,
  naUsun,
  usuwa,
}: {
  k: Komentarz;
  miejsce?: number | null;
  naUsun?: () => void;
  usuwa?: boolean;
}) {
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
          {k.powod ? <span className="znacznik">{POWODY.find((r) => r.wartosc === k.powod)?.etykieta ?? k.powod}</span> : null}
          <span className="prawy">
            {czasTemu(k.czas)}
            {naUsun ? (
              <button type="button" className="przycisk-tekst usun-wpis" onClick={naUsun} disabled={usuwa} aria-label={`Usuń komentarz gracza ${k.nick}`}>
                Usuń
              </button>
            ) : null}
          </span>
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
  const { stan, konto, gracz, otworzModal } = useSesja();
  const admin = gracz?.czy_admin === true;
  const [tekst, setTekst] = useState("");
  const dodaj = useAkcja(async () => {
    await dodajKomentarz(pid, tekst.trim());
    setTekst("");
    await odswiez();
  });
  const usun = useAkcja(async (id: number) => {
    await adminUsunKomentarz(id);
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
      {komentarze.length === 0 ? <p className="pusto">Jeszcze nikt nie skomentował. Twój komentarz może być pierwszy.</p> : null}
      {usun.blad ? <Komunikat typ="blad">{usun.blad}</Komunikat> : null}
      {komentarze.map((k) => (
        <WpisKomentarza
          key={k.id}
          k={k}
          miejsce={miejsca.get(k.nick)}
          usuwa={usun.trwa}
          naUsun={
            admin
              ? () => {
                  if (window.confirm(`Usunąć komentarz gracza ${k.nick}? Tego nie da się cofnąć.`)) void usun.wykonaj(k.id);
                }
              : undefined
          }
        />
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
  /** Adres rynku do karty udostępniania. */
  url: string;
}

/** Zmiana miejsca w rankingu po transakcji (nic, gdy bez zmian). */
function Awans({ przed, po, graczy }: { przed: number | null; po: number | null; graczy?: number }) {
  if (po == null || przed === po) return null;
  if (przed == null)
    return (
      <p className="awans gora">
        Wejście do rankingu: miejsce {po}
        {graczy ? ` z ${graczy}` : ""}
      </p>
    );
  if (po < przed) return <p className="awans gora">Awans w rankingu: {przed} → {po}</p>;
  return <p className="awans dol">Ranking: {przed} → {po}</p>;
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

function Panel({ p, odp, setOdp, udzialyMoje, wydaneRazem, poZmianie, url }: PanelProps) {
  const { gracz, konto, stan, otworzModal, uruchom, odswiezGracza } = useSesja();
  const { odswiez: odswiezPostep } = usePostep();
  const [tryb, setTryb] = useState<"kup" | "sprzedaj">("kup");
  const [stawka, setStawka] = useState(SZYBKIE_STAWKI[0]);
  const [powod, setPowod] = useState<Powod | null>(null);
  const [komentarz, setKomentarz] = useState("");
  const [wynik, setWynik] = useState<WynikZakladu | null>(null);
  const [odpSprzedaz, setOdpSprzedaz] = useState<number | null>(null);
  const [udzialySprzedaz, setUdzialySprzedaz] = useState(0);
  const [wynikSprzedazy, setWynikSprzedazy] = useState<WynikSprzedazy | null>(null);
  const [nrKuponu, setNrKuponu] = useState(0);
  /** Monety lecą z salda do panelu: przycisk czeka, aż wyląduje kupon. */
  const [leci, setLeci] = useState(false);
  const refPanelu = useRef<HTMLDivElement>(null);
  const refKuponu = useRef<HTMLDivElement>(null);
  const refStawki = useRef<HTMLDivElement>(null);
  const refWygranej = useRef<HTMLSpanElement>(null);
  const refPostaw = useRef<HTMLButtonElement>(null);
  const refSprzedaj = useRef<HTMLButtonElement>(null);
  const kup = useAkcja(postawPrognoze);
  const sprzedaj = useAkcja(sprzedajUdzialy);

  const otwarte = p.status === "otwarte";
  const miasto = p.kategoria === "miasto";
  const gotowy = stan === "gotowy";
  const saldo = Math.floor(gracz?.saldo ?? 0);
  // poniżej 0,05 udziału pozycja jest pusta (baza sprzedaje taką resztkę razem z całością)
  const posiadane = udzialyMoje.filter((z) => z.udzialy >= 0.05);
  // Jedna strona rynku na gracza (jak na giełdach prognoz): kupno innej odpowiedzi najpierw sprzedaje te udziały.
  const inne = odp != null ? posiadane.filter((z) => z.odpowiedz !== odp) : [];
  const zwrotInne = inne.reduce(
    (suma, z) => suma + (p.kursy ? podgladSprzedazy(p.kursy[z.odpowiedz - 1], z.udzialy).zwrot : 0),
    0,
  );
  const wydaneTej = odp != null ? (udzialyMoje.find((z) => z.odpowiedz === odp)?.wydane ?? 0) : wydaneRazem;
  // Gość liczy podgląd tak, jakby miał już punkty na start; postawić może dopiero po założeniu konta.
  const maks = Math.max(0, Math.min(LIMIT_NA_PYTANIE - Math.floor(wydaneTej), (gotowy ? saldo : PUNKTY_NA_START) + Math.floor(zwrotInne)));
  const stawkaOk = Math.max(1, Math.min(Math.round(stawka) || 1, Math.max(1, maks)));
  // kurs wybranej odpowiedzi po ewentualnej sprzedaży drugiej strony (dokładnie dla 2 odpowiedzi, w przybliżeniu dla 3)
  const kursWybranej = (() => {
    if (odp == null || !p.kursy) return null;
    if (inne.length === 1 && p.odpowiedzi.length === 2) {
      return 1 - podgladSprzedazy(p.kursy[inne[0].odpowiedz - 1], inne[0].udzialy).kursPo;
    }
    return p.kursy[odp - 1];
  })();
  const podglad = kursWybranej != null ? podgladZakladu(kursWybranej, stawkaOk) : null;
  const mnoznik = podglad ? podglad.udzialy / stawkaOk : null;
  const brakPowodu = miasto && !powod;
  const pozycjaSprzedaz = posiadane.find((z) => z.odpowiedz === odpSprzedaz) ?? posiadane[0] ?? null;
  const kursSprzedazy = pozycjaSprzedaz && p.kursy ? p.kursy[pozycjaSprzedaz.odpowiedz - 1] : null;
  // Pole, suwak i chipy liczą pełne udziały w dół, więc nigdy nie przekraczają posiadanych. Maksimum pola
  // (posiadane w dół) znaczy „wszystko”: sprzedaż bierze całą pozycję razem z ułamkiem.
  const maksSprzedaz = pozycjaSprzedaz ? wDol(pozycjaSprzedaz.udzialy, 0) : 0;
  const uSprzedaz = pozycjaSprzedaz
    ? udzialySprzedaz >= maksSprzedaz
      ? pozycjaSprzedaz.udzialy
      : Math.max(0, wDol(udzialySprzedaz, 0))
    : 0;
  const podgladS = kursSprzedazy != null && uSprzedaz > 0 ? podgladSprzedazy(kursSprzedazy, uSprzedaz) : null;

  useEffect(() => {
    if (posiadane.length === 0 && tryb === "sprzedaj") setTryb("kup");
  }, [posiadane.length, tryb]);
  useEffect(() => {
    if (pozycjaSprzedaz && udzialySprzedaz === 0) setUdzialySprzedaz(wDol(pozycjaSprzedaz.udzialy, 0));
  }, [pozycjaSprzedaz, udzialySprzedaz]);

  // Stawka ma wagę: pole podskakuje przy każdej zmianie, wygrana przy wzroście, a co 50 punktów idzie fala.
  const poprzedniaStawka = useRef(stawkaOk);
  useEffect(() => {
    const przed = poprzedniaStawka.current;
    if (przed === stawkaOk) return;
    poprzedniaStawka.current = stawkaOk;
    podbij(refStawki.current, 0.5);
    if (stawkaOk <= przed) return;
    podbij(refWygranej.current, 0.6 + stawkaOk / LIMIT_NA_PYTANIE);
    if (refWygranej.current && Math.floor(stawkaOk / 50) > Math.floor(przed / 50)) {
      fala(refWygranej.current, "tak", 80);
      wibruj(10);
    }
  }, [stawkaOk]);

  // Przycisk „Postaw” daje znać, że jest gotowy: podbija się w chwili, gdy niczego już nie brakuje.
  const moznaPostawic = gotowy && odp != null && maks >= 1 && !brakPowodu;
  useEffect(() => {
    if (moznaPostawic) podbij(refPostaw.current, 1.2);
  }, [moznaPostawic]);

  // Uderzenie: kupon ląduje, pieczęć puszcza falę i drobiny (tym więcej, im większa stawka), panel drga.
  useEffect(() => {
    const kupon = refKuponu.current;
    if (nrKuponu === 0 || !kupon) return;
    const pieczec = kupon.querySelector(".kupon-gora svg") ?? kupon;
    if (wynik) {
      const waga = Math.min(1, wynik.stawka / LIMIT_NA_PYTANIE);
      const klasa = klasaOdp(wynik.odpowiedz - 1);
      fala(pieczec, klasa, 90 + 70 * waga);
      wystrzel(pieczec, { ile: Math.round(14 + 22 * waga), moc: 0.8 + 0.7 * waga, klasa });
      wstrzasnij(refPanelu.current);
      wibruj([14, 40, 22]);
    } else {
      fala(pieczec, "tak", 70);
    }
    // tylko nowy kupon wywołuje uderzenie; `wynik` jest z tego samego renderu
  }, [nrKuponu]);

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
    if (!w) return;
    setKomentarz("");
    setLeci(true);
    // Kupon pojawi się na górze panelu: najpierw pokazujemy to miejsce, potem lecą tam monety z salda.
    const panel = refPanelu.current;
    const portfel = document.querySelector(".portfel");
    const podNaglowkiem = (document.querySelector(".naglowek")?.getBoundingClientRect().height ?? 60) + 12;
    panel?.parentElement?.scrollTo({ top: 0, behavior: "smooth" });
    let gora = panel?.getBoundingClientRect().top ?? podNaglowkiem;
    if (panel && gora < podNaglowkiem) {
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
      gora = podNaglowkiem;
    }
    void odswiezGracza(); // saldo spada w tym samym czasie, gdy wylatują z niego monety
    if (panel && portfel) {
      const r = panel.getBoundingClientRect();
      await lecPunkty(portfel, { x: r.left + r.width / 2, y: gora + 64 }, 5 + (w.stawka / LIMIT_NA_PYTANIE) * 15);
    }
    setWynik(w);
    setWynikSprzedazy(null);
    setNrKuponu((n) => n + 1);
    setLeci(false);
    // własny ruch na dużym kursie nad wykresem: o ile punktów procentowych przesunęła go ta prognoza
    const ruch = zmianaPp(w.kursy?.[0], p.kursy?.[0]);
    const duzyKurs = document.querySelector(".rynek-glowna .kurs-duzy")?.getBoundingClientRect();
    if (ruch && duzyKurs) {
      // obok dużej liczby, nie nad nią, żeby nie wchodzić na wiersz z terminem
      const obok = { x: duzyKurs.right + 70, y: duzyKurs.top + duzyKurs.height * 0.55 };
      uniesTekst(obok, `${ruch > 0 ? "+" : "−"}${Math.abs(ruch)} pkt proc.`, ruch > 0 ? "gora" : "dol");
    }
    void odswiezPostep(); // doświadczenie za prognozę leci do pierścienia przy awatarze zaraz po kuponie
    await poZmianie();
  };
  const wyslijSprzedaz = async (e: FormEvent) => {
    e.preventDefault();
    if (!pozycjaSprzedaz || uSprzedaz <= 0) return;
    const w = await sprzedaj.wykonaj({ pytanie: p.id, odpowiedz: pozycjaSprzedaz.odpowiedz, udzialy: uSprzedaz });
    if (!w) return;
    // Punkty wracają: monety lecą z przycisku sprzedaży do salda (start liczony, zanim formularz zniknie).
    const portfel = document.querySelector(".portfel");
    const lot = refSprzedaj.current && portfel ? lecPunkty(refSprzedaj.current, portfel, 5 + Math.min(15, w.zwrot / 10)) : null;
    setWynikSprzedazy(w);
    setWynik(null);
    setUdzialySprzedaz(0);
    setNrKuponu((n) => n + 1);
    if (lot) {
      await lot;
      podbij(portfel, 2);
      fala(portfel!, "tak", 80);
      wibruj([10, 30, 16]);
    }
    void odswiezPostep();
    await Promise.all([odswiezGracza(), poZmianie()]);
  };

  const mojaPozycja = posiadane.length
    ? posiadane.map((z) => `${udzialyTekst(z.udzialy)} udz. na „${p.odpowiedzi[z.odpowiedz - 1]}”`).join(", ")
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
    <div className="panel" id="panel" ref={refPanelu}>
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
        <div className="kupon" role="status" key={nrKuponu} ref={refKuponu}>
          <div className="kupon-gora">
            <IkPtaszek />
            Prognoza przyjęta
          </div>
          <div className="kupon-kurs cyfry">
            <span className="przed">{procent(wynik.kurs_przed)}</span>
            <IkStrzalka />
            <KursPoZmianie przed={wynik.kurs_przed} po={wynik.kurs_po} />
          </div>
          <p className="kupon-wygrana">
            Do wygrania{" "}
            <LiczbaZywa className="cyfry" od={0} wartosc={wDol(wynik.udzialy, 0)} format={(n) => `${liczba(n)} pkt`} czas={900} />
          </p>
          {wynik.sprzedano.length > 0 ? (
            <p>
              Sprzedano {wynik.sprzedano.map((z) => `${udzialyTekst(z.udzialy)} udz. „${z.odpowiedz_tekst}”`).join(", ")} za{" "}
              {liczba(wDol(wynik.zwrot_ze_sprzedazy, 0))} pkt.
            </p>
          ) : null}
          <p>
            Twój ruch przesunął kurs {procent(wynik.kurs_przed)} → {procent(wynik.kurs_po)}.
          </p>
          <p>
            Masz <b>{udzialyTekst(wynik.udzialy)} udz.</b> na „{p.odpowiedzi[wynik.odpowiedz - 1]}”. Jeśli trafisz:{" "}
            <b className="zysk">+{liczba(wDol(wynik.udzialy, 0))} pkt</b> (×{liczba(wynik.udzialy / wynik.stawka, 2)}). Saldo: {punkty(wynik.saldo)}.
          </p>
          <Awans przed={wynik.miejsce_przed} po={wynik.miejsce_po} graczy={wynik.graczy_w_rankingu} />
          <PasekUdostepniania
            dane={{ tresc: p.tresc, odpowiedz: p.odpowiedzi[wynik.odpowiedz - 1], indeks: wynik.odpowiedz - 1, kurs: wynik.kurs_po, url, rodzaj: "moja" }}
          />
        </div>
      ) : null}
      {wynikSprzedazy ? (
        <div className="kupon" role="status" key={nrKuponu} ref={refKuponu}>
          <div className="kupon-gora">
            <IkPtaszek />
            Sprzedano {udzialyTekst(wynikSprzedazy.udzialy)} udz. za {liczba(wDol(wynikSprzedazy.zwrot, 0))} pkt
          </div>
          <p>
            Kurs „{p.odpowiedzi[wynikSprzedazy.odpowiedz - 1]}” spadł {procent(wynikSprzedazy.kurs_przed)} → {procent(wynikSprzedazy.kurs_po)}.
            Saldo: {punkty(wynikSprzedazy.saldo)}.
          </p>
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
                className={`odp-przycisk ${klasaOdp(i)} ${odp === i + 1 ? "wybrana" : ""}`}
                aria-pressed={odp === i + 1}
                onClick={(e) => {
                  setOdp(i + 1);
                  podbij(e.currentTarget, 1);
                  wibruj(8);
                }}
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
                : `Na jeden rynek można wydać najwyżej ${LIMIT_NA_PYTANIE} punktów, a Ty masz już ${Math.floor(wydaneTej)}.`}
            </Komunikat>
          ) : (
            <div className="stawka-pole">
              <div className="etykieta">
                <span>Stawka</span>
                <span>{gotowy ? `masz ${pkt(saldo)}` : `na start dostajesz ${pkt(PUNKTY_NA_START)}`}</span>
              </div>
              <div className="stawka-wejscie" ref={refStawki}>
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
                    className={`cyfry ${c <= maks && stawkaOk === c ? "wybrany" : ""}`}
                    disabled={c > maks && stawkaOk === maks}
                    onClick={(e) => {
                      const nowa = Math.min(maks, c);
                      if (nowa !== stawkaOk) uniesTekst(e.currentTarget, `${nowa}`, "akcent");
                      setStawka(nowa);
                      wibruj(6);
                    }}
                  >
                    {c}
                  </button>
                ))}
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

          {odp != null && inne.length > 0 && gotowy ? (
            <div className="panel-info">
              Rynek ma jedną stronę na gracza. Masz{" "}
              {inne.map((z) => `${udzialyTekst(z.udzialy)} udz. na „${p.odpowiedzi[z.odpowiedz - 1]}”`).join(" i ")}: kupno „
              {p.odpowiedzi[odp - 1]}” najpierw je sprzeda
              {p.kursy ? ` (≈ ${liczba(wDol(zwrotInne, 0))} pkt wraca na saldo)` : ""}.
            </div>
          ) : null}
          {odp != null && stan !== "blad" && maks >= 1 ? (
            <div className="wygrana" style={{ "--waga": Math.min(1, stawkaOk / LIMIT_NA_PYTANIE).toFixed(2) } as CSSProperties}>
              {podglad ? (
                <>
                  <div className="wiersz-pod">
                    <span>Udziały</span>
                    <b>≈ {udzialyTekst(podglad.udzialy)}</b>
                  </div>
                  <div className="wiersz-pod">
                    <span>Kurs po transakcji</span>
                    <b>
                      {procent(kursWybranej)} → {procent(podglad.kursPo)}
                    </b>
                  </div>
                  <div className="wygrana-glowna">
                    <span>Jeśli trafisz</span>
                    <span className="cyfry zysk" ref={refWygranej}>
                      <LiczbaZywa wartosc={wDol(podglad.udzialy, 0)} format={(n) => `+${liczba(n)}`} czas={220} />
                      <small>pkt (×{liczba(mnoznik ?? 0, 2)})</small>
                    </span>
                  </div>
                  <div className="wiersz-pod">
                    <span>Zysk ponad stawkę</span>
                    <b className="zysk">
                      +{liczba(wDol(podglad.udzialy - stawkaOk, 0))} pkt (+{Math.floor((podglad.udzialy / stawkaOk - 1) * 100)}%)
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
              ref={refPostaw}
              className={`przycisk-postaw ${odp != null ? klasaOdp(odp - 1) : ""}`}
              disabled={kup.trwa || leci || odp == null || maks < 1 || brakPowodu}
            >
              {kup.trwa || leci
                ? "Zapisuję…"
                : odp == null
                  ? "Wybierz odpowiedź"
                  : brakPowodu
                    ? "Wybierz powód"
                    : inne.length > 0
                      ? `Sprzedaj „${inne.map((z) => p.odpowiedzi[z.odpowiedz - 1]).join("”, „")}” i postaw ${odp === 3 ? ": " : ""}${p.odpowiedzi[odp - 1]}`
                      : `Postaw ${liczba(stawkaOk)} pkt: ${p.odpowiedzi[odp - 1]}`}
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
                  setUdzialySprzedaz(wDol(z.udzialy, 0));
                }}
              >
                <span className="nazwa">{p.odpowiedzi[z.odpowiedz - 1]}</span>
                <small>{udzialyTekst(z.udzialy)} udz.</small>
              </button>
            ))}
          </div>
          {pozycjaSprzedaz ? (
            <div className="stawka-pole">
              <div className="etykieta">
                <span>Ile udziałów sprzedać</span>
                <span>masz {udzialyTekst(pozycjaSprzedaz.udzialy)}</span>
              </div>
              <div className="stawka-wejscie">
                <input
                  type="number"
                  inputMode="decimal"
                  min={Math.min(1, maksSprzedaz)}
                  step={1}
                  max={maksSprzedaz}
                  value={wDol(uSprzedaz, 0)}
                  aria-label="Liczba udziałów do sprzedania"
                  onChange={(e) => setUdzialySprzedaz(Number(e.target.value))}
                />
                <span>udz.</span>
              </div>
              <div className="stawka-chipy">
                {[25, 50, 75].map((proc) => (
                  <button type="button" key={proc} onClick={() => setUdzialySprzedaz(wDol((pozycjaSprzedaz.udzialy * proc) / 100, 0))}>
                    {proc}%
                  </button>
                ))}
                <button type="button" onClick={() => setUdzialySprzedaz(maksSprzedaz)}>
                  Wszystko
                </button>
              </div>
              <Suwak
                min={Math.min(1, maksSprzedaz)}
                max={maksSprzedaz}
                step={1}
                wartosc={wDol(uSprzedaz, 0)}
                etykieta="Suwak udziałów"
                naZmiane={setUdzialySprzedaz}
              />
            </div>
          ) : null}
          <div className="wygrana">
            {podgladS ? (
              <>
                <div className="wygrana-glowna">
                  <span>Zwrot</span>
                  <span className="cyfry">
                    <LiczbaZywa wartosc={wDol(podgladS.zwrot, 0)} format={(n) => `≈ ${liczba(n)}`} czas={220} />
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
          <button type="submit" ref={refSprzedaj} className="przycisk-postaw" disabled={sprzedaj.trwa || !pozycjaSprzedaz || uSprzedaz < 0.01}>
            {sprzedaj.trwa ? "Sprzedaję…" : `Sprzedaj ${udzialyTekst(uSprzedaz)} udz.`}
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

  const { dane: p, blad: bladPytania, laduje, odswiez: odswiezPytanie } = usePolling(() => pobierzPytanie(pid), 5000, pid);
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
  const [obserwowane, setObserwowane] = useState<number[]>(() => czytajObserwowane());
  const [refPanelu, panelWidoczny] = useWidoczny<HTMLElement>();
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
  const pierwszy = historia && historia.length > 0 ? historia[0].kursy[0] : null;
  const zmiana = zmianaPp(kurs0, pierwszy);
  /** Kursu tłumu nie ma (rynek przed odsłonięciem): strona pokazuje kursy otwarcia, bez dużej liczby i bez wykresu. */
  const bezKursu = kurs0 == null;
  const moja = moje?.find((m) => m.pytanie === pid);
  const wydaneRazem = (udzialyMoje ?? []).reduce((s, z) => s + z.wydane, 0);
  const url = `${window.location.origin}/pytanie/${pid}`;
  // plansza do udostępniania: z pozycją „Daję X%” na mój główny typ, bez pozycji „Rynek daje X%” na pierwszą odpowiedź
  const indeksKarty = moja ? moja.odpowiedz_glowna - 1 : 0;
  const kursKarty = p.kursy ? p.kursy[indeksKarty] : p.kursy_otwarcia ? p.kursy_otwarcia[indeksKarty] : null;
  const daneKarty: DaneKarty | null =
    kursKarty != null ? { tresc: p.tresc, odpowiedz: p.odpowiedzi[indeksKarty], indeks: indeksKarty, kurs: kursKarty, url, rodzaj: moja ? "moja" : "rynek" } : null;
  const podobne = (wszystkie ?? []).filter((q) => q.id !== pid && q.kategoria === p.kategoria && q.status === "otwarte").slice(0, 3);
  const obserwowany = obserwowane.includes(pid);
  // adresy z bazy trafiają do href tylko jako http(s)
  const linkZrodla = linkHttp(p.link_zrodla);
  const linkRozstrzygniecia = linkHttp(p.link_rozstrzygniecia);

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
  const przelaczObserwowanie = (e: { currentTarget: Element }) => {
    if (!obserwowany) wystrzel(e.currentTarget, { ile: 8, moc: 0.45 });
    const nowe = obserwowany ? obserwowane.filter((x) => x !== pid) : [...obserwowane, pid];
    setObserwowane(nowe);
    zapiszObserwowane(nowe);
  };
  // Zaraz po RPC (nie przy następnym odpytaniu): własny nick w aktywności i wśród największych graczy, nowy punkt na wykresie.
  const poZmianie = async () => {
    // razem z samym rynkiem: duży kurs nad wykresem rusza od razu po prognozie, bez czekania na odpytanie
    await Promise.all([odswiezPytanie(), odswiezUdzialy(), odswiezHistorie(), odswiezAktywnosc(), odswiezKomentarze(), odswiezNajwiekszych()]);
  };

  return (
    <main className="kontener">
      <div className="rynek-strona">
        <div className="rynek-glowna">
          {/* nad tytułem: gdzie jestem i co mogę zrobić z rynkiem (podać dalej, obserwować) */}
          <div className="rynek-pasek">
            <nav className="okruszki" aria-label="Okruszki">
              <Link to="/">Rynki</Link>
              <span>›</span>
              <Link to={miasto ? "/?f=miasto" : "/?f=luz"}>{miasto ? "Miasto" : "Na luzie"}</Link>
            </nav>
            <span className="meta-akcje">
              {daneKarty ? <PrzyciskUdostepnij dane={daneKarty} /> : null}
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
            </span>
          </div>
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
            </div>
          </header>

          {/* Przed odsłonięciem kursu nie ma dużej liczby ani wykresu i nic o tym nie piszemy: niżej stoją kursy otwarcia. */}
          {kurs0 != null ? (
            <div className="kurs-naglowek">
              <LiczbaZywa className="cyfry kurs-duzy" wartosc={kurs0 * 100} format={jakoProcent} />
              <span className="co">{miasto ? `szans, że ${p.odpowiedzi[0]}` : `szans na „${p.odpowiedzi[0]}”`}</span>
              {zmiana === 0 ? <span className="zmiana zero">bez zmian od otwarcia</span> : <Zmiana pp={zmiana} pelna />}
              {otwarte ? <ZmianaOdGodziny p={p} pelna /> : null}
            </div>
          ) : null}
          {kurs0 != null && (historia ?? []).length > 0 ? (
            <div className="wykres-karta">
              <div className="wykres-naglowek">
                <div className="okresy" role="tablist">
                  {(["1d", "1t", "1m", "all"] as Okres[]).map((o) => (
                    <button type="button" key={o} role="tab" aria-selected={okres === o} className={okres === o ? "aktywny" : ""} onClick={() => setOkres(o)}>
                      {o === "1d" ? "1D" : o === "1t" ? "1T" : o === "1m" ? "1M" : "Wszystko"}
                    </button>
                  ))}
                </div>
              </div>
              <Wykres historia={historiaOkres} odpowiedzi={p.odpowiedzi} zywy={otwarte} />
            </div>
          ) : null}

          {/* Dwie odpowiedzi: pojedynek po dwóch stronach jednego paska. Więcej: wiersze z paskami.
              Bez kursu tłumu lista pokazuje kursy otwarcia: jeden podpis nad nią, liczby i paski przygaszone. */}
          {bezKursu && p.kursy_otwarcia ? <p className="odpowiedzi-etykieta">Kurs otwarcia</p> : null}
          <div className={`${p.odpowiedzi.length === 2 ? "pojedynek" : "rozklad"} ${bezKursu ? "przed-odslona" : ""}`}>
            {p.odpowiedzi.map((o, i) => {
              const k = p.kursy ? p.kursy[i] : null;
              const ko = p.kursy_otwarcia ? p.kursy_otwarcia[i] : null;
              const mojeU = (udzialyMoje ?? []).find((z) => z.odpowiedz === i + 1);
              const nazwa = (
                <div className="nazwa">
                  {o}
                  {p.wynik === i + 1 ? <small className="typ-tak">wynik</small> : null}
                  {mojeU && mojeU.udzialy >= 0.05 ? <small>Twój typ: {udzialyTekst(mojeU.udzialy)} udz.</small> : null}
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
                    <i style={{ width: `${Math.round((k ?? ko ?? 0) * 100)}%` }} />
                  </span>
                </div>
              );
            })}
            {p.odpowiedzi.length === 2 && p.kursy ? <Podzial kursy={p.kursy} /> : null}
            {p.odpowiedzi.length === 2 && bezKursu && p.kursy_otwarcia ? <Podzial kursy={p.kursy_otwarcia} /> : null}
          </div>

          {p.status === "rozstrzygniete" && p.wynik ? (
            <Komunikat typ="info">
              Rozstrzygnięte: <b>{p.odpowiedzi[p.wynik - 1]}</b>. Gracze dawali na to <b>{procent(p.kursy ? p.kursy[p.wynik - 1] : null)}</b>.{" "}
              {linkRozstrzygniecia ? (
                <a href={linkRozstrzygniecia} target="_blank" rel="noopener noreferrer">
                  Źródło rozstrzygnięcia
                </a>
              ) : null}
            </Komunikat>
          ) : null}
          {p.status === "uniewaznione" ? <Komunikat typ="ostrz">Rynek unieważniony, wydane punkty wróciły do graczy.</Komunikat> : null}
          {p.status === "zamkniete" ? <Komunikat typ="info">Rynek zamknięty, czeka na rozstrzygnięcie.</Komunikat> : null}
        </div>

        <aside className="panel-kolumna" ref={refPanelu}>
          <Panel p={p} odp={odp} setOdp={wybierz} udzialyMoje={udzialyMoje ?? []} wydaneRazem={wydaneRazem} poZmianie={poZmianie} url={url} />
        </aside>

        <div className="rynek-reszta">
          <section className="zasady">
            <h2 className="sekcja-tytul">Zasady</h2>
            <dl>
              <dt>Kryterium rozstrzygnięcia</dt>
              <dd>{p.kryterium}</dd>
              {/* link tylko http(s); inny zapis źródła zostaje samym tekstem, a pustego nie pokazujemy */}
              {linkZrodla || p.link_zrodla?.trim() ? (
                <>
                  <dt>Źródło</dt>
                  <dd>
                    {linkZrodla ? (
                      <a href={linkZrodla} target="_blank" rel="noopener noreferrer">
                        <IkLink />
                        {linkZrodla}
                      </a>
                    ) : (
                      p.link_zrodla.trim()
                    )}
                  </dd>
                </>
              ) : null}
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
                      .filter((z) => z.udzialy >= 0.05 || z.wydane > 0)
                      .map((z) => {
                        const k = p.kursy ? p.kursy[z.odpowiedz - 1] : null;
                        // wartość = ile da sprzedaż teraz (sprzedaż obniża kurs), nie udziały × kurs
                        const wartosc =
                          p.status === "rozstrzygniete"
                            ? p.wynik === z.odpowiedz
                              ? z.udzialy
                              : 0
                            : k != null
                              ? podgladSprzedazy(k, z.udzialy).zwrot
                              : z.wydane;
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
                {podobne.map((q) => (
                  <KartaRynku key={q.id} p={q} />
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {rozstrzygniecie.pozycja ? (
        <EkranRozstrzygniecia moja={rozstrzygniecie.pozycja} pytanie={p} onClose={() => rozstrzygniecie.oznacz(rozstrzygniecie.pozycja!.pytanie)} />
      ) : null}
      {otwarte ? (
        <div className={`szybki-pasek ${panelWidoczny ? "schowany" : ""}`} aria-hidden={panelWidoczny}>
          {p.odpowiedzi.map((o, i) => (
            <button type="button" key={i} className={`kup kup-${klasaOdp(i)}`} tabIndex={panelWidoczny ? -1 : 0} onClick={() => wybierz(i + 1)}>
              <span className="nazwa">{o}</span>
              {(p.kursy ?? p.kursy_otwarcia) ? <span className="cyfry kurs">{procent((p.kursy ?? p.kursy_otwarcia)![i])}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </main>
  );
}
