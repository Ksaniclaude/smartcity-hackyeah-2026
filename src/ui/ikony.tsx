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
export const IkStrzalka = (p: P) => (
  <svg {...baza} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
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
