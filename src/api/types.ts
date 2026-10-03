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
  /** Suma postawionych punktów (obrót). */
  obrot: number;
  otwarto: string | null;
  /** Kurs otwarcia ustawiony przez admina (widoczny zawsze, bo nie mówi nic o tłumie). */
  kursy_otwarcia: number[] | null;
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
  obrot: number;
}

/** Wynik RPC sprzedaj_udzialy. */
export interface WynikSprzedazy {
  pytanie: number;
  odpowiedz: number;
  udzialy: number;
  zwrot: number;
  kurs_przed: number;
  kurs_po: number;
  kursy: number[];
  saldo: number;
  udzialy_pozostale: number;
}

/** Pozycja na publicznym profilu gracza. */
export interface PozycjaPubliczna {
  pytanie: number;
  tresc: string;
  kategoria: Kategoria;
  odpowiedzi: string[];
  status: Status;
  wynik: number | null;
  odpowiedz: number;
  udzialy: number;
  wydane: number;
  /** Bieżący kurs wybranej odpowiedzi (null, gdy ukryty). */
  kurs: number | null;
  /** Wartość: udziały × kurs; po koszcie, gdy kurs ukryty; wypłata po rozstrzygnięciu. */
  wartosc: number;
}

/** Publiczny profil (RPC profil_publiczny). */
export interface ProfilPubliczny {
  nick: string;
  utworzono: string;
  prognozy: number;
  obrot: number;
  wartosc_pozycji: number;
  najwieksza_wygrana: number;
  trafione: number;
  rozstrzygniete: number;
  pozycje: PozycjaPubliczna[];
  aktywnosc: Aktywnosc[];
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
  udzialy_glowne: number;
  /** Bieżąca wartość udziałów (po kursie; po koszcie, gdy kurs ukryty; wypłata po rozstrzygnięciu). */
  wartosc: number;
}

export interface RozkladPowodu {
  pytanie: number;
  powod: Powod;
  liczba: number;
  punkty: number;
}

/** Komentarz: z zakładu (id > 0, stawka = zakład) albo samodzielny (id < 0; odpowiedz = główny typ autora, stawka = wydane). */
export interface Komentarz {
  id: number;
  nick: string;
  odpowiedz: number | null;
  odpowiedz_tekst: string | null;
  powod: Powod | null;
  komentarz: string;
  stawka: number;
  czas: string;
}

/** Własna transakcja (tabela transakcje, RLS: tylko własne wiersze) z pytaniem. */
export interface MojaTransakcja {
  id: number;
  pytanie: number;
  odpowiedz: number;
  stawka: number;
  udzialy: number;
  kurs_przed: number;
  kurs_po: number;
  powod: Powod | null;
  komentarz: string | null;
  czas: string;
  pytania: { tresc: string; odpowiedzi: string[]; status: Status; wynik: number | null } | null;
}

/** Punkt historii kursów (RPC historia_kursu). */
export interface PunktHistorii {
  czas: string;
  kursy: number[];
}

/** Wpis aktywności (RPC aktywnosc). */
export interface Aktywnosc {
  id: number;
  pytanie: number;
  tresc: string;
  kategoria: Kategoria;
  nick: string;
  odpowiedz: number;
  odpowiedz_tekst: string;
  stawka: number;
  /** Ujemne = sprzedaż udziałów (stawka to wtedy zwrot). */
  udzialy: number;
  kurs_po: number | null;
  powod: Powod | null;
  komentarz: string | null;
  czas: string;
}

/** Wiersz RPC najwieksi_gracze. */
export interface NajwiekszyGracz {
  nick: string;
  odpowiedz: number;
  odpowiedz_tekst: string;
  udzialy: number;
  wydane: number;
}

/** Wiersz RPC ranking. */
export interface WpisRankingu {
  nick: string;
  saldo: number;
  wartosc_pozycji: number;
  portfel: number;
  zysk: number;
  prognozy: number;
  obrot: number;
  trafione: number;
  rozstrzygniete: number;
}

export interface ZmianaTerminu {
  id: number;
  pytanie: number;
  stary_termin: string;
  nowy_termin: string;
  link: string;
  czas: string;
}
