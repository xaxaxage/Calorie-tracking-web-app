import type { AiProvider, AppData, Entry, Food, Goals, SyncMeta } from '../types';
import { cleanEntry, cleanFood, DEFAULT_GEMINI_MODEL, isModelId } from '../store';
import { fromKey, isDateKey } from '../dates';

/**
 * Sync splits the data into small parts — one per ISO week of entries, one
 * "meta" part for favorites and goals, and one "ai" part for the AI setup
 * (provider, API keys, model) — so each fits comfortably in a relay message
 * and only the parts that changed are uploaded again. Every part is
 * encrypted before it leaves the device.
 *
 * Merging is per item and order-independent: the newest edit of an entry
 * wins, and a deletion wins over any edit made before it.
 */

export interface WeekPart {
  kind: 'week';
  name: string;
  entries: Entry[];
  deleted: { id: string; at: number; date: string }[];
}

export interface MetaPart {
  kind: 'meta';
  name: 'meta';
  favorites: { food: Food; at: number }[];
  unfavorited: { id: string; at: number }[];
  goals: Goals;
  goalsAt: number;
}

/** The AI setup, so a key entered on one device works on all of them. */
export interface AiPart {
  kind: 'ai';
  name: 'ai';
  provider: AiProvider;
  geminiModel: string;
  geminiAutoSwitch: boolean;
  /** When the provider/model choice changed. */
  at: number;
  apiKey: string;
  apiKeyAt: number;
  geminiKey: string;
  geminiKeyAt: number;
}

export type Part = WeekPart | MetaPart | AiPart;

function aiPart(data: AppData): AiPart {
  const { settings: s, meta } = data;
  return {
    kind: 'ai',
    name: 'ai',
    provider: s.aiProvider,
    geminiModel: s.geminiModel,
    geminiAutoSwitch: s.geminiAutoSwitch,
    at: meta.aiAt,
    apiKey: s.apiKey,
    apiKeyAt: meta.apiKeyAt,
    geminiKey: s.geminiKey,
    geminiKeyAt: meta.geminiKeyAt,
  };
}

/** "2026-W39" for the ISO week containing the day. */
export function weekName(dateKey: string): string {
  const d = fromKey(dateKey);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day + 3); // Thursday of this week decides the year
  const year = d.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const editedAt = (e: Entry) => e.updatedAt ?? e.createdAt;

/**
 * Fixed field order, no undefined fields: two devices holding the same data
 * must produce byte-identical parts, or they would keep re-uploading.
 */
export function canonicalFood(f: Food): Food {
  return cleanFood(f)!;
}

export function canonicalEntry(e: Entry): Entry {
  const c = cleanEntry(e)!;
  return JSON.parse(JSON.stringify(c));
}

/** Deterministic pick between two versions with the same timestamp. */
function laterOf<T>(a: T, b: T, canon: (x: T) => unknown): T {
  return JSON.stringify(canon(a)) >= JSON.stringify(canon(b)) ? a : b;
}

/** All parts for the data, keyed by name. Content is sorted so equal data gives equal JSON. */
export function buildParts(data: AppData): Map<string, Part> {
  const parts = new Map<string, Part>();
  const week = (date: string): WeekPart => {
    const name = weekName(date);
    let part = parts.get(name) as WeekPart | undefined;
    if (!part) {
      part = { kind: 'week', name, entries: [], deleted: [] };
      parts.set(name, part);
    }
    return part;
  };
  for (const e of data.entries) week(e.date).entries.push(canonicalEntry(e));
  for (const [id, t] of Object.entries(data.meta.deletedEntries)) week(t.date).deleted.push({ id, at: t.at, date: t.date });
  for (const p of parts.values()) {
    if (p.kind === 'week') {
      p.entries.sort(byId);
      p.deleted.sort(byId);
    }
  }

  const favorites = data.favorites
    .map((food) => ({ food: canonicalFood(food), at: data.meta.favoritedAt[food.id] ?? 0 }))
    .sort((a, b) => byId(a.food, b.food));
  const unfavorited = Object.entries(data.meta.unfavoritedAt)
    .map(([id, at]) => ({ id, at }))
    .sort(byId);
  parts.set('meta', {
    kind: 'meta',
    name: 'meta',
    favorites,
    unfavorited,
    goals: data.settings.goals,
    goalsAt: data.meta.goalsAt,
  });
  parts.set('ai', aiPart(data));
  return parts;
}

/** Validate a part received from another device. */
export function parsePart(raw: any): Part | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  if (raw.kind === 'week' && typeof raw.name === 'string' && /^\d{4}-W\d{2}$/.test(raw.name)) {
    return {
      kind: 'week',
      name: raw.name,
      entries: (Array.isArray(raw.entries) ? raw.entries : []).map(cleanEntry).filter(Boolean) as Entry[],
      deleted: (Array.isArray(raw.deleted) ? raw.deleted : []).filter(
        (d: any) => d && typeof d.id === 'string' && typeof d.at === 'number' && isDateKey(d.date),
      ),
    };
  }
  if (raw.kind === 'ai') {
    const key = (v: unknown) => (typeof v === 'string' && v.length <= 400 ? v.trim() : '');
    const time = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
    return {
      kind: 'ai',
      name: 'ai',
      provider: raw.provider === 'claude' ? 'claude' : 'gemini',
      geminiModel: isModelId(raw.geminiModel) ? raw.geminiModel : DEFAULT_GEMINI_MODEL,
      geminiAutoSwitch: raw.geminiAutoSwitch !== false,
      at: time(raw.at),
      apiKey: key(raw.apiKey),
      apiKeyAt: time(raw.apiKeyAt),
      geminiKey: key(raw.geminiKey),
      geminiKeyAt: time(raw.geminiKeyAt),
    };
  }
  if (raw.kind === 'meta') {
    const g = raw.goals ?? {};
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);
    const goals = n(g.kcal) && n(g.p) && n(g.c) && n(g.f) ? { kcal: g.kcal, p: g.p, c: g.c, f: g.f } : undefined;
    return {
      kind: 'meta',
      name: 'meta',
      favorites: (Array.isArray(raw.favorites) ? raw.favorites : [])
        .map((f: any) => ({ food: cleanFood(f?.food), at: typeof f?.at === 'number' ? f.at : 0 }))
        .filter((f: any) => f.food),
      unfavorited: (Array.isArray(raw.unfavorited) ? raw.unfavorited : []).filter(
        (u: any) => u && typeof u.id === 'string' && typeof u.at === 'number',
      ),
      goals: goals ?? { kcal: 0, p: 0, c: 0, f: 0 },
      goalsAt: goals && typeof raw.goalsAt === 'number' ? raw.goalsAt : 0,
    };
  }
  return undefined;
}

/** Merge a part from another device into local data. Returns the same object if nothing changed. */
export function mergePart(data: AppData, part: Part): AppData {
  if (part.kind === 'week') return mergeWeek(data, part);
  if (part.kind === 'ai') return mergeAi(data, part);
  return mergeMeta(data, part);
}

/**
 * The newest provider/model choice wins, and each key separately: choosing a
 * model on a device without a key never erases the key set elsewhere. Ties
 * (keys saved before they synced) keep whichever key exists.
 */
function mergeAi(data: AppData, part: AiPart): AppData {
  const mine = aiPart(data);
  const next = { ...mine };

  const choice = (x: AiPart) => JSON.stringify([x.provider, x.geminiModel, x.geminiAutoSwitch]);
  if (part.at > mine.at || (part.at === mine.at && choice(part) > choice(mine))) {
    next.provider = part.provider;
    next.geminiModel = part.geminiModel;
    next.geminiAutoSwitch = part.geminiAutoSwitch;
    next.at = part.at;
  }
  const either = (a: string, b: string) => (a && b ? (a > b ? a : b) : a || b);
  for (const [k, at] of [['apiKey', 'apiKeyAt'], ['geminiKey', 'geminiKeyAt']] as const) {
    if (part[at] > mine[at]) {
      next[k] = part[k];
      next[at] = part[at];
    } else if (part[at] === mine[at]) next[k] = either(mine[k], part[k]);
  }

  if (JSON.stringify(next) === JSON.stringify(mine)) return data;
  return {
    ...data,
    settings: {
      ...data.settings,
      aiProvider: next.provider,
      geminiModel: next.geminiModel,
      geminiAutoSwitch: next.geminiAutoSwitch,
      apiKey: next.apiKey,
      geminiKey: next.geminiKey,
    },
    meta: { ...data.meta, aiAt: next.at, apiKeyAt: next.apiKeyAt, geminiKeyAt: next.geminiKeyAt },
  };
}

function mergeWeek(data: AppData, part: WeekPart): AppData {
  let changed = false;
  const deletedEntries: SyncMeta['deletedEntries'] = { ...data.meta.deletedEntries };
  for (const d of part.deleted) {
    const known = deletedEntries[d.id];
    if (!known || d.at > known.at) {
      deletedEntries[d.id] = { at: d.at, date: d.date };
      changed = true;
    }
  }

  const byEntryId = new Map(data.entries.map((e) => [e.id, e]));
  for (const remote of part.entries) {
    const local = byEntryId.get(remote.id);
    const takeRemote =
      !local ||
      editedAt(remote) > editedAt(local) ||
      (editedAt(remote) === editedAt(local) && laterOf(remote, local, canonicalEntry) === remote &&
        JSON.stringify(canonicalEntry(remote)) !== JSON.stringify(canonicalEntry(local)));
    if (takeRemote) {
      byEntryId.set(remote.id, remote);
      changed = true;
    }
  }

  // A deletion wins over any edit made before it.
  for (const [id, e] of byEntryId) {
    const gone = deletedEntries[id];
    if (gone && gone.at >= editedAt(e)) {
      byEntryId.delete(id);
      if (data.entries.some((x) => x.id === id)) changed = true;
    }
  }
  if (!changed) return data;
  return { ...data, entries: [...byEntryId.values()], meta: { ...data.meta, deletedEntries } };
}

function mergeMeta(data: AppData, part: MetaPart): AppData {
  let changed = false;
  const favoritedAt = { ...data.meta.favoritedAt };
  const unfavoritedAt = { ...data.meta.unfavoritedAt };
  const foods = new Map(data.favorites.map((f) => [f.id, f]));

  for (const { food, at } of part.favorites) {
    const mine = foods.get(food.id);
    if (!mine) foods.set(food.id, food);
    else if (laterOf(food, mine, canonicalFood) === food && JSON.stringify(canonicalFood(food)) !== JSON.stringify(canonicalFood(mine))) {
      foods.set(food.id, food);
      changed = true;
    }
    if (at > (favoritedAt[food.id] ?? -1)) {
      favoritedAt[food.id] = at;
      changed = true;
    }
  }
  for (const { id, at } of part.unfavorited) {
    if (at > (unfavoritedAt[id] ?? -1)) {
      unfavoritedAt[id] = at;
      changed = true;
    }
  }

  const favorites = [...foods.values()]
    .filter((f) => (favoritedAt[f.id] ?? 0) > (unfavoritedAt[f.id] ?? -1))
    .sort((a, b) => (favoritedAt[b.id] ?? 0) - (favoritedAt[a.id] ?? 0));
  const sameFavorites =
    favorites.length === data.favorites.length && favorites.every((f, i) => f.id === data.favorites[i].id);

  let settings = data.settings;
  let goalsAt = data.meta.goalsAt;
  const sameTimeOtherGoals =
    part.goalsAt === goalsAt && JSON.stringify(part.goals) > JSON.stringify(data.settings.goals);
  if ((part.goalsAt > goalsAt || sameTimeOtherGoals) && part.goals.kcal > 0) {
    settings = { ...settings, goals: part.goals };
    goalsAt = part.goalsAt;
    changed = true;
  }

  if (!changed && sameFavorites) return data;
  return { ...data, favorites, settings, meta: { ...data.meta, favoritedAt, unfavoritedAt, goalsAt } };
}
