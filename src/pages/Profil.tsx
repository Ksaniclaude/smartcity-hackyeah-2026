import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { pobierzMojePozycje, pobierzMojeTransakcje } from "@/api/api";
import { procent } from "@/api/lmsr";
import { useSesja } from "@/api/sesja";
import type { MojaPozycja, MojaTransakcja } from "@/api/types";
import { useAkcja, usePolling } from "@/ui/hooks";
import { IkKsiezyc, IkSlonce } from "@/ui/ikony";
import { Awatar, Komunikat, Ladowanie, Odznaka, OdznakaStatusu, formatujDateKrotko, useMotyw } from "@/ui/komponenty";
import { czasTemu, liczba, pkt } from "@/ui/tekst";
import { LiczbaZywa } from "@/ui/zywe";
import { klasaTypu } from "@/pages/Aktywnosc";
import { zeZnakiem } from "@/pages/Ranking";

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
              sprzedane <b>{liczba(-t.udzialy, 1)} udz.</b> na {typ} za <b>{liczba(t.stawka)} pkt</b>
            </span>
          ) : (
            <span>
              postawione <b>{liczba(t.stawka)} pkt</b> na {typ}
            </span>
          )}
          <span className="znacznik">
            kurs {procent(t.kurs_przed)} → {procent(t.kurs_po)}
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
    <div className="waska">
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
    <div className="waska-2">
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
          {motyw === "ciemny" ? <IkSlonce /> : <IkKsiezyc />}
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

/** Portfel gracza (/profil): statystyki, pozycje, historia transakcji, ustawienia. Wymaga nicku. */
export default function Profil() {
  const { gracz, konto, wyloguj } = useSesja();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const t = params.get("tab");
  const tab: Tab = t === "historia" || t === "ustawienia" ? t : "pozycje";
  const { dane, blad, laduje } = usePolling(pobierzMojePozycje, 5000);
  const wylogowanie = useAkcja(async () => {
    await wyloguj();
    navigate("/");
  });

  const nick = gracz?.nick ?? "";
  const pozycje = dane ?? [];
  const saldo = Math.floor(gracz?.saldo ?? 0);
  const wartoscUdzialow = pozycje
    .filter((p) => p.status === "otwarte" || p.status === "zamkniete")
    .reduce((s, p) => s + p.wartosc, 0);
  const portfel = Math.round(saldo + wartoscUdzialow);
  const zysk = portfel - 1000;
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
      <div className="profil-naglowek">
        <Awatar nick={nick} duzy />
        <div>
          <h1>{nick}</h1>
          <div className="pod">{konto?.email}</div>
        </div>
        <div className="akcje">
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
          <div className="wartosc">{dane ? <LiczbaZywa wartosc={portfel} format={(n) => pkt(Math.round(n))} /> : "–"}</div>
          <div className="pod">punkty + udziały po kursie</div>
        </div>
        <div className="stat">
          <div className="etykieta">Punkty</div>
          <div className="wartosc">
            <LiczbaZywa wartosc={saldo} format={(n) => liczba(Math.round(n))} />
          </div>
          <div className="pod">do postawienia</div>
        </div>
        <div className="stat">
          <div className="etykieta">Zysk/strata</div>
          <div className={`wartosc ${dane && zysk > 0 ? "zysk" : dane && zysk < 0 ? "strata" : ""}`}>{dane ? zeZnakiem(zysk) : "–"}</div>
          <div className="pod">wobec 1000 pkt na start</div>
        </div>
        <div className="stat">
          <div className="etykieta">Trafność</div>
          <div className="wartosc">{dane && rozstrzygniete.length > 0 ? `${trafione} z ${rozstrzygniete.length}` : "–"}</div>
          <div className="pod">{dane && rozstrzygniete.length === 0 ? "brak rozstrzygniętych rynków" : "rozstrzygnięte rynki"}</div>
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
            {z.klucz === "pozycje" && pozycje.length > 0 ? <span className="licznik">{pozycje.length}</span> : null}
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
            <table className="tabela tabela-pozycje">
              <thead>
                <tr>
                  <th>Rynek</th>
                  <th>Twój typ</th>
                  <th className="liczba">Udziały</th>
                  <th className="liczba">Kurs teraz</th>
                  <th className="liczba">Wartość</th>
                  <th>Wynik</th>
                </tr>
              </thead>
              <tbody>
                {pozycje.map((p) => {
                  const i = p.odpowiedz_glowna - 1;
                  return (
                    <tr key={p.pytanie}>
                      <td className="kol-rynek">
                        <Link to={`/pytanie/${p.pytanie}`}>{p.tresc}</Link>
                        <div className="pomoc">
                          <Odznaka kategoria={p.kategoria} /> <OdznakaStatusu status={p.status} />
                        </div>
                      </td>
                      <td data-etykieta="Twój typ">
                        <span className={klasaTypu(i)}>{p.odpowiedzi[i]}</span>
                      </td>
                      <td className="liczba" data-etykieta="Udziały">
                        {liczba(p.udzialy_glowne, 1)}
                      </td>
                      <td className="liczba" data-etykieta="Kurs teraz">
                        {p.kursy ? procent(p.kursy[i]) : <span className="mala">ukryty</span>}
                      </td>
                      <td className="liczba" data-etykieta="Wartość">
                        {liczba(p.wartosc, 1)} pkt
                      </td>
                      <td data-etykieta="Wynik">
                        <Wynik p={p} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </>
      ) : tab === "historia" ? (
        <Historia nick={nick} />
      ) : (
        <Ustawienia />
      )}
    </main>
  );
}
