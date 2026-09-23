export type MealId = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export const MEALS: MealId[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** Order meals are listed on the Today screen. */
export const MEAL_DISPLAY_ORDER: MealId[] = ['breakfast', 'lunch', 'snack', 'dinner'];

export type Unit = 'g' | 'ml';

/** Energy and macros. kcal in kilocalories, the rest in grams. */
export interface Macros {
  kcal: number;
  p: number;
  c: number;
  f: number;
}

export interface Serving {
  label: string;
  amount: number;
}

/** A food with its nutrition per 100 g (or 100 ml). */
export interface Food {
  id: string;
  name: string;
  brand?: string;
  unit: Unit;
  per100: Macros;
  servings?: Serving[];
  /** Amount suggested when the food is first picked. */
  defaultAmount?: number;
  barcode?: string;
}

export type EntrySource = 'food' | 'barcode' | 'photo' | 'text' | 'quick' | 'copy';

export interface Entry {
  id: string;
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  meal: MealId;
  name: string;
  /** Present for entries logged from a food; absent for quick adds. */
  amount?: number;
  unit?: Unit;
  /** Snapshot of the food so the portion can be edited later. */
  food?: Food;
  /** Totals for this entry. */
  kcal: number;
  p: number;
  c: number;
  f: number;
  source: EntrySource;
  createdAt: number;
  /** Last change, for merging between devices. Missing on entries never edited (use createdAt). */
  updatedAt?: number;
}

export interface Goals extends Macros {}

export type AiProvider = 'gemini' | 'claude';

export interface GeminiModelInfo {
  /** Model ID as used in API calls, e.g. "gemini-flash-lite-latest". */
  id: string;
  label: string;
}

export interface Settings {
  goals: Goals;
  /** Which AI estimates photos and descriptions. */
  aiProvider: AiProvider;
  /** Anthropic API key (Claude). Stored only on this device. */
  apiKey: string;
  /** Google AI Studio key (Gemini, has a free allowance). Stored only on this device. */
  geminiKey: string;
  /** Any Gemini API model ID. */
  geminiModel: string;
  /** Models this key can use, as last fetched from Google. */
  geminiModels: GeminiModelInfo[];
  /** Try other models when the chosen one is busy or out of free uses. */
  geminiAutoSwitch: boolean;
}

/** Bookkeeping that lets two devices merge their changes. */
export interface SyncMeta {
  /** Deleted entries: id → when, and the entry's day (to find its weekly sync part). */
  deletedEntries: Record<string, { at: number; date: string }>;
  /** Food id → when it was starred / unstarred. */
  favoritedAt: Record<string, number>;
  unfavoritedAt: Record<string, number>;
  /** When the daily goals last changed (0 = never). */
  goalsAt: number;
}

export interface AppData {
  version: 1;
  entries: Entry[];
  favorites: Food[];
  settings: Settings;
  meta: SyncMeta;
}
