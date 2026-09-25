import type { Entry, Food, Ingredient, Macros, MealId, Unit } from '../src/lib/types';
import { MEAL_DISPLAY_ORDER } from '../src/lib/types';
import {
  addEntries,
  deleteEntry,
  findFood,
  getData,
  getEntry,
  lastAmount,
  newId,
  recentFoods,
  rememberFood,
  updateEntry,
  updateSettings,
  type NewEntry,
} from '../src/lib/store';
import { FOODS, searchFoods } from '../src/lib/foods';
import { dishFood, dishTotals, entryFieldsFor, ingredientId, ingredientMacros, roundAmount, scaleIngredients } from '../src/lib/dish';
import { entriesFor, MAX_AMOUNT, macrosFor, sum } from '../src/lib/nutrition';
import { addDays, daysBetween, isDateKey, todayKey } from '../src/lib/dates';
import { mealForTime } from '../src/lib/meals';
import { checkNutrition } from '../src/lib/ai/shared';
import { lookupBarcode, searchProducts } from '../src/lib/openfoodfacts';
import { weekName } from '../src/lib/sync/parts';

/**
 * What each tool does to the food log, apart from talking to the relays.
 * Writes return the sync parts they touched, so only those get uploaded.
 */

/** A mistake in the request, explained so Claude can fix it and call again. */
export class ToolError extends Error {}

export interface WriteResult<T> {
  result: T;
  touched: string[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function macrosOut(m: Macros) {
  return { kcal: Math.round(m.kcal), protein_g: r1(m.p), carbs_g: r1(m.c), fat_g: r1(m.f) };
}

function per100Out(m: Macros) {
  return { kcal: r1(m.kcal), protein_g: r1(m.p), carbs_g: r1(m.c), fat_g: r1(m.f) };
}

function ingredientOut(i: Ingredient) {
  return { name: i.name, amount: i.amount, unit: i.unit, kcal: Math.round(ingredientMacros(i).kcal) };
}

export function entryOut(e: Entry) {
  return {
    id: e.id,
    name: e.name,
    ...(e.amount !== undefined ? { amount: e.amount, unit: e.unit ?? 'g' } : {}),
    ...macrosOut(e),
    ...(e.food ? { food_id: e.food.id } : {}),
    ...(e.ingredients?.length ? { ingredients: e.ingredients.map(ingredientOut) } : {}),
  };
}

export function foodOut(f: Food) {
  return {
    food_id: f.id,
    name: f.name,
    ...(f.brand ? { brand: f.brand } : {}),
    unit: f.unit,
    per_100: per100Out(f.per100),
    ...(f.defaultAmount ? { usual_amount: f.defaultAmount } : {}),
    ...(f.servings?.length ? { servings: f.servings } : {}),
    ...(f.ingredients?.length ? { ingredients: f.ingredients.map(ingredientOut) } : {}),
  };
}

export function checkDate(date: string | undefined): string {
  if (date === undefined || date === '' || date === 'today') return todayKey();
  if (date === 'yesterday') return addDays(todayKey(), -1);
  if (!isDateKey(date)) throw new ToolError(`"${date}" is not a date. Use YYYY-MM-DD.`);
  return date;
}

// ── Reading ───────────────────────────────────────────────────────────────

export function dayReport(dateInput?: string) {
  const date = checkDate(dateInput);
  const data = getData();
  const entries = entriesFor(data.entries, date).sort((a, b) => a.createdAt - b.createdAt);
  const goals = data.settings.goals;
  const eaten = sum(entries);
  return {
    date,
    today: todayKey(),
    goals: macrosOut(goals),
    eaten: macrosOut(eaten),
    remaining_kcal: Math.round(goals.kcal - eaten.kcal),
    meals: Object.fromEntries(MEAL_DISPLAY_ORDER.map((m) => [m, entries.filter((e) => e.meal === m).map(entryOut)])),
  };
}

export function summaryReport(fromInput?: string, toInput?: string) {
  const to = checkDate(toInput);
  const from = fromInput ? checkDate(fromInput) : addDays(to, -6);
  const span = daysBetween(from, to);
  if (span < 0) throw new ToolError('"from" must not be after "to".');
  if (span > 92) throw new ToolError('Ask for at most 93 days at a time.');
  const data = getData();
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const entries = entriesFor(data.entries, d);
    days.push({ date: d, entries: entries.length, ...macrosOut(sum(entries)) });
  }
  const logged = days.filter((d) => d.entries > 0);
  const avg = (k: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g') =>
    logged.length ? r1(logged.reduce((t, d) => t + d[k], 0) / logged.length) : 0;
  return {
    from,
    to,
    today: todayKey(),
    goals: macrosOut(data.settings.goals),
    days_logged: logged.length,
    average_per_logged_day: { kcal: Math.round(avg('kcal')), protein_g: avg('protein_g'), carbs_g: avg('carbs_g'), fat_g: avg('fat_g') },
    days,
  };
}

function uniqueFoods(foods: Food[]): Food[] {
  const seen = new Set<string>();
  return foods.filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)));
}

/** The user's favorites and recent foods, then the built-in list; optionally Open Food Facts too. */
export async function findFoods(query: string | undefined, online = false) {
  const data = getData();
  const q = (query ?? '').trim();
  if (!q) {
    return {
      favorites: data.favorites.map(foodOut),
      recent: recentFoods(data.entries, 15).map((r) => ({ ...foodOut(r.food), last_amount: r.amount })),
    };
  }
  const own = uniqueFoods([...data.favorites, ...recentFoods(data.entries, 200).map((r) => r.food)]);
  const results = searchFoods(uniqueFoods([...own, ...FOODS]), q, 12).map(foodOut);
  if (!online) return { results };
  try {
    // Requests run one at a time, so never wait long for another service.
    const signal = AbortSignal.timeout(10_000);
    const found = /^\d{8,14}$/.test(q)
      ? [await lookupBarcode(q, signal)].filter((f): f is Food => !!f)
      : await searchProducts(q, signal);
    found.forEach(rememberFood);
    return { results, open_food_facts: found.slice(0, 12).map(foodOut) };
  } catch (err) {
    return { results, open_food_facts_error: `Open Food Facts didn't answer (${(err as Error).message}).` };
  }
}

// ── Logging ───────────────────────────────────────────────────────────────

export interface NutritionInput {
  name: string;
  grams: number;
  unit?: Unit;
  kcal_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
}

export interface LogItemInput extends Partial<NutritionInput> {
  food_id?: string;
  components?: NutritionInput[];
}

const clamp = (v: number | undefined, hi: number) => Math.max(0, Math.min(hi, Number.isFinite(v) ? (v as number) : 0));

/** Nutrition per 100 g, kept within physical limits and made to add up (as for the app's own AI estimates). */
function per100From(name: string, it: Partial<NutritionInput>): Macros {
  return checkNutrition(name, {
    kcal: clamp(it.kcal_per_100g, 900),
    p: clamp(it.protein_per_100g, 100),
    c: clamp(it.carbs_per_100g, 100),
    f: clamp(it.fat_per_100g, 100),
  });
}

const missingNutrition = (it: Partial<NutritionInput>) =>
  [it.kcal_per_100g, it.protein_per_100g, it.carbs_per_100g, it.fat_per_100g].some((v) => typeof v !== 'number');

function itemEntry(it: LogItemInput, n: number, date: string, meal: MealId): NewEntry {
  if (it.food_id) {
    const food = findFood(it.food_id);
    if (!food) throw new ToolError(`Item ${n}: there is no food "${it.food_id}". Use search_foods to find one, or give the nutrition instead.`);
    const amount = roundAmount(it.grams ?? lastAmount(food.id) ?? food.defaultAmount ?? 100);
    if (amount <= 0) throw new ToolError(`Item ${n}: the amount must be more than 0.`);
    return { date, meal, ...entryFieldsFor(food, amount), source: food.id.startsWith('off:') ? 'barcode' : 'food' };
  }

  const name = (it.name ?? '').trim().slice(0, 80);
  if (!name) throw new ToolError(`Item ${n}: give a name (or a food_id from search_foods).`);
  const parts = (it.components ?? []).filter((c) => c.name?.trim() && c.grams > 0);
  if (parts.length >= 2) {
    const ingredients: Ingredient[] = parts.slice(0, 30).map((c) => {
      const partName = c.name.trim().slice(0, 80);
      if (missingNutrition(c)) throw new ToolError(`Item ${n}: the component "${partName}" needs kcal, protein, carbs and fat per 100 g.`);
      return {
        id: ingredientId(),
        name: partName,
        amount: roundAmount(c.grams),
        unit: c.unit === 'ml' ? 'ml' : 'g',
        per100: per100From(partName, c),
      };
    });
    const food = dishFood(`text:${newId()}`, name, ingredients);
    const t = dishTotals(ingredients);
    return { date, meal, name, amount: roundAmount(t.amount), unit: food.unit, food, kcal: t.kcal, p: t.p, c: t.c, f: t.f, ingredients, source: 'text' };
  }

  if (missingNutrition(it)) {
    throw new ToolError(`Item ${n} ("${name}"): give kcal, protein, carbs and fat per 100 g, or a food_id from search_foods.`);
  }
  const grams = roundAmount(clamp(it.grams, MAX_AMOUNT));
  if (grams <= 0) throw new ToolError(`Item ${n} ("${name}"): give the amount in grams (more than 0).`);
  const unit: Unit = it.unit === 'ml' ? 'ml' : 'g';
  const food: Food = { id: `text:${newId()}`, name, unit, per100: per100From(name, it), defaultAmount: grams };
  return { date, meal, name, amount: grams, unit, food, ...macrosFor(food, grams), source: 'text' };
}

export function logFood(input: { date?: string; meal?: MealId; items: LogItemInput[] }) {
  const date = checkDate(input.date);
  const meal = input.meal ?? mealForTime();
  if (input.items.length === 0) throw new ToolError('Give at least one item to log.');
  if (input.items.length > 30) throw new ToolError('Log at most 30 items at a time.');
  const entries = input.items.map((it, i) => itemEntry(it, i + 1, date, meal));
  const created = addEntries(entries);
  const day = dayReport(date);
  return {
    result: {
      logged: created.map(entryOut),
      meal,
      date,
      added: macrosOut(sum(created)),
      day_eaten: day.eaten,
      day_remaining_kcal: day.remaining_kcal,
    },
    touched: [weekName(date)],
  } satisfies WriteResult<unknown>;
}

// ── Changing ──────────────────────────────────────────────────────────────

export function editEntry(input: { id: string; grams?: number; meal?: MealId; date?: string; name?: string }) {
  const entry = getEntry(input.id);
  if (!entry) throw new ToolError(`There is no entry "${input.id}". Use get_day to see the entries and their ids.`);
  const patch: Partial<Omit<Entry, 'id'>> = {};

  if (input.grams !== undefined) {
    const grams = roundAmount(input.grams);
    if (grams <= 0) throw new ToolError('The amount must be more than 0. To remove the entry, use delete_entry.');
    if (entry.ingredients?.length) {
      const base = dishTotals(entry.ingredients).amount;
      const ingredients = scaleIngredients(entry.ingredients, base > 0 ? grams / base : 0);
      const t = dishTotals(ingredients);
      Object.assign(patch, { amount: grams, ingredients, kcal: t.kcal, p: t.p, c: t.c, f: t.f });
    } else if (entry.food) {
      Object.assign(patch, { amount: grams, ...macrosFor(entry.food, grams) });
    } else {
      throw new ToolError('This entry was added as plain calories, so it has no amount to change. Delete it and log it again instead.');
    }
  }
  if (input.meal) patch.meal = input.meal;
  if (input.date !== undefined) patch.date = checkDate(input.date);
  if (input.name !== undefined) {
    const name = input.name.trim().slice(0, 80);
    if (!name) throw new ToolError('The name cannot be empty.');
    patch.name = name;
  }
  if (Object.keys(patch).length === 0) throw new ToolError('Nothing to change: give grams, meal, date or name.');

  updateEntry(entry.id, patch);
  const updated = getEntry(entry.id)!;
  return {
    result: { updated: entryOut(updated), date: updated.date, meal: updated.meal },
    touched: [weekName(entry.date), weekName(updated.date)],
  } satisfies WriteResult<unknown>;
}

export function removeEntry(id: string) {
  const entry = getEntry(id);
  if (!entry) throw new ToolError(`There is no entry "${id}". Use get_day to see the entries and their ids.`);
  deleteEntry(id);
  return {
    result: { deleted: entryOut(entry), date: entry.date, meal: entry.meal },
    touched: [weekName(entry.date)],
  } satisfies WriteResult<unknown>;
}

export function setGoals(input: { kcal?: number; protein_g?: number; carbs_g?: number; fat_g?: number }) {
  const current = getData().settings.goals;
  const goals = {
    kcal: Math.round(input.kcal ?? current.kcal),
    p: Math.round(input.protein_g ?? current.p),
    c: Math.round(input.carbs_g ?? current.c),
    f: Math.round(input.fat_g ?? current.f),
  };
  if (goals.kcal < 500 || goals.kcal > 10_000) throw new ToolError('The calorie goal should be between 500 and 10000 kcal.');
  if (goals.p <= 0 || goals.c <= 0 || goals.f <= 0) throw new ToolError('Macro goals must be more than 0 g.');
  if (goals.p > 1000 || goals.c > 1000 || goals.f > 1000) throw new ToolError('Macro goals must be at most 1000 g.');
  updateSettings({ goals });
  return { result: { goals: macrosOut(goals) }, touched: ['meta'] } satisfies WriteResult<unknown>;
}
