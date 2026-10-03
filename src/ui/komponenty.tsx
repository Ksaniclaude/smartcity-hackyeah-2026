import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { Kategoria, Status } from "@/api/types";
import { ETYKIETY_STATUSU } from "@/api/types";
import { procent } from "@/api/lmsr";
import { pobierzGracza, zalogujEmailem, zarejestruj } from "@/api/api";
import { useSesja } from "@/api/sesja";
import { useAkcja } from "@/ui/hooks";
import { inicjaly, liczba } from "@/ui/tekst";
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

/** Kafelek kategorii (zamiast obrazka rynku). */
export function KafelekKategorii({ kategoria, duzy = false }: { kategoria: Kategoria; duzy?: boolean }) {
  return (
    <span className={`ikona ikona-${kategoria} ${duzy ? "ikona-duza" : ""}`} aria-hidden="true">
      {kategoria === "miasto" ? <IkMiasto /> : <IkLuz />}
    </span>
  );
}

/** Łuk 200° jak na kartach giełd prognoz: kolor zależy od wartości (<30% czerwony, <50% bursztynowy, dalej zielony),
 *  albo narzucony przez `kolor` (mute = kurs otwarcia / ukryty). */
export function Wskaznik({
  kurs,
  etykieta = "szansa",
  kolor = "auto",
}: {
  kurs: number | null;
  etykieta?: string;
  kolor?: "auto" | "tak" | "nie" | "trzeci" | "mute";
}) {
  const r = 29;
  const dl = r * (200 * Math.PI) / 180;
  const k = kurs == null ? 0 : Math.max(0, Math.min(1, kurs));
  const luk = "M-28.56 5.04 A29 29 0 1 1 28.56 5.04";
  const klasa =
    kolor === "auto" ? (kurs == null ? "mute" : k < 0.3 ? "nie" : k < 0.5 ? "trzeci" : "tak") : kolor;
  const krycie = kolor === "mute" || kurs == null ? 0.5 : (Math.abs(k - 0.5) / 0.5) * 0.45 + 0.55;
  return (
    <div className={`wskaznik ${kurs == null ? "ukryty" : ""}`}>
      <svg viewBox="-29 -29 58 34.04" aria-hidden="true">
        <path d={luk} className="tor" fill="none" strokeWidth="4.5" strokeLinecap="round" />
        <path
          d={luk}
          className={`postep ${klasa}`}
          fill="none"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeOpacity={krycie}
          strokeDasharray={`${(dl * k).toFixed(1)} ${(dl + 2).toFixed(1)}`}
        />
      </svg>
      <b>{kurs == null ? "–" : procent(kurs)}</b>
      <span>{kurs == null ? "kurs ukryty" : etykieta}</span>
    </div>
  );
}

export function Awatar({ nick, duzy = false }: { nick: string; duzy?: boolean }) {
  return (
    <span className={`awatar ${duzy ? "awatar-duzy" : ""}`} aria-hidden="true">
      {inicjaly(nick)}
    </span>
  );
}

/* ---------- motyw ---------- */

export function useMotyw(): [string, () => void] {
  const [motyw, setMotyw] = useState<string>(() => {
    return document.documentElement.dataset.motyw ?? "ciemny";
  });
  const przelacz = useCallback(() => {
    setMotyw((m) => {
      const n = m === "ciemny" ? "jasny" : "ciemny";
      document.documentElement.dataset.motyw = n;
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
  const { gracz, konto, stan, otworzModal } = useSesja();
  const [motyw, przelaczMotyw] = useMotyw();
  const klasa = ({ isActive }: { isActive: boolean }) => `nav-link ${isActive ? "aktywny" : ""}`;
  return (
    <header className="naglowek">
      <div className="naglowek-wnetrze">
        <Link to="/" className="logo" aria-label="Zdążą? strona główna">
          <span className="logo-znak">Z</span>
          Zdążą<em>?</em>
        </Link>
        <div className="szukaj-naglowek" style={{ flex: "1 1 auto", maxWidth: 460, minWidth: 0 }}>
          <Szukajka />
        </div>
        <nav className="naglowek-nav" aria-label="Główna">
          <NavLink to="/" end className={klasa}>
            <IkRynki />
            Rynki
          </NavLink>
          <NavLink to="/miasto" className={klasa}>
            <IkMiasto />
            Miasto
          </NavLink>
          <NavLink to="/aktywnosc" className={klasa}>
            <IkAktywnosc />
            Aktywność
          </NavLink>
          <NavLink to="/ranking" className={klasa}>
            <IkRanking />
            Ranking
          </NavLink>
        </nav>
        <div className="naglowek-akcje">
          <button type="button" className="przycisk-tekst niebieski ukryj-mobil" onClick={() => otworzModal("jak")}>
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
            <Link to="/profil" className="portfel" title="Profil">
              <div>
                <span className="etykieta">Punkty</span>
                <span className="wartosc">{liczba(Math.floor(gracz.saldo))}</span>
              </div>
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
        <Link to="/miasto">Widok dla miasta</Link>
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
          placeholder="np. krowodrza_42"
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
      <p className="pod">Zdążą? to rynek prognoz o Krakowie. Zamiast pieniędzy są punkty, zamiast sondażu kurs.</p>
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
        <p className="pod">Jesteś zalogowany. Nick zobaczą inni gracze przy Twoich prognozach i komentarzach.</p>
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
              <input type="text" value={nick} onChange={(e) => setNick(e.target.value)} placeholder="np. krowodrza_42" minLength={2} maxLength={24} autoComplete="nickname" required />
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
            <button type="button" className="przycisk-tekst niebieski" style={{ padding: 0 }} onClick={() => setTryb("rejestracja")}>
              Zarejestruj się
            </button>
          </>
        ) : (
          <>
            Masz już konto?{" "}
            <button type="button" className="przycisk-tekst niebieski" style={{ padding: 0 }} onClick={() => setTryb("logowanie")}>
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
          <Link to="/miasto" onClick={zamknijModal}>
            <IkMiasto />
            Widok dla miasta
          </Link>
        </li>
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

/* ---------- starsze komponenty (nadal używane w kilku ekranach) ---------- */

/** Pasek podziału kursów (tak / nie / trzecia odpowiedź) z legendą. */
export function PasekRynku({ odpowiedzi, kursy }: { odpowiedzi: string[]; kursy: number[] | null }) {
  const klasy = ["tak", "nie", "trzeci"];
  if (!kursy) {
    return (
      <div className="pasek-rynku">
        <i style={{ width: "100%" }} />
      </div>
    );
  }
  return (
    <>
      <div className="pasek-rynku">
        {kursy.map((k, i) => (
          <i key={i} className={klasy[i] ?? "trzeci"} style={{ width: `${Math.max(0, k * 100)}%` }} />
        ))}
      </div>
      <div className="legenda">
        {odpowiedzi.map((o, i) => (
          <span key={i} className={klasy[i] ?? "trzeci"}>
            <i />
            {o} {procent(kursy[i])}
          </span>
        ))}
      </div>
    </>
  );
}

/** Lista odpowiedzi z paskami kursów (tylko do odczytu). */
export function Kursy({ odpowiedzi, kursy, wynik }: { odpowiedzi: string[]; kursy: number[] | null; wynik?: number | null }) {
  return (
    <div className="odpowiedzi">
      {odpowiedzi.map((o, i) => {
        const k = kursy ? kursy[i] : null;
        return (
          <div key={i} className={`odpowiedz o-${i + 1} ${wynik === i + 1 ? "trafiona" : ""}`}>
            {k != null ? <span className="pasek" style={{ width: `${Math.round(k * 100)}%` }} /> : null}
            <span className="nazwa">
              {o}
              {wynik === i + 1 ? " — wynik" : ""}
            </span>
            <span className="kurs">{procent(k)}</span>
          </div>
        );
      })}
    </div>
  );
}
