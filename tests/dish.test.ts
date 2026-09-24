import { beforeEach, describe, expect, it } from 'vitest';
import type { Ingredient } from '../src/lib/types';
import {
  cleanIngredients,
  customIngredient,
  dishFood,
  dishTotals,
  entryFieldsFor,
  ingredientFromFood,
  portionIngredients,
  roundAmount,
  scaleIngredients,
} from '../src/lib/dish';
import { builtinFood, FOODS, LISTED } from '../src/lib/foods';
import { normalizeItems, PHOTO_SCHEMA, TEXT_SCHEMA, textPrompt } from '../src/lib/ai/shared';
import { addEntry, getData, parseData, reload } from '../src/lib/store';
import { buildParts } from '../src/lib/sync/parts';

const ing = (id: string, amount: number, kcal: number, unit: 'g' | 'ml' = 'g'): Ingredient => ({
  id,
  name: id,
  amount,
  unit,
  per100: { kcal, p: 10, c: 20, f: 5 },
});

describe('dishes', () => {
  it('adds up ingredients', () => {
    const t = dishTotals([ing('rice', 200, 130), ing('oil', 10, 884)]);
    expect(t.amount).toBe(210);
    expect(t.kcal).toBeCloseTo(260 + 88.4);
    expect(t.p).toBeCloseTo(21);
  });

  it('works out per-100 values and unit from the ingredients', () => {
    const food = dishFood('dish:x', 'Rice with oil', [ing('rice', 200, 130), ing('oil', 10, 884)]);
    expect(food.defaultAmount).toBe(210);
    expect(food.per100.kcal).toBeCloseTo((348.4 * 100) / 210, 1);
    expect(food.unit).toBe('g');
    expect(dishFood('dish:y', 'Latte', [ing('milk', 280, 50, 'ml'), ing('coffee', 70, 2, 'ml')]).unit).toBe('ml');
  });

  it('scales a portion, keeping a decimal on small amounts', () => {
    const half = scaleIngredients([ing('rice', 200, 130), ing('oil', 5, 884)], 0.5);
    expect(half.map((i) => i.amount)).toEqual([100, 2.5]);
    expect(roundAmount(12.4)).toBe(12);
    expect(roundAmount(-3)).toBe(0);
  });

  it('logs a dish food with its ingredients scaled to the amount', () => {
    const pizza = builtinFood('db:pizza')!;
    const fields = entryFieldsFor(pizza, 110);
    expect(fields.ingredients!.map((i) => [i.name, i.amount])).toEqual([
      ['Pizza base, baked', 60],
      ['Tomato sauce', 20],
      ['Mozzarella', 30],
    ]);
    expect(fields.kcal).toBeCloseTo(dishTotals(fields.ingredients!).kcal);
    const plain = entryFieldsFor(builtinFood('db:banana')!, 118);
    expect(plain.ingredients).toBeUndefined();
    expect(plain.kcal).toBeCloseTo(105, 0);
  });

  it('turns a food into an ingredient, and label-style numbers into per-100 values', () => {
    const i = ingredientFromFood(builtinFood('db:olive-oil')!, 7);
    expect(i).toMatchObject({ name: 'Olive oil', amount: 7, foodId: 'db:olive-oil', per100: { kcal: 884 } });
    const pesto = customIngredient('Pesto', 40, { kcal: 180, p: 2, c: 1.6, f: 18 });
    expect(pesto.per100).toEqual({ kcal: 450, p: 5, c: 4, f: 45 });
  });

  it('checks ingredients from storage or other devices', () => {
    const clean = cleanIngredients([
      { name: '  Rice ', amount: 150, per100: { kcal: 130, p: 2.7, c: 28, f: 0.3 } },
      { name: '', amount: 10 },
      { name: 'Bad', amount: -5, unit: 'litre', per100: { kcal: 5000, p: 'x' } },
      'nope',
    ])!;
    expect(clean).toHaveLength(2);
    expect(clean[0]).toMatchObject({ id: 'i0', name: 'Rice', amount: 150, unit: 'g' });
    expect(clean[1]).toMatchObject({ id: 'i1', amount: 0, unit: 'g', per100: { kcal: 900, p: 0 } });
    expect(cleanIngredients([])).toBeUndefined();
    expect(cleanIngredients('x')).toBeUndefined();
  });
});

describe('built-in dishes', () => {
  const dishes = FOODS.filter((f) => f.ingredients);

  it('have recipes for the composite foods', () => {
    expect(dishes.map((d) => d.id)).toEqual(
      expect.arrayContaining(['db:pizza', 'db:cheeseburger', 'db:lasagna', 'db:burrito', 'db:caesar-salad', 'db:chicken-rice-bowl', 'db:latte']),
    );
    expect(dishes.length).toBeGreaterThanOrEqual(15);
  });

  it.each(dishes.map((d) => [d.name, d] as const))('%s: recipe matches the typical values (±10%%)', (_, dish) => {
    const listed = LISTED.find((f) => f.id === dish.id)!;
    expect(Math.abs(dish.per100.kcal - listed.per100.kcal) / listed.per100.kcal).toBeLessThan(0.1);
    // A default portion is the whole recipe.
    expect(dish.defaultAmount).toBe(dishTotals(dish.ingredients!).amount);
    expect(dish.unit).toBe(listed.unit);
  });

  it('scale from a portion of the recipe', () => {
    const bowl = builtinFood('db:chicken-rice-bowl')!;
    const half = portionIngredients(bowl, 225);
    expect(dishTotals(half).amount).toBe(225);
  });
});

describe('AI dish components', () => {
  it('asks for components in both schemas and prompts', () => {
    expect(PHOTO_SCHEMA.properties.items.items.required).toContain('components');
    expect(TEXT_SCHEMA.properties.items.items.required).toContain('components');
    expect(textPrompt('a burger')).toMatch(/components/);
  });

  it('makes a dish the sum of its components', () => {
    const [burger, cola] = normalizeItems(
      {
        items: [
          {
            name: 'Cheeseburger',
            grams: 500,
            kcal_per_100g: 1,
            protein_per_100g: 1,
            carbs_per_100g: 1,
            fat_per_100g: 1,
            components: [
              { name: 'Bun', grams: 50, kcal_per_100g: 280, protein_per_100g: 9, carbs_per_100g: 50, fat_per_100g: 4 },
              { name: 'Beef patty', grams: 90, kcal_per_100g: 250, protein_per_100g: 26, carbs_per_100g: 0, fat_per_100g: 17 },
              { name: '', grams: 20 },
              { name: 'Ghost', grams: 0 },
            ],
          },
          { name: 'Cola', grams: 330, kcal_per_100g: 42, components: [] },
        ],
      },
      false,
    );
    expect(burger.components!.map((c) => c.name)).toEqual(['Bun', 'Beef patty']);
    expect(burger.grams).toBe(140);
    expect(burger.per100.kcal).toBeCloseTo((140 + 225) / 1.4, 0);
    expect(cola.components).toBeUndefined();
  });

  it('treats a single component as a plain food', () => {
    const [item] = normalizeItems(
      { items: [{ name: 'Apple', grams: 150, kcal_per_100g: 52, components: [{ name: 'Apple', grams: 150, kcal_per_100g: 52 }] }] },
      false,
    );
    expect(item.components).toBeUndefined();
    expect(item.grams).toBe(150);
  });
});

describe('dishes in storage and sync', () => {
  beforeEach(() => {
    localStorage.clear();
    reload();
  });

  it('keeps ingredients through save, reload and backup', () => {
    const food = builtinFood('db:lasagna')!;
    addEntry({ date: '2026-09-24', meal: 'dinner', source: 'food', ...entryFieldsFor(food, 250) });
    reload();
    const [e] = getData().entries;
    expect(e.ingredients).toHaveLength(5);
    expect(e.food!.ingredients).toHaveLength(5);
    const restored = parseData(JSON.parse(JSON.stringify(getData())));
    expect(restored.entries[0].ingredients).toEqual(e.ingredients);
  });

  it('sync parts carry ingredients and stay byte-identical', () => {
    addEntry({ date: '2026-09-24', meal: 'dinner', source: 'food', ...entryFieldsFor(builtinFood('db:burrito')!, 350) });
    const a = JSON.stringify([...buildParts(getData()).values()]);
    const b = JSON.stringify([...buildParts(parseData(JSON.parse(JSON.stringify(getData())))).values()]);
    expect(a).toBe(b);
    expect(a).toContain('Flour tortilla');
  });
});
