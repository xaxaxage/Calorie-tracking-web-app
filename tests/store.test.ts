import { beforeEach, describe, expect, it } from 'vitest';
import {
  addEntry,
  backupJson,
  clearAll,
  deleteEntry,
  findFood,
  getData,
  isFavorite,
  parseData,
  recentFoods,
  reload,
  STORAGE_KEY,
  toggleFavorite,
  updateEntry,
} from '../src/lib/store';
import { builtinFood } from '../src/lib/foods';

const banana = builtinFood('db:banana')!;

describe('store', () => {
  beforeEach(() => {
    localStorage.clear();
    reload();
  });

  it('starts with default goals', () => {
    expect(getData().settings.goals).toEqual({ kcal: 2300, p: 150, c: 250, f: 75 });
    expect(getData().entries).toEqual([]);
  });

  it('persists entries to localStorage', () => {
    const e = addEntry({ date: '2026-09-23', meal: 'snack', name: 'Banana', amount: 118, unit: 'g', food: banana, kcal: 105, p: 1.3, c: 27, f: 0.4, source: 'food' });
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.entries).toHaveLength(1);
    updateEntry(e.id, { amount: 200, kcal: 178 });
    reload();
    expect(getData().entries[0].kcal).toBe(178);
    deleteEntry(e.id);
    expect(getData().entries).toHaveLength(0);
  });

  it('lists recent foods newest first without duplicates', () => {
    const base = { date: '2026-09-23', meal: 'snack' as const, unit: 'g' as const, kcal: 1, p: 0, c: 0, f: 0, source: 'food' as const };
    const apple = builtinFood('db:apple')!;
    addEntry({ ...base, name: 'Banana', amount: 100, food: banana });
    addEntry({ ...base, name: 'Apple', amount: 150, food: apple });
    addEntry({ ...base, name: 'Banana', amount: 120, food: banana });
    addEntry({ ...base, name: 'Quick', source: 'quick' });
    const recent = recentFoods(getData().entries);
    expect(recent.map((r) => r.food.name)).toEqual(['Banana', 'Apple']);
    expect(recent[0].amount).toBe(120);
  });

  it('toggles favorites and finds foods by id', () => {
    const offFood = { ...banana, id: 'off:123', name: 'Branded banana chips' };
    toggleFavorite(offFood);
    expect(isFavorite('off:123')).toBe(true);
    expect(findFood('off:123')?.name).toBe('Branded banana chips');
    toggleFavorite(offFood);
    expect(isFavorite('off:123')).toBe(false);
    expect(findFood('db:banana')?.name).toBe('Banana');
  });

  it('keeps settings when clearing entries', () => {
    addEntry({ date: '2026-09-23', meal: 'lunch', name: 'X', kcal: 10, p: 0, c: 0, f: 0, source: 'quick' });
    clearAll();
    expect(getData().entries).toHaveLength(0);
    expect(getData().settings.goals.kcal).toBe(2300);
  });

  it('defaults to the free Gemini provider, and keeps Claude for people who already set a key', () => {
    expect(getData().settings.aiProvider).toBe('gemini');
    expect(getData().settings.geminiModel).toBe('gemini-flash-lite-latest');
    expect(getData().settings.geminiAutoSwitch).toBe(true);
    const custom = parseData({
      version: 1,
      settings: { geminiModel: 'gemini-3.5-flash', geminiModels: [{ id: 'gemma-3-27b-it', label: 'Gemma' }, { id: '<bad>' }] },
    });
    expect(custom.settings.geminiModel).toBe('gemini-3.5-flash');
    expect(custom.settings.geminiModels).toEqual([{ id: 'gemma-3-27b-it', label: 'Gemma' }]);
    expect(parseData({ version: 1, settings: { geminiModel: 'drop table;' } }).settings.geminiModel).toBe('gemini-flash-lite-latest');
    const old = parseData({ version: 1, entries: [], favorites: [], settings: { goals: {}, apiKey: 'sk-ant-x' } });
    expect(old.settings.aiProvider).toBe('claude');
    expect(old.settings.geminiKey).toBe('');
  });

  it('leaves API keys out of backups, and a restore keeps working without them', () => {
    addEntry({ date: '2026-09-23', meal: 'lunch', name: 'Soup', kcal: 200, p: 5, c: 20, f: 8, source: 'quick' });
    const withKey = { ...getData(), settings: { ...getData().settings, apiKey: 'sk-ant-secret', geminiKey: 'AIza-secret' } };
    const json = backupJson(withKey);
    expect(json).not.toContain('sk-ant-secret');
    expect(json).not.toContain('AIza-secret');
    expect(json).not.toContain('apiKey');
    expect(json).not.toContain('geminiKey');
    const restored = parseData(JSON.parse(json));
    expect(restored.entries).toHaveLength(1);
    expect(restored.settings.apiKey).toBe('');
  });

  it('validates backups and drops malformed entries', () => {
    expect(() => parseData({ hello: 1 })).toThrow();
    const data = parseData({
      version: 1,
      entries: [
        { id: 'a', date: '2026-09-23', meal: 'lunch', name: 'Soup', kcal: 200, p: 5, c: 20, f: 8, source: 'quick', createdAt: 1 },
        { id: 'b', date: 'not-a-date', meal: 'lunch', name: 'Bad', kcal: 1 },
        { id: 'c', date: '2026-09-23', meal: 'brunch', name: 'Bad meal', kcal: 1 },
      ],
      favorites: [{ nope: true }],
      settings: { goals: { kcal: 1800 } },
    });
    expect(data.entries.map((e) => e.id)).toEqual(['a']);
    expect(data.favorites).toEqual([]);
    expect(data.settings.goals).toEqual({ kcal: 1800, p: 150, c: 250, f: 75 });
  });
});
