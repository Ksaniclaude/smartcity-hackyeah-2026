import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { Kategoria, Pytanie, Status } from "@/api/types";
import { ETYKIETY_STATUSU } from "@/api/types";
import { pobierzGracza, zalogujEmailem, zarejestruj } from "@/api/api";
import { useSesja } from "@/api/sesja";
import { useAkcja } from "@/ui/hooks";
import { inicjaly, kolorAwatara, liczba, odmien } from "@/ui/tekst";
import { LiczbaZywa, fala, lecPunkty, podbij, wibruj } from "@/ui/zywe";
import {
  IkAktywnosc,
  IkInfo,
  IkKalendarz,
  IkKsiezyc,
  IkLuz,
  IkMiasto,
  IkPlus,
  IkProfil,
  IkRanking,
  IkRynki,
  IkSlonce,
  IkStrzalka,
  IkSzukaj,
  IkZamknij,
  IkZnak,
} from "@/ui/ikony";

/* ---------- drobne ---------- */

export function Odznaka({ kategoria }: { kategoria: Kategoria }) {
  return <span className={`odznaka odznaka-${kategoria}`}>{kategoria === "miasto" ? "Miasto" : "Na luzie"}</span>;
}

export function OdznakaStatusu({ status }: { status: Status }) {
  if (status === "otwarte") return null;
  return (
    <span className={`odznaka odznaka-status ${status === "zamkniete" ? "odznaka-zamkniete" : ""}`}>
      {ETYKIETY_STATUSU[status]}
    </span>
  );
}

export function Komunikat({ typ, children }: { typ: "blad" | "ok" | "info" | "ostrz"; children: ReactNode }) {
  return <div className={`komunikat komunikat-${typ}`}>{children}</div>;
}

export function Ladowanie({ tekst = "Ładowanie…" }: { tekst?: string }) {
  return <div className="ladowanie">{tekst}</div>;
}

/** Szare kafelki w miejscu kart, zanim przyjdą dane. */
export function Szkielet({ ile = 6 }: { ile?: number }) {
  return (
    <>
      {Array.from({ length: ile }, (_, i) => (
        <span className="szkielet szkielet-karta" key={i} />
      ))}
    </>
  );
}

export function formatujDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
}

/** „30 lis 2026” */
export function formatujDateKrotko(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" }).replace(".", "");
}

/** Stopka karty rynku: „bez prognoz”, „3/10 prognoz” (kurs jeszcze ukryty) albo „12 prognoz”. Krótko, bez zer. */
export function opisPrognoz(p: Pick<Pytanie, "liczba_prognoz" | "prog_widocznosci" | "status" | "kursy">): string {
  if (p.liczba_prognoz === 0) return "bez prognoz";
  if (p.status === "otwarte" && p.kursy == null) return `${p.liczba_prognoz}/${p.prog_widocznosci} prognoz`;
  return odmien(p.liczba_prognoz, "prognoza", "prognozy", "prognoz");
}

/** Numer miejsca w rankingu przy nicku: „#3”. Nic, gdy gracz nie jest w rankingu. */
export function OdznakaMiejsca({ miejsce, duza = false }: { miejsce: number | null | undefined; duza?: boolean }) {
  if (miejsce == null) return null;
  return (
    <span className={`miejsce-odznaka cyfry ${miejsce <= 3 ? "top" : ""} ${duza ? "duza" : ""}`} title={`${miejsce}. miejsce w rankingu`}>
      #{miejsce}
    </span>
  );
}

/** Zysk/strata z jawnym znakiem, zielony/czerwony; `miejsca` = miejsca po przecinku. */
export function ZyskStrata({ wartosc, miejsca = 0, sufiks = " pkt" }: { wartosc: number; miejsca?: number; sufiks?: string }) {
  const zaokr = Number(wartosc.toFixed(miejsca));
  const klasa = zaokr > 0 ? "zysk" : zaokr < 0 ? "strata" : "zero";
  const tekst = zaokr > 0 ? `+${liczba(zaokr, miejsca)}` : zaokr < 0 ? `−${liczba(-zaokr, miejsca)}` : liczba(0, miejsca);
  return (
    <span className={`zysk-strata ${klasa}`}>
      {tekst}
      {sufiks}
    </span>
  );
}

/** Inicjały gracza na kole w kolorze wyliczonym z nicku. */
export function Awatar({ nick, duzy = false }: { nick: string; duzy?: boolean }) {
  return (
    <span className={`awatar awatar-k${kolorAwatara(nick)} ${duzy ? "awatar-duzy" : ""}`} aria-hidden="true">
      {inicjaly(nick)}
    </span>
  );
}

/* ---------- motyw ---------- */

/** Kolor paska przeglądarki = tło strony w bieżącym motywie (token --tlo). */
function ustawKolorPaska() {
  const tlo = getComputedStyle(document.documentElement).getPropertyValue("--tlo").trim();
  if (tlo) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", tlo);
}

export function useMotyw(): [string, () => void] {
  const [motyw, setMotyw] = useState<string>(() => {
    return document.documentElement.dataset.motyw ?? "ciemny";
  });
  const przelacz = useCallback(() => {
    setMotyw((m) => {
      const n = m === "ciemny" ? "jasny" : "ciemny";
      document.documentElement.dataset.motyw = n;
      ustawKolorPaska();
      try {
        localStorage.setItem("motyw", n);
      } catch {
        /* prywatne okno */
      }
      return n;
    });
  }, []);
  return [motyw, przelacz];
}

/* ---------- wyszukiwarka (parametr ?q= na stronie głównej) ---------- */

export function Szukajka({ autoFocus = false, poWyslaniu }: { autoFocus?: boolean; poWyslaniu?: () => void }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [q, setQ] = useState(params.get("q") ?? "");
  useEffect(() => {
    setQ(params.get("q") ?? "");
  }, [params]);
  const zastosuj = (wartosc: string) => {
    const w = wartosc.trim();
    if (pathname === "/") {
      const nowe = new URLSearchParams(params);
      if (w) nowe.set("q", w);
      else nowe.delete("q");
      setParams(nowe, { replace: true });
    } else {
      navigate(w ? `/?q=${encodeURIComponent(w)}` : "/");
    }
  };
  return (
    <form
      className="szukaj"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        zastosuj(q);
        poWyslaniu?.();
      }}
    >
      <IkSzukaj />
      <input
        type="search"
        placeholder="Szukaj rynków"
        aria-label="Szukaj rynków"
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          if (pathname === "/") zastosuj(e.target.value);
        }}
      />
    </form>
  );
}

/* ---------- nagłówek ---------- */

export function Naglowek() {
  const { gracz, konto, stan, otworzModal, portfel } = useSesja();
  const [motyw, przelaczMotyw] = useMotyw();
  const klasa = ({ isActive }: { isActive: boolean }) => `nav-link ${isActive ? "aktywny" : ""}`;
  // Kto w tej wizycie założył konto albo się zalogował (a nie wrócił z zapisaną sesją), widzi, jak punkty
  // wpadają na saldo: monety lecą ze środka ekranu, a liczba rośnie od zera.
  const refPortfela = useRef<HTMLAnchorElement>(null);
  const bylGosciem = useRef(false);
  const powitany = useRef(false);
  useEffect(() => {
    if (stan === "brak_nicku") bylGosciem.current = true;
  }, [stan]);
  useEffect(() => {
    const portfel = refPortfela.current;
    if (!gracz || !portfel || !bylGosciem.current || powitany.current) return;
    powitany.current = true;
    void lecPunkty({ x: window.innerWidth / 2, y: window.innerHeight * 0.55 }, portfel, 18).then(() => {
      podbij(portfel, 2);
      fala(portfel, "", 90);
      wibruj([12, 40, 18]);
    });
  }, [gracz]);
  return (
    <header className="naglowek">
      <div className="naglowek-wnetrze">
        <Link to="/" className="logo" aria-label="Zdążą? strona główna">
          <IkZnak className="logo-znak" />
          <span>Zdążą?</span>
        </Link>
        <div className="szukaj-naglowek">
          <Szukajka />
        </div>
        <nav className="naglowek-nav" aria-label="Główna">
          <NavLink to="/" end className={klasa}>
            Rynki
          </NavLink>
          <NavLink to="/aktywnosc" className={klasa}>
            Aktywność
          </NavLink>
          <NavLink to="/ranking" className={klasa}>
            Ranking
          </NavLink>
        </nav>
        <div className="naglowek-akcje">
          <button type="button" className="przycisk-tekst ukryj-mobil" onClick={() => otworzModal("jak")}>
            <IkInfo />
            Jak to działa
          </button>
          <button
            type="button"
            className="przycisk-ikona ukryj-mobil"
            onClick={przelaczMotyw}
            aria-label={motyw === "ciemny" ? "Jasny motyw" : "Ciemny motyw"}
            title={motyw === "ciemny" ? "Jasny motyw" : "Ciemny motyw"}
          >
            {motyw === "ciemny" ? <IkSlonce /> : <IkKsiezyc />}
          </button>
          {gracz ? (
            <Link to="/profil" className="portfel" title="Portfel na żywo: punkty + udziały po kursie, zysk wobec 1000 na start" ref={refPortfela}>
              <span className="portfel-saldo">
                <LiczbaZywa
                  className="cyfry"
                  wartosc={portfel ? Math.round(portfel.wartosc) : Math.floor(gracz.saldo)}
                  od={bylGosciem.current ? 0 : undefined}
                  czas={bylGosciem.current ? 1100 : 450}
                  format={(n) => liczba(Math.round(n))}
                />
                <small>pkt</small>
                {portfel ? <ZyskStrata wartosc={Math.round(portfel.zysk)} sufiks="" /> : null}
              </span>
              <Awatar nick={gracz.nick} />
            </Link>
          ) : stan === "laduje" ? (
            <span className="szkielet szkielet-przycisk" />
          ) : konto ? (
            <button type="button" className="pigulka pigulka-pelna" onClick={() => otworzModal("nick")}>
              Podaj nick
            </button>
          ) : (
            <>
              <button type="button" className="pigulka ukryj-mobil" onClick={() => otworzModal("konto", "logowanie")}>
                Zaloguj
              </button>
              <button type="button" className="pigulka pigulka-pelna" onClick={() => otworzModal("konto", "rejestracja")}>
                Zarejestruj
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function DolnaNawigacja() {
  const { otworzModal } = useSesja();
  const klasa = ({ isActive }: { isActive: boolean }) => (isActive ? "aktywny" : "");
  return (
    <nav className="dol-nav" aria-label="Dolna">
      <NavLink to="/" end className={klasa}>
        <IkRynki />
        Rynki
      </NavLink>
      <button type="button" onClick={() => otworzModal("szukaj")}>
        <IkSzukaj />
        Szukaj
      </button>
      <NavLink to="/aktywnosc" className={klasa}>
        <IkAktywnosc />
        Aktywność
      </NavLink>
      <NavLink to="/profil" className={klasa}>
        <IkProfil />
        Profil
      </NavLink>
      <button type="button" onClick={() => otworzModal("wiecej")}>
        <IkPlus />
        Więcej
      </button>
    </nav>
  );
}

export function StopkaStrony() {
  return (
    <footer className="stopka-strony">
      <div className="stopka-wnetrze">
        <Link to="/zaproponuj">Zaproponuj pytanie</Link>
        <span className="prawy">Gra o punkty. Punktów nie da się kupić ani wymienić.</span>
      </div>
    </footer>
  );
}

/* ---------- modale ---------- */

export function Modal({ tytul, onClose, children }: { tytul?: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    const poprzedni = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = poprzedni;
    };
  }, [onClose]);
  return (
    <div
      className="modal-tlo"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={tytul}>
        <button type="button" className="przycisk-ikona modal-zamknij" onClick={onClose} aria-label="Zamknij">
          <IkZamknij />
        </button>
        {tytul ? <h2>{tytul}</h2> : null}
        {children}
      </div>
    </div>
  );
}

/** Formularz nicku: jedyne, co zapisujemy o graczu. Używany w modalu i na /profil bez nicku. */
export function FormularzNicku({ etykietaPrzycisku = "Zaczynam" }: { etykietaPrzycisku?: string }) {
  const { ustawNick, stan, uruchom, blad: bladSesji } = useSesja();
  const [nick, setNick] = useState("");
  const { wykonaj, trwa, blad } = useAkcja(ustawNick);
  useEffect(() => {
    if (stan === "nowa") uruchom();
  }, [stan, uruchom]);
  const laczy = stan === "nowa" || stan === "laduje";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void wykonaj(nick.trim());
      }}
    >
      <label className="pole">
        <span className="etykieta">Nick (widzą go inni gracze)</span>
        <input
          type="text"
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          placeholder="np. sokole_oko"
          minLength={2}
          maxLength={24}
          autoComplete="nickname"
          autoFocus
          required
        />
        <div className="pomoc">2–24 znaki: litery, cyfry, _ . -</div>
      </label>
      {stan === "blad" ? (
        <Komunikat typ="blad">
          {bladSesji}{" "}
          <button type="button" className="przycisk przycisk-maly przycisk-drugi" onClick={uruchom}>
            Spróbuj ponownie
          </button>
        </Komunikat>
      ) : null}
      {blad ? <Komunikat typ="blad">{blad}</Komunikat> : null}
      <button className="przycisk" type="submit" disabled={trwa || laczy || stan === "blad" || nick.trim().length < 2}>
        {trwa ? "Chwila…" : laczy ? "Łączę z miastem…" : etykietaPrzycisku}
      </button>
    </form>
  );
}

function ModalNicku() {
  const { zamknijModal, stan } = useSesja();
  useEffect(() => {
    if (stan === "gotowy") zamknijModal();
  }, [stan, zamknijModal]);
  return (
    <Modal tytul="Podaj nick" onClose={zamknijModal}>
      <p className="pod">
        Nick zobaczą inni gracze przy Twoich prognozach i komentarzach. Dostajesz 1000 punktów na prognozy.{" "}
        <b>Punktów nie da się kupić ani wymienić.</b>
      </p>
      <FormularzNicku />
    </Modal>
  );
}

function ModalJakToDziala() {
  const { zamknijModal, otworzModal, gracz, konto } = useSesja();
  return (
    <Modal tytul="Jak to działa" onClose={zamknijModal}>
      <p className="pod">Zdążą? to rynek prognoz o terminach w polskich miastach. Zamiast pieniędzy są punkty, zamiast sondażu kurs.</p>
      <div className="kroki">
        <div className="krok">
          <b>1</b>
          <div>
            <strong>Wybierz pytanie</strong>
            <span>Czy miasto dotrzyma terminu? Każde pytanie ma kryterium rozstrzygnięcia i publiczne źródło.</span>
          </div>
        </div>
        <div className="krok">
          <b>2</b>
          <div>
            <strong>Postaw punkty</strong>
            <span>Dostajesz 1000 punktów. Stawiasz na odpowiedź, a kurs przesuwa się tak, jak myślą mieszkańcy.</span>
          </div>
        </div>
        <div className="krok">
          <b>3</b>
          <div>
            <strong>Sprawdzamy wynik w źródle</strong>
            <span>Po terminie każdy udział trafionej odpowiedzi wypłaca 1 punkt. Unieważnione pytanie zwraca punkty.</span>
          </div>
        </div>
      </div>
      {gracz ? (
        <button type="button" className="przycisk" onClick={zamknijModal}>
          Jasne
        </button>
      ) : (
        <button type="button" className="przycisk" onClick={() => (konto ? otworzModal("nick") : otworzModal("konto", "rejestracja"))}>
          {konto ? "Podaj nick" : "Zacznij grać"}
        </button>
      )}
      <p className="zastrzezenie">Gra o punkty. Punktów nie da się kupić ani wymienić, nagród nie ma.</p>
    </Modal>
  );
}

/** Rejestracja i logowanie e-mailem (jak na giełdach prognoz). Sesja anonimowa z nickiem
 *  Konto zakłada signUp; stare sesje anonimowe są porzucane przy starcie. */
function ModalKonta() {
  const { zamknijModal, opcjaModalu, stan, uruchom, gracz, konto, odswiezGracza, ustawNick } = useSesja();
  const [tryb, setTryb] = useState<"rejestracja" | "logowanie" | "nick">(
    konto && !gracz ? "nick" : opcjaModalu === "logowanie" ? "logowanie" : "rejestracja",
  );
  useEffect(() => {
    if (gracz) zamknijModal();
  }, [gracz, zamknijModal]);
  const [email, setEmail] = useState("");
  const [haslo, setHaslo] = useState("");
  const [nick, setNick] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  useEffect(() => {
    if (stan === "nowa") uruchom();
  }, [stan, uruchom]);

  const rejestracja = useAkcja(async () => {
    const w = await zarejestruj(email.trim(), haslo);
    if (w.wymagaPotwierdzenia) {
      // Supabase ma włączone potwierdzanie e-maila: sesja powstanie po kliknięciu w link z poczty.
      setInfo("Wysłaliśmy link potwierdzający na podany adres. Kliknij w niego (otworzy stronę zalogowaną), a potem podaj nick.");
      return;
    }
    if (nick.trim().length >= 2) {
      try {
        await ustawNick(nick.trim());
      } catch (e) {
        // konto już istnieje (sesja jest), tylko nick nie przeszedł: zostajemy przy formularzu nicku
        await odswiezGracza();
        setTryb("nick");
        throw e;
      }
    }
    await odswiezGracza();
    zamknijModal();
  });
  const logowanie = useAkcja(async () => {
    await zalogujEmailem(email.trim(), haslo);
    await odswiezGracza();
    const g = await pobierzGracza();
    if (g) zamknijModal();
    else setTryb("nick");
  });
  const wyslijRejestracje = (e: FormEvent) => {
    e.preventDefault();
    void rejestracja.wykonaj();
  };
  const wyslijLogowanie = (e: FormEvent) => {
    e.preventDefault();
    void logowanie.wykonaj();
  };

  if (tryb === "nick") {
    return (
      <Modal tytul="Jeszcze nick" onClose={zamknijModal}>
        <p className="pod">Zalogowano. Nick zobaczą inni gracze przy Twoich prognozach i komentarzach.</p>
        {rejestracja.blad ? <Komunikat typ="blad">{rejestracja.blad}</Komunikat> : null}
        <FormularzNicku />
      </Modal>
    );
  }
  return (
    <Modal tytul={tryb === "logowanie" ? "Zaloguj się" : "Witaj w Zdążą?"} onClose={zamknijModal}>
      <p className="pod">
        {tryb === "logowanie"
          ? "Zaloguj się e-mailem i hasłem, które podałeś przy rejestracji."
          : "Załóż konto: nick, e-mail i hasło. Dostajesz 1000 punktów na prognozy. Punktów nie da się kupić ani wymienić."}
      </p>
      <div className="modal-zakladki" role="tablist">
        <button type="button" role="tab" className={tryb === "rejestracja" ? "aktywna" : ""} onClick={() => setTryb("rejestracja")}>
          Rejestracja
        </button>
        <button type="button" role="tab" className={tryb === "logowanie" ? "aktywna" : ""} onClick={() => setTryb("logowanie")}>
          Logowanie
        </button>
      </div>
      {tryb === "rejestracja" ? (
        <form onSubmit={wyslijRejestracje}>
          {!gracz ? (
            <label className="pole">
              <span className="etykieta">Nick</span>
              <input type="text" value={nick} onChange={(e) => setNick(e.target.value)} placeholder="np. sokole_oko" minLength={2} maxLength={24} autoComplete="nickname" required />
            </label>
          ) : null}
          <label className="pole">
            <span className="etykieta">E-mail</span>
            <input type="text" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ty@przyklad.pl" autoComplete="email" required />
          </label>
          <label className="pole">
            <span className="etykieta">Hasło (co najmniej 6 znaków)</span>
            <input type="password" value={haslo} onChange={(e) => setHaslo(e.target.value)} minLength={6} autoComplete="new-password" required />
          </label>
          {info ? <Komunikat typ="info">{info}</Komunikat> : null}
          {rejestracja.blad ? <Komunikat typ="blad">{rejestracja.blad}</Komunikat> : null}
          <button className="przycisk" type="submit" disabled={rejestracja.trwa || stan === "laduje" || info != null}>
            {rejestracja.trwa ? "Chwila…" : stan === "laduje" ? "Łączę z miastem…" : "Załóż konto"}
          </button>
        </form>
      ) : (
        <form onSubmit={wyslijLogowanie}>
          <label className="pole">
            <span className="etykieta">E-mail</span>
            <input type="text" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ty@przyklad.pl" autoComplete="email" required />
          </label>
          <label className="pole">
            <span className="etykieta">Hasło</span>
            <input type="password" value={haslo} onChange={(e) => setHaslo(e.target.value)} autoComplete="current-password" required />
          </label>
          {logowanie.blad ? <Komunikat typ="blad">{logowanie.blad}</Komunikat> : null}
          <button className="przycisk" type="submit" disabled={logowanie.trwa}>
            {logowanie.trwa ? "Chwila…" : "Zaloguj się"}
          </button>
        </form>
      )}
      <p className="zastrzezenie">
        {tryb === "logowanie" ? (
          <>
            Nie masz konta?{" "}
            <button type="button" className="lacze" onClick={() => setTryb("rejestracja")}>
              Zarejestruj się
            </button>
          </>
        ) : (
          <>
            Masz już konto?{" "}
            <button type="button" className="lacze" onClick={() => setTryb("logowanie")}>
              Zaloguj się
            </button>
          </>
        )}
        <br />
        Gra o punkty, bez pieniędzy. Zapisujemy tylko nick i e-mail.
      </p>
    </Modal>
  );
}

/** Arkusz wyszukiwania (dolna nawigacja na telefonie): pole + skróty przeglądania. */
function ModalSzukaj() {
  const { zamknijModal } = useSesja();
  const skroty: { etykieta: string; do: string; ikona: ReactNode }[] = [
    { etykieta: "Nowe", do: "/?f=nowe", ikona: <IkStrzalka /> },
    { etykieta: "Popularne", do: "/?s=obrot", ikona: <IkAktywnosc /> },
    { etykieta: "Kończą się", do: "/?s=termin", ikona: <IkKalendarz /> },
    { etykieta: "Miasto", do: "/?f=miasto", ikona: <IkMiasto /> },
    { etykieta: "Na luzie", do: "/?f=luz", ikona: <IkLuz /> },
    { etykieta: "Rozstrzygnięte", do: "/?f=rozstrzygniete", ikona: <IkRanking /> },
  ];
  return (
    <Modal onClose={zamknijModal}>
      <div className="uchwyt" />
      <Szukajka autoFocus poWyslaniu={zamknijModal} />
      <div className="przegladaj">
        <h4>Przeglądaj</h4>
        <div className="chipy">
          {skroty.map((sk) => (
            <Link key={sk.etykieta} to={sk.do} className="chip" onClick={zamknijModal}>
              {sk.ikona}
              {sk.etykieta}
            </Link>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/** Menu „więcej” (telefon): pozostałe ekrany, motyw, konto. */
function ModalWiecej() {
  const { zamknijModal, otworzModal, gracz, konto, wyloguj } = useSesja();
  const [motyw, przelaczMotyw] = useMotyw();
  const { wykonaj: wylogujSie, trwa } = useAkcja(wyloguj);
  return (
    <Modal onClose={zamknijModal}>
      <div className="uchwyt" />
      {gracz ? (
        <div className="konto-info">
          <Awatar nick={gracz.nick} />
          <div>
            <b>{gracz.nick}</b>
            <div className="pod">{konto?.email}</div>
          </div>
        </div>
      ) : null}
      <ul className="menu-lista">
        <li>
          <Link to="/ranking" onClick={zamknijModal}>
            <IkRanking />
            Ranking
          </Link>
        </li>
        <li>
          <Link to="/zaproponuj" onClick={zamknijModal}>
            <IkPlus />
            Zaproponuj pytanie
          </Link>
        </li>
        <li>
          <button type="button" onClick={() => otworzModal("jak")}>
            <IkInfo />
            Jak to działa
          </button>
        </li>
        <li>
          <button type="button" onClick={przelaczMotyw}>
            {motyw === "ciemny" ? <IkSlonce /> : <IkKsiezyc />}
            {motyw === "ciemny" ? "Jasny motyw" : "Ciemny motyw"}
          </button>
        </li>
      </ul>
      {gracz ? (
        <div className="menu-przyciski">
          <Link to="/profil" className="przycisk przycisk-drugi" onClick={zamknijModal}>
            Profil
          </Link>
          <button type="button" className="przycisk" disabled={trwa} onClick={() => void wylogujSie()}>
            Wyloguj
          </button>
        </div>
      ) : konto ? (
        <div className="menu-przyciski">
          <button type="button" className="przycisk" onClick={() => otworzModal("nick")}>
            Podaj nick
          </button>
          <button type="button" className="przycisk przycisk-drugi" disabled={trwa} onClick={() => void wylogujSie()}>
            Wyloguj
          </button>
        </div>
      ) : (
        <div className="menu-przyciski">
          <button type="button" className="przycisk przycisk-drugi" onClick={() => otworzModal("konto", "logowanie")}>
            Zaloguj
          </button>
          <button type="button" className="przycisk" onClick={() => otworzModal("konto", "rejestracja")}>
            Zarejestruj
          </button>
        </div>
      )}
    </Modal>
  );
}

/** Renderuje otwarty modal (sterowany przez SesjaProvider). */
export function Modale() {
  const { modal } = useSesja();
  if (modal === "nick") return <ModalNicku />;
  if (modal === "jak") return <ModalJakToDziala />;
  if (modal === "konto") return <ModalKonta />;
  if (modal === "szukaj") return <ModalSzukaj />;
  if (modal === "wiecej") return <ModalWiecej />;
  return null;
}
