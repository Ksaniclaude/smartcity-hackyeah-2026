import { Link, useParams, useSearchParams } from "react-router-dom";
import { pobierzProfilPubliczny } from "@/api/api";
import { procent } from "@/api/lmsr";
import { useSesja, useUruchomSesje } from "@/api/sesja";
import type { PozycjaPubliczna } from "@/api/types";
import { usePolling } from "@/ui/hooks";
import { Awatar, Komunikat, Ladowanie, Odznaka, OdznakaMiejsca, OdznakaStatusu, ZyskStrata, formatujDate } from "@/ui/komponenty";
import { liczba, odmien, pkt } from "@/ui/tekst";
import { WpisAktywnosci, klasaTypu } from "@/pages/Aktywnosc";

type Tab = "pozycje" | "aktywnosc";

/** Kolumna „Kurs”: bieżący kurs typu, a po rozstrzygnięciu wynik pozycji. */
function KursPozycji({ p }: { p: PozycjaPubliczna }) {
  if (p.status === "rozstrzygniete" && p.wynik) {
    return p.wynik === p.odpowiedz ? <span className="trafione">trafione</span> : <span className="chybione">chybione</span>;
  }
  if (p.status === "uniewaznione") return <span className="mala">zwrot</span>;
  if (p.kurs == null) return <span className="mala">ukryty</span>;
  return <>{procent(p.kurs)}</>;
}

/** Publiczny profil gracza (/u/:nick): statystyki, pozycje i aktywność. Bez logowania. */
export default function ProfilPubliczny() {
  const { nick = "" } = useParams<{ nick: string }>();
  useUruchomSesje();
  const { gracz } = useSesja();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "aktywnosc" ? "aktywnosc" : "pozycje";
  const { dane: p, blad, laduje } = usePolling(() => pobierzProfilPubliczny(nick), 10000, nick);
  const toJa = p != null && gracz?.nick === p.nick;

  const ustawTab = (t: Tab) => {
    const nowe = new URLSearchParams(params);
    if (t === "pozycje") nowe.delete("tab");
    else nowe.set("tab", t);
    setParams(nowe, { replace: true });
  };

  return (
    <main className="kontener">
      {blad ? <Komunikat typ="blad">{blad}</Komunikat> : null}
      {laduje && !p ? <Ladowanie /> : null}
      {!laduje && !p && !blad ? (
        <>
          <h1>Nie ma gracza o nicku „{nick}”</h1>
          <p className="mala">
            Sprawdź pisownię albo zajrzyj do <Link to="/ranking">rankingu</Link>.
          </p>
        </>
      ) : null}

      {p ? (
        <>
          <div className="profil-naglowek">
            <Awatar nick={p.nick} duzy />
            <div>
              <h1>
                {p.nick} <OdznakaMiejsca miejsce={p.miejsce} duza />
              </h1>
              <div className="pod">
                {p.miejsce != null ? `${p.miejsce}. miejsce w rankingu · ` : ""}Gra od {formatujDate(p.utworzono)}
                {toJa ? (
                  <>
                    {" · "}
                    <Link to="/profil">To Ty. Przejdź do portfela</Link>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div className="staty">
            <div className="stat">
              <div className="etykieta">Wartość pozycji</div>
              <div className="wartosc">{pkt(Math.round(p.wartosc_pozycji))}</div>
              <div className="pod">udziały po bieżącym kursie</div>
            </div>
            <div className="stat">
              <div className="etykieta">Największa wygrana</div>
              <div className="wartosc">{p.rozstrzygniete > 0 ? pkt(Math.round(p.najwieksza_wygrana)) : "–"}</div>
              <div className="pod">{p.rozstrzygniete > 0 ? "na jednym rynku" : "brak rozstrzygniętych rynków"}</div>
            </div>
            <div className="stat">
              <div className="etykieta">Prognoz</div>
              <div className="wartosc">{liczba(p.prognozy)}</div>
              <div className="pod">obrót {pkt(Math.round(p.obrot))}</div>
            </div>
            <div className="stat">
              <div className="etykieta">Trafność</div>
              <div className="wartosc">{p.rozstrzygniete > 0 ? `${p.trafione} z ${p.rozstrzygniete}` : "–"}</div>
              <div className="pod">
                {p.rozstrzygniete > 0
                  ? odmien(p.rozstrzygniete, "rozstrzygnięty rynek", "rozstrzygnięte rynki", "rozstrzygniętych rynków")
                  : "brak rozstrzygniętych rynków"}
              </div>
            </div>
          </div>

          <div className="zakladki" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "pozycje"} className={tab === "pozycje" ? "aktywna" : ""} onClick={() => ustawTab("pozycje")}>
              Pozycje{p.pozycje.length > 0 ? <span className="licznik">{p.pozycje.length}</span> : null}
            </button>
            <button type="button" role="tab" aria-selected={tab === "aktywnosc"} className={tab === "aktywnosc" ? "aktywna" : ""} onClick={() => ustawTab("aktywnosc")}>
              Aktywność{p.aktywnosc.length > 0 ? <span className="licznik">{p.aktywnosc.length}</span> : null}
            </button>
          </div>

          {tab === "pozycje" ? (
            p.pozycje.length === 0 ? (
              <p className="pusto">Ten gracz nie ma jeszcze żadnej pozycji.</p>
            ) : (
              <table className="tabela tabela-pozycje">
                <thead>
                  <tr>
                    <th>Rynek</th>
                    <th>Typ</th>
                    <th className="liczba">Udziały</th>
                    <th className="liczba">Kurs</th>
                    <th className="liczba">Wartość</th>
                    <th className="liczba">Zysk/strata</th>
                  </tr>
                </thead>
                <tbody>
                  {p.pozycje.map((z) => (
                    <tr key={`${z.pytanie}-${z.odpowiedz}`}>
                      <td className="kol-rynek">
                        <Link to={`/pytanie/${z.pytanie}`}>{z.tresc}</Link>
                        <div className="pomoc">
                          <Odznaka kategoria={z.kategoria} /> <OdznakaStatusu status={z.status} />
                        </div>
                      </td>
                      <td data-etykieta="Typ">
                        <span className={klasaTypu(z.odpowiedz - 1)}>{z.odpowiedzi[z.odpowiedz - 1]}</span>
                      </td>
                      <td className="liczba" data-etykieta="Udziały">
                        {liczba(z.udzialy, 1)}
                      </td>
                      <td className="liczba" data-etykieta="Kurs">
                        <KursPozycji p={z} />
                      </td>
                      <td className="liczba" data-etykieta="Wartość">
                        {liczba(z.wartosc, 1)} pkt
                      </td>
                      <td className="liczba" data-etykieta="Zysk/strata">
                        {z.status === "uniewaznione" ? <span className="mala">zwrot</span> : <ZyskStrata wartosc={z.wartosc - z.wydane} miejsca={1} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : p.aktywnosc.length === 0 ? (
            <p className="pusto">Ten gracz nie postawił jeszcze punktów.</p>
          ) : (
            <div className="waska">
              {p.aktywnosc.map((a) => (
                <WpisAktywnosci key={a.id} wpis={a} />
              ))}
            </div>
          )}
        </>
      ) : null}
    </main>
  );
}
