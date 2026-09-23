/** Calendar-day helpers. Days are local-time strings in YYYY-MM-DD form. */

const pad = (n: number) => String(n).padStart(2, '0');

export function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toKey(fromKey(value)) === value;
}

export function todayKey(now: Date = new Date()): string {
  return toKey(now);
}

export function addDays(key: string, days: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + days);
  return toKey(d);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  const ms = fromKey(b).getTime() - fromKey(a).getTime();
  return Math.round(ms / 86_400_000);
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "Wednesday, 23 September" */
export function longDate(key: string): string {
  const d = fromKey(key);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "Wed" */
export function shortWeekday(key: string): string {
  return WEEKDAYS[fromKey(key).getDay()].slice(0, 3);
}

/** "Wednesday" */
export function weekday(key: string): string {
  return WEEKDAYS[fromKey(key).getDay()];
}

/** "23 Sep" */
export function dayMonth(key: string): string {
  const d = fromKey(key);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

/** "Today", "Yesterday" or the weekday name, for headings. */
export function relativeDayTitle(key: string, today: string = todayKey()): string {
  const diff = daysBetween(key, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return weekday(key);
  return dayMonth(key);
}

/** "17 – 23 Sep" or "28 Sep – 4 Oct" for a range of days. */
export function rangeLabel(start: string, end: string): string {
  const s = fromKey(start);
  const e = fromKey(end);
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()} – ${dayMonth(end)}`;
  }
  return `${dayMonth(start)} – ${dayMonth(end)}`;
}
