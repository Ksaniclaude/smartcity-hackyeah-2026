import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const baza = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export const IkRynki = (p: P) => (
  <svg {...baza} {...p}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
  </svg>
);
export const IkMiasto = (p: P) => (
  <svg {...baza} {...p}>
    <path d="M3 21h18M5 21V8l5-3v16M10 21V11l6-3v13M16 21V13l3 1v7M7 11h.01M7 14h.01M7 17h.01M13 13h.01M13 16h.01" />
  </svg>
);
export const IkLuz = (p: P) => (
  <svg {...baza} {...p}>
    <path d="M13 3 5 13h6l-1 8 9-11h-6l1-7z" />
  </svg>
);
export const IkAktywnosc = (p: P) => (
  <svg {...baza} {...p}>
    <path d="M3 12h4l3-8 4 16 3-8h4" />
  </svg>
);
export const IkRanking = (p: P) => (
  <svg {...baza} {...p}>
    <path d="M8 21h8M12 17v4M6 4h12v3a6 6 0 0 1-12 0V4zM6 6H3v1a3 3 0 0 0 3 3M18 6h3v1a3 3 0 0 1-3 3" />
  </svg>
);
export const IkProfil = (p: P) => (
  <svg {...baza} {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
  </svg>
);
export const IkSzukaj = (p: P) => (
  <svg {...baza} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
export const IkSlonce = (p: P) => (
  <svg {...baza} {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
export const IkKsiezyc = (p: P) => (
  <svg {...baza} {...p}>
    <path d="M21 13A8.5 8.5 0 0 1 11 3a8.5 8.5 0 1 0 10 10z" />
  </svg>
);
export const IkZamknij = (p: P) => (
  <svg {...baza} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const IkLink = (p: P) => (
  <svg {...baza} {...p}>
    <path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
  </svg>
);
export const IkKalendarz = (p: P) => (
  <svg {...baza} {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);
export const IkZegar = (p: P) => (
  <svg {...baza} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
export const IkStrzalka = (p: P) => (
  <svg {...baza} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
/* ---------- udostępnianie ---------- */
export const IkUdostepnij = (p: P) => (
  <svg {...baza} {...p}>
    <path d="M12 15V3.5M7.5 8 12 3.5 16.5 8M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12" />
  </svg>
);
/** Relacja (pionowa plansza 9:16): obiektyw w zaokrąglonym kwadracie. */
export const IkRelacja = (p: P) => (
  <svg {...baza} {...p}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <path d="M17 7h.01" strokeWidth={2.4} />
  </svg>
);
export const IkWhatsApp = (p: P) => (
  <svg {...baza} {...p}>
    <path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.85L3.5 20.5l4.3-1.15A8.5 8.5 0 1 0 12 3.5z" />
    <path d="M9.3 8.3c-.5 1.1.2 2.9 1.7 4.4s3.3 2.2 4.4 1.7l.5-1.4-1.6-1-.9.7c-.7-.3-1.7-1.3-2-2l.7-.9-1-1.6z" fill="currentColor" strokeWidth={1} />
  </svg>
);
export const IkX = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
  </svg>
);
export const IkFacebook = (p: P) => (
  <svg {...baza} {...p}>
    <path d="M17 3h-2.5A4.5 4.5 0 0 0 10 7.5V10H7v4h3v7h4v-7h2.8l.7-4H14V7.8a.8.8 0 0 1 .8-.8H17z" />
  </svg>
);
export const IkTelegram = (p: P) => (
  <svg {...baza} {...p}>
    <path d="M21 3.5 10.5 13.5M21 3.5l-6.5 17-4-7-7-4z" />
  </svg>
);
export const IkKopiuj = (p: P) => (
  <svg {...baza} {...p}>
    <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5" />
    <path d="M15.5 5.5V5A1.5 1.5 0 0 0 14 3.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h.5" />
  </svg>
);
export const IkPobierz = (p: P) => (
  <svg {...baza} {...p}>
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />
  </svg>
);
export const IkWiecej = (p: P) => (
  <svg {...baza} strokeWidth={2.6} {...p}>
    <path d="M5.5 12h.01M12 12h.01M18.5 12h.01" />
  </svg>
);

/** Szewron w prawo; w lewo przez odbicie w arkuszu (.wstecz). */
export const IkSzewron = (p: P) => (
  <svg {...baza} strokeWidth={2.2} {...p}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);
export const IkInfo = (p: P) => (
  <svg {...baza} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);
export const IkPlus = (p: P) => (
  <svg {...baza} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IkPtaszek = (p: P) => (
  <svg {...baza} strokeWidth={2.4} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
export const IkPlomien = (p: P) => (
  <svg {...baza} {...p}>
    <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-1.6.6-2.8 1.5-3.8.3 1.5 1 2.3 2 2.8C10 9 10.5 6 12 3z" />
  </svg>
);
export const IkZamiana = (p: P) => (
  <svg {...baza} {...p}>
    <path d="M4 8h14l-3-3M20 16H6l3 3" />
  </svg>
);
export const IkDymek = (p: P) => (
  <svg {...baza} {...p}>
    <path d="M4 5h16v11H9l-5 4V5z" />
  </svg>
);
/** Trójkąt kierunku zmiany kursu (pełny, bez obrysu). */
export const IkGora = (p: P) => (
  <svg viewBox="0 0 10 8" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M5 0.5 9.5 7.5h-9z" />
  </svg>
);
export const IkDol = (p: P) => (
  <svg viewBox="0 0 10 8" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M5 7.5 0.5 0.5h9z" />
  </svg>
);
export const IkGwiazdka = ({ pelna = false, ...p }: P & { pelna?: boolean }) => (
  <svg {...baza} {...p} fill={pelna ? "currentColor" : "none"}>
    <path d="m12 3 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.4l-5.7 3.1 1.2-6.4L2.8 9.7l6.4-.8L12 3z" />
  </svg>
);

/* ---------- piktogramy tematów (kafelek rynku dobierany po słowach z pytania) ---------- */

export const IkTramwaj = (p: P) => (
  <svg {...baza} {...p}>
    <path d="M8 3h8M12 3v3M7 6h10a2 2 0 0 1 2 2v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V8a2 2 0 0 1 2-2zM5 12h14M9 15.5h.01M15 15.5h.01M8.5 19 7 21.5M15.5 19l1.5 2.5" />
  </svg>
);
export const IkMost = (p: P) => (
  <svg {...baza} {...p}>
    <path d="M2 17h20M4 17c1.5-9 14.5-9 16 0M8 11.300V17M12 10.200V17M16 11.300V17M4 17v3M20 17v3" />
  </svg>
);
export const IkDroga = (p: P) => (
  <svg {...baza} {...p}>
    <path d="M9 3 5 21M15 3l4 18M12 4v2.500M12 10.500V13M12 17v3" />
  </svg>
);
export const IkBudzet = (p: P) => (
  <svg {...baza} {...p}>
    <ellipse cx="12" cy="7" rx="7" ry="3" />
    <path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
  </svg>
);
export const IkDokument = (p: P) => (
  <svg {...baza} {...p}>
    <path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" />
  </svg>
);
export const IkGmach = (p: P) => (
  <svg {...baza} {...p}>
    <path d="M3 21h18M4 10h16M12 3l8 4.500V10H4V7.500zM6.5 10v8M10.2 10v8M13.8 10v8M17.5 10v8M4.5 18h15" />
  </svg>
);
export const IkDrzewo = (p: P) => (
  <svg {...baza} {...p}>
    <path d="M12 21v-7M12 14c-4 0-6-2.5-6-5.500C6 5 8.5 3 12 3s6 2 6 5.500c0 3-2 5.5-6 5.500zM9 21h6" />
  </svg>
);

/** Znak logo: zegar „za pięć dwunasta” na żółtym kafelku (kolory z arkusza: .logo-znak). */
export const IkZnak = (p: P) => (
  <svg viewBox="0 0 30 30" aria-hidden="true" {...p}>
    <rect className="znak-tlo" width="30" height="30" rx="8" />
    <circle className="znak-kreska" cx="15" cy="15" r="7.6" fill="none" strokeWidth="2.2" />
    <path className="znak-kreska" d="M15 15V10.600M15 15l-3.1-5" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
