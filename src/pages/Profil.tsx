import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { pobierzMojeTransakcje } from "@/api/api";
import { procent } from "@/api/lmsr";
import { useSesja } from "@/api/sesja";
import type { MojaPozycja, MojaTransakcja } from "@/api/types";
import { useAkcja, useMiejsca, usePolling } from "@/ui/hooks";
import { IkKsiezyc, IkSlonce } from "@/ui/ikony";
import { Awatar, Komunikat, Ladowanie, Odznaka, OdznakaMiejsca, OdznakaStatusu, ZyskStrata, formatujDateKrotko, useMotyw } from "@/ui/komponenty";
import { EkranRozstrzygniecia, useRozstrzygniecieDoPokazania } from "@/ui/rozstrzygniecie";
import { czasTemu, liczba, pkt } from "@/ui/tekst";
import { klasaTypu } from "@/pages/Aktywnosc";

type Tab = "pozycje" | "historia" | "ustawienia";
const ZAKLADKI: { klucz: Tab; etykieta: string }[] = [
  { klucz: "pozycje", etykieta: "Pozycje" },
  { klucz: "historia", etykieta: "Historia" },
  { klucz: "ustawienia", etykieta: "Ustawienia" },
];

/** Kolumna „Wynik”: po rozstrzygnięciu trafione/chybione, wcześniej termin. */
function Wynik({ p }: { p: MojaPozycja }) {
  if (p.status === "rozstrzygniete" && p.wynik) {
    if (p.trafione) return <span className="trafione">trafione, +{liczba(p.wyplata, 1)} pkt</span>;
    return (
      <span className="chybione">
        chybione (było: {p.odpowiedzi[p.wynik - 1]}){p.wyplata > 0 ? `, wypłata +${liczba(p.wyplata, 1)} pkt` : ""}
      </span>
    );
  }
  if (p.status === "uniewaznione") return <span className="mala">zwrot</span>;
  if (p.status === "zamkniete") return <span className="mala">zamknięte, czeka na wynik</span>;
  return <span className="mala">do {formatujDateKrotko(p.termin)}</span>;
}

/** Własna transakcja: zakład albo sprzedaż udziałów. */
function WpisTransakcji({ t, nick }: { t: MojaTransakcja; nick: string }) {
  const sprzedaz = t.udzialy < 0;
  const odpowiedz = t.pytania?.odpowiedzi[t.odpowiedz - 1] ?? `odpowiedź ${t.odpowiedz}`;
  const typ = <span className={klasaTypu(t.odpowiedz - 1)}>{odpowiedz}</span>;
  return (
    <div className="wpis">
      <Awatar nick={nick} />
      <div>
        <div className="kto">
          {sprzedaz ? (
            <span>
              sprzedałeś <b>{liczba(-t.udzialy, 1)} udz.</b> na {typ} za <b>{liczba(t.stawka)} pkt</b>
            </span>
          ) : (
            <span>
              postawiłeś <b>{liczba(t.stawka)} pkt</b> na {typ}
            </span>
          )}
          <span>
            · kurs {procent(t.kurs_przed)} → {procent(t.kurs_po)}
          </span>
          <span className="prawy">{czasTemu(t.czas)}</span>
        </div>
        <div className="tresc">
          <Link to={`/pytanie/${t.pytanie}`}>{t.pytania?.tresc ?? `Rynek nr ${t.pytanie}`}</Link>
        </div>
        {t.komentarz ? <div className="mala">„{t.komentarz}”</div> : null}
      </div>
    </div>
  );
}

function Historia({ nick }: { nick: string }) {
  const { dane, blad, laduje } = usePolling(() => pobierzMojeTransakcje(100), 10000);
  const wpisy = dane ?? [];
  return (
    <div className="waska" style={{ maxWidth: 820 }}>
      {blad ? <Komunikat typ="blad">{blad}</Komunikat> : null}
      {laduje && !dane ? <Ladowanie /> : null}
      {dane && wpisy.length === 0 ? (
        <p className="pusto">
          Jeszcze nie masz żadnej transakcji. <Link to="/">Wybierz rynek</Link>.
        </p>
      ) : null}
      {wpisy.map((t) => (
        <WpisTransakcji key={t.id} t={t} nick={nick} />
      ))}
    </div>
  );
}

function Ustawienia() {
  const { gracz, konto, ustawNick, wyloguj } = useSesja();
  const navigate = useNavigate();
  const [motyw, przelaczMotyw] = useMotyw();
  const [nick, setNick] = useState(gracz?.nick ?? "");
  const [zapisano, setZapisano] = useState(false);
  const zapis = useAkcja(async (nowy: string) => {
    await ustawNick(nowy);
    setZapisano(true);
  });
  const wylogowanie = useAkcja(async () => {
    await wyloguj();
    navigate("/");
  });
  const czysty = nick.trim();
  const bezZmian = czysty === (gracz?.nick ?? "");

  return (
    <div className="waska" style={{ maxWidth: 560 }}>
      <div className="karta">
        <h3>Nick</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (czysty.length < 2 || bezZmian) return;
            void zapis.wykonaj(czysty);
          }}
        >
          <label className="pole">
            <span className="etykieta">Nick (widzą go inni gracze przy prognozach i w rankingu)</span>
            <input
              type="text"
              value={nick}
              onChange={(e) => {
                setNick(e.target.value);
                setZapisano(false);
              }}
              minLength={2}
              maxLength={24}
              autoComplete="nickname"
              required
            />
            <div className="pomoc">2–24 znaki: litery, cyfry, _ . -</div>
          </label>
          {zapis.blad ? <Komunikat typ="blad">{zapis.blad}</Komunikat> : null}
          {zapisano && bezZmian ? <Komunikat typ="ok">Nick zapisany.</Komunikat> : null}
          <button className="przycisk przycisk-glowny" type="submit" disabled={zapis.trwa || czysty.length < 2 || bezZmian}>
            {zapis.trwa ? "Chwila…" : "Zapisz nick"}
          </button>
        </form>
      </div>

      <div className="karta">
        <h3>Konto</h3>
        <p>
          Zalogowano jako <b>{konto?.email ?? "–"}</b>
          {konto && !konto.potwierdzony ? <span className="mala"> (e-mail jeszcze niepotwierdzony)</span> : null}
        </p>
      </div>

      <div className="karta">
        <h3>Wygląd</h3>
        <button type="button" className="przycisk przycisk-drugi przycisk-glowny" onClick={przelaczMotyw}>
          {motyw === "ciemny" ? <IkSlonce width={18} height={18} /> : <IkKsiezyc width={18} height={18} />}
          {motyw === "ciemny" ? "Jasny motyw" : "Ciemny motyw"}
        </button>
      </div>

      <div className="karta">
        <h3>Sesja</h3>
        <p className="mala">
          Zalogujesz się ponownie e-mailem i hasłem.
        </p>
        {wylogowanie.blad ? <Komunikat typ="blad">{wylogowanie.blad}</Komunikat> : null}
        <button
          type="button"
          className="przycisk przycisk-drugi przycisk-glowny"
          disabled={wylogowanie.trwa}
          onClick={() => void wylogowanie.wykonaj()}
        >
          Wyloguj
        </button>
      </div>
    </div>
  );
}

/** Zysk/strata pozycji wobec kosztu: po kursie dla otwartych, po wypłacie dla rozstrzygniętych, 0 dla unieważnionych. */
function zyskPozycji(p: MojaPozycja): number {
  if (p.status === "uniewaznione") return 0;
  return p.wartosc - p.wydane;
}

/** Portfel gracza (/profil): statystyki, pozycje, historia transakcji, ustawienia. Wymaga nicku. */
export default function Profil() {
  const { gracz, konto, wyloguj, pozycje: dane, portfel: portfelNaZywo } = useSesja();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const t = params.get("tab");
  const tab: Tab = t === "historia" || t === "ustawienia" ? t : "pozycje";
  const miejsca = useMiejsca(10000);
  const rozstrzygniecie = useRozstrzygniecieDoPokazania(gracz?.nick ?? null, dane);
  const wylogowanie = useAkcja(async () => {
    await wyloguj();
    navigate("/");
  });

  const nick = gracz?.nick ?? "";
  const laduje = dane == null;
  const blad: string | null = null;
  const pozycje = dane ?? [];
  const saldo = Math.floor(gracz?.saldo ?? 0);
  const portfel = Math.round(portfelNaZywo?.wartosc ?? saldo);
  const zysk = portfel - 1000;
  const zyskPozycjiOtwartych = portfelNaZywo?.zyskPozycji ?? 0;
  const miejsce = miejsca.get(nick) ?? null;
  const rozstrzygniete = pozycje.filter((p) => p.status === "rozstrzygniete");
  const trafione = rozstrzygniete.filter((p) => p.trafione === true).length;

  const ustawTab = (nowy: Tab) => {
    const nowe = new URLSearchParams(params);
    if (nowy === "pozycje") nowe.delete("tab");
    else nowe.set("tab", nowy);
    setParams(nowe, { replace: true });
  };

  return (
    <main className="kontener">
      <div className="profil-naglowek" style={{ flexWrap: "wrap" }}>
        <Awatar nick={nick} duzy />
        <div>
          <h1>
            {nick} <OdznakaMiejsca miejsce={miejsce} duza />
          </h1>
          <div className="pod">
            {miejsce != null ? `${miejsce}. miejsce w rankingu · ` : ""}
            {konto?.email}
          </div>
        </div>
        <div className="przyciski akcje" style={{ marginLeft: "auto", marginTop: 0 }}>
          <button
            type="button"
            className="przycisk przycisk-maly przycisk-drugi"
            disabled={wylogowanie.trwa}
            onClick={() => void wylogowanie.wykonaj()}
          >
            Wyloguj
          </button>
        </div>
      </div>

      <div className="staty">
        <div className="stat">
          <div className="etykieta">Wartość portfela</div>
          <div className="wartosc">
            {dane ? pkt(portfel) : "–"} {dane ? <ZyskStrata wartosc={zysk} sufiks="" /> : null}
          </div>
          <div className="pod">punkty + udziały po kursie, zysk wobec 1000 na start</div>
        </div>
        <div className="stat">
          <div className="etykieta">Punkty</div>
          <div className="wartosc">{liczba(saldo)}</div>
          <div className="pod">do postawienia</div>
        </div>
        <div className="stat">
          <div className="etykieta">Otwarte pozycje</div>
          <div className={`wartosc ${dane && zyskPozycjiOtwartych > 0.05 ? "zysk" : dane && zyskPozycjiOtwartych < -0.05 ? "strata" : ""}`}>
            {dane ? <ZyskStrata wartosc={zyskPozycjiOtwartych} miejsca={1} /> : "–"}
          </div>
          <div className="pod">
            {portfelNaZywo ? `warte ${liczba(portfelNaZywo.wartoscPozycji, 1)} pkt, koszt ${liczba(portfelNaZywo.kosztPozycji, 1)} pkt` : "wobec kosztu"}
          </div>
        </div>
        <div className="stat">
          <div className="etykieta">Trafność</div>
          <div className="wartosc">{dane ? `${trafione} z ${rozstrzygniete.length}` : "–"}</div>
          <div className="pod">rozstrzygnięte rynki</div>
        </div>
      </div>

      {blad ? <Komunikat typ="blad">{blad}</Komunikat> : null}
      {wylogowanie.blad ? <Komunikat typ="blad">{wylogowanie.blad}</Komunikat> : null}

      <div className="zakladki" role="tablist">
        {ZAKLADKI.map((z) => (
          <button
            type="button"
            role="tab"
            key={z.klucz}
            aria-selected={tab === z.klucz}
            className={tab === z.klucz ? "aktywna" : ""}
            onClick={() => ustawTab(z.klucz)}
          >
            {z.etykieta}
            {z.klucz === "pozycje" && dane ? <span className="licznik">{pozycje.length}</span> : null}
          </button>
        ))}
      </div>

      {tab === "pozycje" ? (
        <>
          {laduje && !dane ? <Ladowanie /> : null}
          {dane && pozycje.length === 0 ? (
            <p className="pusto">
              Jeszcze nic nie prognozujesz. <Link to="/">Wybierz rynek</Link>.
            </p>
          ) : null}
          {pozycje.length > 0 ? (
            <div className="tabela-owijka">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Rynek</th>
                    <th>Twój typ</th>
                    <th className="liczba">Udziały</th>
                    <th className="liczba">Koszt</th>
                    <th className="liczba">Kurs teraz</th>
                    <th className="liczba">Wartość</th>
                    <th className="liczba">Zysk/strata</th>
                    <th>Wynik</th>
                  </tr>
                </thead>
                <tbody>
                  {pozycje.map((p) => {
                    const i = p.odpowiedz_glowna - 1;
                    return (
                      <tr key={p.pytanie}>
                        <td>
                          <Link to={`/pytanie/${p.pytanie}`}>{p.tresc}</Link>
                          <div className="pomoc">
                            <Odznaka kategoria={p.kategoria} /> <OdznakaStatusu status={p.status} />
                          </div>
                        </td>
                        <td>
                          <span className={klasaTypu(i)}>{p.odpowiedzi[i]}</span>
                        </td>
                        <td className="liczba">{liczba(p.udzialy_glowne, 1)}</td>
                        <td className="liczba">{pkt(p.wydane)}</td>
                        <td className="liczba">{p.kursy ? procent(p.kursy[i]) : <span className="mala">ukryty</span>}</td>
                        <td className="liczba">{liczba(p.wartosc, 1)} pkt</td>
                        <td className="liczba">
                          <ZyskStrata wartosc={zyskPozycji(p)} miejsca={1} />
                        </td>
                        <td>
                          <Wynik p={p} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : tab === "historia" ? (
        <Historia nick={nick} />
      ) : (
        <Ustawienia />
      )}
      {rozstrzygniecie.pozycja ? (
        <EkranRozstrzygniecia moja={rozstrzygniecie.pozycja} onClose={() => rozstrzygniecie.oznacz(rozstrzygniecie.pozycja!.pytanie)} />
      ) : null}
    </main>
  );
}
