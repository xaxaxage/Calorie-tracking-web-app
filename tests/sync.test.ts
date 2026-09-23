import { beforeEach, describe, expect, it } from 'vitest';
import type { AppData, Entry } from '../src/lib/types';
import { buildParts, mergePart, parsePart, weekName, type Part } from '../src/lib/sync/parts';
import {
  decryptText,
  deriveKeys,
  encryptText,
  isValidPhrase,
  newPhrase,
  normalizePhrase,
  partLabel,
} from '../src/lib/sync/crypto';
import {
  addEntry,
  clearAll,
  deleteEntry,
  emptyData,
  getData,
  reload,
  toggleFavorite,
  updateEntry,
  updateSettings,
} from '../src/lib/store';
import { builtinFood } from '../src/lib/foods';

const entry = (id: string, date: string, extra: Partial<Entry> = {}): Entry => ({
  id,
  date,
  meal: 'lunch',
  name: `Food ${id}`,
  kcal: 100,
  p: 1,
  c: 2,
  f: 3,
  source: 'quick',
  createdAt: 1000,
  ...extra,
});

const withEntries = (entries: Entry[], meta: Partial<AppData['meta']> = {}): AppData => {
  const d = emptyData();
  return { ...d, entries, meta: { ...d.meta, ...meta } };
};

/** Send every part of `from` through JSON (as the relay would) and merge into `into`. */
function syncInto(into: AppData, from: AppData): AppData {
  let out = into;
  for (const part of buildParts(from).values()) out = mergePart(out, parsePart(JSON.parse(JSON.stringify(part))) as Part);
  return out;
}

describe('week parts', () => {
  it('uses ISO week numbers, including across new year', () => {
    expect(weekName('2026-09-23')).toBe('2026-W39');
    expect(weekName('2026-01-01')).toBe('2026-W01');
    expect(weekName('2024-12-30')).toBe('2025-W01');
    expect(weekName('2027-01-01')).toBe('2026-W53');
    expect(weekName('2026-03-29')).toBe('2026-W13'); // DST change in Europe
  });

  it('groups entries and deletions by week, with stable JSON', () => {
    const data = withEntries([entry('b', '2026-09-23'), entry('a', '2026-09-21'), entry('c', '2026-09-30')], {
      deletedEntries: { z: { at: 5, date: '2026-09-22' } },
    });
    const parts = buildParts(data);
    expect([...parts.keys()].sort()).toEqual(['2026-W39', '2026-W40', 'meta']);
    const w39 = parts.get('2026-W39')!;
    expect(w39.kind === 'week' && w39.entries.map((e) => e.id)).toEqual(['a', 'b']);
    expect(w39.kind === 'week' && w39.deleted).toEqual([{ id: 'z', at: 5, date: '2026-09-22' }]);
    const again = buildParts({ ...data, entries: [...data.entries].reverse() });
    expect(JSON.stringify(again.get('2026-W39'))).toBe(JSON.stringify(w39));
  });
});

describe('merging two devices', () => {
  it('adds entries from the other device and is idempotent', () => {
    const phone = withEntries([entry('p1', '2026-09-23')]);
    const tablet = withEntries([entry('t1', '2026-09-23'), entry('t2', '2026-09-01')]);
    const merged = syncInto(phone, tablet);
    expect(merged.entries.map((e) => e.id).sort()).toEqual(['p1', 't1', 't2']);
    expect(syncInto(merged, tablet)).toBe(merged);
    // Both directions converge.
    const back = syncInto(tablet, merged);
    expect(back.entries.map((e) => e.id).sort()).toEqual(['p1', 't1', 't2']);
  });

  it('keeps the newest edit of an entry', () => {
    const phone = withEntries([entry('x', '2026-09-23', { amount: 100, updatedAt: 2000 })]);
    const tablet = withEntries([entry('x', '2026-09-23', { amount: 250, updatedAt: 3000 })]);
    expect(syncInto(phone, tablet).entries[0].amount).toBe(250);
    expect(syncInto(tablet, phone).entries[0].amount).toBe(250);
  });

  it('applies deletions, but not over a later edit', () => {
    const phone = withEntries([entry('x', '2026-09-23', { updatedAt: 2000 }), entry('y', '2026-09-23')]);
    const tablet = withEntries([], {
      deletedEntries: { x: { at: 2500, date: '2026-09-23' }, y: { at: 500, date: '2026-09-23' } },
    });
    const merged = syncInto(phone, tablet);
    expect(merged.entries.map((e) => e.id)).toEqual(['y']);
    expect(merged.meta.deletedEntries.x.at).toBe(2500);
    // The deletion travels on to a third device that still has the entry.
    const laptop = withEntries([entry('x', '2026-09-23', { updatedAt: 2000 })]);
    expect(syncInto(laptop, merged).entries.map((e) => e.id)).toEqual(['y']);
  });

  it('merges favorites and goals by time', () => {
    const banana = builtinFood('db:banana')!;
    const apple = builtinFood('db:apple')!;
    const phone: AppData = {
      ...emptyData(),
      favorites: [banana],
      meta: { ...emptyData().meta, favoritedAt: { [banana.id]: 10 }, goalsAt: 50 },
      settings: { ...emptyData().settings, goals: { kcal: 2000, p: 140, c: 200, f: 70 } },
    };
    const tablet: AppData = {
      ...emptyData(),
      favorites: [apple],
      meta: { ...emptyData().meta, favoritedAt: { [apple.id]: 20 }, unfavoritedAt: { [banana.id]: 30 }, goalsAt: 60 },
      settings: { ...emptyData().settings, goals: { kcal: 1800, p: 130, c: 180, f: 60 } },
    };
    const merged = syncInto(phone, tablet);
    expect(merged.favorites.map((f) => f.id)).toEqual([apple.id]);
    expect(merged.settings.goals.kcal).toBe(1800);
    const other = syncInto(tablet, phone);
    expect(other.favorites.map((f) => f.id)).toEqual([apple.id]);
    expect(other.settings.goals.kcal).toBe(1800);
  });

  it('converges to byte-identical parts, even with ties and different field order', () => {
    // Same entry edited on both devices in the same millisecond, and fields in a different order.
    const a = withEntries([{ ...entry('x', '2026-09-23', { amount: 100, updatedAt: 2000 }) }]);
    const reordered = Object.fromEntries(Object.entries(entry('x', '2026-09-23', { amount: 150, updatedAt: 2000 })).reverse()) as Entry;
    const b = withEntries([reordered, entry('y', '2026-09-24')]);
    const ab = syncInto(a, b);
    const ba = syncInto(b, a);
    const json = (d: AppData) => JSON.stringify([...buildParts(d).values()]);
    expect(json(ab)).toBe(json(ba));
    // And a further round changes nothing.
    expect(syncInto(ab, ba)).toBe(ab);
  });

  it('never syncs API keys', () => {
    const data = { ...emptyData(), settings: { ...emptyData().settings, geminiKey: 'AIza-secret', apiKey: 'sk-ant-x' } };
    const json = JSON.stringify([...buildParts(data).values()]);
    expect(json).not.toContain('AIza-secret');
    expect(json).not.toContain('sk-ant-x');
  });

  it('ignores malformed parts', () => {
    expect(parsePart({ kind: 'week', name: 'bad' })).toBeUndefined();
    expect(parsePart('nope')).toBeUndefined();
    const part = parsePart({ kind: 'week', name: '2026-W39', entries: [{ id: 1 }], deleted: [{ id: 'x' }] }) as Part;
    expect(part.kind === 'week' && part.entries.length + part.deleted.length).toBe(0);
  });
});

describe('store bookkeeping for sync', () => {
  beforeEach(() => {
    localStorage.clear();
    reload();
  });

  it('records edits, deletions, favorites and goal changes', () => {
    const e = addEntry({ date: '2026-09-23', meal: 'lunch', name: 'Soup', kcal: 1, p: 0, c: 0, f: 0, source: 'quick' });
    expect(e.updatedAt).toBe(e.createdAt);
    updateEntry(e.id, { kcal: 2 });
    expect(getData().entries[0].updatedAt).toBeGreaterThan(e.createdAt);
    deleteEntry(e.id);
    expect(getData().meta.deletedEntries[e.id].date).toBe('2026-09-23');
    const banana = builtinFood('db:banana')!;
    toggleFavorite(banana);
    toggleFavorite(banana);
    expect(getData().meta.unfavoritedAt[banana.id]).toBeGreaterThan(getData().meta.favoritedAt[banana.id]);
    updateSettings({ goals: { kcal: 1900, p: 1, c: 1, f: 1 } });
    expect(getData().meta.goalsAt).toBeGreaterThan(0);
  });

  it('delete all leaves deletions for other devices', () => {
    const e = addEntry({ date: '2026-09-23', meal: 'lunch', name: 'Soup', kcal: 1, p: 0, c: 0, f: 0, source: 'quick' });
    clearAll();
    expect(getData().entries).toEqual([]);
    expect(getData().meta.deletedEntries[e.id]).toBeDefined();
  });
});

describe('sync key and encryption', () => {
  it('makes 12-word keys and accepts pasted or dictated variants', () => {
    const phrase = newPhrase();
    expect(phrase.split(' ')).toHaveLength(12);
    expect(isValidPhrase(phrase)).toBe(true);
    expect(isValidPhrase(`  ${phrase.toUpperCase().replace(/ /g, ',\n ')}.`)).toBe(true);
    expect(isValidPhrase(phrase.split(' ').slice(0, 11).join(' '))).toBe(false);
    expect(isValidPhrase('abandon '.repeat(12))).toBe(false); // bad checksum
    expect(normalizePhrase(' Apple,  BANANA\ncherry ')).toBe('apple banana cherry');
  });

  it('derives the same keys from the same phrase on every device', async () => {
    const phrase = newPhrase();
    const a = await deriveKeys(phrase);
    const b = await deriveKeys(phrase.toUpperCase());
    expect(a.pubkey).toBe(b.pubkey);
    expect(a.pubkey).toMatch(/^[0-9a-f]{64}$/);
    expect(await partLabel(a.nameKey, '2026-W39')).toBe(await partLabel(b.nameKey, '2026-W39'));
    expect(await partLabel(a.nameKey, '2026-W39')).not.toContain('2026');
    const other = await deriveKeys(newPhrase());
    expect(other.pubkey).not.toBe(a.pubkey);
  });

  it('encrypts so only the same phrase can read it', async () => {
    const phrase = newPhrase();
    const a = await deriveKeys(phrase);
    const b = await deriveKeys(phrase);
    const text = JSON.stringify({ kind: 'week', name: '2026-W39', entries: Array(50).fill({ name: 'Oatmeal with milk' }) });
    const sealed = await encryptText(a.encKey, text);
    expect(sealed.startsWith('1z:')).toBe(true);
    expect(sealed).not.toContain('Oatmeal');
    expect(sealed.length).toBeLessThan(text.length); // compressed
    expect(await decryptText(b.encKey, sealed)).toBe(text);
    const stranger = await deriveKeys(newPhrase());
    await expect(decryptText(stranger.encKey, sealed)).rejects.toThrow();
  });
});
