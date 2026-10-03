import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { zaproponujPytanie } from "@/api/api";
import { ZASADY_PYTANIA, type Kategoria } from "@/api/types";
import { useAkcja } from "@/ui/hooks";
import { Komunikat } from "@/ui/komponenty";

/** Formularz propozycji pytania od gracza: trafia do kolejki admina. */
export default function Zaproponuj() {
  const [kategoria, setKategoria] = useState<Kategoria>("luz");
  const [tresc, setTresc] = useState("");
  const [termin, setTermin] = useState("");
  const [link, setLink] = useState("");
  const [wyslano, setWyslano] = useState(false);
  const { wykonaj, trwa, blad } = useAkcja(zaproponujPytanie);

  const wyslij = async (e: FormEvent) => {
    e.preventDefault();
    const id = await wykonaj({ tresc: tresc.trim(), kategoria, termin, link: link.trim() });
    if (id) {
      setWyslano(true);
      setTresc("");
      setLink("");
      setTermin("");
    }
  };

  const szablon = kategoria === "miasto" ? "Zdążą z [co] do [data]?" : "Czy [co] do [data]?";

  return (
    <main className="ekran">
      <p>
        <Link to="/">← Wszystkie pytania</Link>
      </p>
      <h1>Zaproponuj pytanie</h1>
      <p className="mala">
        Pytanie musi dać się jednoznacznie sprawdzić w publicznym źródle. Admin uzupełni kryterium i otworzy je.
      </p>
      {wyslano ? <Komunikat typ="ok">Dzięki! Propozycja trafiła do kolejki admina.</Komunikat> : null}
      <form onSubmit={wyslij} className="karta">
        <div className="pole">
          <span className="etykieta">Kategoria</span>
          <div className="powody">
            <button type="button" className={kategoria === "miasto" ? "wybrany" : ""} onClick={() => setKategoria("miasto")}>
              miasto (termin)
            </button>
            <button type="button" className={kategoria === "luz" ? "wybrany" : ""} onClick={() => setKategoria("luz")}>
              na luzie
            </button>
          </div>
        </div>
        <label className="pole">
          <span className="etykieta">Treść ({szablon})</span>
          <input type="text" value={tresc} onChange={(e) => setTresc(e.target.value)} placeholder={szablon} maxLength={200} required />
        </label>
        <label className="pole">
          <span className="etykieta">Data rozstrzygnięcia</span>
          <input type="date" value={termin} onChange={(e) => setTermin(e.target.value)} required />
        </label>
        <label className="pole">
          <span className="etykieta">Link do publicznego źródła</span>
          <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" required />
        </label>
        <p className="pomoc">Każdy temat jest dozwolony. Zasady: {ZASADY_PYTANIA.join("; ")}.</p>
        {blad ? <Komunikat typ="blad">{blad}</Komunikat> : null}
        <button className="przycisk" type="submit" disabled={trwa}>
          {trwa ? "Wysyłam…" : "Wyślij propozycję"}
        </button>
      </form>
    </main>
  );
}
