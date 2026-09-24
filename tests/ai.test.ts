import { describe, expect, it } from 'vitest';
import { AiError, checkNutrition, normalizeItems, parseJsonReply, PHOTO_PROMPT, PHOTO_SCHEMA, TEXT_SCHEMA, textPrompt, withPropertyOrdering } from '../src/lib/ai/shared';
import { aiReady, providerName } from '../src/lib/ai';
import { emptyData } from '../src/lib/store';

describe('AI output validation', () => {
  it('accepts well-formed items and clamps impossible values', () => {
    const items = normalizeItems(
      {
        items: [
          { name: ' Rice ', grams: 150.4, kcal_per_100g: 130, protein_per_100g: 2.7, carbs_per_100g: 28, fat_per_100g: 0.3, x: 1.4, y: -1 },
          { name: 'Mystery', grams: 99999, kcal_per_100g: 5000, protein_per_100g: -3, carbs_per_100g: '12', fat_per_100g: null },
          { name: '', grams: 10 },
          'junk',
        ],
      },
      true,
    );
    expect(items).toEqual([
      { name: 'Rice', grams: 150, per100: { kcal: 130, p: 2.7, c: 28, f: 0.3 }, x: 1, y: 0 },
      // 900 kcal can't come from 12 g of carbs, so calories follow the macros.
      { name: 'Mystery', grams: 5000, per100: { kcal: 48, p: 0, c: 12, f: 0 }, x: 0.5, y: 0.5 },
    ]);
  });

  it('omits photo positions for text estimates', () => {
    const [item] = normalizeItems({ items: [{ name: 'Latte', grams: 350, kcal_per_100g: 42 }] }, false);
    expect(item).not.toHaveProperty('x');
  });

  it('rejects replies that are not an item list', () => {
    expect(() => normalizeItems({ foods: [] }, false)).toThrow(AiError);
    expect(() => parseJsonReply('')).toThrow(AiError);
    expect(() => parseJsonReply('{"items": [')).toThrow(AiError);
    expect(parseJsonReply('```json\n{"items": []}\n```')).toEqual({ items: [] });
    expect(parseJsonReply('Here is the estimate:\n{"items": []}\nEnjoy!')).toEqual({ items: [] });
  });

  it('keeps the description separate from the instructions', () => {
    expect(textPrompt('2 eggs')).toContain('<description>\n2 eggs\n</description>');
  });

  it('knows when the chosen provider is set up', () => {
    const s = emptyData().settings;
    expect(aiReady(s)).toBe(false);
    expect(aiReady({ ...s, geminiKey: 'AIza' })).toBe(true);
    expect(aiReady({ ...s, aiProvider: 'claude', geminiKey: 'AIza' })).toBe(false);
    expect(providerName({ ...s, aiProvider: 'claude' })).toBe('Claude');
    expect(providerName(s)).toBe('Gemini');
  });
});

describe('what the AI is asked', () => {
  it('names the food, then its components, then the totals', () => {
    expect(Object.keys(PHOTO_SCHEMA.properties.items.items.properties)).toEqual([
      'name', 'components', 'grams', 'kcal_per_100g', 'protein_per_100g', 'carbs_per_100g', 'fat_per_100g', 'x', 'y',
    ]);
    expect(Object.keys(TEXT_SCHEMA.properties.items.items.properties)).toEqual([
      'name', 'components', 'grams', 'kcal_per_100g', 'protein_per_100g', 'carbs_per_100g', 'fat_per_100g',
    ]);
  });

  it('spells out the field order for Gemini at every level', () => {
    const s = withPropertyOrdering(TEXT_SCHEMA) as any;
    expect(s.propertyOrdering).toEqual(['items']);
    expect(s.properties.items.items.propertyOrdering.slice(0, 3)).toEqual(['name', 'components', 'grams']);
    expect(s.properties.items.items.properties.components.items.propertyOrdering[0]).toBe('name');
    // The shared schema itself stays plain JSON Schema.
    expect((TEXT_SCHEMA as any).propertyOrdering).toBeUndefined();
  });

  it('keeps raw and dry weights raw, and treats "X with Y" as one dish', () => {
    const p = textPrompt('100 g rice');
    expect(p).toContain('If they give a raw or dry weight');
    expect(p).toContain('"toast with butter"');
    expect(p).toContain('are separate items');
    expect(p).not.toContain('unless its parts are listed separately');
  });

  it('gives photo estimates a sense of scale, drinks in ml, labels and what to ignore', () => {
    expect(PHOTO_PROMPT).toMatch(/dinner plate is about 26–27 cm/);
    expect(PHOTO_PROMPT).toMatch(/volume in ml/);
    expect(PHOTO_PROMPT).toMatch(/nutrition label/);
    expect(PHOTO_PROMPT).toMatch(/other people's plates/);
  });
});

describe('checking the numbers that come back', () => {
  it('keeps macros within the 100 g', () => {
    expect(checkNutrition('Odd', { kcal: 500, p: 60, c: 60, f: 30 })).toEqual({ kcal: 500, p: 40, c: 40, f: 20 });
  });

  it('recalculates calories that clearly disagree with the macros', () => {
    // Grilled chicken can't be 400 kcal with 31 g protein and 3.6 g fat.
    expect(checkNutrition('Chicken breast, grilled', { kcal: 400, p: 31, c: 0, f: 3.6 }).kcal).toBe(156);
    // Nor can peanut butter be 90 kcal.
    expect(checkNutrition('Peanut butter', { kcal: 90, p: 25, c: 20, f: 50 }).kcal).toBe(630);
    // Missing calories are filled in.
    expect(checkNutrition('Oats', { kcal: 0, p: 13, c: 68, f: 6.5 }).kcal).toBe(383);
  });

  it('leaves normal gaps, alcohol and sweeteners alone', () => {
    expect(checkNutrition('Lettuce', { kcal: 15, p: 1.4, c: 2.9, f: 0.2 }).kcal).toBe(15);
    expect(checkNutrition('Broccoli, steamed', { kcal: 35, p: 2.4, c: 7, f: 0.4 }).kcal).toBe(35);
    expect(checkNutrition('Beer', { kcal: 43, p: 0.5, c: 3.6, f: 0 }).kcal).toBe(43);
    expect(checkNutrition('Red wine', { kcal: 85, p: 0.1, c: 2.6, f: 0 }).kcal).toBe(85);
    expect(checkNutrition('Пиво светлое', { kcal: 42, p: 0.3, c: 4.6, f: 0 }).kcal).toBe(42);
    expect(checkNutrition('Erythritol sweetener', { kcal: 20, p: 0, c: 100, f: 0 }).kcal).toBe(20);
    // No macros given at all: nothing to check against.
    expect(checkNutrition('Cola', { kcal: 42, p: 0, c: 0, f: 0 }).kcal).toBe(42);
  });
});
