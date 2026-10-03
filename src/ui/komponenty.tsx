import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import type { Kategoria, Status } from "@/api/types";
import { ETYKIETY_STATUSU } from "@/api/types";
import { procent } from "@/api/lmsr";

export function Odznaka({ kategoria }: { kategoria: Kategoria }) {
  return (
    <span className={`odznaka odznaka-${kategoria}`}>{kategoria === "miasto" ? "Miasto" : "Na luzie"}</span>
  );
}

export function OdznakaStatusu({ status }: { status: Status }) {
  if (status === "otwarte") return null;
  return <span className="odznaka odznaka-status">{ETYKIETY_STATUSU[status]}</span>;
}

export function Komunikat({ typ, children }: { typ: "blad" | "ok" | "info" | "ostrz"; children: ReactNode }) {
  return <div className={`komunikat komunikat-${typ}`}>{children}</div>;
}

export function Ladowanie({ tekst = "Ładowanie…" }: { tekst?: string }) {
  return <div className="ladowanie">{tekst}</div>;
}

export function Data({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <>–</>;
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return <>{d.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" })}</>;
}

export function formatujDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
}

export function Naglowek({ nick, saldo }: { nick?: string; saldo?: number }) {
  return (
    <header className="naglowek">
      <Link to="/" className="logo">
        Zdążą?
      </Link>
      {nick ? (
        <Link to="/profil" className="saldo">
          {nick} · <b>{Math.floor(saldo ?? 0)}</b> pkt
        </Link>
      ) : null}
    </header>
  );
}

export function DolnaNawigacja() {
  const klasa = ({ isActive }: { isActive: boolean }) => (isActive ? "aktywny" : "");
  return (
    <nav className="dol-nav">
      <NavLink to="/" end className={klasa}>
        <span className="ikona">❓</span>Pytania
      </NavLink>
      <NavLink to="/profil" className={klasa}>
        <span className="ikona">🎯</span>Profil
      </NavLink>
      <NavLink to="/miasto" className={klasa}>
        <span className="ikona">🏛️</span>Miasto
      </NavLink>
    </nav>
  );
}

/** Lista odpowiedzi z paskami kursów (tylko do odczytu). */
export function Kursy({
  odpowiedzi,
  kursy,
  wynik,
}: {
  odpowiedzi: string[];
  kursy: number[] | null;
  wynik?: number | null;
}) {
  return (
    <div className="odpowiedzi">
      {odpowiedzi.map((o, i) => {
        const k = kursy ? kursy[i] : null;
        return (
          <div key={i} className={`odpowiedz ${wynik === i + 1 ? "trafiona" : ""}`}>
            {k != null ? <span className="pasek" style={{ width: `${Math.round(k * 100)}%` }} /> : null}
            <span className="nazwa">
              {o}
              {wynik === i + 1 ? " ✓" : ""}
            </span>
            <span className="kurs">{procent(k)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Krótki opis kursu do listy: "zdążą 41%" albo "kurs ukryty (3/10 prognoz)". */
export function opisKursu(p: {
  kategoria: Kategoria;
  kursy: number[] | null;
  kurs_widoczny: boolean;
  liczba_prognoz: number;
  prog_widocznosci: number;
  odpowiedzi: string[];
}): string {
  if (!p.kurs_widoczny || !p.kursy) {
    return `kurs ukryty do ${p.prog_widocznosci} prognoz (${p.liczba_prognoz}/${p.prog_widocznosci})`;
  }
  if (p.kategoria === "miasto") return `${procent(p.kursy[0])}, że zdążą`;
  return `${p.odpowiedzi[0]} ${procent(p.kursy[0])}`;
}
