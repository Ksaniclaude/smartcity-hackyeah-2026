/** Polska odmiana: odmien(3, "prognoza", "prognozy", "prognoz") → "3 prognozy". */
export function odmien(n: number, jeden: string, kilka: string, wiele: string): string {
  const abs = Math.abs(n);
  const r10 = abs % 10;
  const r100 = abs % 100;
  let forma = wiele;
  if (abs === 1) forma = jeden;
  else if (r10 >= 2 && r10 <= 4 && (r100 < 12 || r100 > 14)) forma = kilka;
  return `${n} ${forma}`;
}

export function punkty(n: number): string {
  return odmien(Math.round(n), "punkt", "punkty", "punktów");
}
