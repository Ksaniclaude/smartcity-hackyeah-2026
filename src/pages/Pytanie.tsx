import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { pobierzKomentarze, pobierzMojePozycje, pobierzPytanie, postawPrognoze } from "@/api/api";
import { podgladZakladu, procent } from "@/api/lmsr";
import { useSesja, useUruchomSesje } from "@/api/sesja";
import { POWODY, type Powod, type WynikZakladu } from "@/api/types";
import { useAkcja, usePolling } from "@/ui/hooks";
import { Komunikat, Kursy, Ladowanie, Odznaka, OdznakaStatusu, formatujDate } from "@/ui/komponenty";
import { odmien, punkty } from "@/ui/tekst";

const LIMIT_NA_PYTANIE = 200;
const SZYBKIE_STAWKI = [10, 25, 50, 100];

/** Nick podawany w miejscu formularza prognozy (gość klika „Tak”, dopiero wtedy się przedstawia). */
function FormularzNicku() {
  const { ustawNick } = useSesja();
  const [nick, setNick] = useState("");
  const { wykonaj, trwa, blad } = useAkcja(ustawNick);
  return (
    <form
      className="karta"
      onSubmit={(e) => {
        e.preventDefault();
        void wykonaj(nick.trim());
      }}
    >
      <h3>Żeby postawić, podaj nick</h3>
      <p className="mala">
        Dostaniesz 1000 punktów. Punktów nie da się kupić ani wymienić, udział jest darmowy, nagród nie ma.
      </p>
      <label className="pole">
        <span className="etykieta">Nick (tylko tyle o Tobie zapisujemy)</span>
        <input
          type="text"
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          placeholder="np. krowodrza_42"
          minLength={2}
          maxLength={24}
          autoFocus
          required
        />
      </label>
      {blad ? <Komunikat typ="blad">{blad}</Komunikat> : null}
      <button className="przycisk" type="submit" disabled={trwa || nick.trim().length < 2}>
        {trwa ? "Chwila…" : "Dalej"}
      </button>
    </form>
  );
}

export default function Pytanie() {
  useUruchomSesje();
  const { id } = useParams();
  const [params] = useSearchParams();
  const pid = Number(id);
  const { gracz, stan, odswiezGracza, uruchom } = useSesja();
  const { dane: p, blad: bladPytania, laduje } = usePolling(() => pobierzPytanie(pid), 5000, pid);
  const zalogowany = stan === "gotowy";
  const { dane: moje, odswiez: odswiezMoje } = usePolling(
    () => (zalogowany ? pobierzMojePozycje() : Promise.resolve([])),
    5000,
    `${pid}-${zalogowany}`,
  );
  const { dane: komentarze, odswiez: odswiezKomentarze } = usePolling(() => pobierzKomentarze(pid), 5000, pid);

  const [odp, setOdp] = useState<number | null>(null);
  const [stawka, setStawka] = useState(10);
  const [powod, setPowod] = useState<Powod | null>(null);
  const [komentarz, setKomentarz] = useState("");
  const [wynik, setWynik] = useState<WynikZakladu | null>(null);
  const { wykonaj, trwa, blad } = useAkcja(postawPrognoze);

  // Odpowiedź wybrana już na liście (przycisk „Tak” / „Nie” na karcie rynku).
  useEffect(() => {
    const z = Number(params.get("odp"));
    if (z >= 1 && z <= 3) setOdp(z);
  }, [params]);

  if (!p) {
    if (laduje) return <Ladowanie />;
    return (
      <main className="ekran">
        <Komunikat typ="blad">{bladPytania ?? "Nie ma takiego pytania."}</Komunikat>
        <Link to="/">← Wróć do rynków</Link>
      </main>
    );
  }

  const moja = moje?.find((m) => m.pytanie === pid);
  const wydane = Math.floor(moja?.wydane ?? 0);
  const saldo = Math.floor(gracz?.saldo ?? 0);
  const maks = Math.max(0, Math.min(LIMIT_NA_PYTANIE - wydane, saldo));
  const stawkaOk = Math.max(1, Math.min(stawka, Math.max(1, maks)));
  const otwarte = p.status === "otwarte";
  const miasto = p.kategoria === "miasto";
  const kursWybranej = odp != null && p.kursy ? p.kursy[odp - 1] : null;
  const podglad = kursWybranej != null ? podgladZakladu(kursWybranej, stawkaOk) : null;
  const brakPowodu = miasto && !powod;

  const wyslij = async (e: FormEvent) => {
    e.preventDefault();
    if (odp == null || maks < 1 || brakPowodu) return;
    const w = await wykonaj({
      pytanie: pid,
      odpowiedz: odp,
      stawka: stawkaOk,
      powod: miasto ? powod : null,
      komentarz: komentarz.trim(),
    });
    if (w) {
      setWynik(w);
      setKomentarz("");
      await Promise.all([odswiezGracza(), odswiezMoje(), odswiezKomentarze()]);
    }
  };

  return (
    <main className="ekran">
      <p>
        <Link to="/">← Wszystkie rynki</Link>
      </p>
      <div>
        <Odznaka kategoria={p.kategoria} /> <OdznakaStatusu status={p.status} />
      </div>
      <h1 style={{ marginTop: 8 }}>{p.tresc}</h1>

      {miasto ? (
        <div className="zestawienie">
          <div>
            <div className="etykieta">Oficjalnie</div>
            <div className="wartosc">{formatujDate(p.termin)}</div>
            {p.liczba_zmian_terminu > 0 ? (
              <div className="pomoc">termin zmieniany {odmien(p.liczba_zmian_terminu, "raz", "razy", "razy")}</div>
            ) : null}
          </div>
          <div>
            <div className="etykieta">Mieszkańcy</div>
            <div className="wartosc kurs-tak">{p.kursy ? `${procent(p.kursy[0])}, że zdążą` : "kurs ukryty"}</div>
            <div className="pomoc">{odmien(p.liczba_prognoz, "prognoza", "prognozy", "prognoz")}</div>
          </div>
        </div>
      ) : (
        <div className="zestawienie">
          <div>
            <div className="etykieta">Rozstrzygnięcie</div>
            <div className="wartosc">{formatujDate(p.termin)}</div>
          </div>
          <div>
            <div className="etykieta">Szansa na „{p.odpowiedzi[0]}”</div>
            <div className="wartosc kurs-tak">{p.kursy ? procent(p.kursy[0]) : "kurs ukryty"}</div>
            <div className="pomoc">{odmien(p.liczba_prognoz, "prognoza", "prognozy", "prognoz")}</div>
          </div>
        </div>
      )}

      <div className="karta">
        <div className="pomoc">Kryterium rozstrzygnięcia</div>
        <p>{p.kryterium}</p>
        <div className="pomoc">Publiczne źródło</div>
        <p style={{ wordBreak: "break-all", marginBottom: p.komentarz_urzedu ? 10 : 0 }}>
          <a href={p.link_zrodla} target="_blank" rel="noreferrer">
            {p.link_zrodla}
          </a>
        </p>
        {p.komentarz_urzedu ? (
          <>
            <div className="pomoc">Komentarz urzędu</div>
            <p style={{ marginBottom: 0 }}>{p.komentarz_urzedu}</p>
          </>
        ) : null}
      </div>

      {wynik ? (
        <Komunikat typ="ok">
          <big>
            Twoja prognoza przesunęła kurs z {procent(wynik.kurs_przed)} na {procent(wynik.kurs_po)}
          </big>
          Masz {wynik.udzialy.toFixed(1)} udziałów na „{p.odpowiedzi[wynik.odpowiedz - 1]}”. Jeśli trafisz, każdy
          udział wypłaci 1 punkt. Saldo: {punkty(wynik.saldo)}.
        </Komunikat>
      ) : null}

      {!p.kurs_widoczny && otwarte ? (
        <Komunikat typ="info">
          Kurs jest ukryty, dopóki pytanie ma mniej niż {p.prog_widocznosci} prognoz ({p.liczba_prognoz}/
          {p.prog_widocznosci}). Po swojej prognozie zobaczysz, jak go przesuwasz.
        </Komunikat>
      ) : null}

      {otwarte ? (
        <div>
          <h2>Twoja prognoza</h2>
          <div className="odpowiedzi">
            {p.odpowiedzi.map((o, i) => {
              const k = p.kursy ? p.kursy[i] : null;
              return (
                <button
                  type="button"
                  key={i}
                  className={`odpowiedz o-${i + 1} ${odp === i + 1 ? "wybrana" : ""}`}
                  onClick={() => setOdp(i + 1)}
                >
                  {k != null ? <span className="pasek" style={{ width: `${Math.round(k * 100)}%` }} /> : null}
                  <span className="nazwa">{o}</span>
                  <span className="kurs">{procent(k)}</span>
                </button>
              );
            })}
          </div>

          {stan === "brak_nicku" ? (
            <FormularzNicku />
          ) : stan === "blad" ? (
            <Komunikat typ="blad">
              Brak połączenia z sesją gracza.{" "}
              <button type="button" className="przycisk przycisk-maly przycisk-drugi" onClick={uruchom}>
                Spróbuj ponownie
              </button>
            </Komunikat>
          ) : stan !== "gotowy" ? (
            <Ladowanie tekst="Łączę z miastem…" />
          ) : (
            <form onSubmit={wyslij}>
              {maks < 1 ? (
                <Komunikat typ="ostrz">
                  {saldo < 1
                    ? "Nie masz już punktów. Poczekaj na rozstrzygnięcia."
                    : `Na jedno pytanie można wydać najwyżej ${LIMIT_NA_PYTANIE} punktów, a Ty masz już ${wydane}.`}
                </Komunikat>
              ) : (
                <label className="pole">
                  <span className="etykieta">Stawka</span>
                  <div className="stawka-wartosc">{punkty(stawkaOk)}</div>
                  <div className="szybkie">
                    {SZYBKIE_STAWKI.filter((s) => s <= maks).map((s) => (
                      <button type="button" key={s} className={stawkaOk === s ? "wybrany" : ""} onClick={() => setStawka(s)}>
                        {s}
                      </button>
                    ))}
                    <button type="button" className={stawkaOk === maks ? "wybrany" : ""} onClick={() => setStawka(maks)}>
                      maks
                    </button>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={maks}
                    value={stawkaOk}
                    onChange={(e) => setStawka(Number(e.target.value))}
                  />
                  <div className="pomoc">
                    Masz {punkty(saldo)}. Na to pytanie możesz wydać jeszcze {punkty(maks)}.
                    {podglad ? (
                      <>
                        {" "}
                        Przy tej stawce dostaniesz ok. {podglad.udzialy.toFixed(1)} udziałów (tyle punktów, jeśli
                        trafisz), a kurs przesunie się na {procent(podglad.kursPo)}.
                      </>
                    ) : null}
                  </div>
                </label>
              )}

              {miasto ? (
                <div className="pole">
                  <span className="etykieta">Dlaczego tak myślisz? (powód)</span>
                  <div className="powody">
                    {POWODY.map((r) => (
                      <button
                        type="button"
                        key={r.wartosc}
                        className={powod === r.wartosc ? "wybrany" : ""}
                        onClick={() => setPowod(r.wartosc)}
                      >
                        {r.etykieta}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <label className="pole">
                <span className="etykieta">Jedno zdanie komentarza (opcjonalnie)</span>
                <input
                  type="text"
                  maxLength={200}
                  value={komentarz}
                  onChange={(e) => setKomentarz(e.target.value)}
                  placeholder="np. wykonawca już raz prosił o aneks"
                />
              </label>

              {blad ? <Komunikat typ="blad">{blad}</Komunikat> : null}
              <button
                className={`przycisk ${odp === 1 ? "przycisk-tak" : odp === 2 ? "przycisk-zle" : ""}`}
                type="submit"
                disabled={trwa || odp == null || maks < 1 || brakPowodu}
              >
                {trwa
                  ? "Zapisuję…"
                  : odp == null
                    ? "Wybierz odpowiedź"
                    : brakPowodu
                      ? "Wybierz powód"
                      : `Stawiam ${punkty(stawkaOk)} na „${p.odpowiedzi[odp - 1]}”`}
              </button>
            </form>
          )}
        </div>
      ) : (
        <>
          <h2>{p.status === "rozstrzygniete" ? "Wynik" : "Kursy"}</h2>
          {p.status === "rozstrzygniete" && p.wynik ? (
            <Komunikat typ="info">
              Rozstrzygnięte: <b>{p.odpowiedzi[p.wynik - 1]}</b>. Mieszkańcy dawali na to{" "}
              <b>{procent(p.kursy ? p.kursy[p.wynik - 1] : null)}</b>.{" "}
              {p.link_rozstrzygniecia ? (
                <a href={p.link_rozstrzygniecia} target="_blank" rel="noreferrer">
                  Źródło rozstrzygnięcia
                </a>
              ) : null}
            </Komunikat>
          ) : null}
          {p.status === "uniewaznione" ? (
            <Komunikat typ="ostrz">Pytanie unieważnione, wydane punkty wróciły do graczy.</Komunikat>
          ) : null}
          {p.status === "zamkniete" ? <Komunikat typ="info">Pytanie zamknięte, czeka na rozstrzygnięcie.</Komunikat> : null}
          <Kursy odpowiedzi={p.odpowiedzi} kursy={p.kursy} wynik={p.wynik} />
        </>
      )}

      {moja ? (
        <div className="karta">
          <h3>Twoje prognozy na to pytanie</h3>
          <div className="meta">
            <span>
              wydane: <b>{punkty(moja.wydane)}</b>
            </span>
            <span>
              główny typ: <b>{p.odpowiedzi[moja.odpowiedz_glowna - 1]}</b>
            </span>
            {moja.trafione != null ? (
              <span className={moja.trafione ? "trafione" : "chybione"}>
                {moja.trafione ? `trafione, +${moja.wyplata.toFixed(1)} pkt` : "chybione"}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {komentarze && komentarze.length > 0 ? (
        <>
          <h2>Komentarze graczy</h2>
          {komentarze.map((k, i) => (
            <div className="komentarz" key={i}>
              <div className="kto">
                {p.odpowiedzi[k.odpowiedz - 1]}
                {k.powod ? ` · ${POWODY.find((r) => r.wartosc === k.powod)?.etykieta ?? k.powod}` : ""}
              </div>
              {k.komentarz}
            </div>
          ))}
        </>
      ) : null}
    </main>
  );
}
