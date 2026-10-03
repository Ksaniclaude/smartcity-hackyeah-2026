import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { komunikatBledu, pobierzGracza, ustawNick as ustawNickApi, zalogujAnonimowo } from "./api";
import { konfiguracjaOk } from "./supabase";
import type { Gracz } from "./types";

type Stan = "nowa" | "laduje" | "brak_nicku" | "gotowy" | "blad";

interface Sesja {
  stan: Stan;
  gracz: Gracz | null;
  blad: string | null;
  /** Loguje anonimowo i pobiera gracza (wołane przez ekrany gracza, nie przez /miasto). */
  uruchom: () => void;
  ustawNick: (nick: string) => Promise<void>;
  odswiezGracza: () => Promise<void>;
}

const Ctx = createContext<Sesja | null>(null);

export function SesjaProvider({ children }: { children: ReactNode }) {
  const [stan, setStan] = useState<Stan>("nowa");
  const [gracz, setGracz] = useState<Gracz | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const uruchomiono = useRef(false);

  const odswiezGracza = useCallback(async () => {
    const g = await pobierzGracza();
    setGracz(g);
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
  }, []);

  return <Ctx.Provider value={{ stan, gracz, blad, uruchom, ustawNick, odswiezGracza }}>{children}</Ctx.Provider>;
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
