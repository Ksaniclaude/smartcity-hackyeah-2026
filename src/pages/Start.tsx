import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useSesja } from "@/api/sesja";

/** Gość wszedł na /profil, /zaproponuj albo /admin: od razu otwieramy rejestrację
 *  (albo formularz nicku, gdy konto e-mail nie ma jeszcze nicku). */
export default function Start() {
  const { konto, otworzModal } = useSesja();
  useEffect(() => {
    otworzModal(konto ? "nick" : "konto", konto ? null : "rejestracja");
  }, [konto, otworzModal]);
  return (
    <main className="ekran">
      <h1 className="start-tytul">
        Czy miasto zdąży<span>?</span>
      </h1>
      <p className="mala">
        Rynek prognoz dla Krakowa. Mieszkańcy stawiają punkty na to, czy urząd dotrzyma terminu, a kurs pokazuje, ile w to
        wierzą.
      </p>
      <div className="karta">
        <h3>{konto ? "Jeszcze nick" : "Ten ekran wymaga konta"}</h3>
        <p className="mala">
          {konto
            ? "Jesteś zalogowany. Nick zobaczą inni gracze przy Twoich prognozach."
            : "Załóż konto (nick, e-mail, hasło) i dostań 1000 punktów albo zaloguj się, jeśli już je masz."}
        </p>
        <div className="przyciski">
          {konto ? (
            <button type="button" className="przycisk przycisk-glowny" onClick={() => otworzModal("nick")}>
              Podaj nick
            </button>
          ) : (
            <>
              <button type="button" className="przycisk przycisk-glowny" onClick={() => otworzModal("konto", "rejestracja")}>
                Zarejestruj się
              </button>
              <button type="button" className="przycisk przycisk-glowny przycisk-drugi" onClick={() => otworzModal("konto", "logowanie")}>
                Zaloguj się
              </button>
            </>
          )}
        </div>
      </div>
      <p className="stopka">
        <Link to="/">Wróć do rynków</Link>
      </p>
    </main>
  );
}
