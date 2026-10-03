import { Link, useSearchParams } from "react-router-dom";
import { pobierzAktywnosc } from "@/api/api";
import { procent } from "@/api/lmsr";
import { POWODY, type Aktywnosc as WpisAkt, type Kategoria } from "@/api/types";
import { useMiejsca, usePolling } from "@/ui/hooks";
import { Awatar, Komunikat, Ladowanie, OdznakaMiejsca } from "@/ui/komponenty";
import { czasTemu, liczba, odmien } from "@/ui/tekst";

const KLASY_TYPU = ["typ-tak", "typ-nie", "typ-trzeci"];

/** Klasa koloru odpowiedzi wg indeksu 0 | 1 | 2 (tak | nie | trzecia). */
export function klasaTypu(indeks: number): string {
  return KLASY_TYPU[indeks] ?? "typ-trzeci";
}

/** Jeden wiersz aktywności: „nick stawia 25 pkt na tak · kurs 44% · 5 min temu”. */
export function WpisAktywnosci({ wpis, miejsce }: { wpis: WpisAkt; miejsce?: number | null }) {
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
          <OdznakaMiejsca miejsce={miejsce} />
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

/** Zestawienie z listy: na których rynkach i u których graczy jest najwięcej ruchów (liczone z tych samych wpisów). */
function zestawienie(wpisy: WpisAkt[]) {
  const rynki = new Map<number, { pytanie: number; tresc: string; ruchy: number; gracze: Set<string> }>();
  const gracze = new Map<string, { nick: string; ruchy: number; postawione: number }>();
  for (const w of wpisy) {
    const r = rynki.get(w.pytanie) ?? { pytanie: w.pytanie, tresc: w.tresc, ruchy: 0, gracze: new Set<string>() };
    r.ruchy++;
    r.gracze.add(w.nick);
    rynki.set(w.pytanie, r);
    const g = gracze.get(w.nick) ?? { nick: w.nick, ruchy: 0, postawione: 0 };
    g.ruchy++;
    if (w.udzialy > 0) g.postawione += w.stawka;
    gracze.set(w.nick, g);
  }
  return {
    rynki: [...rynki.values()].sort((a, b) => b.ruchy - a.ruchy).slice(0, 5),
    gracze: [...gracze.values()].sort((a, b) => b.ruchy - a.ruchy || b.postawione - a.postawione).slice(0, 5),
  };
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
  const miejsca = useMiejsca();
  const wszystkie = dane ?? [];
  const wpisy = filtr === "wszystko" ? wszystkie : wszystkie.filter((w) => w.kategoria === filtr);
  const zestaw = zestawienie(wpisy);

  const ustawFiltr = (k: Filtr) => {
    const nowe = new URLSearchParams(params);
    if (k === "wszystko") nowe.delete("f");
    else nowe.set("f", k);
    setParams(nowe, { replace: true });
  };

  return (
    <main className="kontener">
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

      {/* Na szerokim ekranie lista zajmuje główną kolumnę, a obok stoi zestawienie: gdzie i kto gra najwięcej. */}
      <div className="aktywnosc-uklad">
        <div>
          {blad ? <Komunikat typ="blad">{blad}</Komunikat> : null}
          {laduje && !dane ? <Ladowanie /> : null}
          {dane && wszystkie.length === 0 ? <p className="pusto">Jeszcze nikt nie postawił punktów.</p> : null}
          {dane && wszystkie.length > 0 && wpisy.length === 0 ? <p className="pusto">Brak aktywności w tej kategorii.</p> : null}
          {wpisy.map((w) => (
            <WpisAktywnosci key={w.id} wpis={w} miejsce={miejsca.get(w.nick)} />
          ))}
        </div>
        {wpisy.length > 0 ? (
          <aside className="aktywnosc-bok">
            <section>
              <h2>Najwięcej ruchu</h2>
              <ol className="bok-lista">
                {zestaw.rynki.map((r) => (
                  <li key={r.pytanie}>
                    <Link to={`/pytanie/${r.pytanie}`} title={r.tresc}>
                      {r.tresc}
                    </Link>
                    <span>
                      {odmien(r.ruchy, "ruch", "ruchy", "ruchów")}, {odmien(r.gracze.size, "gracz", "graczy", "graczy")}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
            <section>
              <h2>Najaktywniejsi</h2>
              <ol className="bok-lista">
                {zestaw.gracze.map((g) => (
                  <li key={g.nick}>
                    <Link to={`/u/${encodeURIComponent(g.nick)}`} className="gracz-kom">
                      <Awatar nick={g.nick} />
                      <span>{g.nick}</span>
                      <OdznakaMiejsca miejsce={miejsca.get(g.nick)} />
                    </Link>
                    <span>
                      {odmien(g.ruchy, "ruch", "ruchy", "ruchów")}
                      {g.postawione > 0 ? `, postawione ${liczba(g.postawione)} pkt` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
            <p className="pomoc">Liczone z {odmien(wpisy.length, "ostatniego ruchu", "ostatnich ruchów", "ostatnich ruchów")} na liście.</p>
          </aside>
        ) : null}
      </div>
    </main>
  );
}
