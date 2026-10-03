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

export function formatujDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
}

export function Naglowek({ nick, saldo }: { nick?: string; saldo?: number }) {
  return (
    <header className="naglowek">
      <Link to="/" className="logo">
        Zdążą<span>?</span>
      </Link>
      <nav className="naglowek-nav">
        <NavLink to="/" end className={({ isActive }) => (isActive ? "aktywny" : "")}>
          Rynki
        </NavLink>
        <NavLink to="/miasto" className={({ isActive }) => (isActive ? "aktywny" : "")}>
          Widok dla miasta
        </NavLink>
        <NavLink to="/liczba" className={({ isActive }) => (isActive ? "aktywny" : "")}>
          Liczba
        </NavLink>
        <NavLink to="/profil" className={({ isActive }) => (isActive ? "aktywny" : "")}>
          Profil
        </NavLink>
      </nav>
      {nick ? (
        <Link to="/profil" className="saldo">
          {nick} <b>{Math.floor(saldo ?? 0)} pkt</b>
        </Link>
      ) : null}
    </header>
  );
}

function IkonaLista() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}
function IkonaProfil() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}
function IkonaMiasto() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6M9 12h.01M15 12h.01" />
    </svg>
  );
}

export function DolnaNawigacja() {
  const klasa = ({ isActive }: { isActive: boolean }) => (isActive ? "aktywny" : "");
  return (
    <nav className="dol-nav">
      <NavLink to="/" end className={klasa}>
        <IkonaLista />
        Rynki
      </NavLink>
      <NavLink to="/profil" className={klasa}>
        <IkonaProfil />
        Profil
      </NavLink>
      <NavLink to="/miasto" className={klasa}>
        <IkonaMiasto />
        Miasto
      </NavLink>
    </nav>
  );
}

/** Pasek podziału kursów (tak / nie / trzecia odpowiedź) z legendą. */
export function PasekRynku({ odpowiedzi, kursy }: { odpowiedzi: string[]; kursy: number[] | null }) {
  const klasy = ["tak", "nie", "trzeci"];
  if (!kursy) {
    return (
      <div className="pasek-rynku">
        <i style={{ width: "100%", background: "#eef0f3" }} />
      </div>
    );
  }
  return (
    <>
      <div className="pasek-rynku">
        {kursy.map((k, i) => (
          <i key={i} className={klasy[i] ?? "trzeci"} style={{ width: `${Math.max(0, k * 100)}%` }} />
        ))}
      </div>
      <div className="legenda">
        {odpowiedzi.map((o, i) => (
          <span key={i} className={klasy[i] ?? "trzeci"}>
            <i />
            {o} {procent(kursy[i])}
          </span>
        ))}
      </div>
    </>
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
          <div key={i} className={`odpowiedz o-${i + 1} ${wynik === i + 1 ? "trafiona" : ""}`}>
            {k != null ? <span className="pasek" style={{ width: `${Math.round(k * 100)}%` }} /> : null}
            <span className="nazwa">
              {o}
              {wynik === i + 1 ? " — wynik" : ""}
            </span>
            <span className="kurs">{procent(k)}</span>
          </div>
        );
      })}
    </div>
  );
}
