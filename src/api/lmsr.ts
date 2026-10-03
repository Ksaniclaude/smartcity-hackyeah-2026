// Podgląd zakładu po stronie klienta. Wzory wynikają z LMSR i zależą tylko od
// bieżącego kursu p_i oraz parametru b, więc nie potrzebują ukrytego q:
//   udziały  = b * ln((e^(s/b) - 1 + p_i) / p_i)
//   kurs po  = (e^(s/b) - 1 + p_i) / e^(s/b)
// Baza liczy to samo w funkcji postaw_prognoze (przez log-sum-exp); tu jest
// tylko podgląd, wynik wiążący zwraca RPC.
export const B = 1000;

export function podgladZakladu(kurs: number, stawka: number, b = B) {
  const e = Math.exp(stawka / b);
  const udzialy = b * Math.log((e - 1 + kurs) / kurs);
  const kursPo = (e - 1 + kurs) / e;
  return { udzialy, kursPo };
}

export function procent(kurs: number | null | undefined): string {
  if (kurs == null || Number.isNaN(kurs)) return "–";
  return `${Math.round(kurs * 100)}%`;
}

/**
 * Podgląd sprzedaży u udziałów odpowiedzi o kursie p (LMSR, zależy tylko od p i b):
 *   zwrot   = -b * ln(1 - p * (1 - e^(-u/b)))
 *   kurs po = p * e^(-u/b) / (1 - p + p * e^(-u/b))
 * Wynik wiążący zwraca RPC sprzedaj_udzialy.
 */
export function podgladSprzedazy(kurs: number, udzialy: number, b = B) {
  const e = Math.exp(-udzialy / b);
  const zwrot = -b * Math.log(1 - kurs * (1 - e));
  const kursPo = (kurs * e) / (1 - kurs + kurs * e);
  return { zwrot, kursPo };
}
