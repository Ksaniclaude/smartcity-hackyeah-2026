export type Kategoria = "miasto" | "luz";
export type Status = "propozycja" | "otwarte" | "zamkniete" | "rozstrzygniete" | "uniewaznione";
export type Powod = "wykonawca" | "decyzja_polityczna" | "pieniadze" | "formalnosci" | "inne";

export const POWODY: { wartosc: Powod; etykieta: string }[] = [
  { wartosc: "wykonawca", etykieta: "wykonawca" },
  { wartosc: "decyzja_polityczna", etykieta: "decyzja polityczna" },
  { wartosc: "pieniadze", etykieta: "pieniądze" },
  { wartosc: "formalnosci", etykieta: "formalności" },
  { wartosc: "inne", etykieta: "inne" },
];

export const ETYKIETY_STATUSU: Record<Status, string> = {
  propozycja: "propozycja",
  otwarte: "otwarte",
  zamkniete: "zamknięte",
  rozstrzygniete: "rozstrzygnięte",
  uniewaznione: "unieważnione",
};

export const TEMATY_WYKLUCZONE = [
  "wyniki sportowe",
  "wybory i kandydaci",
  "konkretne osoby prywatne",
  "wypadki i zgony",
];

/** Wiersz widoku v_pytania. */
export interface Pytanie {
  id: number;
  tresc: string;
  kategoria: Kategoria;
  odpowiedzi: string[];
  kryterium: string;
  link_zrodla: string;
  termin: string;
  status: Status;
  wynik: number | null;
  link_rozstrzygniecia: string | null;
  komentarz_urzedu: string | null;
  liczba_prognoz: number;
  utworzono: string;
  rozstrzygnieto: string | null;
  kurs_widoczny: boolean;
  kursy: number[] | null;
  prog_widocznosci: number;
  liczba_zmian_terminu: number;
}

/** Wiersz tabeli pytania (tylko admin, przez RPC admin_pytania). */
export interface PytanieAdmin {
  id: number;
  tresc: string;
  kategoria: Kategoria;
  odpowiedzi: string[];
  kryterium: string;
  link_zrodla: string;
  termin: string;
  status: Status;
  q: number[];
  b: number;
  wynik: number | null;
  link_rozstrzygniecia: string | null;
  komentarz_urzedu: string | null;
  liczba_prognoz: number;
  zaproponowal: string | null;
  utworzono: string;
  rozstrzygnieto: string | null;
}

export interface Gracz {
  id: string;
  nick: string;
  saldo: number;
  czy_admin: boolean;
}

export interface WynikZakladu {
  pytanie: number;
  odpowiedz: number;
  stawka: number;
  udzialy: number;
  kurs_przed: number;
  kurs_po: number;
  kursy: number[];
  saldo: number;
  liczba_prognoz: number;
}

/** Wiersz widoku v_moje_pozycje. */
export interface MojaPozycja {
  pytanie: number;
  tresc: string;
  kategoria: Kategoria;
  odpowiedzi: string[];
  status: Status;
  termin: string;
  wynik: number | null;
  odpowiedz_glowna: number;
  wydane: number;
  wyplata: number;
  trafione: boolean | null;
  kursy: number[] | null;
}

export interface RozkladPowodu {
  pytanie: number;
  powod: Powod;
  liczba: number;
  punkty: number;
}

export interface Komentarz {
  pytanie: number;
  odpowiedz: number;
  powod: Powod | null;
  komentarz: string;
  czas: string;
}

export interface ZmianaTerminu {
  id: number;
  pytanie: number;
  stary_termin: string;
  nowy_termin: string;
  link: string;
  czas: string;
}
