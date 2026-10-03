import { Link } from "react-router-dom";
import { pobierzPytania } from "@/api/api";
import { procent } from "@/api/lmsr";
import type { Pytanie } from "@/api/types";
import { usePolling } from "@/ui/hooks";
import { Komunikat, Ladowanie, Odznaka, OdznakaStatusu, formatujDate, opisKursu } from "@/ui/komponenty";
import { odmien } from "@/ui/tekst";

function Pozycja({ p }: { p: Pytanie }) {
  return (
    <Link to={`/pytanie/${p.id}`} className="karta karta-link">
      <div className="wiersz" style={{ justifyContent: "space-between" }}>
        <span style={{ flex: "0 0 auto" }}>
          <Odznaka kategoria={p.kategoria} />
        </span>
        <span style={{ flex: "0 0 auto" }}>
          <OdznakaStatusu status={p.status} />
        </span>
      </div>
      <div className="tresc">{p.tresc}</div>
      <div className="meta">
        <span>
          <b>{opisKursu(p)}</b>
        </span>
        <span>{odmien(p.liczba_prognoz, "prognoza", "prognozy", "prognoz")}</span>
        <span>do {formatujDate(p.termin)}</span>
      </div>
    </Link>
  );
}

function Rozstrzygniete({ p }: { p: Pytanie }) {
  const wynik = p.wynik;
  const kursWyniku = wynik && p.kursy ? p.kursy[wynik - 1] : null;
  const tlumTrafil = wynik && p.kursy ? p.kursy[wynik - 1] === Math.max(...p.kursy) : null;
  return (
    <Link to={`/pytanie/${p.id}`} className="karta karta-link">
      <div className="wiersz" style={{ justifyContent: "space-between" }}>
        <span style={{ flex: "0 0 auto" }}>
          <Odznaka kategoria={p.kategoria} />
        </span>
        <span style={{ flex: "0 0 auto" }}>
          <OdznakaStatusu status={p.status} />
        </span>
      </div>
      <div className="tresc">{p.tresc}</div>
      {p.status === "rozstrzygniete" && wynik ? (
        <div className="meta">
          <span>
            Wynik: <b>{p.odpowiedzi[wynik - 1]}</b>
          </span>
          <span>
            Mieszkańcy dawali <b>{procent(kursWyniku)}</b>
          </span>
          <span className={tlumTrafil ? "trafione" : "chybione"}>
            {tlumTrafil ? "✓ tłum trafił" : "✗ tłum się pomylił"}
          </span>
        </div>
      ) : (
        <div className="meta">
          <span>unieważnione, punkty zwrócone</span>
        </div>
      )}
    </Link>
  );
}

export default function Lista() {
  const { dane, blad, laduje } = usePolling(pobierzPytania, 5000);
  const pytania = dane ?? [];
  const aktywne = (k: Pytanie["kategoria"]) =>
    pytania.filter((p) => p.kategoria === k && (p.status === "otwarte" || p.status === "zamkniete"));
  const miasto = aktywne("miasto");
  const luz = aktywne("luz");
  const zakonczone = pytania
    .filter((p) => p.status === "rozstrzygniete" || p.status === "uniewaznione")
    .sort((a, b) => (b.rozstrzygnieto ?? "").localeCompare(a.rozstrzygnieto ?? ""));

  return (
    <main className="ekran">
      {blad ? <Komunikat typ="blad">{blad}</Komunikat> : null}
      {laduje && !dane ? <Ladowanie /> : null}

      <h2>Miasto</h2>
      <p className="mala">Czy miejski termin zostanie dotrzymany? Podajesz też powód.</p>
      {miasto.length === 0 && dane ? <p className="pusto">Na razie brak otwartych pytań.</p> : null}
      {miasto.map((p) => (
        <Pozycja key={p.id} p={p} />
      ))}

      <h2>Na luzie</h2>
      <p className="mala">Lekkie pytania o miasto, sprawdzalne w publicznym źródle.</p>
      {luz.length === 0 && dane ? <p className="pusto">Na razie brak otwartych pytań.</p> : null}
      {luz.map((p) => (
        <Pozycja key={p.id} p={p} />
      ))}

      {zakonczone.length > 0 ? (
        <>
          <h2>Rozstrzygnięte</h2>
          <p className="mala">Jak trafne były prognozy mieszkańców.</p>
          {zakonczone.map((p) => (
            <Rozstrzygniete key={p.id} p={p} />
          ))}
        </>
      ) : null}

      <p className="stopka">
        Masz pomysł na pytanie? <Link to="/zaproponuj">Zaproponuj je</Link>. Kursy odświeżają się co 5 sekund.
      </p>
    </main>
  );
}
