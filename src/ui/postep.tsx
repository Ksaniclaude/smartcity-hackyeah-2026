import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode, type SVGProps } from "react";
import { pobierzMojeTransakcje } from "@/api/api";
import { useSesja } from "@/api/sesja";
import type { MojaPozycja, MojaTransakcja } from "@/api/types";
import { IkAktywnosc, IkBudzet, IkDymek, IkGwiazdka, IkLuz, IkPlomien, IkPtaszek, IkRanking, IkRynki, IkStrzalka, IkUdostepnij, IkZamiana } from "@/ui/ikony";
import { liczba, odmien } from "@/ui/tekst";
import { fala, lecPunkty, podbij, uniesTekst, wibruj, wystrzel } from "@/ui/zywe";

/* ---------- postęp gracza: doświadczenie, poziom, odznaki, seria dni ----------
 * Wszystko liczone z tego, co gracz już zrobił (własne transakcje i pozycje), bez zapisu w bazie i bez wartości
 * w punktach: doświadczenia nie da się postawić ani wymienić. Na urządzeniu pamiętamy tylko, co już świętowano.
 */

type Ikona = (p: SVGProps<SVGSVGElement>) => ReactElement;

export interface Odznaka {
  id: string;
  nazwa: string;
  opis: string;
  Ikona: Ikona;
  /** Ile już jest z tego, czego wymaga odznaka (obcięte do `cel`). */
  ile: number;
  cel: number;
  zdobyta: boolean;
}

export interface Postep {
  doswiadczenie: number;
  poziom: number;
  nazwa: string;
  /** Doświadczenie, od którego zaczyna się bieżący poziom, i to, od którego zaczyna się następny. */
  prog: number;
  nastepny: number;
  /** Jaka część drogi do następnego poziomu jest za graczem (0–1). */
  ulamek: number;
  odznaki: Odznaka[];
}

/** Nazwy poziomów: od sekundnika do zegara atomowego (wyżej zostaje ostatnia). */
const NAZWY_POZIOMOW = ["Sekundnik", "Stoper", "Budzik", "Zegarek", "Chronometr", "Zegar wieżowy", "Zegar atomowy"];

const DOSWIADCZENIE = { prognoza: 10, nowyRynek: 25, komentarz: 5, trafiony: 60 } as const;

/** Doświadczenie potrzebne, żeby wejść na poziom `l`: 0, 30, 90, 180, 300, 450… */
function progPoziomu(l: number): number {
  return 15 * (l - 1) * l;
}

export function policzPostep(transakcje: MojaTransakcja[], pozycje: MojaPozycja[], seria: number, udostepnienia = 0): Postep {
  const kupna = transakcje.filter((t) => t.udzialy > 0);
  const rynki = new Set(kupna.map((t) => t.pytanie)).size;
  // Bez nabijania kupnem i sprzedażą w kółko: prognoza liczy się raz na odpowiedź na rynku (zmiana zdania
  // daje najwyżej tyle, ile rynek ma odpowiedzi), komentarz raz na rynek.
  const prognozy = new Set(kupna.map((t) => `${t.pytanie}-${t.odpowiedz}`)).size;
  const zKomentarzem = new Set(kupna.filter((t) => (t.komentarz ?? "").trim().length > 0).map((t) => t.pytanie)).size;
  const sprzedaze = transakcje.filter((t) => t.udzialy < 0).length;
  const trafione = pozycje.filter((p) => p.status === "rozstrzygniete" && p.trafione === true).length;
  const doswiadczenie =
    prognozy * DOSWIADCZENIE.prognoza +
    rynki * DOSWIADCZENIE.nowyRynek +
    zKomentarzem * DOSWIADCZENIE.komentarz +
    trafione * DOSWIADCZENIE.trafiony;

  let poziom = 1;
  while (progPoziomu(poziom + 1) <= doswiadczenie) poziom++;
  const prog = progPoziomu(poziom);
  const nastepny = progPoziomu(poziom + 1);

  const odznaka = (id: string, nazwa: string, opis: string, Ikona: Ikona, ile: number, cel = 1): Odznaka => ({
    id,
    nazwa,
    opis,
    Ikona,
    ile: Math.min(ile, cel),
    cel,
    zdobyta: ile >= cel,
  });
  const odznaki = [
    odznaka("pierwsza", "Pierwsza prognoza", "Postaw pierwszą prognozę.", IkPtaszek, kupna.length),
    odznaka("trzy-rynki", "Trzy rynki", "Miej prognozy na trzech różnych rynkach.", IkRynki, rynki, 3),
    odznaka("dziesiec", "Dziesięć prognoz", "Postaw prognozy na dziesięć różnych odpowiedzi.", IkLuz, prognozy, 10),
    odznaka("pod-prad", "Pod prąd", "Postaw na odpowiedź, której tłum daje mniej niż 25%.", IkStrzalka, kupna.filter((t) => t.kurs_przed < 0.25).length),
    odznaka("gruba-stawka", "Gruba stawka", "Postaw co najmniej 100 punktów w jednej prognozie.", IkBudzet, kupna.filter((t) => t.stawka >= 100).length),
    odznaka("uzasadnienie", "Z uzasadnieniem", "Dodaj komentarz do prognozy.", IkDymek, zKomentarzem),
    odznaka("ruch-kursu", "Ruch kursu", "Przesuń kurs jedną prognozą o co najmniej 3 punkty procentowe.", IkAktywnosc, kupna.filter((t) => t.kurs_po - t.kurs_przed >= 0.03).length),
    odznaka("zmiana-zdania", "Zmiana zdania", "Sprzedaj udziały przed rozstrzygnięciem.", IkZamiana, sprzedaze),
    odznaka("trafione", "Trafione", "Traf wynik rozstrzygniętego rynku.", IkRanking, trafione),
    odznaka("trzy-trafione", "Trzy trafione", "Traf wynik trzech rozstrzygniętych rynków.", IkGwiazdka, trafione, 3),
    odznaka("seria", "Trzy dni z rzędu", "Zajrzyj trzy dni z rzędu.", IkPlomien, seria, 3),
    odznaka("dalej", "Podaj dalej", "Udostępnij prognozę, rynek albo profil.", IkUdostepnij, udostepnienia),
  ];

  return {
    doswiadczenie,
    poziom,
    nazwa: NAZWY_POZIOMOW[Math.min(poziom, NAZWY_POZIOMOW.length) - 1],
    prog,
    nastepny,
    ulamek: Math.max(0, Math.min(1, (doswiadczenie - prog) / (nastepny - prog))),
    odznaki,
  };
}

/* ---------- pamięć urządzenia: co już świętowano i seria dni ---------- */

interface Zapis {
  poziom: number;
  doswiadczenie: number;
  odznaki: string[];
  dzien: string;
  seria: number;
  /** Ile razy gracz podał coś dalej z tego urządzenia (odznaka „Podaj dalej”). */
  udostepnienia?: number;
}

const KLUCZ = "zdaza.postep";

function czytajZapisy(): Record<string, Zapis> {
  try {
    const s: unknown = JSON.parse(localStorage.getItem(KLUCZ) ?? "{}");
    return s && typeof s === "object" ? (s as Record<string, Zapis>) : {};
  } catch {
    return {};
  }
}

function zapiszZapis(nick: string, zapis: Zapis) {
  try {
    localStorage.setItem(KLUCZ, JSON.stringify({ ...czytajZapisy(), [nick]: zapis }));
  } catch {
    /* prywatne okno: postęp liczy się dalej, tylko świętowanie może się powtórzyć */
  }
}

/** Data lokalna „RRRR-MM-DD”, przesunięta o `dni`. */
function dzien(dni = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dni);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ---------- kontekst ---------- */

/** To, co ląduje na planszy nagrody u dołu ekranu: nowa odznaka, nowy poziom albo kolejny dzień serii. */
interface Nagroda {
  klucz: string;
  tytul: string;
  nazwa: string;
  opis: string;
  Ikona: Ikona;
}

interface Kontekst {
  postep: Postep | null;
  /** Dni z rzędu na tym urządzeniu (liczone przy wejściu gracza). */
  seria: number;
  /** Przelicza postęp od razu (panel woła to po przyjętej prognozie). */
  odswiez: () => Promise<void>;
  /** Gracz coś udostępnił (link, relacja, komunikator): liczy się do odznaki „Podaj dalej”. */
  zaliczUdostepnienie: () => void;
  nagroda: Nagroda | null;
}

const Ctx = createContext<Kontekst>({ postep: null, seria: 0, odswiez: async () => undefined, zaliczUdostepnienie: () => undefined, nagroda: null });

export function usePostep(): Kontekst {
  return useContext(Ctx);
}

const CZAS_NAGRODY = 3600;

export function PostepProvider({ children }: { children: ReactNode }) {
  const { gracz, pozycje } = useSesja();
  const nick = gracz?.nick ?? null;
  const [transakcje, setTransakcje] = useState<{ nick: string; lista: MojaTransakcja[] } | null>(null);
  const [seria, setSeria] = useState(0);
  const [udostepnienia, setUdostepnienia] = useState(0);
  const [kolejka, setKolejka] = useState<Nagroda[]>([]);

  const odswiez = useCallback(async () => {
    if (!nick) return;
    try {
      const lista = await pobierzMojeTransakcje(200);
      setTransakcje({ nick, lista });
    } catch {
      /* brak sieci: postęp zostaje z poprzedniego odczytu */
    }
  }, [nick]);

  useEffect(() => {
    if (!nick) {
      setTransakcje(null);
      return;
    }
    void odswiez();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void odswiez();
    }, 20000);
    return () => window.clearInterval(id);
  }, [nick, odswiez]);

  useEffect(() => {
    setUdostepnienia(nick ? (czytajZapisy()[nick]?.udostepnienia ?? 0) : 0);
  }, [nick]);
  const zaliczUdostepnienie = useCallback(() => {
    if (nick) setUdostepnienia((n) => n + 1);
  }, [nick]);

  // Seria dni: liczona raz przy wejściu gracza; dzień po dniu rośnie, po przerwie zaczyna się od nowa.
  useEffect(() => {
    if (!nick) {
      setSeria(0);
      return;
    }
    const zapis = czytajZapisy()[nick];
    const dzis = dzien();
    if (zapis?.dzien === dzis) {
      setSeria(zapis.seria);
      return;
    }
    const nowa = zapis?.dzien === dzien(-1) ? zapis.seria + 1 : 1;
    setSeria(nowa);
    if (zapis) zapiszZapis(nick, { ...zapis, dzien: dzis, seria: nowa });
    if (nowa >= 2) {
      setKolejka((k) => [
        ...k,
        { klucz: `seria-${dzis}`, tytul: "Seria", nazwa: `${nowa} dni z rzędu`, opis: "Jutro będzie o jeden więcej.", Ikona: IkPlomien },
      ]);
    }
  }, [nick]);

  const gotowe = nick != null && transakcje?.nick === nick && pozycje != null;
  const postep = useMemo(
    () => (gotowe ? policzPostep(transakcje!.lista, pozycje!, seria, udostepnienia) : null),
    [gotowe, transakcje, pozycje, seria, udostepnienia],
  );

  // Porównanie z tym, co urządzenie już widziało: przyrost doświadczenia leci gwiazdkami do pierścienia przy
  // awatarze, a nowy poziom i nowe odznaki trafiają do kolejki nagród. Pierwszy odczyt na urządzeniu jest cichy.
  useEffect(() => {
    if (!nick || !postep) return;
    const zdobyte = postep.odznaki.filter((o) => o.zdobyta).map((o) => o.id);
    const zapis = czytajZapisy()[nick];
    const nowyZapis: Zapis = { poziom: postep.poziom, doswiadczenie: postep.doswiadczenie, odznaki: zdobyte, dzien: zapis?.dzien ?? dzien(), seria: zapis?.seria ?? Math.max(1, seria), udostepnienia };
    if (!zapis) {
      zapiszZapis(nick, nowyZapis);
      return;
    }
    const przyrost = postep.doswiadczenie - zapis.doswiadczenie;
    const nowe: Nagroda[] = [];
    if (postep.poziom > zapis.poziom) {
      nowe.push({
        klucz: `poziom-${postep.poziom}`,
        tytul: `Poziom ${postep.poziom}`,
        nazwa: postep.nazwa,
        opis: `Do poziomu ${postep.poziom + 1} brakuje ${liczba(postep.nastepny - postep.doswiadczenie)} doświadczenia.`,
        Ikona: IkGwiazdka,
      });
    }
    for (const o of postep.odznaki) {
      if (o.zdobyta && !zapis.odznaki.includes(o.id)) nowe.push({ klucz: `odznaka-${o.id}`, tytul: "Nowa odznaka", nazwa: o.nazwa, opis: o.opis, Ikona: o.Ikona });
    }
    if (przyrost === 0 && nowe.length === 0 && postep.poziom === zapis.poziom) return;
    zapiszZapis(nick, nowyZapis);
    if (przyrost > 0) {
      const cel = document.querySelector(".portfel .pierscien") ?? document.querySelector(".portfel");
      const zrodlo = document.querySelector(".kupon") ?? { x: window.innerWidth / 2, y: window.innerHeight * 0.6 };
      if (cel) {
        void lecPunkty(zrodlo, cel, 7, "iskierka").then(() => {
          podbij(cel, 1.8);
          uniesTekst(cel, `+${liczba(przyrost)} doświadczenia`, "", true);
        });
      }
    }
    if (nowe.length > 0) setKolejka((k) => [...k, ...nowe.filter((n) => !k.some((x) => x.klucz === n.klucz))]);
  }, [nick, postep, seria, udostepnienia]);

  // Nagrody pokazują się po kolei, każda przez chwilę.
  const nagroda = kolejka[0] ?? null;
  const kluczNagrody = nagroda?.klucz;
  useEffect(() => {
    if (!kluczNagrody) return;
    const id = window.setTimeout(() => setKolejka((k) => k.slice(1)), CZAS_NAGRODY);
    return () => window.clearTimeout(id);
  }, [kluczNagrody]);

  const wartosc = useMemo(() => ({ postep, seria, odswiez, zaliczUdostepnienie, nagroda }), [postep, seria, odswiez, zaliczUdostepnienie, nagroda]);
  return <Ctx.Provider value={wartosc}>{children}</Ctx.Provider>;
}

/* ---------- elementy interfejsu ---------- */

/** Pierścień postępu do następnego poziomu wokół awatara, z numerem poziomu w rogu. Bez gracza pokazuje samo wnętrze. */
export function PierscienPoziomu({ children, duzy = false }: { children: ReactNode; duzy?: boolean }) {
  const { postep } = usePostep();
  if (!postep) return <>{children}</>;
  const r = 46;
  const obwod = 2 * Math.PI * r;
  return (
    <span
      className={`pierscien ${duzy ? "pierscien-duzy" : ""}`}
      title={`Poziom ${postep.poziom}: ${postep.nazwa}. ${liczba(postep.doswiadczenie)} z ${liczba(postep.nastepny)} doświadczenia do poziomu ${postep.poziom + 1}.`}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="pierscien-tor" cx="50" cy="50" r={r} />
        <circle className="pierscien-luk" cx="50" cy="50" r={r} strokeDasharray={`${(obwod * postep.ulamek).toFixed(1)} ${obwod.toFixed(1)}`} />
      </svg>
      {children}
      <b className="pierscien-poziom cyfry">{postep.poziom}</b>
    </span>
  );
}

/** Płomień z liczbą dni z rzędu; pokazuje się od drugiego dnia. */
export function Seria() {
  const { seria } = usePostep();
  if (seria < 2) return null;
  return (
    <span className="seria" title={`${odmien(seria, "dzień", "dni", "dni")} z rzędu na tym urządzeniu`}>
      <IkPlomien />
      <b className="cyfry">{seria}</b>
    </span>
  );
}

/** Pas z poziomem na profilu: nazwa, pasek do następnego poziomu, ile brakuje. */
export function PasPoziomu() {
  const { postep } = usePostep();
  if (!postep) return null;
  return (
    <section className="poziom-pas" aria-label="Poziom">
      <div className="poziom-opis">
        <span className="cyfry poziom-numer">Poziom {postep.poziom}</span>
        <b>{postep.nazwa}</b>
        <span className="poziom-ile">
          {liczba(postep.doswiadczenie)} z {liczba(postep.nastepny)} doświadczenia
        </span>
      </div>
      <div className="poziom-slupek">
        <i style={{ width: `${(postep.ulamek * 100).toFixed(1)}%` }} />
      </div>
      <p className="pomoc">
        Doświadczenie rośnie z prognozą na każdą nową odpowiedź (+{DOSWIADCZENIE.prognoza}), nowym rynkiem (+{DOSWIADCZENIE.nowyRynek}),
        komentarzem na nowym rynku (+{DOSWIADCZENIE.komentarz}) i trafionym wynikiem (+{DOSWIADCZENIE.trafiony}). Ponowne kupno tych samych
        udziałów nie dodaje doświadczenia. Nie da się go postawić ani wymienić.
      </p>
    </section>
  );
}

/** Plansza odznak: zdobyte w kolorze, pozostałe wygaszone z paskiem postępu. */
export function TablicaOdznak() {
  const { postep } = usePostep();
  if (!postep) return null;
  const zdobyte = postep.odznaki.filter((o) => o.zdobyta).length;
  return (
    <section>
      <p className="mala">
        Zdobyte: {zdobyte} z {postep.odznaki.length}.
      </p>
      <div className="odznaki">
        {postep.odznaki.map((o) => (
          <div key={o.id} className={`odznaka-kafel ${o.zdobyta ? "zdobyta" : ""}`}>
            <span className="odznaka-ikona">
              <o.Ikona />
            </span>
            <div>
              <b>{o.nazwa}</b>
              <span>{o.opis}</span>
            </div>
            {/* każdy kafel ma ten sam dół (pasek i stan), żeby siatka była równa */}
            <span className="odznaka-postep">
              <i style={{ "--ile": (o.ile / o.cel).toFixed(2) } as CSSProperties} />
              {o.zdobyta ? "zdobyta" : o.ile > 0 ? `${o.ile} z ${o.cel}` : "do zdobycia"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Plansza nagrody u dołu ekranu: nowa odznaka, poziom albo dzień serii, z falą i drobinami z ikony. */
export function Nagrody() {
  const { nagroda } = usePostep();
  const ref = useRef<HTMLDivElement>(null);
  const klucz = nagroda?.klucz;
  useEffect(() => {
    const ikona = ref.current?.querySelector(".nagroda-ikona");
    if (!klucz || !ikona) return;
    fala(ikona, "", 130);
    wystrzel(ikona, { ile: 28, moc: 1.15 });
    wibruj([16, 50, 24]);
  }, [klucz]);
  if (!nagroda) return null;
  return (
    <div className="nagroda" role="status" key={nagroda.klucz} ref={ref}>
      <span className="nagroda-ikona">
        <nagroda.Ikona />
      </span>
      <div>
        <small>{nagroda.tytul}</small>
        <b>{nagroda.nazwa}</b>
        <span>{nagroda.opis}</span>
      </div>
    </div>
  );
}
