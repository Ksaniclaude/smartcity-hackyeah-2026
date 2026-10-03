import { Link } from "react-router-dom";
import { useSesja } from "@/api/sesja";
import { FormularzNicku } from "@/ui/komponenty";

/** Gość wszedł na /profil, /zaproponuj albo /admin: konto e-mail jest potrzebne (a po zalogowaniu jeszcze nick). */
export default function Start() {
  const { konto, otworzModal } = useSesja();
  return (
    <main className="ekran">
      <h1 className="start-tytul">
        Czy miasto zdąży<span>?</span>
      </h1>
      <p className="mala">
        Rynek prognoz dla Krakowa. Mieszkańcy stawiają punkty na to, czy urząd dotrzyma terminu, a kurs pokazuje, ile w to
        wierzą.
      </p>
      <div className="start-zasady">
        <div>
          <b>1</b>
          <span>Zakładasz konto (nick, e-mail, hasło) i dostajesz 1000 punktów.</span>
        </div>
        <div>
          <b>2</b>
          <span>Stawiasz punkty na odpowiedzi, kurs się przesuwa. Udziały możesz sprzedać przed terminem.</span>
        </div>
        <div>
          <b>3</b>
          <span>
            Każdy udział trafionej odpowiedzi wypłaca 1 punkt. <strong>Punktów nie da się kupić ani wymienić.</strong>
          </span>
        </div>
      </div>
      {konto ? (
        <div className="karta">
          <h3>Jeszcze nick</h3>
          <p className="mala">Jesteś zalogowany. Nick zobaczą inni gracze przy Twoich prognozach.</p>
          <FormularzNicku etykietaPrzycisku="Zapisz nick" />
        </div>
      ) : (
        <div className="karta">
          <h3>Ten ekran wymaga konta</h3>
          <div className="przyciski">
            <button type="button" className="przycisk przycisk-glowny" onClick={() => otworzModal("konto", "rejestracja")}>
              Zarejestruj się
            </button>
            <button type="button" className="przycisk przycisk-glowny przycisk-drugi" onClick={() => otworzModal("konto", "logowanie")}>
              Zaloguj się
            </button>
          </div>
        </div>
      )}
      <p className="stopka">
        <Link to="/">Wróć do rynków</Link>
      </p>
    </main>
  );
}
