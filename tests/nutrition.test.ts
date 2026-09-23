import { describe, expect, it } from 'vitest';
import { builtinFood, FOODS, searchFoods } from '../src/lib/foods';
import { cleanAmount, fmtKcal, kcalFromMacros, macroSplit, macrosFor, parseNumber, sum } from '../src/lib/nutrition';

describe('nutrition', () => {
  it('scales per-100 g values to a portion (design: 180 g pasta = 268 kcal)', () => {
    const pasta = builtinFood('db:pasta-wholegrain-cooked')!;
    const m = macrosFor(pasta, 180);
    expect(Math.round(m.kcal)).toBe(268);
    expect(m.p).toBeCloseTo(10.8);
    expect(m.f).toBeCloseTo(3.06);
  });

  it('matches the design numbers for the scanned oat drink', () => {
    const oat = builtinFood('db:oat-drink-barista')!;
    const m = macrosFor(oat, 250);
    expect(Math.round(m.kcal)).toBe(148);
    expect(m.p).toBeCloseTo(2.5);
    expect(m.c).toBeCloseTo(16.5);
    expect(m.f).toBeCloseTo(7.5);
  });

  it('sums and splits macros', () => {
    const total = sum([
      { kcal: 100, p: 10, c: 5, f: 2 },
      { kcal: 50, p: 1, c: 10, f: 0 },
    ]);
    expect(total).toEqual({ kcal: 150, p: 11, c: 15, f: 2 });
    expect(kcalFromMacros({ p: 35, c: 70, f: 24 })).toBe(636);
    const split = macroSplit({ p: 10, c: 10, f: 0 });
    expect(split.p).toBeCloseTo(50);
    expect(macroSplit({ p: 0, c: 0, f: 0 })).toEqual({ p: 0, c: 0, f: 0 });
  });

  it('cleans user input', () => {
    expect(cleanAmount('180.4')).toBe(180);
    expect(cleanAmount(-5)).toBe(0);
    expect(cleanAmount('abc')).toBe(0);
    expect(cleanAmount(99999)).toBe(5000);
    expect(parseNumber('12,5')).toBe(12.5);
    expect(fmtKcal(1327.4)).toBe('1,327');
  });

  it('keeps built-in foods internally consistent', () => {
    const ids = new Set<string>();
    for (const f of FOODS) {
      expect(ids.has(f.id), f.id).toBe(false);
      ids.add(f.id);
      expect(f.defaultAmount, f.id).toBeGreaterThan(0);
      // Stated calories should roughly agree with 4/4/9 from the macros. Low-calorie
      // produce (fiber) and alcoholic drinks legitimately differ, so check the rest.
      const implied = kcalFromMacros(f.per100);
      if (f.per100.kcal >= 100) expect(Math.abs(implied - f.per100.kcal) / f.per100.kcal, f.id).toBeLessThan(0.2);
    }
  });

  it('searches by name and keyword', () => {
    expect(searchFoods(FOODS, 'banana')[0].name).toBe('Banana');
    expect(searchFoods(FOODS, 'greek yog').map((f) => f.name)).toContain('Greek yogurt 0%');
    expect(searchFoods(FOODS, 'courgette')[0].name).toBe('Zucchini');
    expect(searchFoods(FOODS, 'chicken breast')[0].name).toBe('Chicken breast, grilled');
    expect(searchFoods(FOODS, 'zzzz')).toEqual([]);
  });
});
