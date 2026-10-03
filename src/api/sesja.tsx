import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  komunikatBledu,
  pobierzGracza,
  pobierzKonto,
  pobierzMojePozycje,
  ustawNick as ustawNickApi,
  wylogujKonto,
  type Konto,
} from "./api";
import { konfiguracjaOk } from "./supabase";
import type { Gracz, MojaPozycja } from "./types";

/** Portfel na żywo: punkty + wartość udziałów w otwartych rynkach, zysk wobec kosztu pozycji i wobec 1000 na start. */
export interface Portfel {
  saldo: number;
  wartoscPozycji: number;
  kosztPozycji: number;
  wartosc: number;
  /** Zysk/strata otwartych pozycji wobec tego, co za nie zapłacono. */
  zyskPozycji: number;
  /** Zysk/strata całego portfela wobec 1000 punktów na start. */
  zysk: number;
}

export function policzPortfel(saldo: number, pozycje: MojaPozycja[]): Portfel {
  const otwarte = pozycje.filter((p) => p.status === "otwarte" || p.status === "zamkniete");
  const wartoscPozycji = otwarte.reduce((s, p) => s + p.wartosc, 0);
  const kosztPozycji = otwarte.reduce((s, p) => s + p.wydane, 0);
  const wartosc = saldo + wartoscPozycji;
  return { saldo, wartoscPozycji, kosztPozycji, wartosc, zyskPozycji: wartoscPozycji - kosztPozycji, zysk: wartosc - 1000 };
}

/** brak_nicku = gość bez konta (konto null) albo konto e-mail bez nicku (konto ustawione). */
type Stan = "nowa" | "laduje" | "brak_nicku" | "gotowy" | "blad";
export type Modal = "nick" | "jak" | "konto" | "szukaj" | "wiecej" | null;
export type OpcjaModalu = "rejestracja" | "logowanie" | null;

interface Sesja {
  stan: Stan;
  gracz: Gracz | null;
  /** Konto Supabase Auth (anonimowe albo z e-mailem); null przed uruchomieniem sesji. */
  konto: Konto | null;
  blad: string | null;
  /** Czyta zapisaną sesję i pobiera gracza (układ strony woła to raz przy starcie). */
  uruchom: () => void;
  ustawNick: (nick: string) => Promise<void>;
  /** Odświeża gracza (saldo) i jego pozycje; panel woła to zaraz po RPC, żeby portfel zmienił się od razu. */
  odswiezGracza: () => Promise<void>;
  /** Pozycje gracza (widok v_moje_pozycje), odpytywane co 5 s; null przed pierwszym pobraniem. */
  pozycje: MojaPozycja[] | null;
  odswiezPozycje: () => Promise<void>;
  /** Portfel policzony z salda i pozycji; null, gdy brak gracza albo pozycje jeszcze nie przyszły. */
  portfel: Portfel | null;
  /** Otwarte okno: podanie nicku albo „jak to działa”. */
  modal: Modal;
  opcjaModalu: OpcjaModalu;
  otworzModal: (m: Exclude<Modal, null>, opcja?: OpcjaModalu) => void;
  zamknijModal: () => void;
  /** Wylogowanie (konto e-mail albo sesja anonimowa); następne wejście tworzy nową sesję anonimową. */
  wyloguj: () => Promise<void>;
}

const Ctx = createContext<Sesja | null>(null);

export function SesjaProvider({ children }: { children: ReactNode }) {
  const [stan, setStan] = useState<Stan>("nowa");
  const [gracz, setGracz] = useState<Gracz | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [opcjaModalu, setOpcjaModalu] = useState<OpcjaModalu>(null);
  const [konto, setKonto] = useState<Konto | null>(null);
  const [pozycje, setPozycje] = useState<MojaPozycja[] | null>(null);
  const uruchomiono = useRef(false);

  const odswiezPozycje = useCallback(async () => {
    try {
      setPozycje(await pobierzMojePozycje());
    } catch {
      /* chwilowy brak sieci: zostaje poprzedni stan */
    }
  }, []);

  const odswiezGracza = useCallback(async () => {
    const [g, k] = await Promise.all([pobierzGracza(), pobierzKonto()]);
    setGracz(g);
    setKonto(k);
    setStan(g ? "gotowy" : "brak_nicku");
    if (g) await odswiezPozycje();
  }, [odswiezPozycje]);

  // Odpytywanie pozycji co 5 s (tylko gracz z nickiem i widoczna karta), bez realtime.
  useEffect(() => {
    if (stan !== "gotowy") {
      setPozycje(null);
      return;
    }
    void odswiezPozycje();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void odswiezPozycje();
    }, 5000);
    return () => window.clearInterval(id);
  }, [stan, odswiezPozycje]);

  const portfel = gracz && pozycje ? policzPortfel(gracz.saldo, pozycje) : null;

  /** Sprawdza zapisaną sesję (bez sieci). Gość bez konta ma stan „brak_nicku” i konto = null;
   *  konto zakłada się e-mailem w modalu rejestracji (jak na giełdach prognoz). */
  const uruchom = useCallback(() => {
    if (uruchomiono.current) return;
    uruchomiono.current = true;
    if (!konfiguracjaOk) {
      setBlad("Brak konfiguracji Supabase: ustaw VITE_SUPABASE_URL i VITE_SUPABASE_KEY.");
      setStan("blad");
      return;
    }
    setStan("laduje");
    (async () => {
      try {
        const k = await pobierzKonto();
        if (k) {
          if (k.anonimowy) {
            // sesja anonimowa ze starszej wersji gry: gra wymaga konta e-mail, więc ją porzucamy
            await wylogujKonto();
          } else {
            const g = await pobierzGracza();
            setKonto(k);
            setGracz(g);
            setStan(g ? "gotowy" : "brak_nicku");
            return;
          }
        }
        setKonto(null);
        setGracz(null);
        setStan("brak_nicku");
      } catch (e) {
        setBlad(komunikatBledu(e));
        setStan("blad");
        uruchomiono.current = false;
      }
    })();
  }, [odswiezGracza]);

  const ustawNick = useCallback(async (nick: string) => {
    const g = await ustawNickApi(nick);
    setGracz(g);
    setStan("gotowy");
    setModal(null);
  }, []);

  const otworzModal = useCallback((m: Exclude<Modal, null>, opcja: OpcjaModalu = null) => {
    setOpcjaModalu(opcja);
    setModal(m);
  }, []);
  const zamknijModal = useCallback(() => setModal(null), []);

  const wyloguj = useCallback(async () => {
    await wylogujKonto();
    setGracz(null);
    setKonto(null);
    setModal(null);
    uruchomiono.current = true;
    setStan("brak_nicku");
  }, []);

  return (
    <Ctx.Provider
      value={{
        stan,
        gracz,
        konto,
        blad,
        uruchom,
        ustawNick,
        odswiezGracza,
        pozycje,
        odswiezPozycje,
        portfel,
        modal,
        opcjaModalu,
        otworzModal,
        zamknijModal,
        wyloguj,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSesja(): Sesja {
  const s = useContext(Ctx);
  if (!s) throw new Error("Brak SesjaProvider");
  return s;
}

/** Uruchamia sesję przy wejściu na ekran gracza. */
export function useUruchomSesje() {
  const { uruchom } = useSesja();
  useEffect(() => {
    uruchom();
  }, [uruchom]);
}
