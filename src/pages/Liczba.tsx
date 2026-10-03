import { Link } from "react-router-dom";
import { terminowosc } from "@/dane/terminowosc";
import { Komunikat } from "@/ui/komponenty";

/** Liczba z zamówień publicznych: jaki odsetek umów wykonano w pierwotnym terminie. */
export default function Liczba() {
  const t = terminowosc;
  const odsetek = t.ogolem.odsetek;
  return (
    <main className="ekran">
      <p>
        <Link to="/">← Zdążą?</Link>
      </p>
      {odsetek == null ? (
        <>
          <h1>Ile umów miasto wykonuje w terminie?</h1>
          <Komunikat typ="ostrz">
            Brak przeliczonych danych. Uruchom <code>npm run zamowienia</code> (pobiera ogłoszenia o wykonaniu umowy
            z Biuletynu Zamówień Publicznych) albo <code>npm run terminowosc</code> (liczy z ręcznie wypełnionego
            pliku <code>data/umowy.csv</code>). Liczb nie wymyślamy.
          </Komunikat>
        </>
      ) : (
        <>
          <div className="wielka-liczba">{Math.round(odsetek * 100)}%</div>
          <h1>umów krakowskich jednostek miejskich wykonano w pierwotnym terminie</h1>
          <p className="mala">
            {t.ogolem.w_terminie} z {t.ogolem.liczba} ogłoszeń o wykonaniu umowy
            {t.zakres ? `, ${t.zakres.od} – ${t.zakres.do}` : ""}.
          </p>
          {t.roboty_budowlane.odsetek != null ? (
            <div className="zestawienie">
              <div>
                <div className="etykieta">Roboty budowlane</div>
                <div className="wartosc">{Math.round(t.roboty_budowlane.odsetek * 100)}%</div>
                <div className="pomoc">
                  {t.roboty_budowlane.w_terminie} z {t.roboty_budowlane.liczba} umów
                </div>
              </div>
              <div>
                <div className="etykieta">Kurs otwarcia pytań „miasto”</div>
                <div className="wartosc">{Math.round(odsetek * 100)}%</div>
                <div className="pomoc">tyle na start dostaje odpowiedź „w terminie”</div>
              </div>
            </div>
          ) : null}
        </>
      )}

      {t.zamawiajacy.length > 0 ? (
        <details>
          <summary>Zamawiający ({t.zamawiajacy.length})</summary>
          <ul className="lista-prosta">
            {t.zamawiajacy.map((z) => (
              <li key={z}>{z}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {t.wykonawcy.length > 0 ? (
        <>
          <h2>Wykonawcy</h2>
          <div className="tabela-owijka">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Wykonawca</th>
                  <th>Umów</th>
                  <th>W terminie</th>
                </tr>
              </thead>
              <tbody>
                {t.wykonawcy.slice(0, 30).map((w) => (
                  <tr key={w.wykonawca}>
                    <td>{w.wykonawca}</td>
                    <td className="liczba">{w.umowy}</td>
                    <td className="liczba">
                      {w.w_terminie} ({Math.round((w.w_terminie / w.umowy) * 100)}%)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <p className="stopka">
        Źródło: {t.zrodlo}
        {t.wygenerowano ? ` Przeliczono ${new Date(t.wygenerowano).toLocaleString("pl-PL")}.` : ""}
      </p>
      {t.uwagi.length > 0 ? (
        <ul className="lista-prosta stopka">
          {t.uwagi.map((u, i) => (
            <li key={i}>{u}</li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
