import { useEffect, useState } from 'preact/hooks';
import type { AppData, Entry, Food, Goals, Settings, SyncMeta } from './types';
import { MEALS } from './types';
import { builtinFood } from './foods';
import { isDateKey } from './dates';
import { cleanCustomTheme, DEFAULT_THEME } from './theme';
import { cleanIngredients } from './dish';

export const STORAGE_KEY = 'calorie-tracker:v1';

export const DEFAULT_GOALS: Goals = { kcal: 2300, p: 150, c: 250, f: 75 };

export const DEFAULT_GEMINI_MODEL = 'gemini-flash-lite-latest';

export const MAX_CUSTOM_THEMES = 12;

/** Gemini model IDs look like "gemini-3.5-flash-lite" or "gemma-3-27b-it". */
export function isModelId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9.\-_]{1,80}$/i.test(value);
}

export function emptyMeta(): SyncMeta {
  return { deletedEntries: {}, favoritedAt: {}, unfavoritedAt: {}, goalsAt: 0, aiAt: 0, apiKeyAt: 0, geminiKeyAt: 0 };
}

export function emptyData(): AppData {
  return {
    version: 1,
    entries: [],
    favorites: [],
    meta: emptyMeta(),
    settings: {
      goals: { ...DEFAULT_GOALS },
      aiProvider: 'gemini',
      apiKey: '',
      geminiKey: '',
      geminiModel: DEFAULT_GEMINI_MODEL,
      geminiModels: [],
      geminiAutoSwitch: true,
      theme: DEFAULT_THEME,
      customThemes: [],
      humor: true,
      dishBuilder: true,
      animations: true,
      savePhotos: true,
    },
  };
}

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

function cleanFood(raw: any): Food | undefined {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || typeof raw.name !== 'string') return undefined;
  const per = raw.per100 ?? {};
  return {
    id: raw.id,
    name: raw.name,
    brand: typeof raw.brand === 'string' ? raw.brand : undefined,
    unit: raw.unit === 'ml' ? 'ml' : 'g',
    per100: { kcal: num(per.kcal), p: num(per.p), c: num(per.c), f: num(per.f) },
    servings: Array.isArray(raw.servings)
      ? raw.servings
          .filter((s: any) => s && typeof s.label === 'string' && num(s.amount) > 0)
          .map((s: any) => ({ label: s.label, amount: num(s.amount) }))
      : undefined,
    defaultAmount: num(raw.defaultAmount) > 0 ? num(raw.defaultAmount) : undefined,
    barcode: typeof raw.barcode === 'string' ? raw.barcode : undefined,
    ingredients: cleanIngredients(raw.ingredients),
  };
}

function cleanEntry(raw: any): Entry | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  if (typeof raw.id !== 'string' || !isDateKey(raw.date) || !MEALS.includes(raw.meal)) return undefined;
  return {
    id: raw.id,
    date: raw.date,
    meal: raw.meal,
    name: typeof raw.name === 'string' && raw.name ? raw.name : 'Food',
    amount: num(raw.amount) > 0 ? num(raw.amount) : undefined,
    unit: raw.unit === 'ml' ? 'ml' : raw.unit === 'g' ? 'g' : undefined,
    food: cleanFood(raw.food),
    kcal: Math.max(0, num(raw.kcal)),
    p: Math.max(0, num(raw.p)),
    c: Math.max(0, num(raw.c)),
    f: Math.max(0, num(raw.f)),
    source: ['food', 'barcode', 'photo', 'text', 'quick', 'copy'].includes(raw.source) ? raw.source : 'quick',
    createdAt: num(raw.createdAt, Date.now()),
    updatedAt: num(raw.updatedAt) > 0 ? num(raw.updatedAt) : undefined,
    ingredients: cleanIngredients(raw.ingredients),
  };
}

function cleanTimes(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

export function cleanMeta(raw: any): SyncMeta {
  const deletedEntries: SyncMeta['deletedEntries'] = {};
  if (raw?.deletedEntries && typeof raw.deletedEntries === 'object') {
    for (const [id, v] of Object.entries<any>(raw.deletedEntries)) {
      if (v && typeof v.at === 'number' && isDateKey(v.date)) deletedEntries[id] = { at: v.at, date: v.date };
    }
  }
  return {
    deletedEntries,
    favoritedAt: cleanTimes(raw?.favoritedAt),
    unfavoritedAt: cleanTimes(raw?.unfavoritedAt),
    goalsAt: num(raw?.goalsAt),
    aiAt: num(raw?.aiAt),
    apiKeyAt: num(raw?.apiKeyAt),
    geminiKeyAt: num(raw?.geminiKeyAt),
  };
}

export { cleanEntry, cleanFood };

/** Validate data loaded from storage or an imported backup. Throws if it isn't app data. */
export function parseData(raw: unknown): AppData {
  if (!raw || typeof raw !== 'object' || (raw as any).version !== 1) {
    throw new Error('This file is not a Calorie Tracker backup.');
  }
  const r = raw as any;
  const goals = r.settings?.goals ?? {};
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const apiKey = str(r.settings?.apiKey);
  const geminiKey = str(r.settings?.geminiKey);
  const meta = cleanMeta(r.meta);
  // Keys saved before keys synced: count them as set long ago, so they reach a
  // device without a key but lose to any key entered or removed from now on.
  if (apiKey && !meta.apiKeyAt) meta.apiKeyAt = 1;
  if (geminiKey && !meta.geminiKeyAt) meta.geminiKeyAt = 1;
  return {
    version: 1,
    entries: Array.isArray(r.entries) ? r.entries.map(cleanEntry).filter(Boolean) : [],
    favorites: Array.isArray(r.favorites) ? r.favorites.map(cleanFood).filter(Boolean) : [],
    meta,
    settings: {
      goals: {
        kcal: num(goals.kcal, DEFAULT_GOALS.kcal),
        p: num(goals.p, DEFAULT_GOALS.p),
        c: num(goals.c, DEFAULT_GOALS.c),
        f: num(goals.f, DEFAULT_GOALS.f),
      },
      // Older data only had a Claude key; keep using Claude for people who set one up.
      aiProvider: r.settings?.aiProvider === 'claude' || r.settings?.aiProvider === 'gemini'
        ? r.settings.aiProvider
        : apiKey
          ? 'claude'
          : 'gemini',
      apiKey,
      geminiKey,
      geminiModel: isModelId(r.settings?.geminiModel) ? r.settings.geminiModel : DEFAULT_GEMINI_MODEL,
      geminiModels: Array.isArray(r.settings?.geminiModels)
        ? r.settings.geminiModels
            .filter((m: any) => m && isModelId(m.id))
            .map((m: any) => ({ id: m.id, label: typeof m.label === 'string' && m.label ? m.label : m.id }))
            .slice(0, 100)
        : [],
      geminiAutoSwitch: r.settings?.geminiAutoSwitch !== false,
      theme: typeof r.settings?.theme === 'string' && /^[a-z0-9-]{1,60}$/.test(r.settings.theme) ? r.settings.theme : DEFAULT_THEME,
      customThemes: Array.isArray(r.settings?.customThemes)
        ? r.settings.customThemes.map(cleanCustomTheme).filter(Boolean).slice(0, MAX_CUSTOM_THEMES)
        : [],
      humor: r.settings?.humor !== false,
      dishBuilder: r.settings?.dishBuilder !== false,
      animations: r.settings?.animations !== false,
      savePhotos: r.settings?.savePhotos !== false,
    },
  };
}

function load(): AppData {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (text) return parseData(JSON.parse(text));
  } catch (err) {
    console.error('Could not read saved data', err);
  }
  return emptyData();
}

let data: AppData = load();
/** Bumped on every change, so a component can tell it missed one. */
let version = 0;
let saveError: string | null = null;
const listeners = new Set<() => void>();

function commit(next: AppData) {
  data = next;
  version++;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    saveError = null;
  } catch (err) {
    console.error('Could not save data', err);
    saveError = 'Could not save. Your device storage may be full.';
  }
  listeners.forEach((l) => l());
}

export function getData(): AppData {
  return data;
}

export function getSaveError(): string | null {
  return saveError;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-read storage, e.g. after another tab changed it. */
export function reload() {
  data = load();
  version++;
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) reload();
  });
}

export function useData(): AppData {
  const [, setTick] = useState(0);
  const seen = version;
  useEffect(() => {
    const unsubscribe = subscribe(() => setTick((t) => t + 1));
    // Effects run a moment after render; catch a change made in between.
    if (version !== seen) setTick((t) => t + 1);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return data;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── Entries ───────────────────────────────────────────────────────────────

export type NewEntry = Omit<Entry, 'id' | 'createdAt'>;

let lastStamp = 0;

/** Strictly increasing timestamps, so "most recent" is unambiguous. */
function stamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}

export function addEntries(items: NewEntry[]): Entry[] {
  const created = items.map((item) => {
    const t = stamp();
    return { ...item, id: newId(), createdAt: t, updatedAt: t };
  });
  commit({ ...data, entries: [...data.entries, ...created] });
  return created;
}

export function addEntry(item: NewEntry): Entry {
  return addEntries([item])[0];
}

export function updateEntry(id: string, patch: Partial<Omit<Entry, 'id'>>) {
  const t = stamp();
  commit({ ...data, entries: data.entries.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: t } : e)) });
}

/** Deleting leaves a note of when, so other devices delete it too. */
function tombstones(entries: Entry[], at: number): SyncMeta['deletedEntries'] {
  return Object.fromEntries(entries.map((e) => [e.id, { at, date: e.date }]));
}

export function deleteEntry(id: string) {
  const gone = data.entries.filter((e) => e.id === id);
  commit({
    ...data,
    entries: data.entries.filter((e) => e.id !== id),
    meta: { ...data.meta, deletedEntries: { ...data.meta.deletedEntries, ...tombstones(gone, stamp()) } },
  });
}

export function getEntry(id: string): Entry | undefined {
  return data.entries.find((e) => e.id === id);
}

// ── Favorites ─────────────────────────────────────────────────────────────

export function isFavorite(foodId: string): boolean {
  return data.favorites.some((f) => f.id === foodId);
}

export function toggleFavorite(food: Food) {
  const t = stamp();
  const removing = isFavorite(food.id);
  const favorites = removing ? data.favorites.filter((f) => f.id !== food.id) : [food, ...data.favorites];
  const meta = removing
    ? { ...data.meta, unfavoritedAt: { ...data.meta.unfavoritedAt, [food.id]: t } }
    : { ...data.meta, favoritedAt: { ...data.meta.favoritedAt, [food.id]: t } };
  commit({ ...data, favorites, meta });
}

// ── Settings ──────────────────────────────────────────────────────────────

/** AI settings that sync together as one choice; the keys each sync on their own. */
const AI_CHOICE = ['aiProvider', 'geminiModel', 'geminiAutoSwitch'] as const;

export function updateSettings(patch: Partial<Settings>) {
  const changed = (k: keyof Settings) => k in patch && patch[k] !== data.settings[k];
  const meta = { ...data.meta };
  if (patch.goals) meta.goalsAt = stamp();
  if (AI_CHOICE.some(changed)) meta.aiAt = stamp();
  if (changed('apiKey')) meta.apiKeyAt = stamp();
  if (changed('geminiKey')) meta.geminiKeyAt = stamp();
  commit({ ...data, settings: { ...data.settings, ...patch }, meta });
}

/** Backup file contents. API keys are left out so a shared backup file can't leak them. */
export function backupJson(source: AppData = data): string {
  const { apiKey: _claude, geminiKey: _gemini, ...settings } = source.settings;
  const { apiKeyAt: _a, geminiKeyAt: _g, ...meta } = source.meta;
  return JSON.stringify({ ...source, settings, meta }, null, 2);
}

/** Restore a backup, keeping this device's API keys (backups have none). */
export function restoreBackup(next: AppData) {
  const { settings, meta } = data;
  commit({
    ...next,
    settings: { ...next.settings, apiKey: settings.apiKey, geminiKey: settings.geminiKey },
    meta: { ...next.meta, apiKeyAt: meta.apiKeyAt, geminiKeyAt: meta.geminiKeyAt },
  });
}

/** Delete every entry and favorite (on every synced device, too). */
export function clearAll() {
  const t = stamp();
  const unfavoritedAt = { ...data.meta.unfavoritedAt };
  for (const f of data.favorites) unfavoritedAt[f.id] = t;
  commit({
    ...data,
    entries: [],
    favorites: [],
    meta: {
      ...data.meta,
      deletedEntries: { ...data.meta.deletedEntries, ...tombstones(data.entries, t) },
      unfavoritedAt,
    },
  });
}

/** Replace the data with a merged copy from another device. */
export function applyMerged(next: AppData) {
  commit(next);
}

// ── Derived lists ─────────────────────────────────────────────────────────

export interface RecentFood {
  food: Food;
  amount: number;
}

/** Foods logged most recently, newest first, one per food. */
export function recentFoods(entries: Entry[], limit = 25): RecentFood[] {
  const seen = new Set<string>();
  const out: RecentFood[] = [];
  const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt);
  for (const e of sorted) {
    if (!e.food || seen.has(e.food.id)) continue;
    seen.add(e.food.id);
    out.push({ food: e.food, amount: e.amount ?? e.food.defaultAmount ?? 100 });
    if (out.length >= limit) break;
  }
  return out;
}

/** Last amount the user logged of a food, if any. */
export function lastAmount(foodId: string): number | undefined {
  let best: Entry | undefined;
  for (const e of data.entries) {
    if (e.food?.id === foodId && e.amount && (!best || e.createdAt > best.createdAt)) best = e;
  }
  return best?.amount;
}

// ── Food lookup for routes ────────────────────────────────────────────────

const SESSION_FOODS_KEY = 'calorie-tracker:session-foods';
const sessionFoods = new Map<string, Food>();

try {
  const saved = JSON.parse(sessionStorage.getItem(SESSION_FOODS_KEY) ?? '[]');
  if (Array.isArray(saved)) saved.map(cleanFood).forEach((f) => f && sessionFoods.set(f.id, f));
} catch {
  // Session storage unavailable; foods from searches just won't survive a reload.
}

/** Keep a food found online around so its detail screen survives a reload. */
export function rememberFood(food: Food) {
  sessionFoods.set(food.id, food);
  try {
    const list = [...sessionFoods.values()].slice(-40);
    sessionStorage.setItem(SESSION_FOODS_KEY, JSON.stringify(list));
  } catch {
    // Ignore: best effort only.
  }
}

export function findFood(id: string): Food | undefined {
  return (
    builtinFood(id) ??
    sessionFoods.get(id) ??
    data.favorites.find((f) => f.id === id) ??
    [...data.entries].reverse().find((e) => e.food?.id === id)?.food
  );
}
