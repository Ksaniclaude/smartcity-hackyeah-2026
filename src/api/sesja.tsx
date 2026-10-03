import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { komunikatBledu, pobierzGracza, pobierzKonto, ustawNick as ustawNickApi, wylogujKonto, zalogujAnonimowo, type Konto } from "./api";
import { konfiguracjaOk } from "./supabase";
import type { Gracz } from "./types";

type Stan = "nowa" | "laduje" | "brak_nicku" | "gotowy" | "blad";
export type Modal = "nick" | "jak" | "konto" | "szukaj" | "wiecej" | null;
export type OpcjaModalu = "rejestracja" | "logowanie" | null;

interface Sesja {
  stan: Stan;
  gracz: Gracz | null;
  /** Konto Supabase Auth (anonimowe albo z e-mailem); null przed uruchomieniem sesji. */
  konto: Konto | null;
  blad: string | null;
  /** Loguje anonimowo i pobiera gracza (wołane przez ekrany gracza, nie przez /miasto). */
  uruchom: () => void;
  ustawNick: (nick: string) => Promise<void>;
  odswiezGracza: () => Promise<void>;
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
  const uruchomiono = useRef(false);

  const odswiezGracza = useCallback(async () => {
    const [g, k] = await Promise.all([pobierzGracza(), pobierzKonto()]);
    setGracz(g);
    setKonto(k);
    setStan(g ? "gotowy" : "brak_nicku");
  }, []);

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
        await zalogujAnonimowo();
        await odswiezGracza();
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
    uruchomiono.current = false;
    setStan("nowa");
  }, []);

  return (
    <Ctx.Provider
      value={{ stan, gracz, konto, blad, uruchom, ustawNick, odswiezGracza, modal, opcjaModalu, otworzModal, zamknijModal, wyloguj }}
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
