import { Link } from "react-router-dom";
import { FormularzNicku } from "@/ui/komponenty";

/** Ekran nicku dla gościa, który wszedł na /profil, /zaproponuj albo /admin. */
export default function Start() {
  return (
    <main className="ekran">
      <h1 className="start-tytul">
        Czy miasto zdąży<span>?</span>
      </h1>
      <p className="mala">
        Rynek prognoz dla Krakowa. Mieszkańcy stawiają punkty na to, czy urząd dotrzyma terminu, a kurs pokazuje, ile w to
        wierzą. Żeby wejść na ten ekran, podaj nick.
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
      <div className="karta">
        <FormularzNicku etykietaPrzycisku="Zaczynam prognozować" />
      </div>
      <p className="stopka">
        Bez e-maila i danych osobowych. Sesja zostaje w tej przeglądarce. <Link to="/">Wróć do rynków</Link>
      </p>
    </main>
  );
}
