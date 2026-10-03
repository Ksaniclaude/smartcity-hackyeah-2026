import dane from "./terminowosc.json";

export interface Terminowosc {
  wygenerowano: string | null;
  zrodlo: string;
  zakres: { od: string; do: string } | null;
  zamawiajacy: string[];
  ogolem: { liczba: number; w_terminie: number; odsetek: number | null };
  roboty_budowlane: { liczba: number; w_terminie: number; odsetek: number | null };
  wykonawcy: { wykonawca: string; umowy: number; w_terminie: number }[];
  uwagi: string[];
}

/**
 * Liczba z Biuletynu Zamówień Publicznych, wygenerowana skryptem
 * `npm run zamowienia` (albo `npm run terminowosc` z CSV). Dopóki skrypt nie
 * przeliczy danych, odsetek jest pusty i ekrany mówią o tym wprost.
 */
export const terminowosc: Terminowosc = dane as Terminowosc;
