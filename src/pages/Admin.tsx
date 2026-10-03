import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  adminDodajPytanie,
  adminEdytujPytanie,
  adminKomentarzUrzedu,
  adminOtworz,
  adminPytania,
  adminRozstrzygnij,
  adminUniewaznij,
  adminUstawProg,
  adminUstawProgDomyslny,
  adminZaloguj,
  adminZamknij,
  adminZmienTermin,
} from "@/api/api";
import { procent } from "@/api/lmsr";
import { useSesja } from "@/api/sesja";
import { ETYKIETY_STATUSU, TEMATY_WYKLUCZONE, type Kategoria, type PytanieAdmin } from "@/api/types";
import { terminowosc } from "@/dane/terminowosc";
import { useAkcja, usePolling } from "@/ui/hooks";
import { Komunikat, Ladowanie, Odznaka, formatujDate } from "@/ui/komponenty";

const ODPOWIEDZI: Record<Kategoria, string[]> = {
  miasto: ["w terminie", "po terminie", "wstrzymane lub anulowane"],
  luz: ["tak", "nie"],
};
const SZABLON: Record<Kategoria, string> = {
  miasto: "Zdążą z [co] do [data]?",
  luz: "Czy [co] do [data]?",
};

/** Kurs otwarcia w procentach: "miasto" z liczby z zamówień publicznych, "na luzie" 50/50. */
function domyslnyKurs(kategoria: Kategoria): number[] {
  if (kategoria === "luz") return [50, 50];
  const p = terminowosc.ogolem.odsetek;
  if (p == null) return [34, 33, 33];
  const wTerminie = Math.round(p * 100);
  const wstrzymane = Math.min(10, Math.round(((100 - wTerminie) / 3) * 10) / 10);
  return [wTerminie, Math.round((100 - wTerminie - wstrzymane) * 10) / 10, wstrzymane];
}

function kursyZProcentow(proc: number[]): number[] {
  return proc.map((x) => x / 100);
}

function sumaProc(proc: number[]): number {
  return Math.round(proc.reduce((s, x) => s + x, 0) * 10) / 10;
}

// ---------------------------------------------------------------------------

function LogowanieAdmina({ poZalogowaniu }: { poZalogowaniu: () => Promise<void> }) {
  const [haslo, setHaslo] = useState("");
  const { wykonaj, trwa, blad, setBlad } = useAkcja(adminZaloguj);
  const wyslij = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await wykonaj(haslo);
    if (ok === false) setBlad("Złe hasło");
    if (ok) await poZalogowaniu();
  };
  return (
    <main className="ekran">
      <h1>Panel admina</h1>
      <p className="mala">Hasło admina ustawia się w bazie (patrz README). Po zalogowaniu to konto ma prawa admina.</p>
      <form onSubmit={wyslij} className="karta">
        <label className="pole">
          <span className="etykieta">Hasło</span>
          <input type="password" value={haslo} onChange={(e) => setHaslo(e.target.value)} autoFocus required />
        </label>
        {blad ? <Komunikat typ="blad">{blad}</Komunikat> : null}
        <button className="przycisk" type="submit" disabled={trwa || !haslo}>
          Zaloguj
        </button>
      </form>
    </main>
  );
}

// ---------------------------------------------------------------------------

function PoleKursu({
  kategoria,
  proc,
  onChange,
}: {
  kategoria: Kategoria;
  proc: number[];
  onChange: (p: number[]) => void;
}) {
  const suma = sumaProc(proc);
  return (
    <div className="pole">
      <span className="etykieta">Kurs otwarcia (%)</span>
      <div className="wiersz">
        {ODPOWIEDZI[kategoria].map((o, i) => (
          <label key={o}>
            <span className="pomoc">{o}</span>
            <input
              type="number"
              min={1}
              max={98}
              step={0.1}
              value={proc[i] ?? ""}
              onChange={(e) => {
                const n = [...proc];
                n[i] = Number(e.target.value);
                onChange(n);
              }}
              style={{ width: "100%", font: "inherit", padding: 8, borderRadius: 8, border: "1px solid #c9d1d9" }}
            />
          </label>
        ))}
      </div>
      <div className="pomoc" style={{ color: Math.abs(suma - 100) > 0.11 ? "var(--zle)" : undefined }}>
        suma: {suma}% {Math.abs(suma - 100) > 0.11 ? "(musi być 100%)" : ""}
        {kategoria === "miasto" && terminowosc.ogolem.odsetek != null
          ? ` · „w terminie” z zamówień publicznych: ${Math.round(terminowosc.ogolem.odsetek * 100)}%`
          : ""}
      </div>
    </div>
  );
}

function FormularzDodawania({ poDodaniu }: { poDodaniu: () => Promise<void> }) {
  const [kategoria, setKategoria] = useState<Kategoria>("miasto");
  const [tresc, setTresc] = useState("");
  const [kryterium, setKryterium] = useState("");
  const [link, setLink] = useState("");
  const [termin, setTermin] = useState("");
  const [proc, setProc] = useState<number[]>(() => domyslnyKurs("miasto"));
  const [otworz, setOtworz] = useState(true);
  const [ok, setOk] = useState<string | null>(null);
  const { wykonaj, trwa, blad } = useAkcja(adminDodajPytanie);

  const zmienKategorie = (k: Kategoria) => {
    setKategoria(k);
    setProc(domyslnyKurs(k));
  };
  const sumaOk = Math.abs(sumaProc(proc) - 100) <= 0.11;
  const komplet = tresc.trim() && kryterium.trim() && link.trim() && termin && sumaOk;

  const wyslij = async (e: FormEvent) => {
    e.preventDefault();
    if (!komplet) return;
    const id = await wykonaj({
      tresc: tresc.trim(),
      kategoria,
      odpowiedzi: ODPOWIEDZI[kategoria],
      kryterium: kryterium.trim(),
      link_zrodla: link.trim(),
      termin,
      kurs_otwarcia: kursyZProcentow(proc),
      otworz,
    });
    if (id) {
      setOk(`Dodano pytanie nr ${id}${otworz ? " i otwarto" : " (propozycja)"}.`);
      setTresc("");
      setKryterium("");
      setLink("");
      setTermin("");
      await poDodaniu();
    }
  };

  return (
    <form onSubmit={wyslij} className="karta">
      <h2 style={{ marginTop: 0 }}>Dodaj pytanie</h2>
      <div className="pole">
        <span className="etykieta">Kategoria</span>
        <div className="powody">
          <button type="button" className={kategoria === "miasto" ? "wybrany" : ""} onClick={() => zmienKategorie("miasto")}>
            miasto (3 odpowiedzi)
          </button>
          <button type="button" className={kategoria === "luz" ? "wybrany" : ""} onClick={() => zmienKategorie("luz")}>
            na luzie (tak / nie)
          </button>
        </div>
      </div>
      <label className="pole">
        <span className="etykieta">Treść · szablon: {SZABLON[kategoria]}</span>
        <input type="text" value={tresc} onChange={(e) => setTresc(e.target.value)} placeholder={SZABLON[kategoria]} maxLength={200} required />
      </label>
      <div className="pole">
        <span className="etykieta">Odpowiedzi</span>
        <div>{ODPOWIEDZI[kategoria].join(" · ")}</div>
      </div>
      <label className="pole">
        <span className="etykieta">Kryterium rozstrzygnięcia (co dokładnie sprawdzimy)</span>
        <textarea value={kryterium} onChange={(e) => setKryterium(e.target.value)} required />
      </label>
      <label className="pole">
        <span className="etykieta">Link do publicznego źródła</span>
        <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" required />
      </label>
      <label className="pole">
        <span className="etykieta">{kategoria === "miasto" ? "Termin oficjalny (data rozstrzygnięcia)" : "Data rozstrzygnięcia"}</span>
        <input type="date" value={termin} onChange={(e) => setTermin(e.target.value)} required />
      </label>
      <PoleKursu kategoria={kategoria} proc={proc} onChange={setProc} />
      <label className="pole" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" checked={otworz} onChange={(e) => setOtworz(e.target.checked)} />
        <span>otwórz od razu (limit: 3 „miasto”, 5 „na luzie”)</span>
      </label>
      <Komunikat typ="ostrz">
        Tematy wykluczone: {TEMATY_WYKLUCZONE.join(", ")}. Bez kryterium, linku i daty pytania nie da się otworzyć.
      </Komunikat>
      {blad ? <Komunikat typ="blad">{blad}</Komunikat> : null}
      {ok ? <Komunikat typ="ok">{ok}</Komunikat> : null}
      <button className="przycisk" type="submit" disabled={trwa || !komplet}>
        {trwa ? "Zapisuję…" : otworz ? "Dodaj i otwórz" : "Dodaj jako propozycję"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------

function KartaPytania({ p, odswiez }: { p: PytanieAdmin; odswiez: () => Promise<void> }) {
  const kursy = useMemo(() => {
    const m = Math.max(...p.q.map((x) => x / p.b));
    const e = p.q.map((x) => Math.exp(x / p.b - m));
    const s = e.reduce((a, b) => a + b, 0);
    return e.map((x) => x / s);
  }, [p.q, p.b]);

  const [wynik, setWynik] = useState<number>(1);
  const [linkWyniku, setLinkWyniku] = useState("");
  const [komentarz, setKomentarz] = useState(p.komentarz_urzedu ?? "");
  const [nowyTermin, setNowyTermin] = useState("");
  const [linkTerminu, setLinkTerminu] = useState("");
  const [powodUniewaznienia, setPowodUniewaznienia] = useState("");
  const [prog, setProg] = useState<string>(p.prog_widocznosci == null ? "" : String(p.prog_widocznosci));
  const [proc, setProc] = useState<number[]>(() => kursy.map((k) => Math.round(k * 1000) / 10));
  const [edycja, setEdycja] = useState({
    tresc: p.tresc,
    kryterium: p.kryterium,
    link_zrodla: p.link_zrodla,
    termin: p.termin,
  });
  const [info, setInfo] = useState<string | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [trwa, setTrwa] = useState(false);

  const akcja = async (nazwa: string, fn: () => Promise<unknown>) => {
    setTrwa(true);
    setBlad(null);
    setInfo(null);
    try {
      const r = await fn();
      setInfo(`${nazwa}: OK${r && typeof r === "object" ? " " + JSON.stringify(r) : ""}`);
      await odswiez();
    } catch (e) {
      setBlad(e instanceof Error ? e.message : String(e));
    } finally {
      setTrwa(false);
    }
  };

  const koniec = p.status === "rozstrzygniete" || p.status === "uniewaznione";
  const sumaOk = Math.abs(sumaProc(proc) - 100) <= 0.11;

  return (
    <div className="karta">
      <div className="wiersz" style={{ justifyContent: "space-between" }}>
        <span style={{ flex: "0 0 auto" }}>
          <Odznaka kategoria={p.kategoria} /> <span className="odznaka odznaka-status">{ETYKIETY_STATUSU[p.status]}</span>
        </span>
        <span className="pomoc" style={{ flex: "0 0 auto" }}>
          nr {p.id}
        </span>
      </div>
      <div className="tresc">
        <Link to={`/pytanie/${p.id}`}>{p.tresc}</Link>
      </div>
      <div className="meta">
        <span>termin: {formatujDate(p.termin)}</span>
        <span>{p.liczba_prognoz} prognoz</span>
        <span>
          kursy:{" "}
          {p.odpowiedzi.map((o, i) => (
            <span key={o}>
              {i > 0 ? " · " : ""}
              {o} <b>{procent(kursy[i])}</b>
            </span>
          ))}
        </span>
        {p.wynik ? (
          <span>
            wynik: <b>{p.odpowiedzi[p.wynik - 1]}</b>
          </span>
        ) : null}
      </div>
      {!p.kryterium || !p.link_zrodla ? (
        <Komunikat typ="ostrz">Brakuje kryterium lub linku do źródła: uzupełnij przed otwarciem.</Komunikat>
      ) : null}

      <details>
        <summary>Akcje</summary>

        {p.status === "propozycja" ? (
          <>
            <h3>Uzupełnij i otwórz</h3>
            <label className="pole">
              <span className="etykieta">Treść</span>
              <input type="text" value={edycja.tresc} onChange={(e) => setEdycja({ ...edycja, tresc: e.target.value })} />
            </label>
            <label className="pole">
              <span className="etykieta">Kryterium rozstrzygnięcia</span>
              <textarea value={edycja.kryterium} onChange={(e) => setEdycja({ ...edycja, kryterium: e.target.value })} />
            </label>
            <label className="pole">
              <span className="etykieta">Link do publicznego źródła</span>
              <input type="url" value={edycja.link_zrodla} onChange={(e) => setEdycja({ ...edycja, link_zrodla: e.target.value })} />
            </label>
            <label className="pole">
              <span className="etykieta">Data rozstrzygnięcia</span>
              <input type="date" value={edycja.termin} onChange={(e) => setEdycja({ ...edycja, termin: e.target.value })} />
            </label>
            <PoleKursu kategoria={p.kategoria} proc={proc} onChange={setProc} />
            <div className="przyciski">
              <button
                type="button"
                className="przycisk przycisk-maly przycisk-drugi"
                disabled={trwa}
                onClick={() =>
                  akcja("Zapisano", () =>
                    adminEdytujPytanie({
                      pytanie: p.id,
                      tresc: edycja.tresc,
                      odpowiedzi: null,
                      kryterium: edycja.kryterium,
                      link_zrodla: edycja.link_zrodla,
                      termin: edycja.termin,
                    }),
                  )
                }
              >
                Zapisz zmiany
              </button>
              <button
                type="button"
                className="przycisk przycisk-maly"
                disabled={trwa || !sumaOk}
                onClick={() =>
                  akcja("Otwarto", async () => {
                    await adminEdytujPytanie({
                      pytanie: p.id,
                      tresc: edycja.tresc,
                      odpowiedzi: null,
                      kryterium: edycja.kryterium,
                      link_zrodla: edycja.link_zrodla,
                      termin: edycja.termin,
                    });
                    await adminOtworz(p.id, kursyZProcentow(proc));
                  })
                }
              >
                Otwórz
              </button>
            </div>
          </>
        ) : null}

        {p.status === "otwarte" ? (
          <div className="przyciski">
            <button type="button" className="przycisk przycisk-maly przycisk-drugi" disabled={trwa} onClick={() => akcja("Zamknięto", () => adminZamknij(p.id))}>
              Zamknij (koniec prognoz)
            </button>
          </div>
        ) : null}

        {p.status === "otwarte" || p.status === "zamkniete" ? (
          <>
            <h3>Rozstrzygnij</h3>
            <div className="wiersz">
              <label className="pole">
                <span className="etykieta">Wynik</span>
                <select value={wynik} onChange={(e) => setWynik(Number(e.target.value))}>
                  {p.odpowiedzi.map((o, i) => (
                    <option key={o} value={i + 1}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pole">
                <span className="etykieta">Link do źródła rozstrzygnięcia</span>
                <input type="url" value={linkWyniku} onChange={(e) => setLinkWyniku(e.target.value)} placeholder="https://…" />
              </label>
            </div>
            <div className="przyciski">
              <button
                type="button"
                className="przycisk przycisk-maly"
                disabled={trwa || !linkWyniku.trim()}
                onClick={() => {
                  if (window.confirm(`Rozstrzygnąć jako „${p.odpowiedzi[wynik - 1]}”? Wypłaty są nieodwracalne.`))
                    void akcja("Rozstrzygnięto", () => adminRozstrzygnij(p.id, wynik, linkWyniku.trim()));
                }}
              >
                Rozstrzygnij i wypłać
              </button>
            </div>

            <h3>Zmień termin oficjalny</h3>
            <div className="wiersz">
              <label className="pole">
                <span className="etykieta">Nowy termin</span>
                <input type="date" value={nowyTermin} onChange={(e) => setNowyTermin(e.target.value)} />
              </label>
              <label className="pole">
                <span className="etykieta">Link do źródła zmiany</span>
                <input type="url" value={linkTerminu} onChange={(e) => setLinkTerminu(e.target.value)} placeholder="https://…" />
              </label>
            </div>
            <div className="przyciski">
              <button
                type="button"
                className="przycisk przycisk-maly przycisk-drugi"
                disabled={trwa || !nowyTermin || !linkTerminu.trim()}
                onClick={() => akcja("Zmieniono termin", () => adminZmienTermin(p.id, nowyTermin, linkTerminu.trim()))}
              >
                Zapisz nowy termin
              </button>
            </div>
          </>
        ) : null}

        {!koniec ? (
          <>
            <h3>Unieważnij (zwrot punktów)</h3>
            <label className="pole">
              <span className="etykieta">Powód (trafi do komentarza urzędu)</span>
              <input type="text" value={powodUniewaznienia} onChange={(e) => setPowodUniewaznienia(e.target.value)} />
            </label>
            <div className="przyciski">
              <button
                type="button"
                className="przycisk przycisk-maly przycisk-zle"
                disabled={trwa}
                onClick={() => {
                  if (window.confirm("Unieważnić pytanie i zwrócić punkty?"))
                    void akcja("Unieważniono", () => adminUniewaznij(p.id, powodUniewaznienia));
                }}
              >
                Unieważnij
              </button>
            </div>
          </>
        ) : null}

        {!koniec ? (
          <>
            <h3>Próg ukrycia kursu</h3>
            <div className="wiersz">
              <label className="pole">
                <span className="etykieta">Kurs tłumu widoczny od N prognoz (puste = domyślny próg gry)</span>
                <input type="number" min={1} value={prog} onChange={(e) => setProg(e.target.value)} placeholder="domyślny" />
              </label>
            </div>
            <div className="przyciski">
              <button
                type="button"
                className="przycisk przycisk-maly przycisk-drugi"
                disabled={trwa}
                onClick={() => akcja("Zapisano próg", () => adminUstawProg(p.id, prog.trim() === "" ? null : Number(prog)))}
              >
                Zapisz próg
              </button>
            </div>
          </>
        ) : null}

        <h3>Komentarz urzędu</h3>
        <label className="pole">
          <textarea value={komentarz} onChange={(e) => setKomentarz(e.target.value)} placeholder="np. termin przesunięty aneksem nr 3 z powodu…" />
        </label>
        <div className="przyciski">
          <button type="button" className="przycisk przycisk-maly przycisk-drugi" disabled={trwa} onClick={() => akcja("Zapisano komentarz", () => adminKomentarzUrzedu(p.id, komentarz))}>
            Zapisz komentarz
          </button>
        </div>

        {blad ? <Komunikat typ="blad">{blad}</Komunikat> : null}
        {info ? <Komunikat typ="ok">{info}</Komunikat> : null}
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Domyślny próg ukrycia kursu dla wszystkich rynków (zapis w ustawieniach; na demo 1). */
function ProgDomyslny() {
  const [prog, setProg] = useState("2");
  const [ok, setOk] = useState<string | null>(null);
  const { wykonaj, trwa, blad } = useAkcja(adminUstawProgDomyslny);
  return (
    <form
      className="karta"
      onSubmit={async (e) => {
        e.preventDefault();
        const n = await wykonaj(Number(prog));
        if (n != null) setOk(`Domyślny próg: kurs tłumu widoczny od ${n} ${n === 1 ? "prognozy" : "prognoz"}.`);
      }}
    >
      <h2 style={{ marginTop: 0 }}>Próg ukrycia kursu</h2>
      <p className="mala">
        Kurs tłumu jest ukryty, dopóki rynek ma mniej prognoz niż próg (domyślnie 2; na demo 1). Próg per rynek ustawia się w karcie
        pytania.
      </p>
      <div className="wiersz">
        <label className="pole">
          <span className="etykieta">Domyślny próg (liczba prognoz)</span>
          <input type="number" min={1} value={prog} onChange={(e) => setProg(e.target.value)} required />
        </label>
      </div>
      {blad ? <Komunikat typ="blad">{blad}</Komunikat> : null}
      {ok ? <Komunikat typ="ok">{ok}</Komunikat> : null}
      <button className="przycisk przycisk-maly" type="submit" disabled={trwa || !prog}>
        Zapisz domyślny próg
      </button>
    </form>
  );
}

function PanelAdmina() {
  const { dane, blad, laduje, odswiez } = usePolling(adminPytania, 5000);
  const pytania = dane ?? [];
  const grupy: { tytul: string; filtr: (p: PytanieAdmin) => boolean }[] = [
    { tytul: "Propozycje (kolejka)", filtr: (p) => p.status === "propozycja" },
    { tytul: "Otwarte", filtr: (p) => p.status === "otwarte" },
    { tytul: "Zamknięte, czekają na rozstrzygnięcie", filtr: (p) => p.status === "zamkniete" },
    { tytul: "Zakończone", filtr: (p) => p.status === "rozstrzygniete" || p.status === "uniewaznione" },
  ];
  return (
    <main className="ekran">
      <h1>Panel admina</h1>
      <p className="mala">
        Otwarte naraz: najwyżej 3 pytania „miasto” i 5 „na luzie”. Rozstrzygnięcie wymaga linku do źródła. <Link to="/miasto">Widok dla miasta</Link>
      </p>
      <FormularzDodawania poDodaniu={odswiez} />
      <ProgDomyslny />
      {blad ? <Komunikat typ="blad">{blad}</Komunikat> : null}
      {laduje && !dane ? <Ladowanie /> : null}
      {grupy.map((g) => {
        const lista = pytania.filter(g.filtr);
        return (
          <section key={g.tytul}>
            <h2>
              {g.tytul} ({lista.length})
            </h2>
            {lista.length === 0 ? <p className="pusto">brak</p> : null}
            {lista.map((p) => (
              <KartaPytania key={p.id} p={p} odswiez={odswiez} />
            ))}
          </section>
        );
      })}
    </main>
  );
}

export default function Admin() {
  const { gracz, odswiezGracza } = useSesja();
  if (!gracz?.czy_admin) return <LogowanieAdmina poZalogowaniu={odswiezGracza} />;
  return <PanelAdmina />;
}
