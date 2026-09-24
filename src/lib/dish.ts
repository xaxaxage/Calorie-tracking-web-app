import type { Entry, Food, Ingredient, Macros, Serving, Unit } from './types';
import { macrosFor, MAX_AMOUNT, sum } from './nutrition';

/**
 * Dishes are foods made of ingredients. A dish's nutrition is always the sum
 * of its ingredients, so changing one ingredient changes the dish, and a
 * portion of a dish is its ingredients scaled.
 */

export function ingredientId(): string {
  return `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function ingredientMacros(i: Pick<Ingredient, 'amount' | 'per100'>): Macros {
  const k = Math.max(0, i.amount) / 100;
  return { kcal: i.per100.kcal * k, p: i.per100.p * k, c: i.per100.c * k, f: i.per100.f * k };
}

export function dishTotals(list: Ingredient[]): Macros & { amount: number } {
  return { ...sum(list.map(ingredientMacros)), amount: list.reduce((t, i) => t + Math.max(0, i.amount), 0) };
}

/** A dish is measured in ml only when everything in it is (a latte); otherwise in grams, counting 1 ml as 1 g. */
export function dishUnit(list: Ingredient[]): Unit {
  return list.length > 0 && list.every((i) => i.unit === 'ml') ? 'ml' : 'g';
}

/** Whole grams, but keep a decimal for small amounts so 2.5 g of oil stays 2.5 g. */
export function roundAmount(n: number): number {
  const v = Math.max(0, Math.min(MAX_AMOUNT, n));
  return v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
}

export function scaleIngredients(list: Ingredient[], factor: number): Ingredient[] {
  return list.map((i) => ({ ...i, amount: roundAmount(i.amount * factor) }));
}

/** A dish as a food, with per-100 values worked out from its ingredients. */
export function dishFood(id: string, name: string, ingredients: Ingredient[], servings?: Serving[]): Food {
  const t = dishTotals(ingredients);
  const k = t.amount > 0 ? 100 / t.amount : 0;
  const r = (v: number) => Math.round(v * k * 10) / 10;
  return {
    id,
    name,
    unit: dishUnit(ingredients),
    per100: { kcal: r(t.kcal), p: r(t.p), c: r(t.c), f: r(t.f) },
    defaultAmount: roundAmount(t.amount) || 100,
    servings,
    ingredients,
  };
}

/** Turn a food into one ingredient. A dish added to a dish counts as a single ingredient. */
export function ingredientFromFood(food: Food, amount: number): Ingredient {
  return {
    id: ingredientId(),
    name: food.name,
    amount: roundAmount(amount),
    unit: food.unit,
    per100: { ...food.per100 },
    foodId: food.id,
  };
}

/** Ingredient from what someone knows about it: grams and the calories/macros for that amount. */
export function customIngredient(name: string, amount: number, totals: Macros, unit: Unit = 'g'): Ingredient {
  const k = amount > 0 ? 100 / amount : 0;
  const r = (v: number) => Math.round(v * k * 10) / 10;
  return {
    id: ingredientId(),
    name,
    amount: roundAmount(amount),
    unit,
    per100: { kcal: r(totals.kcal), p: r(totals.p), c: r(totals.c), f: r(totals.f) },
  };
}

export function isDish(food: Food | undefined): boolean {
  return !!food?.ingredients && food.ingredients.length > 0;
}

/** The ingredients of `amount` of a dish food. */
export function portionIngredients(food: Food, amount: number): Ingredient[] {
  const list = food.ingredients ?? [];
  const base = dishTotals(list).amount || food.defaultAmount || 100;
  return scaleIngredients(list, amount / base);
}

type EntryFields = Pick<Entry, 'name' | 'amount' | 'unit' | 'food' | 'kcal' | 'p' | 'c' | 'f' | 'ingredients'>;

/** What an entry for `amount` of a food holds — for a dish, its ingredients scaled to that amount. */
export function entryFieldsFor(food: Food, amount: number): EntryFields {
  if (isDish(food)) {
    const ingredients = portionIngredients(food, amount);
    const t = dishTotals(ingredients);
    return { name: food.name, amount, unit: food.unit, food, kcal: t.kcal, p: t.p, c: t.c, f: t.f, ingredients };
  }
  const m = macrosFor(food, amount);
  return { name: food.name, amount, unit: food.unit, food, ...m };
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Validate ingredients from storage, a backup or another device. */
export function cleanIngredients(raw: unknown): Ingredient[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Ingredient[] = [];
  for (const i of raw.slice(0, 60)) {
    if (!i || typeof i !== 'object' || typeof i.name !== 'string' || !i.name.trim()) continue;
    const per = i.per100 ?? {};
    out.push({
      // A missing id gets a fixed one, so every device cleans the same data the same way.
      id: typeof i.id === 'string' && i.id ? i.id.slice(0, 60) : `i${out.length}`,
      name: i.name.trim().slice(0, 80),
      amount: roundAmount(num(i.amount)),
      unit: i.unit === 'ml' ? 'ml' : 'g',
      per100: {
        kcal: Math.max(0, Math.min(900, num(per.kcal))),
        p: Math.max(0, Math.min(100, num(per.p))),
        c: Math.max(0, Math.min(100, num(per.c))),
        f: Math.max(0, Math.min(100, num(per.f))),
      },
      foodId: typeof i.foodId === 'string' && i.foodId ? i.foodId.slice(0, 120) : undefined,
    });
  }
  return out.length > 0 ? out : undefined;
}
