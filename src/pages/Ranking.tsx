import { Link, useSearchParams } from "react-router-dom";
import { pobierzRanking } from "@/api/api";
import { useSesja, useUruchomSesje } from "@/api/sesja";
import type { WpisRankingu } from "@/api/types";
import { usePolling } from "@/ui/hooks";
import { Awatar, Komunikat, Ladowanie } from "@/ui/komponenty";
import { liczba } from "@/ui/tekst";

type Sort = "portfel" | "zysk" | "obrot" | "trafnosc";
const SORTY: { klucz: Sort; etykieta: string }[] = [
  { klucz: "portfel", etykieta: "Portfel" },
  { klucz: "zysk", etykieta: "Zysk" },
  { klucz: "obrot", etykieta: "Obrót" },
  { klucz: "trafnosc", etykieta: "Trafność" },
];

/** „+120” / „−45” / „0”: znak zawsze jawny, minus typograficzny. */
export function zeZnakiem(n: number, miejsca = 0): string {
  if (n > 0) return `+${liczba(n, miejsca)}`;
  if (n < 0) return `−${liczba(-n, miejsca)}`;
  return liczba(0, miejsca);
}

function trafnosc(w: WpisRankingu): number {
  return w.rozstrzygniete > 0 ? w.trafione / w.rozstrzygniete : -1;
}

function posortuj(lista: WpisRankingu[], sort: Sort): WpisRankingu[] {
  const porownaj: Record<Sort, (a: WpisRankingu, b: WpisRankingu) => number> = {
    portfel: (a, b) => b.portfel - a.portfel,
    zysk: (a, b) => b.zysk - a.zysk,
    obrot: (a, b) => b.obrot - a.obrot,
    trafnosc: (a, b) => trafnosc(b) - trafnosc(a) || b.trafione - a.trafione || b.rozstrzygniete - a.rozstrzygniete,
  };
  const glowne = porownaj[sort];
  return [...lista].sort((a, b) => glowne(a, b) || b.portfel - a.portfel || a.nick.localeCompare(b.nick, "pl"));
}

/** Publiczny ranking graczy; własny wiersz podświetlony, gdy sesja gracza jest uruchomiona. */
export default function Ranking() {
  useUruchomSesje();
  const { gracz } = useSesja();
  const [params, setParams] = useSearchParams();
  const s = params.get("s");
  const sort: Sort = s === "zysk" || s === "obrot" || s === "trafnosc" ? s : "portfel";
  const { dane, blad, laduje } = usePolling(() => pobierzRanking(100), 10000);
  const wiersze = posortuj(dane ?? [], sort);

  const ustawSort = (k: Sort) => {
    const nowe = new URLSearchParams(params);
    if (k === "portfel") nowe.delete("s");
    else nowe.set("s", k);
    setParams(nowe, { replace: true });
  };

  return (
    <main className="kontener">
      <h1>Ranking</h1>
      <p className="mala">Portfel = punkty + wartość udziałów po bieżącym kursie. Tylko gracze, którzy coś postawili.</p>
      <div className="chipy" role="tablist" aria-label="Sortowanie">
        {SORTY.map((x) => (
          <button
            type="button"
            role="tab"
            key={x.klucz}
            aria-selected={sort === x.klucz}
            className={`chip ${sort === x.klucz ? "aktywny" : ""}`}
            onClick={() => ustawSort(x.klucz)}
          >
            {x.etykieta}
          </button>
        ))}
      </div>

      {blad ? <Komunikat typ="blad">{blad}</Komunikat> : null}
      {laduje && !dane ? <Ladowanie /> : null}
      {dane && wiersze.length === 0 ? <p className="pusto">Jeszcze nikt nie postawił punktów.</p> : null}

      {wiersze.length > 0 ? (
        <div className="tabela-owijka">
          <table className="tabela">
            <thead>
              <tr>
                <th>#</th>
                <th>Gracz</th>
                <th className="liczba">Portfel</th>
                <th className="liczba">Zysk</th>
                <th className="liczba">Trafność</th>
                <th className="liczba">Obrót</th>
                <th className="liczba">Prognozy</th>
              </tr>
            </thead>
            <tbody>
              {wiersze.map((w, i) => {
                const zysk = Math.round(w.zysk);
                const ja = gracz?.nick === w.nick;
                return (
                  <tr key={w.nick} className={ja ? "ja" : undefined}>
                    <td>
                      <span className={`miejsce ${i < 3 ? "top" : ""}`}>{i + 1}</span>
                    </td>
                    <td>
                      <Link to={`/u/${encodeURIComponent(w.nick)}`} className="gracz-kom">
                        <Awatar nick={w.nick} />
                        <span>{w.nick}</span>
                        {ja ? <span className="odznaka odznaka-status">Ty</span> : null}
                      </Link>
                    </td>
                    <td className="liczba">{liczba(Math.round(w.portfel))}</td>
                    <td className={`liczba ${zysk > 0 ? "trafione" : zysk < 0 ? "chybione" : ""}`}>{zeZnakiem(zysk)}</td>
                    <td className="liczba">
                      {w.trafione} z {w.rozstrzygniete}
                    </td>
                    <td className="liczba">{liczba(Math.round(w.obrot))}</td>
                    <td className="liczba">{w.prognozy}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="stopka">
        Zysk = portfel minus 1000 punktów na start. Trafność: główny typ gracza wobec wyniku rozstrzygniętych rynków.
        Ranking odświeża się co 10 sekund.
      </p>
    </main>
  );
}
