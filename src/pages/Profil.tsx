import { Link } from "react-router-dom";
import { pobierzMojePozycje } from "@/api/api";
import { procent } from "@/api/lmsr";
import { useSesja } from "@/api/sesja";
import { ETYKIETY_STATUSU } from "@/api/types";
import { usePolling } from "@/ui/hooks";
import { Komunikat, Ladowanie, Odznaka, formatujDate } from "@/ui/komponenty";
import { punkty } from "@/ui/tekst";

export default function Profil() {
  const { gracz } = useSesja();
  const { dane, blad, laduje } = usePolling(pobierzMojePozycje, 5000);
  const pozycje = dane ?? [];
  const rozstrzygniete = pozycje.filter((p) => p.status === "rozstrzygniete");
  const trafione = rozstrzygniete.filter((p) => p.trafione).length;

  return (
    <main className="ekran">
      <h1>{gracz?.nick}</h1>
      <div className="zestawienie">
        <div>
          <div className="etykieta">Saldo</div>
          <div className="wartosc">{punkty(Math.floor(gracz?.saldo ?? 0))}</div>
        </div>
        <div>
          <div className="etykieta">Trafność</div>
          <div className="wartosc">
            trafił {trafione} z {rozstrzygniete.length}
          </div>
        </div>
      </div>
      <p className="mala">
        Punktów nie da się kupić ani wymienić. Liczy się tylko to, czy wiesz lepiej niż tłum.
      </p>

      {blad ? <Komunikat typ="blad">{blad}</Komunikat> : null}
      {laduje && !dane ? <Ladowanie /> : null}

      <h2>Twoje prognozy</h2>
      {dane && pozycje.length === 0 ? (
        <p className="pusto">
          Jeszcze nic nie prognozujesz. <Link to="/">Wybierz pytanie</Link>.
        </p>
      ) : null}
      {pozycje.map((p) => (
        <Link to={`/pytanie/${p.pytanie}`} className="karta karta-link" key={p.pytanie}>
          <Odznaka kategoria={p.kategoria} />{" "}
          {p.status !== "otwarte" ? <span className="odznaka odznaka-status">{ETYKIETY_STATUSU[p.status]}</span> : null}
          <div className="tresc">{p.tresc}</div>
          <div className="meta">
            <span>
              Twój typ: <b>{p.odpowiedzi[p.odpowiedz_glowna - 1]}</b>
            </span>
            <span>wydane {punkty(p.wydane)}</span>
            {p.status === "rozstrzygniete" && p.wynik ? (
              <span className={p.trafione ? "trafione" : "chybione"}>
                {p.trafione ? `trafione, +${p.wyplata.toFixed(1)} pkt` : `chybione (było: ${p.odpowiedzi[p.wynik - 1]})`}
              </span>
            ) : p.kursy ? (
              <span>kurs {procent(p.kursy[p.odpowiedz_glowna - 1])}</span>
            ) : (
              <span>do {formatujDate(p.termin)}</span>
            )}
          </div>
        </Link>
      ))}
    </main>
  );
}
