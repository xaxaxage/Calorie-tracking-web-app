import { describe, expect, it } from 'vitest';
import { AiError, normalizeItems, parseJsonReply, textPrompt } from '../src/lib/ai/shared';
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
      { name: 'Mystery', grams: 5000, per100: { kcal: 900, p: 0, c: 12, f: 0 }, x: 0.5, y: 0.5 },
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
