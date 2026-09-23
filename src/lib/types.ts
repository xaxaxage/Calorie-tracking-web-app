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
}

export interface Goals extends Macros {}

export type AiProvider = 'gemini' | 'claude';

export type GeminiModel = 'gemini-flash-lite-latest' | 'gemini-flash-latest';

export interface Settings {
  goals: Goals;
  /** Which AI estimates photos and descriptions. */
  aiProvider: AiProvider;
  /** Anthropic API key (Claude). Stored only on this device. */
  apiKey: string;
  /** Google AI Studio key (Gemini, has a free allowance). Stored only on this device. */
  geminiKey: string;
  geminiModel: GeminiModel;
}

export interface AppData {
  version: 1;
  entries: Entry[];
  favorites: Food[];
  settings: Settings;
}
