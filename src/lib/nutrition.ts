import type { Entry, Food, Macros, MealId } from './types';

export const ZERO: Macros = { kcal: 0, p: 0, c: 0, f: 0 };

export const MAX_AMOUNT = 5000;

/** Nutrition for `amount` grams (or ml) of a food. */
export function macrosFor(food: Food, amount: number): Macros {
  const k = Math.max(0, amount) / 100;
  return {
    kcal: food.per100.kcal * k,
    p: food.per100.p * k,
    c: food.per100.c * k,
    f: food.per100.f * k,
  };
}

export function sum(items: Macros[]): Macros {
  return items.reduce(
    (t, m) => ({ kcal: t.kcal + m.kcal, p: t.p + m.p, c: t.c + m.c, f: t.f + m.f }),
    { ...ZERO },
  );
}

export function entriesFor(entries: Entry[], date: string, meal?: MealId): Entry[] {
  return entries.filter((e) => e.date === date && (!meal || e.meal === meal));
}

/** Calories implied by macros (4/4/9 kcal per gram). */
export function kcalFromMacros(m: Pick<Macros, 'p' | 'c' | 'f'>): number {
  return m.p * 4 + m.c * 4 + m.f * 9;
}

/** Share of energy from protein, carbs and fat, in percent. */
export function macroSplit(m: Pick<Macros, 'p' | 'c' | 'f'>): { p: number; c: number; f: number } {
  const pk = m.p * 4;
  const ck = m.c * 4;
  const fk = m.f * 9;
  const total = pk + ck + fk;
  if (total <= 0) return { p: 0, c: 0, f: 0 };
  return { p: (pk / total) * 100, c: (ck / total) * 100, f: (fk / total) * 100 };
}

/** Clamp and round a user-entered amount. */
export function cleanAmount(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_AMOUNT, Math.round(n)));
}

/** Parse a numeric input that may use a comma decimal separator. */
export function parseNumber(value: string): number {
  const n = Number(String(value).replace(',', '.').trim());
  return Number.isFinite(n) ? n : 0;
}

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** 1327.4 -> "1,327" */
export function fmtKcal(n: number): string {
  return nf.format(Math.round(n));
}

/** Grams with one decimal below 10 g, whole numbers above. */
export function fmtGrams(n: number): string {
  if (n > 0 && n < 10) return String(Math.round(n * 10) / 10);
  return nf.format(Math.round(n));
}

/** Round to one decimal place, dropping a trailing ".0". */
export function oneDecimal(n: number): string {
  return String(Math.round(n * 10) / 10);
}

export function percent(value: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.max(0, Math.min(100, (value / goal) * 100));
}
