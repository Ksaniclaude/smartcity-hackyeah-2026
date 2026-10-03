import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useSesja } from "@/api/sesja";
import { useAkcja } from "@/ui/hooks";
import { Komunikat } from "@/ui/komponenty";
import { terminowosc } from "@/dane/terminowosc";

/** Pierwszy ekran: nick i zasady w trzech punktach. */
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
      <h1 className="start-tytul">
        Czy miasto zdąży<span>?</span>
      </h1>
      <p>
        Rynek prognoz dla Krakowa. Mieszkańcy stawiają punkty na to, czy urząd dotrzyma terminu, a kurs pokazuje,
        ile w to wierzą.
      </p>
      <div className="start-zasady">
        <div>
          <b>1</b>
          <span>Dostajesz 1000 punktów. Stawiasz je na odpowiedzi, kurs się przesuwa.</span>
        </div>
        <div>
          <b>2</b>
          <span>Każdy udział trafionej odpowiedzi wypłaca 1 punkt. Rozstrzygamy według publicznego źródła.</span>
        </div>
        <div>
          <b>3</b>
          <span>
            <strong>Punktów nie da się kupić ani wymienić.</strong> Udział jest darmowy, nagród nie ma.
          </span>
        </div>
      </div>
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
