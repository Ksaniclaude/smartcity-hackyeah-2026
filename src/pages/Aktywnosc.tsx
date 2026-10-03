import { Link, useSearchParams } from "react-router-dom";
import { pobierzAktywnosc } from "@/api/api";
import { procent } from "@/api/lmsr";
import { POWODY, type Aktywnosc as WpisAkt, type Kategoria } from "@/api/types";
import { usePolling } from "@/ui/hooks";
import { Awatar, Komunikat, Ladowanie } from "@/ui/komponenty";
import { czasTemu, liczba } from "@/ui/tekst";

const KLASY_TYPU = ["typ-tak", "typ-nie", "typ-trzeci"];

/** Klasa koloru odpowiedzi wg indeksu 0 | 1 | 2 (tak | nie | trzecia). */
export function klasaTypu(indeks: number): string {
  return KLASY_TYPU[indeks] ?? "typ-trzeci";
}

/** Jeden wiersz aktywności: „nick stawia 25 pkt na tak · kurs 44% · 5 min temu”. */
export function WpisAktywnosci({ wpis }: { wpis: WpisAkt }) {
  const sprzedaz = wpis.udzialy < 0;
  const typ = <span className={klasaTypu(wpis.odpowiedz - 1)}>{wpis.odpowiedz_tekst}</span>;
  const powod = wpis.powod ? (POWODY.find((p) => p.wartosc === wpis.powod)?.etykieta ?? wpis.powod) : null;
  return (
    <div className="wpis">
      <Awatar nick={wpis.nick} />
      <div>
        <div className="kto">
          <b>
            <Link to={`/u/${encodeURIComponent(wpis.nick)}`}>{wpis.nick}</Link>
          </b>
          {sprzedaz ? (
            <span>
              sprzedaje <b>{liczba(-wpis.udzialy, 1)} udz.</b> na {typ} za <b>{liczba(wpis.stawka)} pkt</b>
            </span>
          ) : (
            <span>
              stawia <b>{liczba(wpis.stawka)} pkt</b> na {typ}
            </span>
          )}
          {wpis.kurs_po != null ? <span className="znacznik">kurs {procent(wpis.kurs_po)}</span> : null}
          {powod ? <span className="znacznik">powód: {powod}</span> : null}
          <span className="prawy">{czasTemu(wpis.czas)}</span>
        </div>
        <div className="tresc">
          <Link to={`/pytanie/${wpis.pytanie}`}>{wpis.tresc}</Link>
        </div>
        {wpis.komentarz ? <div className="mala">„{wpis.komentarz}”</div> : null}
      </div>
    </div>
  );
}

type Filtr = "wszystko" | Kategoria;
const FILTRY: { klucz: Filtr; etykieta: string }[] = [
  { klucz: "wszystko", etykieta: "Wszystko" },
  { klucz: "miasto", etykieta: "Miasto" },
  { klucz: "luz", etykieta: "Na luzie" },
];

/** Publiczna lista ostatnich prognoz i sprzedaży (wszyscy gracze, wszystkie rynki). */
export default function Aktywnosc() {
  const [params, setParams] = useSearchParams();
  const f = params.get("f");
  const filtr: Filtr = f === "miasto" || f === "luz" ? f : "wszystko";
  const { dane, blad, laduje } = usePolling(() => pobierzAktywnosc(null, 60), 5000);
  const wszystkie = dane ?? [];
  const wpisy = filtr === "wszystko" ? wszystkie : wszystkie.filter((w) => w.kategoria === filtr);

  const ustawFiltr = (k: Filtr) => {
    const nowe = new URLSearchParams(params);
    if (k === "wszystko") nowe.delete("f");
    else nowe.set("f", k);
    setParams(nowe, { replace: true });
  };

  return (
    <main className="kontener">
      <div className="waska">
        <h1>Aktywność</h1>
        <p className="mala">Ostatnie prognozy i sprzedaże udziałów wszystkich graczy. Lista odświeża się co 5 sekund.</p>
        <div className="chipy" role="tablist" aria-label="Kategoria">
          {FILTRY.map((x) => (
            <button
              type="button"
              role="tab"
              key={x.klucz}
              aria-selected={filtr === x.klucz}
              className={`chip ${filtr === x.klucz ? "aktywny" : ""}`}
              onClick={() => ustawFiltr(x.klucz)}
            >
              {x.etykieta}
            </button>
          ))}
        </div>

        {blad ? <Komunikat typ="blad">{blad}</Komunikat> : null}
        {laduje && !dane ? <Ladowanie /> : null}
        {dane && wszystkie.length === 0 ? <p className="pusto">Jeszcze nikt nie postawił punktów.</p> : null}
        {dane && wszystkie.length > 0 && wpisy.length === 0 ? (
          <p className="pusto">Brak aktywności w tej kategorii.</p>
        ) : null}
        {wpisy.length > 0 ? (
          <div>
            {wpisy.map((w) => (
              <WpisAktywnosci key={w.id} wpis={w} />
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}
