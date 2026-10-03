// Daty w strefie Europe/Warsaw — do wyświetlania (liczniki, zakresy dat w formularzach).
// Czas gry pochodzi z bazy: gameNow() w session.ts.
import { TZ } from './config';

const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Data w strefie Europe/Warsaw jako YYYY-MM-DD. */
export function dayKey(ms: number): string {
  return dayFmt.format(new Date(ms));
}

function parseKey(key: string): [number, number, number] {
  const [y, m, d] = key.split('-').map(Number);
  return [y, m, d];
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = parseKey(key);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 0 = poniedziałek ... 6 = niedziela */
export function weekday(key: string): number {
  const [y, m, d] = parseKey(key);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Poniedziałek tygodnia, w którym leży dana chwila. */
export function weekKey(ms: number): string {
  const key = dayKey(ms);
  return addDays(key, -weekday(key));
}

const offsetFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' });

function tzOffsetMs(utcMs: number): number {
  const name = offsetFmt.formatToParts(new Date(utcMs)).find((p) => p.type === 'timeZoneName')?.value;
  const m = name?.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0)) * 60_000;
}

/** Północ (początek dnia) w Warszawie jako timestamp. */
export function startOfDayMs(key: string): number {
  const [y, m, d] = parseKey(key);
  const guess = Date.UTC(y, m - 1, d);
  // druga iteracja poprawia przypadek zmiany czasu letniego
  return guess - tzOffsetMs(guess - tzOffsetMs(guess));
}

export function endOfDayMs(key: string): number {
  return startOfDayMs(addDays(key, 1)) - 1;
}
