import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { pobierzPytanie } from "@/api/api";
import type { MojaPozycja, Pytanie } from "@/api/types";
import { useLicznik } from "@/ui/hooks";
import { liczba, odmien } from "@/ui/tekst";

const KLUCZ = "zdaza.rozstrzygniecia_widziane";

function czytajWidziane(): string[] {
  try {
    const s = JSON.parse(localStorage.getItem(KLUCZ) ?? "[]");
    return Array.isArray(s) ? s.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function klucz(nick: string, pytanie: number) {
  return `${nick}:${pytanie}`;
}

/**
 * Pierwsza rozstrzygnięta pozycja gracza, której ekranu wyniku jeszcze nie pokazano na tym
 * urządzeniu (opcjonalnie tylko dla jednego rynku). `oznacz` zapisuje, że ekran był pokazany.
 */
export function useRozstrzygniecieDoPokazania(nick: string | null, pozycje: MojaPozycja[] | null, pytanie?: number) {
  const [widziane, setWidziane] = useState<string[]>(czytajWidziane);
  const kandydat =
    nick && pozycje
      ? pozycje.find(
          (p) => p.status === "rozstrzygniete" && p.wynik != null && (pytanie == null || p.pytanie === pytanie) && !widziane.includes(klucz(nick, p.pytanie)),
        ) ?? null
      : null;
  const oznacz = (pid: number) => {
    if (!nick) return;
    const nowe = [...widziane, klucz(nick, pid)].slice(-200);
    setWidziane(nowe);
    try {
      localStorage.setItem(KLUCZ, JSON.stringify(nowe));
    } catch {
      /* prywatne okno */
    }
  };
  return { pozycja: kandydat, oznacz };
}

interface Props {
  moja: MojaPozycja;
  /** Wiersz rynku (jeśli strona już go ma); inaczej zostanie pobrany. */
  pytanie?: Pytanie | null;
  onClose: () => void;
}

/**
 * Ekran „Rynek rozstrzygnięty” dla gracza z pozycją: wynik odsłania się po ok. 1 s, licznik
 * wypłaty bije do góry, linijka „byłeś lepszy niż N% graczy” (odsetek graczy z pozycją, którzy chybili).
 */
export function EkranRozstrzygniecia({ moja, pytanie, onClose }: Props) {
  const [p, setP] = useState<Pytanie | null>(pytanie ?? null);
  const [odslonione, setOdslonione] = useState(false);
  useEffect(() => {
    if (pytanie) setP(pytanie);
    else void pobierzPytanie(moja.pytanie).then((x) => setP(x), () => undefined);
  }, [pytanie, moja.pytanie]);
  useEffect(() => {
    const id = window.setTimeout(() => setOdslonione(true), 1000);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const trafione = moja.trafione === true;
  const wyplata = moja.wyplata;
  const strata = Math.max(0, moja.wydane - wyplata);
  const licznik = useLicznik(trafione ? wyplata : strata, 1400, 1100, true);
  const wynikTekst = moja.wynik != null ? moja.odpowiedzi[moja.wynik - 1] : "";
  const g = p?.gracze_rynku ?? null;
  let porownanie: string | null = null;
  if (g && g.graczy > 0) {
    if (g.graczy === 1) porownanie = "Byłeś jedynym graczem na tym rynku.";
    else if (trafione) porownanie = `Byłeś lepszy niż ${Math.round(((g.graczy - g.trafilo) / g.graczy) * 100)}% graczy na tym rynku.`;
    else porownanie = `Trafiło ${Math.round((g.trafilo / g.graczy) * 100)}% graczy na tym rynku (${odmien(g.trafilo, "gracz", "graczy", "graczy")} z ${g.graczy}).`;
  }

  return (
    <div className="modal-tlo rozstrzygniecie-tlo" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`rozstrzygniecie ${odslonione ? (trafione ? "trafione" : "chybione") : ""}`} role="dialog" aria-modal="true" aria-label="Rynek rozstrzygnięty">
        <div className="rozstrzygniecie-naglowek">Rynek rozstrzygnięty</div>
        <h2>{moja.tresc}</h2>
        <div className="rozstrzygniecie-wynik">
          <span className="etykieta">Wynik</span>
          <b className={odslonione ? "odsloniety" : "ukryty"}>{odslonione ? wynikTekst : "…"}</b>
        </div>
        <div className={`rozstrzygniecie-wyplata ${odslonione ? "widoczna" : ""}`}>
          <span className="etykieta">Twój typ: {moja.odpowiedzi[moja.odpowiedz_glowna - 1]}</span>
          {trafione ? (
            <b className="zysk">+{liczba(odslonione ? licznik : 0, 1)} pkt</b>
          ) : (
            <b className="strata">−{liczba(odslonione ? licznik : 0, 1)} pkt</b>
          )}
          <span className="pod">
            {trafione
              ? `Trafione: ${liczba(moja.udzialy_glowne, 1)} udziałów po 1 punkcie`
              : wyplata > 0
                ? `Chybione, ale udziały na „${wynikTekst}” wypłaciły +${liczba(wyplata, 1)} pkt`
                : `Chybione: ${liczba(moja.wydane)} pkt poszło do tych, którzy trafili`}
          </span>
        </div>
        {odslonione && porownanie ? <p className="rozstrzygniecie-porownanie">{porownanie}</p> : null}
        <div className="przyciski">
          <button type="button" className="przycisk przycisk-glowny" onClick={onClose}>
            Jasne
          </button>
          <Link to={`/pytanie/${moja.pytanie}`} className="przycisk przycisk-glowny przycisk-drugi" onClick={onClose}>
            Zobacz rynek
          </Link>
        </div>
      </div>
    </div>
  );
}
