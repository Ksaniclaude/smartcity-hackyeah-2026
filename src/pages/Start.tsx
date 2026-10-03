import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useSesja } from "@/api/sesja";
import { useAkcja } from "@/ui/hooks";
import { Komunikat } from "@/ui/komponenty";
import { terminowosc } from "@/dane/terminowosc";

/** Pierwszy ekran: nick i zasady w trzech zdaniach. */
export default function Start() {
  const { ustawNick } = useSesja();
  const [nick, setNick] = useState("");
  const { wykonaj, trwa, blad } = useAkcja(ustawNick);

  const wyslij = (e: FormEvent) => {
    e.preventDefault();
    void wykonaj(nick.trim());
  };

  const odsetek = terminowosc.ogolem.odsetek;

  return (
    <main className="ekran">
      <h1>Zdążą?</h1>
      <p>
        Mieszkańcy prognozują punktami sprawdzalne pytania o swoje miasto: czy urząd dotrzyma terminu i czy
        jutro będzie czym oddychać.
      </p>
      <p>
        <b>Punktów nie da się kupić ani wymienić.</b> Udział jest darmowy, nagród nie ma. Dostajesz 1000 punktów na
        start, a każda trafiona prognoza je pomnaża.
      </p>
      {odsetek != null ? (
        <p className="mala">
          Tylko {Math.round(odsetek * 100)}% umów krakowskich jednostek miejskich wykonano w pierwotnym terminie.{" "}
          <Link to="/liczba">Skąd ta liczba?</Link>
        </p>
      ) : null}

      <form onSubmit={wyslij} className="karta">
        <label className="pole">
          <span className="etykieta">Twój nick (tylko tyle o Tobie zapisujemy)</span>
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
        {blad ? <Komunikat typ="blad">{blad}</Komunikat> : null}
        <button className="przycisk" type="submit" disabled={trwa || nick.trim().length < 2}>
          {trwa ? "Chwila…" : "Zaczynam prognozować"}
        </button>
      </form>

      <p className="stopka">
        Bez e-maila i danych osobowych. Sesja zostaje w tej przeglądarce. <Link to="/miasto">Widok dla miasta</Link>
      </p>
    </main>
  );
}
