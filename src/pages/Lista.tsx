import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { pobierzPytania } from "@/api/api";
import { procent } from "@/api/lmsr";
import { useSesja, useUruchomSesje } from "@/api/sesja";
import type { Pytanie } from "@/api/types";
import { usePolling } from "@/ui/hooks";
import { Komunikat, Ladowanie, Odznaka, OdznakaStatusu, PasekRynku, formatujDate } from "@/ui/komponenty";
import { odmien } from "@/ui/tekst";

type Filtr = "wszystkie" | "miasto" | "luz" | "rozstrzygniete";

const FILTRY: { klucz: Filtr; etykieta: string }[] = [
  { klucz: "wszystkie", etykieta: "Wszystkie" },
  { klucz: "miasto", etykieta: "Miasto" },
  { klucz: "luz", etykieta: "Na luzie" },
  { klucz: "rozstrzygniete", etykieta: "Rozstrzygnięte" },
];

/** Karta rynku jak na giełdzie prognoz: tytuł, kurs, przyciski odpowiedzi. */
function Rynek({ p }: { p: Pytanie }) {
  const navigate = useNavigate();
  const k = p.kursy ? p.kursy[0] : null;
  const klasy = ["przycisk-tak", "przycisk-zle", "przycisk-trzeci"];
  const otwarte = p.status === "otwarte";
  return (
    <div className="karta rynek-karta">
      <Link to={`/pytanie/${p.id}`} className="rynek-link">
        <div className="rynek">
          <div>
            <Odznaka kategoria={p.kategoria} /> <OdznakaStatusu status={p.status} />
            <div className="tresc">{p.tresc}</div>
          </div>
          <div className={`kurs-duzy ${k == null ? "kurs-ukryty" : "kurs-tak"}`}>
            <b>{k == null ? "–" : procent(k)}</b>
            <span>{p.kategoria === "miasto" ? "że zdążą" : "szansa na tak"}</span>
          </div>
        </div>
        <PasekRynku odpowiedzi={p.odpowiedzi} kursy={p.kursy} />
      </Link>
      {otwarte ? (
        <div className={`odpowiedzi-szybkie o${p.odpowiedzi.length}`}>
          {p.odpowiedzi.map((o, i) => (
            <button
              type="button"
              key={i}
              className={`przycisk-odp ${klasy[i]}`}
              onClick={() => navigate(`/pytanie/${p.id}?odp=${i + 1}`)}
            >
              {o}
              {p.kursy ? <span>{procent(p.kursy[i])}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      <div className="meta" style={{ marginTop: 10 }}>
        {!p.kurs_widoczny && otwarte ? <span>kurs ukryty do {p.prog_widocznosci} prognoz</span> : null}
        <span>{odmien(p.liczba_prognoz, "prognoza", "prognozy", "prognoz")}</span>
        <span>do {formatujDate(p.termin)}</span>
      </div>
    </div>
  );
}

function Rozstrzygniete({ p }: { p: Pytanie }) {
  const wynik = p.wynik;
  const kursWyniku = wynik && p.kursy ? p.kursy[wynik - 1] : null;
  const tlumTrafil = wynik && p.kursy ? p.kursy[wynik - 1] === Math.max(...p.kursy) : null;
  return (
    <Link to={`/pytanie/${p.id}`} className="karta karta-link">
      <div className="rynek">
        <div>
          <Odznaka kategoria={p.kategoria} /> <OdznakaStatusu status={p.status} />
          <div className="tresc">{p.tresc}</div>
        </div>
        {p.status === "rozstrzygniete" && wynik ? (
          <div className={`kurs-duzy ${tlumTrafil ? "kurs-tak" : "kurs-nie"}`}>
            <b>{procent(kursWyniku)}</b>
            <span>na „{p.odpowiedzi[wynik - 1]}”</span>
          </div>
        ) : null}
      </div>
      {p.status === "rozstrzygniete" && wynik ? (
        <div className="meta">
          <span>
            Wynik: <b>{p.odpowiedzi[wynik - 1]}</b>
          </span>
          <span className={tlumTrafil ? "trafione" : "chybione"}>{tlumTrafil ? "tłum trafił" : "tłum się pomylił"}</span>
          <span>{odmien(p.liczba_prognoz, "prognoza", "prognozy", "prognoz")}</span>
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
  useUruchomSesje();
  const { stan } = useSesja();
  const [filtr, setFiltr] = useState<Filtr>("wszystkie");
  const { dane, blad, laduje } = usePolling(pobierzPytania, 5000);
  const pytania = dane ?? [];
  const aktywne = pytania.filter((p) => p.status === "otwarte" || p.status === "zamkniete");
  const miasto = aktywne.filter((p) => p.kategoria === "miasto");
  const luz = aktywne.filter((p) => p.kategoria === "luz");
  const zakonczone = pytania
    .filter((p) => p.status === "rozstrzygniete" || p.status === "uniewaznione")
    .sort((a, b) => (b.rozstrzygnieto ?? "").localeCompare(a.rozstrzygnieto ?? ""));

  const pokazMiasto = filtr === "wszystkie" || filtr === "miasto";
  const pokazLuz = filtr === "wszystkie" || filtr === "luz";
  const pokazZakonczone = filtr === "wszystkie" || filtr === "rozstrzygniete";

  return (
    <main className="ekran">
      <div className="filtry">
        {FILTRY.map((f) => (
          <button type="button" key={f.klucz} className={filtr === f.klucz ? "wybrany" : ""} onClick={() => setFiltr(f.klucz)}>
            {f.etykieta}
          </button>
        ))}
      </div>
      {stan === "brak_nicku" ? (
        <p className="mala" style={{ margin: "8px 0 0" }}>
          Przeglądasz jako gość. Nick podasz przy pierwszej prognozie. <b>Punktów nie da się kupić ani wymienić.</b>
        </p>
      ) : null}
      {stan === "blad" ? <Komunikat typ="ostrz">Nie udało się połączyć z sesją gracza. Rynki możesz przeglądać, prognoza wymaga połączenia.</Komunikat> : null}
      {blad ? <Komunikat typ="blad">{blad}</Komunikat> : null}
      {laduje && !dane ? <Ladowanie /> : null}

      {pokazMiasto ? (
        <>
          <h2>Miasto · czy termin zostanie dotrzymany</h2>
          {miasto.length === 0 && dane ? <p className="pusto">Na razie brak otwartych pytań.</p> : null}
          {miasto.map((p) => (
            <Rynek key={p.id} p={p} />
          ))}
        </>
      ) : null}

      {pokazLuz ? (
        <>
          <h2>Na luzie · szybkie pytania o miasto</h2>
          {luz.length === 0 && dane ? <p className="pusto">Na razie brak otwartych pytań.</p> : null}
          {luz.map((p) => (
            <Rynek key={p.id} p={p} />
          ))}
        </>
      ) : null}

      {pokazZakonczone && (zakonczone.length > 0 || filtr === "rozstrzygniete") ? (
        <>
          <h2>Rozstrzygnięte · trafność prognoz</h2>
          {zakonczone.length === 0 ? <p className="pusto">Jeszcze nic nie rozstrzygnięto.</p> : null}
          {zakonczone.map((p) => (
            <Rozstrzygniete key={p.id} p={p} />
          ))}
        </>
      ) : null}

      <p className="stopka">
        Masz pomysł na pytanie? <Link to="/zaproponuj">Zaproponuj je</Link>. Kursy odświeżają się co 5 sekund. Punktów nie
        da się kupić ani wymienić.
      </p>
    </main>
  );
}
