import { TZ } from './config';

/** Polska odmiana: plural(5, 'cegiełka', 'cegiełki', 'cegiełek') → 'cegiełek'. */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n);
  if (a === 1) return one;
  const l10 = a % 10;
  const l100 = a % 100;
  if (l10 >= 2 && l10 <= 4 && !(l100 >= 12 && l100 <= 14)) return few;
  return many;
}

export function bricks(n: number): string {
  return `${fmtInt(n)} ${plural(n, 'cegiełka', 'cegiełki', 'cegiełek')}`;
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('pl-PL');
}

export function fmtSigned(n: number): string {
  const r = Math.round(n);
  if (r > 0) return `+${fmtInt(r)}`;
  if (r < 0) return `−${fmtInt(-r)}`;
  return '0';
}

export function pct(p: number): number {
  return Math.round(p * 100);
}

const dateFmt = new Intl.DateTimeFormat('pl-PL', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
const dateShortFmt = new Intl.DateTimeFormat('pl-PL', { timeZone: TZ, day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('pl-PL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const weekdayFmt = new Intl.DateTimeFormat('pl-PL', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });

export function fmtDate(ms: number): string {
  return dateFmt.format(new Date(ms));
}

export function fmtDateShort(ms: number): string {
  return dateShortFmt.format(new Date(ms));
}

export function fmtDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return dateFmt.format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** „12 min temu”, „dziś, 9:41”, „wczoraj”, „pon., 28 wrz”. */
export function fmtRelative(ms: number, nowMs: number): string {
  const diff = nowMs - ms;
  if (diff < 60_000) return 'przed chwilą';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min temu`;
  const dayOf = (x: number) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(x));
  if (dayOf(ms) === dayOf(nowMs)) return `dziś, ${timeFmt.format(new Date(ms))}`;
  if (dayOf(ms) === dayOf(nowMs - 86_400_000)) return `wczoraj, ${timeFmt.format(new Date(ms))}`;
  return weekdayFmt.format(new Date(ms));
}

export function fmtDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (days > 0) return `${days} ${plural(days, 'dzień', 'dni', 'dni')} ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}
