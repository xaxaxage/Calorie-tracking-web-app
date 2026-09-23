import type { MealId } from './types';
import { MEALS } from './types';

/** Names used in lists and buttons ("Add to Snacks"). */
export const MEAL_LABEL: Record<MealId, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

/** Shorter names for the four-way meal picker. */
export const MEAL_CHIP: Record<MealId, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export function parseMeal(value: string | null | undefined): MealId | undefined {
  return MEALS.includes(value as MealId) ? (value as MealId) : undefined;
}

/** A sensible meal for the time of day. */
export function mealForTime(now: Date = new Date()): MealId {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes >= 4 * 60 && minutes < 10 * 60 + 30) return 'breakfast';
  if (minutes >= 10 * 60 + 30 && minutes < 14 * 60 + 30) return 'lunch';
  if (minutes >= 14 * 60 + 30 && minutes < 17 * 60) return 'snack';
  if (minutes >= 17 * 60 && minutes < 22 * 60) return 'dinner';
  return 'snack';
}
