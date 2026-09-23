import { useEffect, useState } from 'preact/hooks';
import type { AppData, Entry, Food, Goals, Settings } from './types';
import { MEALS } from './types';
import { builtinFood } from './foods';
import { isDateKey } from './dates';

export const STORAGE_KEY = 'calorie-tracker:v1';

export const DEFAULT_GOALS: Goals = { kcal: 2300, p: 150, c: 250, f: 75 };

export function emptyData(): AppData {
  return {
    version: 1,
    entries: [],
    favorites: [],
    settings: { goals: { ...DEFAULT_GOALS }, apiKey: '' },
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
    source: ['food', 'barcode', 'photo', 'quick', 'copy'].includes(raw.source) ? raw.source : 'quick',
    createdAt: num(raw.createdAt, Date.now()),
  };
}

/** Validate data loaded from storage or an imported backup. Throws if it isn't app data. */
export function parseData(raw: unknown): AppData {
  if (!raw || typeof raw !== 'object' || (raw as any).version !== 1) {
    throw new Error('This file is not a Calorie Tracker backup.');
  }
  const r = raw as any;
  const goals = r.settings?.goals ?? {};
  return {
    version: 1,
    entries: Array.isArray(r.entries) ? r.entries.map(cleanEntry).filter(Boolean) : [],
    favorites: Array.isArray(r.favorites) ? r.favorites.map(cleanFood).filter(Boolean) : [],
    settings: {
      goals: {
        kcal: num(goals.kcal, DEFAULT_GOALS.kcal),
        p: num(goals.p, DEFAULT_GOALS.p),
        c: num(goals.c, DEFAULT_GOALS.c),
        f: num(goals.f, DEFAULT_GOALS.f),
      },
      apiKey: typeof r.settings?.apiKey === 'string' ? r.settings.apiKey : '',
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
let saveError: string | null = null;
const listeners = new Set<() => void>();

function commit(next: AppData) {
  data = next;
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
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) reload();
  });
}

export function useData(): AppData {
  const [, setTick] = useState(0);
  useEffect(() => subscribe(() => setTick((t) => t + 1)), []);
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
  const created = items.map((item) => ({ ...item, id: newId(), createdAt: stamp() }));
  commit({ ...data, entries: [...data.entries, ...created] });
  return created;
}

export function addEntry(item: NewEntry): Entry {
  return addEntries([item])[0];
}

export function updateEntry(id: string, patch: Partial<Omit<Entry, 'id'>>) {
  commit({ ...data, entries: data.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
}

export function deleteEntry(id: string) {
  commit({ ...data, entries: data.entries.filter((e) => e.id !== id) });
}

export function getEntry(id: string): Entry | undefined {
  return data.entries.find((e) => e.id === id);
}

// ── Favorites ─────────────────────────────────────────────────────────────

export function isFavorite(foodId: string): boolean {
  return data.favorites.some((f) => f.id === foodId);
}

export function toggleFavorite(food: Food) {
  const favorites = isFavorite(food.id)
    ? data.favorites.filter((f) => f.id !== food.id)
    : [food, ...data.favorites];
  commit({ ...data, favorites });
}

// ── Settings ──────────────────────────────────────────────────────────────

export function updateSettings(patch: Partial<Settings>) {
  commit({ ...data, settings: { ...data.settings, ...patch } });
}

export function replaceData(next: AppData) {
  commit(next);
}

export function clearAll() {
  commit({ ...emptyData(), settings: { ...data.settings } });
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
