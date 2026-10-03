import { useEffect, useRef, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { SesjaProvider, useSesja, useUruchomSesje } from "@/api/sesja";
import Admin from "@/pages/Admin";
import Aktywnosc from "@/pages/Aktywnosc";
import Lista from "@/pages/Lista";
import Miasto from "@/pages/Miasto";
import Profil from "@/pages/Profil";
import ProfilPubliczny from "@/pages/ProfilPubliczny";
import Pytanie from "@/pages/Pytanie";
import Qr from "@/pages/Qr";
import Ranking from "@/pages/Ranking";
import Start from "@/pages/Start";
import Zaproponuj from "@/pages/Zaproponuj";
import { DolnaNawigacja, Komunikat, Ladowanie, Modale, Naglowek, StopkaStrony } from "@/ui/komponenty";
import { Nagrody, PostepProvider } from "@/ui/postep";
import { useEfektyDotyku } from "@/ui/zywe";

/** Ekrany wymagające gracza z nickiem (profil, propozycje, admin). Rynki są publiczne. */
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
  useUruchomSesje();
  useEfektyDotyku();
  const { pathname } = useLocation();
  const { stan, konto, gracz, modal, otworzModal } = useSesja();
  const pelnyEkran = pathname === "/qr";
  // Konto e-mail bez nicku (np. zaraz po kliknięciu w link potwierdzający): raz otwieramy okno nicku.
  const pytanoONick = useRef(false);
  useEffect(() => {
    if (stan === "brak_nicku" && konto && !gracz && modal === null && !pytanoONick.current) {
      pytanoONick.current = true;
      otworzModal("nick");
    }
  }, [stan, konto, gracz, modal, otworzModal]);
  return (
    <div className="aplikacja">
      {!pelnyEkran ? <Naglowek /> : null}
      <Nagrody />
      <Routes>
        <Route path="/" element={<Lista />} />
        <Route path="/pytanie/:id" element={<Pytanie />} />
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
        <Route path="/u/:nick" element={<ProfilPubliczny />} />
        <Route path="/ranking" element={<Ranking />} />
        <Route path="/aktywnosc" element={<Aktywnosc />} />
        <Route path="/miasto" element={<Miasto />} />
        <Route path="/liczba" element={<Navigate to="/" replace />} />
        <Route path="/start" element={<Navigate to="/" replace />} />
        <Route path="/qr" element={<Qr />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!pelnyEkran ? <StopkaStrony /> : null}
      {!pelnyEkran ? <DolnaNawigacja /> : null}
      <Modale />
    </div>
  );
}

export default function App() {
  return (
    <SesjaProvider>
      <PostepProvider>
        <Uklad />
      </PostepProvider>
    </SesjaProvider>
  );
}
