import { Link } from "react-router-dom";
import { pobierzPowody, pobierzPytania } from "@/api/api";
import { procent } from "@/api/lmsr";
import { POWODY, type Pytanie, type RozkladPowodu } from "@/api/types";
import { terminowosc } from "@/dane/terminowosc";
import { usePolling } from "@/ui/hooks";
import { Komunikat, Ladowanie, formatujDate } from "@/ui/komponenty";
import { odmien } from "@/ui/tekst";

function Powody({ rozklad }: { rozklad: RozkladPowodu[] }) {
  const razem = rozklad.reduce((s, r) => s + r.liczba, 0);
  if (razem === 0) return <span className="pusto">brak</span>;
  const posortowane = [...rozklad].sort((a, b) => b.liczba - a.liczba);
  return (
    <div>
      {posortowane.map((r) => (
        <div className="powod-pasek" key={r.powod}>
          <span>{POWODY.find((p) => p.wartosc === r.powod)?.etykieta ?? r.powod}</span>
          <span className="slupek">
            <i style={{ width: `${Math.round((r.liczba / razem) * 100)}%` }} />
          </span>
          <span>{Math.round((r.liczba / razem) * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

async function pobierzWszystko() {
  const [pytania, powody] = await Promise.all([pobierzPytania(), pobierzPowody()]);
  return { pytania: pytania.filter((p) => p.kategoria === "miasto"), powody };
}

function wiara(p: Pytanie): number | null {
  return p.kursy ? p.kursy[0] : null;
}

/** Tabela dla miasta: terminy, w które mieszkańcy nie wierzą. Bez logowania. */
export default function Miasto() {
  const { dane, blad, laduje } = usePolling(pobierzWszystko, 5000);
  const pytania = dane?.pytania ?? [];
  const powody = dane?.powody ?? [];
  const aktywne = pytania
    .filter((p) => p.status === "otwarte" || p.status === "zamkniete")
    .sort((a, b) => (wiara(a) ?? 2) - (wiara(b) ?? 2));
  const zakonczone = pytania.filter((p) => p.status === "rozstrzygniete" || p.status === "uniewaznione");
  const t = terminowosc;

  return (
    <main className="ekran ekran-szeroki">
      <h1>Zdążą? Widok dla miasta</h1>
      <p>
        Mieszkańcy stawiają punkty na to, czy miejskie terminy zostaną dotrzymane. Poniżej: terminy oficjalne,
        wiara mieszkańców i powody, dla których w termin nie wierzą. Winnego nie wskazujemy, robi to rozkład
        powodów.
      </p>
      {t.ogolem.odsetek != null ? (
        <Komunikat typ="info">
          <b>{Math.round(t.ogolem.odsetek * 100)}%</b> umów krakowskich jednostek miejskich wykonano w pierwotnym
          terminie
          {t.roboty_budowlane.odsetek != null
            ? `, w robotach budowlanych ${Math.round(t.roboty_budowlane.odsetek * 100)}%`
            : ""}{" "}
          (Biuletyn Zamówień Publicznych, {t.ogolem.liczba} ogłoszeń o wykonaniu umowy).{" "}
          <Link to="/liczba">Szczegóły</Link>
        </Komunikat>
      ) : null}

      {blad ? <Komunikat typ="blad">{blad}</Komunikat> : null}
      {laduje && !dane ? <Ladowanie /> : null}

      <h2>Terminy, które mieszkańcy oceniają teraz</h2>
      {dane && aktywne.length === 0 ? <p className="pusto">Brak otwartych pytań w kategorii „miasto”.</p> : null}
      {aktywne.length > 0 ? (
        <div className="tabela-owijka">
          <table className="tabela">
            <thead>
              <tr>
                <th>Co</th>
                <th>Termin oficjalny</th>
                <th>Mieszkańcy: że zdążą</th>
                <th>Po terminie / wstrzymane</th>
                <th>Prognoz</th>
                <th>Powody niewiary</th>
                <th>Komentarz urzędu</th>
              </tr>
            </thead>
            <tbody>
              {aktywne.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/pytanie/${p.id}`}>{p.tresc}</Link>
                    <div className="pomoc">{p.kryterium}</div>
                  </td>
                  <td>
                    {formatujDate(p.termin)}
                    {p.liczba_zmian_terminu > 0 ? (
                      <div className="pomoc">zmieniany {odmien(p.liczba_zmian_terminu, "raz", "razy", "razy")}</div>
                    ) : null}
                  </td>
                  <td className="liczba">{p.kursy ? procent(p.kursy[0]) : `ukryty (${p.liczba_prognoz}/${p.prog_widocznosci})`}</td>
                  <td className="liczba">
                    {p.kursy ? `${procent(p.kursy[1])} / ${procent(p.kursy[2])}` : "–"}
                  </td>
                  <td className="liczba">{p.liczba_prognoz}</td>
                  <td style={{ minWidth: 220 }}>
                    <Powody rozklad={powody.filter((r) => r.pytanie === p.id)} />
                  </td>
                  <td>{p.komentarz_urzedu ?? <span className="pusto">brak</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {zakonczone.length > 0 ? (
        <>
          <h2>Rozstrzygnięte</h2>
          <div className="tabela-owijka">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Co</th>
                  <th>Termin oficjalny</th>
                  <th>Wynik</th>
                  <th>Mieszkańcy dawali</th>
                  <th>Powody</th>
                  <th>Komentarz urzędu</th>
                </tr>
              </thead>
              <tbody>
                {zakonczone.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/pytanie/${p.id}`}>{p.tresc}</Link>
                    </td>
                    <td>{formatujDate(p.termin)}</td>
                    <td>
                      {p.status === "rozstrzygniete" && p.wynik ? (
                        <>
                          <b>{p.odpowiedzi[p.wynik - 1]}</b>
                          {p.link_rozstrzygniecia ? (
                            <div className="pomoc">
                              <a href={p.link_rozstrzygniecia} target="_blank" rel="noreferrer">
                                źródło
                              </a>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        "unieważnione"
                      )}
                    </td>
                    <td className="liczba">
                      {p.wynik && p.kursy ? `${procent(p.kursy[p.wynik - 1])} na ten wynik` : "–"}
                    </td>
                    <td style={{ minWidth: 220 }}>
                      <Powody rozklad={powody.filter((r) => r.pytanie === p.id)} />
                    </td>
                    <td>{p.komentarz_urzedu ?? <span className="pusto">brak</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <p className="stopka">
        Kurs jest ukryty, dopóki pytanie ma mniej niż 10 prognoz. Dane odświeżają się co 5 sekund. Gra toczy się o
        punkty, których nie da się kupić, wymienić ani przekazać.
      </p>
    </main>
  );
}
