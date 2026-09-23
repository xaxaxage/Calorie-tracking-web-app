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

export type EntrySource = 'food' | 'barcode' | 'photo' | 'quick' | 'copy';

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

export interface Settings {
  goals: Goals;
  /** Anthropic API key used for photo estimates. Stored only on this device. */
  apiKey: string;
}

export interface AppData {
  version: 1;
  entries: Entry[];
  favorites: Food[];
  settings: Settings;
}
