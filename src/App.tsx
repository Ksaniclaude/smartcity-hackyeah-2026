import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { SesjaProvider, useSesja, useUruchomSesje } from "@/api/sesja";
import Admin from "@/pages/Admin";
import Liczba from "@/pages/Liczba";
import Lista from "@/pages/Lista";
import Miasto from "@/pages/Miasto";
import Profil from "@/pages/Profil";
import Pytanie from "@/pages/Pytanie";
import Qr from "@/pages/Qr";
import Start from "@/pages/Start";
import Zaproponuj from "@/pages/Zaproponuj";
import { DolnaNawigacja, Komunikat, Ladowanie, Naglowek } from "@/ui/komponenty";

/** Ekrany gracza: logowanie anonimowe, a bez nicku ekran startowy. */
function WymagaGracza({ children }: { children: ReactNode }) {
  useUruchomSesje();
  const { stan, blad, uruchom } = useSesja();
  if (stan === "nowa" || stan === "laduje") return <Ladowanie tekst="Łączę z miastem…" />;
  if (stan === "blad") {
    return (
      <main className="ekran">
        <Komunikat typ="blad">{blad}</Komunikat>
        <button className="przycisk" type="button" onClick={uruchom}>
          Spróbuj ponownie
        </button>
      </main>
    );
  }
  if (stan === "brak_nicku") return <Start />;
  return <>{children}</>;
}

function Uklad() {
  const { gracz } = useSesja();
  const { pathname } = useLocation();
  const pelnyEkran = pathname === "/qr";
  return (
    <div className="aplikacja">
      {!pelnyEkran ? <Naglowek nick={gracz?.nick} saldo={gracz?.saldo} /> : null}
      <Routes>
        <Route
          path="/"
          element={
            <WymagaGracza>
              <Lista />
            </WymagaGracza>
          }
        />
        <Route
          path="/pytanie/:id"
          element={
            <WymagaGracza>
              <Pytanie />
            </WymagaGracza>
          }
        />
        <Route
          path="/profil"
          element={
            <WymagaGracza>
              <Profil />
            </WymagaGracza>
          }
        />
        <Route
          path="/zaproponuj"
          element={
            <WymagaGracza>
              <Zaproponuj />
            </WymagaGracza>
          }
        />
        <Route
          path="/admin"
          element={
            <WymagaGracza>
              <Admin />
            </WymagaGracza>
          }
        />
        <Route path="/miasto" element={<Miasto />} />
        <Route path="/liczba" element={<Liczba />} />
        <Route path="/qr" element={<Qr />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!pelnyEkran ? <DolnaNawigacja /> : null}
    </div>
  );
}

export default function App() {
  return (
    <SesjaProvider>
      <Uklad />
    </SesjaProvider>
  );
}
