import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  dodajKomentarz,
  pobierzAktywnosc,
  pobierzHistorie,
  pobierzKomentarze,
  pobierzMojePozycje,
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
  type MojaPozycja,
  type NajwiekszyGracz,
  type Powod,
  type PunktHistorii,
  type Pytanie as DanePytania,
  type WynikSprzedazy,
  type WynikZakladu,
} from "@/api/types";
import { useAkcja, usePolling } from "@/ui/hooks";
import { IkKalendarz, IkLink } from "@/ui/ikony";
import { Awatar, KafelekKategorii, Komunikat, Ladowanie, OdznakaStatusu, Wskaznik, formatujDate, formatujDateKrotko } from "@/ui/komponenty";
import { czasTemu, liczba, odmien, punkty } from "@/ui/tekst";
import { Wykres } from "@/ui/wykres";

const LIMIT_NA_PYTANIE = 200;
const SZYBKIE_STAWKI = [10, 25, 50, 100];
const KLUCZ_OBSERWOWANYCH = "zdaza.obserwowane";
const KOLORY = ["var(--tak)", "var(--nie)", "var(--trzeci)"];
const KLASY_KOLORU = ["tak", "nie", "trzeci"];
const KLASY_KUP = ["kup-tak", "kup-nie", "kup-trzeci"];
const KLASY_TYPU = ["typ-tak", "typ-nie", "typ-trzeci"];

type Zakladka = "komentarze" | "gracze" | "moje" | "aktywnosc";
type Okres = "1D" | "1T" | "1M" | "wszystko";
const OKRESY: { klucz: Okres; etykieta: string }[] = [
  { klucz: "1D", etykieta: "1D" },
  { klucz: "1T", etykieta: "1T" },
  { klucz: "1M", etykieta: "1M" },
  { klucz: "wszystko", etykieta: "Wszystko" },
];
const DOBA = 24 * 60 * 60 * 1000;
const DLUGOSC_OKRESU: Record<Exclude<Okres, "wszystko">, number> = { "1D": DOBA, "1T": 7 * DOBA, "1M": 30 * DOBA };

function kolorKlasa(indeks: number): string {
  return KLASY_KOLORU[indeks] ?? "trzeci";
}

/** „tak” → „Tak” (do przycisku „Postaw Tak”; CSS nie zmienia tekstu w DOM). */
function duzaLitera(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Tekst przycisku: „Postaw Tak” / „Postaw Nie”, dla dłuższych odpowiedzi „Postaw: wstrzymane lub anulowane”. */
function tekstPostaw(odpowiedz: string): string {
  return odpowiedz.includes(" ") ? `Postaw: ${odpowiedz}` : `Postaw ${duzaLitera(odpowiedz)}`;
}

function odczytajZakladke(s: string | null): Zakladka {
  return s === "gracze" || s === "moje" || s === "aktywnosc" ? s : "komentarze";
}

function wczytajObserwowane(): number[] {
  try {
    const surowe = localStorage.getItem(KLUCZ_OBSERWOWANYCH);
    const dane: unknown = surowe ? JSON.parse(surowe) : [];
    return Array.isArray(dane) ? dane.filter((x): x is number => typeof x === "number") : [];
  } catch {
    return [];
  }
}

function zapiszObserwowane(ids: number[]) {
  try {
    localStorage.setItem(KLUCZ_OBSERWOWANYCH, JSON.stringify(ids));
  } catch {
    /* prywatne okno albo pełna pamięć */
  }
}

/**
 * Historia w wybranym oknie czasu. Kurs zmienia się tylko w chwili zakładu, więc do okna
 * dokładamy ostatni punkt sprzed okna (na jego początku) i bieżący kurs na końcu.
 */
function historiaOkresu(historia: PunktHistorii[], okres: Okres, teraz: number): PunktHistorii[] {
  if (okres === "wszystko" || historia.length === 0) return historia;
  const od = teraz - DLUGOSC_OKRESU[okres];
  const wOknie = historia.filter((h) => new Date(h.czas).getTime() >= od);
  const przed = [...historia].reverse().find((h) => new Date(h.czas).getTime() < od);
  const wynik = przed ? [{ czas: new Date(od).toISOString(), kursy: przed.kursy }, ...wOknie] : wOknie;
  if (wynik.length === 0) return wynik;
  const ostatni = wynik[wynik.length - 1];
  if (teraz - new Date(ostatni.czas).getTime() > 60 * 1000) {
    return [...wynik, { czas: new Date(teraz).toISOString(), kursy: ostatni.kursy }];
  }
  return wynik;
}

function IkGwiazdka({ pelna }: { pelna: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={pelna ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3.5 2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.8l6.1-.7L12 3.5z" />
    </svg>
  );
}

/** Zwięzła karta rynku do sekcji „Podobne rynki” (bez przycisków). */
function KartaPodobna({ p }: { p: DanePytania }) {
  const kurs = p.kursy ? p.kursy[0] : null;
  const dwie = p.odpowiedzi.length === 2;
  return (
    <div className="rynek">
      <Link to={`/pytanie/${p.id}`} className={`rynek-gora ${dwie ? "" : "bez-wskaznika"}`}>
        <KafelekKategorii kategoria={p.kategoria} />
        <h3 className="rynek-tytul">{p.tresc}</h3>
        {dwie ? <Wskaznik kurs={kurs} /> : null}
      </Link>
      {!dwie ? (
        <ul className="wyniki">
          {p.odpowiedzi.map((o, i) => (
            <li className="wynik" key={i}>
              <span className="nazwa">{o}</span>
              <span className={`kurs ${p.kursy ? "" : "ukryty"}`}>{p.kursy ? procent(p.kursy[i]) : "–"}</span>
              <span />
            </li>
          ))}
        </ul>
      ) : null}
      <div className="rynek-dol">
        <span>{liczba(p.obrot)} pkt obrotu</span>
        <span>{odmien(p.liczba_prognoz, "prognoza", "prognozy", "prognoz")}</span>
        <span className="prawy">
          <IkKalendarz />
          do {formatujDateKrotko(p.termin)}
        </span>
      </div>
    </div>
  );
}

function WpisKomentarza({ k, kolorOdp }: { k: Komentarz; kolorOdp: (n: number) => string }) {
  return (
    <div className="wpis">
      <Awatar nick={k.nick} />
      <div>
        <div className="kto">
          <b>
            <Link to={`/u/${encodeURIComponent(k.nick)}`}>{k.nick}</Link>
          </b>
          {k.odpowiedz != null && k.odpowiedz_tekst ? (
            <>
              <span>·</span>
              <span className={kolorOdp(k.odpowiedz)}>{k.odpowiedz_tekst}</span>
              {k.stawka > 0 ? <span>{liczba(k.stawka)} pkt</span> : null}
            </>
          ) : null}
          <span>·</span>
          <span>{czasTemu(k.czas)}</span>
        </div>
        <div className="tresc">{k.komentarz}</div>
      </div>
    </div>
  );
}

function WpisAktywnosci({ a, kolorOdp }: { a: Aktywnosc; kolorOdp: (n: number) => string }) {
  const sprzedaz = a.udzialy < 0;
  return (
    <div className="wpis">
      <Awatar nick={a.nick} />
      <div>
        <div className="tresc" style={{ marginTop: 0 }}>
          <b>
            <Link to={`/u/${encodeURIComponent(a.nick)}`}>{a.nick}</Link>
          </b>{" "}
          {sprzedaz ? (
            <>
              sprzedał {Math.abs(a.udzialy).toFixed(1)} udz. na <span className={kolorOdp(a.odpowiedz)}>{a.odpowiedz_tekst}</span> za{" "}
              {liczba(a.stawka)} pkt
            </>
          ) : (
            <>
              postawił {liczba(a.stawka)} pkt na <span className={kolorOdp(a.odpowiedz)}>{a.odpowiedz_tekst}</span>
            </>
          )}
          {a.kurs_po != null ? <span className="mala"> · kurs {procent(a.kurs_po)}</span> : null}
        </div>
        <div className="kto">
          <span>{czasTemu(a.czas)}</span>
          {a.komentarz ? <span>„{a.komentarz}”</span> : null}
        </div>
      </div>
    </div>
  );
}

export default function Pytanie() {
  useUruchomSesje();
  const { id } = useParams();
  const pid = Number(id);
  const [params, setParams] = useSearchParams();
  const { gracz, stan, blad: bladSesji, odswiezGracza, uruchom, otworzModal } = useSesja();
  const zalogowany = stan === "gotowy";

  const pytanie = usePolling(() => pobierzPytanie(pid), 5000, pid);
  const historia = usePolling(() => pobierzHistorie(pid), 10000, pid);
  const komentarze = usePolling(() => pobierzKomentarze(pid), 10000, pid);
  const aktywnosc = usePolling(() => pobierzAktywnosc(pid, 30), 10000, pid);
  const najwieksi = usePolling(() => pobierzNajwiekszych(pid), 15000, pid);
  const moje = usePolling(
    () => (zalogowany ? pobierzMojePozycje() : Promise.resolve([] as MojaPozycja[])),
    5000,
    `${pid}-${zalogowany}`,
  );
  const wszystkie = usePolling(pobierzPytania, 30000, "podobne");

  const [odp, setOdp] = useState<number | null>(null);
  const [stawka, setStawka] = useState(10);
  const [powod, setPowod] = useState<Powod | null>(null);
  const [komentarz, setKomentarz] = useState("");
  const [wynik, setWynik] = useState<WynikZakladu | null>(null);
  const [tryb, setTryb] = useState<"kup" | "sprzedaj">("kup");
  const [okres, setOkres] = useState<Okres>("wszystko");
  const [skopiowano, setSkopiowano] = useState<string | null>(null);
  const [obserwowane, setObserwowane] = useState<number[]>(wczytajObserwowane);
  const [nowyKomentarz, setNowyKomentarz] = useState("");
  const [sprzedajOdp, setSprzedajOdp] = useState<number | null>(null);
  const [sprzedajUdz, setSprzedajUdz] = useState(0);
  const [wynikSprzedazy, setWynikSprzedazy] = useState<WynikSprzedazy | null>(null);
  const zaklad = useAkcja(postawPrognoze);
  const sprzedaz = useAkcja(sprzedajUdzialy);
  const komentowanie = useAkcja(dodajKomentarz);

  // Odpowiedź wybrana już na karcie rynku (?odp=N) i czysty stan po przejściu na inne pytanie.
  const odpParam = params.get("odp");
  useEffect(() => {
    const z = Number(odpParam);
    setOdp(z >= 1 && z <= 3 ? z : null);
    setWynik(null);
    setWynikSprzedazy(null);
    setTryb("kup");
    setPowod(null);
    setKomentarz("");
    setOkres("wszystko");
    setSprzedajOdp(null);
    setSprzedajUdz(0);
  }, [pid, odpParam]);

  useEffect(() => {
    if (!skopiowano) return;
    const t = window.setTimeout(() => setSkopiowano(null), 2000);
    return () => window.clearTimeout(t);
  }, [skopiowano]);

  const historiaWidoczna = useMemo(() => historiaOkresu(historia.dane ?? [], okres, Date.now()), [historia.dane, okres]);

  const kategoria = pytanie.dane?.kategoria;
  const podobne = useMemo(
    () => (wszystkie.dane ?? []).filter((x) => x.kategoria === kategoria && x.status === "otwarte" && x.id !== pid).slice(0, 3),
    [wszystkie.dane, kategoria, pid],
  );

  const moja = (moje.dane ?? []).find((m) => m.pytanie === pid) ?? null;
  const nick = gracz?.nick;
  /** Moje udziały na każdą odpowiedź: główny typ z v_moje_pozycje, reszta z listy największych graczy. */
  const mojeUdzialy = useMemo(() => {
    const mapa = new Map<number, number>();
    if (nick) {
      for (const g of najwieksi.dane ?? []) if (g.nick === nick && g.udzialy > 0) mapa.set(g.odpowiedz, g.udzialy);
    }
    if (moja && moja.udzialy_glowne > 0) mapa.set(moja.odpowiedz_glowna, moja.udzialy_glowne);
    return mapa;
  }, [najwieksi.dane, nick, moja]);

  const p = pytanie.dane && pytanie.dane.id === pid ? pytanie.dane : null;
  if (!p) {
    if (pytanie.laduje) {
      return (
        <main className="kontener">
          <Ladowanie />
        </main>
      );
    }
    return (
      <main className="kontener">
        <Komunikat typ="blad">{pytanie.blad ?? "Nie ma takiego pytania."}</Komunikat>
        <Link to="/">Wróć do rynków</Link>
      </main>
    );
  }

  const otwarte = p.status === "otwarte";
  const miasto = p.kategoria === "miasto";
  const kursy = p.kursy;
  const dwie = p.odpowiedzi.length === 2;
  const tabZUrl = odczytajZakladke(params.get("tab"));
  const tab: Zakladka = tabZUrl === "moje" && !gracz ? "komentarze" : tabZUrl;
  const obserwuje = obserwowane.includes(pid);
  const wydane = moja?.wydane ?? 0;
  const saldo = Math.floor(gracz?.saldo ?? 0);
  const maks = Math.max(0, Math.min(Math.floor(LIMIT_NA_PYTANIE - wydane), saldo));
  const stawkaOk = Math.max(1, Math.min(Math.round(stawka) || 1, Math.max(1, maks)));
  const kursWybranej = odp != null && kursy ? kursy[odp - 1] : null;
  const podglad = kursWybranej != null ? podgladZakladu(kursWybranej, stawkaOk) : null;
  const brakPowodu = miasto && !powod;
  const historiaDane = historia.dane ?? [];
  const zmiana = kursy && historiaDane.length > 0 ? Math.round(kursy[0] * 100) - Math.round(historiaDane[0].kursy[0] * 100) : null;
  const kolorOdp = (n: number) => KLASY_TYPU[n - 1] ?? "typ-trzeci";
  const listaKomentarzy = komentarze.dane ?? [];
  const listaAktywnosci = (aktywnosc.dane ?? []).filter((a) => a.pytanie === pid);

  // Sprzedaż: odpowiedź spośród tych, na które mam udziały; domyślnie wszystkie udziały.
  const odpowiedziZUdzialami = [...mojeUdzialy.keys()].sort((a, b) => a - b);
  const odpSprzedazy = sprzedajOdp != null && mojeUdzialy.has(sprzedajOdp) ? sprzedajOdp : (odpowiedziZUdzialami[0] ?? null);
  const posiadane = odpSprzedazy != null ? (mojeUdzialy.get(odpSprzedazy) ?? 0) : 0;
  const udzSprzedazy = sprzedajUdz > 0 ? Math.min(sprzedajUdz, posiadane) : posiadane;
  const kursSprzedawanej = odpSprzedazy != null && kursy ? kursy[odpSprzedazy - 1] : null;
  const podgladSprz = kursSprzedawanej != null && udzSprzedazy > 0 ? podgladSprzedazy(kursSprzedawanej, udzSprzedazy) : null;
  const moznaSprzedac = otwarte && zalogowany && odpowiedziZUdzialami.length > 0;

  const ustawZakladke = (z: Zakladka) => {
    const nowe = new URLSearchParams(params);
    if (z === "komentarze") nowe.delete("tab");
    else nowe.set("tab", z);
    setParams(nowe, { replace: true });
  };

  const wybierzOdpowiedz = (n: number) => {
    setOdp(n);
    setTryb("kup");
    setWynik(null);
    if (window.innerWidth < 1000) document.getElementById("panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const udostepnij = async () => {
    try {
      if (!navigator.clipboard) throw new Error("brak schowka");
      await navigator.clipboard.writeText(window.location.href);
      setSkopiowano("Skopiowano link");
    } catch {
      setSkopiowano("Nie udało się skopiować linku");
    }
  };

  const przelaczObserwowanie = () => {
    const nowe = obserwuje ? obserwowane.filter((x) => x !== pid) : [...obserwowane, pid];
    setObserwowane(nowe);
    zapiszObserwowane(nowe);
  };

  const odswiezPoTransakcji = () =>
    Promise.all([
      odswiezGracza(),
      pytanie.odswiez(),
      moje.odswiez(),
      historia.odswiez(),
      aktywnosc.odswiez(),
      komentarze.odswiez(),
      najwieksi.odswiez(),
    ]);

  const wyslijZaklad = async (e: FormEvent) => {
    e.preventDefault();
    if (odp == null || maks < 1 || brakPowodu) return;
    const w = await zaklad.wykonaj({
      pytanie: pid,
      odpowiedz: odp,
      stawka: stawkaOk,
      powod: miasto ? powod : null,
      komentarz: komentarz.trim(),
    });
    if (w) {
      setWynik(w);
      setKomentarz("");
      await odswiezPoTransakcji();
    }
  };

  const wyslijSprzedaz = async (e: FormEvent) => {
    e.preventDefault();
    if (odpSprzedazy == null || udzSprzedazy <= 0) return;
    const w = await sprzedaz.wykonaj({ pytanie: pid, odpowiedz: odpSprzedazy, udzialy: udzSprzedazy });
    if (w) {
      setWynikSprzedazy(w);
      setSprzedajUdz(0);
      await odswiezPoTransakcji();
      if (w.udzialy_pozostale <= 0) setTryb("kup");
    }
  };

  const wyslijKomentarz = async (e: FormEvent) => {
    e.preventDefault();
    const tresc = nowyKomentarz.trim();
    if (!tresc) return;
    const r = await komentowanie.wykonaj(pid, tresc);
    if (r !== undefined) {
      setNowyKomentarz("");
      await komentarze.odswiez();
    }
  };

  const komunikatStanu =
    p.status === "rozstrzygniete" && p.wynik ? (
      <Komunikat typ="info">
        Rozstrzygnięte: <b>{p.odpowiedzi[p.wynik - 1]}</b>. Mieszkańcy dawali na to <b>{procent(kursy ? kursy[p.wynik - 1] : null)}</b>.
        {p.link_rozstrzygniecia ? (
          <>
            {" "}
            <a href={p.link_rozstrzygniecia} target="_blank" rel="noreferrer">
              Źródło rozstrzygnięcia
            </a>
          </>
        ) : null}
      </Komunikat>
    ) : p.status === "zamkniete" ? (
      <Komunikat typ="info">Pytanie zamknięte, czeka na rozstrzygnięcie.</Komunikat>
    ) : p.status === "uniewaznione" ? (
      <Komunikat typ="ostrz">
        Pytanie unieważnione, wydane punkty wróciły do graczy.{p.komentarz_urzedu ? ` ${p.komentarz_urzedu}` : ""}
      </Komunikat>
    ) : null;

  const graczePoOdpowiedzi = p.odpowiedzi.map((_, i) => (najwieksi.dane ?? []).filter((g) => g.odpowiedz === i + 1).slice(0, 5));

  return (
    <main className="kontener">
      <div className="rynek-strona">
        <div>
          <nav className="okruszki" aria-label="Okruszki">
            <Link to="/">Rynki</Link>
            <span>›</span>
            <Link to={`/?f=${p.kategoria}`}>{miasto ? "Miasto" : "Na luzie"}</Link>
          </nav>

          <div className="naglowek-rynku">
            <KafelekKategorii kategoria={p.kategoria} duzy />
            <div>
              <h1>{p.tresc}</h1>
              <div className="meta">
                <span>{liczba(p.obrot)} pkt obrotu</span>
                <span>
                  <IkKalendarz />
                  Koniec {formatujDate(p.termin)}
                </span>
                {p.liczba_zmian_terminu > 0 ? <span>termin zmieniany {odmien(p.liczba_zmian_terminu, "raz", "razy", "razy")}</span> : null}
                <OdznakaStatusu status={p.status} />
                <span className="akcje" style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {skopiowano ? <span role="status">{skopiowano}</span> : null}
                  <button type="button" className="przycisk-ikona" onClick={() => void udostepnij()} aria-label="Kopiuj link" title="Kopiuj link">
                    <IkLink />
                  </button>
                  <button
                    type="button"
                    className="przycisk-ikona"
                    onClick={przelaczObserwowanie}
                    aria-pressed={obserwuje}
                    aria-label={obserwuje ? "Przestań obserwować" : "Obserwuj"}
                    title={obserwuje ? "Przestań obserwować" : "Obserwuj"}
                  >
                    <IkGwiazdka pelna={obserwuje} />
                  </button>
                </span>
              </div>
            </div>
          </div>

          <div className="kurs-naglowek">
            {kursy ? (
              <>
                <b>{procent(kursy[0])}</b>
                <span className="co">{dwie ? <>szans na „{p.odpowiedzi[0]}”</> : <>szans, że {p.odpowiedzi[0]}</>}</span>
                {zmiana != null ? (
                  <span className={`zmiana ${zmiana > 0 ? "gora" : zmiana < 0 ? "dol" : "zero"}`}>
                    {zmiana > 0 ? `▲ ${zmiana} pkt proc. od otwarcia` : zmiana < 0 ? `▼ ${-zmiana} pkt proc. od otwarcia` : "bez zmian od otwarcia"}
                  </span>
                ) : null}
              </>
            ) : (
              <>
                <b className="ukryty">–</b>
                <span className="co">
                  kurs ukryty do {p.prog_widocznosci} prognoz ({p.liczba_prognoz}/{p.prog_widocznosci})
                </span>
              </>
            )}
          </div>

          <div className="wykres-karta">
            <div className="wykres-naglowek">
              <div className="legenda-wykresu">
                {dwie ? (
                  <span>{odmien(p.liczba_prognoz, "prognoza", "prognozy", "prognoz")}</span>
                ) : (
                  p.odpowiedzi.map((o, i) => (
                    <span key={i}>
                      <i style={{ background: KOLORY[i] }} />
                      {o}
                    </span>
                  ))
                )}
              </div>
              <div className="okresy" role="group" aria-label="Okres wykresu">
                {OKRESY.map((o) => (
                  <button type="button" key={o.klucz} className={okres === o.klucz ? "aktywny" : ""} onClick={() => setOkres(o.klucz)}>
                    {o.etykieta}
                  </button>
                ))}
              </div>
            </div>
            {kursy && historiaWidoczna.length === 0 ? (
              <div className="wykres-pusty">Historia kursu pojawi się po pierwszych prognozach.</div>
            ) : (
              <Wykres historia={historiaWidoczna} odpowiedzi={p.odpowiedzi} />
            )}
          </div>

          <div className="wyniki-tabela">
            <div className="naglowek-tab">
              <span>Odpowiedź</span>
              <span style={{ textAlign: "right" }}>Kurs</span>
              <span />
            </div>
            {p.odpowiedzi.map((o, i) => {
              const n = i + 1;
              const udz = mojeUdzialy.get(n) ?? 0;
              return (
                <div key={i} className={`wynik-wiersz ${odp === n && otwarte ? "wybrany" : ""} ${p.wynik === n ? "trafiony" : ""}`}>
                  <div className="nazwa">
                    {o}
                    {udz > 0 ? <small>{udz.toFixed(1)} udz. · Twój typ</small> : null}
                  </div>
                  {kursy ? (
                    <div className="kurs">{procent(kursy[i])}</div>
                  ) : p.kursy_otwarcia ? (
                    <div className="kurs ukryty" title="kurs otwarcia">
                      {procent(p.kursy_otwarcia[i])}
                    </div>
                  ) : (
                    <div className="kurs ukryty">–</div>
                  )}
                  <div>
                    {otwarte ? (
                      <button type="button" className={`kup ${KLASY_KUP[i] ?? "kup-trzeci"}`} onClick={() => wybierzOdpowiedz(n)}>
                        Tak
                      </button>
                    ) : p.wynik === n ? (
                      <span className="mala">wynik</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="karta zasady">
            <h3>Zasady</h3>
            <div className="etykieta">Kryterium rozstrzygnięcia</div>
            <p>{p.kryterium}</p>
            <div className="etykieta">Źródło</div>
            <p>
              <a href={p.link_zrodla} target="_blank" rel="noreferrer">
                <IkLink width={14} height={14} style={{ verticalAlign: -2, marginRight: 4 }} />
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
            <p className="mala">Rozstrzyga zespół Zdążą? według publicznego źródła. Unieważnione pytanie zwraca punkty.</p>
            {komunikatStanu}
          </div>

          <div className="zakladki" role="tablist">
            <button type="button" role="tab" className={tab === "komentarze" ? "aktywna" : ""} onClick={() => ustawZakladke("komentarze")}>
              Komentarze
              <span className="licznik">{listaKomentarzy.length}</span>
            </button>
            <button type="button" role="tab" className={tab === "gracze" ? "aktywna" : ""} onClick={() => ustawZakladke("gracze")}>
              Najwięksi gracze
            </button>
            {gracz ? (
              <button type="button" role="tab" className={tab === "moje" ? "aktywna" : ""} onClick={() => ustawZakladke("moje")}>
                Moje pozycje
              </button>
            ) : null}
            <button type="button" role="tab" className={tab === "aktywnosc" ? "aktywna" : ""} onClick={() => ustawZakladke("aktywnosc")}>
              Aktywność
            </button>
          </div>

          {tab === "komentarze" ? (
            <div>
              {zalogowany ? (
                <form onSubmit={wyslijKomentarz}>
                  <label className="pole">
                    <span className="etykieta">Twój komentarz</span>
                    <textarea
                      value={nowyKomentarz}
                      onChange={(e) => setNowyKomentarz(e.target.value)}
                      maxLength={500}
                      rows={3}
                      placeholder="Co wiesz o tej sprawie? (do 500 znaków)"
                    />
                  </label>
                  {komentowanie.blad ? <Komunikat typ="blad">{komentowanie.blad}</Komunikat> : null}
                  <button type="submit" className="przycisk przycisk-maly" disabled={komentowanie.trwa || nowyKomentarz.trim().length === 0}>
                    {komentowanie.trwa ? "Chwila…" : "Dodaj komentarz"}
                  </button>
                </form>
              ) : stan === "blad" ? null : (
                <div className="panel-info" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span>Zaloguj się, żeby komentować</span>
                  <button type="button" className="przycisk przycisk-maly przycisk-drugi" onClick={() => otworzModal("konto", "rejestracja")}>
                    Zaloguj się
                  </button>
                </div>
              )}
              {komentarze.laduje && listaKomentarzy.length === 0 ? (
                <Ladowanie />
              ) : listaKomentarzy.length === 0 ? (
                <div className="pusto">Jeszcze nikt nie skomentował. Napisz pierwszy.</div>
              ) : (
                listaKomentarzy.map((k) => <WpisKomentarza key={k.id} k={k} kolorOdp={kolorOdp} />)
              )}
            </div>
          ) : null}

          {tab === "gracze" ? (
            najwieksi.laduje && !najwieksi.dane ? (
              <Ladowanie />
            ) : (
              <div className="najwieksi">
                {p.odpowiedzi.map((o, i) => (
                  <div key={i}>
                    <h4>{o}</h4>
                    {graczePoOdpowiedzi[i].length === 0 ? (
                      <div className="mala">Nikt jeszcze nie ma udziałów</div>
                    ) : (
                      <ol>
                        {graczePoOdpowiedzi[i].map((g: NajwiekszyGracz) => (
                          <li key={g.nick}>
                            <Link to={`/u/${encodeURIComponent(g.nick)}`} className="gracz-kom" style={{ color: "inherit", textDecoration: "none" }}>
                              <Awatar nick={g.nick} />
                              <span>{g.nick}</span>
                            </Link>
                            <b>{g.udzialy.toFixed(1)} udz.</b>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : null}

          {tab === "moje" && gracz ? (
            moje.laduje && !moje.dane ? (
              <Ladowanie />
            ) : !moja ? (
              <div className="pusto">Nie masz jeszcze udziałów na tym rynku.</div>
            ) : (
              <>
                <div className="staty">
                  <div className="stat">
                    <div className="etykieta">Twój typ</div>
                    <div className={`wartosc ${kolorOdp(moja.odpowiedz_glowna)}`}>{p.odpowiedzi[moja.odpowiedz_glowna - 1]}</div>
                    {moja.trafione != null ? (
                      <div className={`pod ${moja.trafione ? "trafione" : "chybione"}`}>{moja.trafione ? "trafiony" : "chybiony"}</div>
                    ) : null}
                  </div>
                  <div className="stat">
                    <div className="etykieta">Udziały</div>
                    <div className="wartosc">{moja.udzialy_glowne.toFixed(1)}</div>
                    {odpowiedziZUdzialami
                      .filter((n) => n !== moja.odpowiedz_glowna)
                      .map((n) => (
                        <div className="pod" key={n}>
                          + {(mojeUdzialy.get(n) ?? 0).toFixed(1)} na „{p.odpowiedzi[n - 1]}”
                        </div>
                      ))}
                  </div>
                  <div className="stat">
                    <div className="etykieta">Wydane</div>
                    <div className="wartosc">{liczba(moja.wydane)} pkt</div>
                  </div>
                  <div className="stat">
                    <div className="etykieta">{p.status === "rozstrzygniete" ? "Wypłata" : "Wartość"}</div>
                    <div className="wartosc">{liczba(p.status === "rozstrzygniete" ? moja.wyplata : moja.wartosc, 1)} pkt</div>
                    {!kursy && otwarte ? <div className="pod">po koszcie, kurs ukryty</div> : null}
                  </div>
                </div>
                <p className="mala">
                  Udział trafionej odpowiedzi wypłaca 1 punkt. <Link to="/profil">Wszystkie pozycje w profilu.</Link>
                </p>
              </>
            )
          ) : null}

          {tab === "aktywnosc" ? (
            aktywnosc.laduje && !aktywnosc.dane ? (
              <Ladowanie />
            ) : listaAktywnosci.length === 0 ? (
              <div className="pusto">Jeszcze nikt nie postawił na tym rynku.</div>
            ) : (
              listaAktywnosci.map((a) => <WpisAktywnosci key={a.id} a={a} kolorOdp={kolorOdp} />)
            )
          ) : null}

          {podobne.length > 0 ? (
            <>
              <h2 className="sekcja-tytul">Podobne rynki</h2>
              <div className="siatka" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
                {podobne.map((x) => (
                  <KartaPodobna key={x.id} p={x} />
                ))}
              </div>
            </>
          ) : null}
        </div>

        <aside className="panel-kolumna" id="panel">
          <div className="panel">
            <div className="panel-naglowek">
              Prognoza
              {moja && moja.udzialy_glowne > 0 ? (
                <span>
                  Masz {moja.udzialy_glowne.toFixed(1)} udz. na {p.odpowiedzi[moja.odpowiedz_glowna - 1]}
                </span>
              ) : null}
            </div>

            {!otwarte ? (
              <div className="panel-info">
                {p.status === "rozstrzygniete" && p.wynik
                  ? `Rynek rozstrzygnięty: ${p.odpowiedzi[p.wynik - 1]}. Każdy udział tej odpowiedzi wypłacił 1 punkt.`
                  : p.status === "zamkniete"
                    ? "Rynek zamknięty. Czeka na rozstrzygnięcie według publicznego źródła, nowych prognoz nie przyjmujemy."
                    : p.status === "uniewaznione"
                      ? "Rynek unieważniony. Wydane punkty wróciły do graczy."
                      : "Ten rynek nie jest jeszcze otwarty."}
              </div>
            ) : (
              <>
                {moznaSprzedac ? (
                  <div className="modal-zakladki" role="tablist">
                    <button type="button" role="tab" className={tryb === "kup" ? "aktywna" : ""} onClick={() => setTryb("kup")}>
                      Kup
                    </button>
                    <button type="button" role="tab" className={tryb === "sprzedaj" ? "aktywna" : ""} onClick={() => setTryb("sprzedaj")}>
                      Sprzedaj
                    </button>
                  </div>
                ) : null}

                {wynikSprzedazy ? (
                  <div className="panel-sukces">
                    <b>
                      Sprzedano {wynikSprzedazy.udzialy.toFixed(1)} udz. za {liczba(wynikSprzedazy.zwrot, 1)} pkt
                    </b>
                    Kurs „{p.odpowiedzi[wynikSprzedazy.odpowiedz - 1]}” z {procent(wynikSprzedazy.kurs_przed)} na {procent(wynikSprzedazy.kurs_po)}. Saldo:{" "}
                    {punkty(wynikSprzedazy.saldo)}.
                  </div>
                ) : null}

                {tryb === "sprzedaj" && moznaSprzedac ? (
                  <form onSubmit={wyslijSprzedaz}>
                    <div className={`wybor-odp ${odpowiedziZUdzialami.length === 2 ? "o2" : ""}`}>
                      {odpowiedziZUdzialami.map((n) => (
                        <button
                          type="button"
                          key={n}
                          className={`odp-przycisk ${odpSprzedazy === n ? `wybrana ${kolorKlasa(n - 1)}` : ""}`}
                          onClick={() => {
                            setSprzedajOdp(n);
                            setSprzedajUdz(0);
                            setWynikSprzedazy(null);
                          }}
                        >
                          {p.odpowiedzi[n - 1]}
                          <small>{(mojeUdzialy.get(n) ?? 0).toFixed(1)} udz.</small>
                        </button>
                      ))}
                    </div>
                    <div className="stawka-pole">
                      <div className="etykieta">
                        <span>Udziały do sprzedaży</span>
                        <span>masz {posiadane.toFixed(1)} udz.</span>
                      </div>
                      <div className="stawka-wejscie">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0.1}
                          max={posiadane}
                          step={0.1}
                          value={Number(udzSprzedazy.toFixed(1))}
                          onChange={(e) => setSprzedajUdz(Math.max(0.1, Number(e.target.value) || 0.1))}
                          aria-label="Udziały do sprzedaży"
                        />
                        <span>udz.</span>
                      </div>
                      <div className="stawka-chipy">
                        {[0.25, 0.5, 0.75, 1].map((u) => {
                          const cel = u === 1 ? posiadane : Math.max(0.1, Math.round(posiadane * u * 10) / 10);
                          return (
                            <button type="button" key={u} className={Math.abs(udzSprzedazy - cel) < 0.05 ? "wybrany" : ""} onClick={() => setSprzedajUdz(cel)}>
                              {u === 1 ? "Wszystko" : `${Math.round(u * 100)}%`}
                            </button>
                          );
                        })}
                      </div>
                      <input
                        type="range"
                        min={0.1}
                        max={Math.max(0.1, posiadane)}
                        step={0.1}
                        value={udzSprzedazy}
                        onChange={(e) => setSprzedajUdz(Number(e.target.value))}
                        aria-label="Udziały do sprzedaży (suwak)"
                      />
                    </div>
                    <div className="podsumowanie">
                      {podgladSprz ? (
                        <>
                          <div className="wiersz-pod wygrana">
                            <span>Zwrot</span>
                            <b>≈ {liczba(podgladSprz.zwrot, 1)} pkt</b>
                          </div>
                          <div className="wiersz-pod">
                            <span>Kurs po sprzedaży</span>
                            <b>{procent(podgladSprz.kursPo)}</b>
                          </div>
                        </>
                      ) : (
                        <div className="wiersz-pod">
                          <span>Zwrot</span>
                          <b>poznasz po sprzedaży (kurs ukryty)</b>
                        </div>
                      )}
                    </div>
                    {sprzedaz.blad ? <Komunikat typ="blad">{sprzedaz.blad}</Komunikat> : null}
                    <button
                      type="submit"
                      className={`przycisk-postaw ${odpSprzedazy != null ? kolorKlasa(odpSprzedazy - 1) : ""}`}
                      disabled={sprzedaz.trwa || odpSprzedazy == null || udzSprzedazy <= 0}
                    >
                      {sprzedaz.trwa ? "Sprzedaję…" : `Sprzedaj ${udzSprzedazy.toFixed(1)} udz.`}
                    </button>
                    <p className="zastrzezenie">Zwrot liczy rynek (LMSR). Punktów nie da się kupić ani wymienić.</p>
                  </form>
                ) : (
                  <form onSubmit={wyslijZaklad}>
                    {wynik ? (
                      <div className="panel-sukces">
                        <b>
                          Twoja prognoza przesunęła kurs z {procent(wynik.kurs_przed)} na {procent(wynik.kurs_po)}
                        </b>
                        Masz {wynik.udzialy.toFixed(1)} udziałów na „{p.odpowiedzi[wynik.odpowiedz - 1]}”. Saldo: {punkty(wynik.saldo)}.
                      </div>
                    ) : null}

                    <div className={`wybor-odp ${dwie ? "o2" : ""}`}>
                      {p.odpowiedzi.map((o, i) => (
                        <button
                          type="button"
                          key={i}
                          className={`odp-przycisk ${odp === i + 1 ? `wybrana ${kolorKlasa(i)}` : ""}`}
                          aria-pressed={odp === i + 1}
                          onClick={() => {
                            setOdp(i + 1);
                            setWynik(null);
                          }}
                        >
                          {o}
                          <small>{kursy ? procent(kursy[i]) : "–"}</small>
                        </button>
                      ))}
                    </div>

                    {stan === "nowa" || stan === "laduje" ? (
                      <button type="button" className="przycisk-postaw" disabled>
                        Łączę z miastem…
                      </button>
                    ) : stan === "brak_nicku" ? (
                      <button type="button" className="przycisk-postaw" onClick={() => otworzModal("konto", "rejestracja")}>
                        Zaloguj się, żeby postawić
                      </button>
                    ) : stan === "blad" ? (
                      <Komunikat typ="blad">
                        {bladSesji ?? "Brak połączenia z sesją gracza."}{" "}
                        <button type="button" className="przycisk przycisk-maly przycisk-drugi" onClick={uruchom}>
                          Spróbuj ponownie
                        </button>
                      </Komunikat>
                    ) : (
                      <>
                        {maks < 1 ? (
                          <Komunikat typ="ostrz">
                            {saldo < 1
                              ? "Nie masz już punktów. Poczekaj na rozstrzygnięcia albo sprzedaj udziały."
                              : `Na jedno pytanie można wydać najwyżej ${LIMIT_NA_PYTANIE} punktów, a Ty masz już ${liczba(wydane)}.`}
                          </Komunikat>
                        ) : (
                          <div className="stawka-pole">
                            <div className="etykieta">
                              <span>Stawka</span>
                              <span>masz {liczba(saldo)} pkt</span>
                            </div>
                            <div className="stawka-wejscie">
                              <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={maks}
                                step={1}
                                value={stawkaOk}
                                onChange={(e) => setStawka(Number(e.target.value))}
                                aria-label="Stawka w punktach"
                              />
                              <span>pkt</span>
                            </div>
                            <div className="stawka-chipy">
                              {SZYBKIE_STAWKI.map((s) => (
                                <button
                                  type="button"
                                  key={s}
                                  className={stawkaOk === s ? "wybrany" : ""}
                                  disabled={stawkaOk >= maks}
                                  onClick={() => setStawka(Math.min(maks, stawkaOk + s))}
                                >
                                  +{s}
                                </button>
                              ))}
                              <button type="button" className={stawkaOk === maks ? "wybrany" : ""} onClick={() => setStawka(maks)}>
                                Maks
                              </button>
                            </div>
                            <input
                              type="range"
                              min={1}
                              max={maks}
                              step={1}
                              value={stawkaOk}
                              onChange={(e) => setStawka(Number(e.target.value))}
                              aria-label="Stawka (suwak)"
                            />
                          </div>
                        )}

                        {miasto ? (
                          <div className="pole">
                            <span className="etykieta">Dlaczego tak myślisz?</span>
                            <div className="powody">
                              {POWODY.map((r) => (
                                <button
                                  type="button"
                                  key={r.wartosc}
                                  className={powod === r.wartosc ? "wybrany" : ""}
                                  aria-pressed={powod === r.wartosc}
                                  onClick={() => setPowod(r.wartosc)}
                                >
                                  {r.etykieta}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <label className="pole">
                          <span className="etykieta">Komentarz</span>
                          <input
                            type="text"
                            maxLength={200}
                            value={komentarz}
                            onChange={(e) => setKomentarz(e.target.value)}
                            placeholder="Jedno zdanie komentarza (opcjonalnie)"
                          />
                        </label>

                        <div className="podsumowanie">
                          {odp == null ? (
                            <div className="wiersz-pod">
                              <span>Wybierz odpowiedź, żeby zobaczyć udziały</span>
                            </div>
                          ) : podglad ? (
                            <>
                              <div className="wiersz-pod">
                                <span>Udziały</span>
                                <b>≈ {podglad.udzialy.toFixed(1)}</b>
                              </div>
                              <div className="wiersz-pod wygrana">
                                <span>Wygrasz, jeśli trafisz</span>
                                <b>≈ {podglad.udzialy.toFixed(1)} pkt</b>
                              </div>
                              <div className="wiersz-pod">
                                <span>Kurs po Twojej prognozie</span>
                                <b>{procent(podglad.kursPo)}</b>
                              </div>
                            </>
                          ) : (
                            <div className="wiersz-pod">
                              <span>Udziały poznasz po prognozie</span>
                              <b>kurs ukryty</b>
                            </div>
                          )}
                        </div>

                        {zaklad.blad ? <Komunikat typ="blad">{zaklad.blad}</Komunikat> : null}
                        <button
                          type="submit"
                          className={`przycisk-postaw ${odp != null ? kolorKlasa(odp - 1) : ""}`}
                          disabled={zaklad.trwa || odp == null || brakPowodu || maks < 1}
                        >
                          {zaklad.trwa
                            ? "Zapisuję…"
                            : odp == null
                              ? "Wybierz odpowiedź"
                              : brakPowodu
                                ? "Wybierz powód"
                                : tekstPostaw(p.odpowiedzi[odp - 1])}
                        </button>
                      </>
                    )}
                    <p className="zastrzezenie">Gra o punkty. Punktów nie da się kupić ani wymienić.</p>
                  </form>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
