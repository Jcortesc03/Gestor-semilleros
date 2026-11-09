/** Fechas locales en la zona horaria institucional, sin dependencias externas (Intl). */

const DAY_MS = 86_400_000;
const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const weekdayFormatters = new Map<string, Intl.DateTimeFormat>();

function cached(map: Map<string, Intl.DateTimeFormat>, timeZone: string, options: Intl.DateTimeFormatOptions) {
  let formatter = map.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, ...options });
    map.set(timeZone, formatter);
  }
  return formatter;
}

/** Fecha local `YYYY-MM-DD` del instante en `timeZone`. */
export function localDateKey(date: Date, timeZone: string): string {
  return cached(dateFormatters, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Día ISO de la semana (1 lunes … 7 domingo) del instante en `timeZone`. */
export function isoWeekday(date: Date, timeZone: string): number {
  const formatter = weekdayFormatters.get(timeZone) ?? new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' });
  weekdayFormatters.set(timeZone, formatter);
  return WEEKDAYS[formatter.format(date)] ?? 1;
}

/** Fecha `YYYY-MM-DD` de una columna `@db.Date` (medianoche UTC). */
export function dateOnlyKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Días enteros entre dos claves `YYYY-MM-DD` (`b − a`). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** Suma `days` a una clave `YYYY-MM-DD`. */
export function addDays(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Meses `YYYY-MM` desde `from` hasta `to`, ambos incluidos. */
export function monthRange(from: string, to: string): string[] {
  const months: string[] = [];
  let [year, month] = from.split('-').map(Number);
  const [endYear, endMonth] = to.split('-').map(Number);
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}
