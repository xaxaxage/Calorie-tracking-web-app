import { useState } from 'preact/hooks';
import type { EntrySource, Food, Macros, MealId, Unit } from '../lib/types';
import { addEntries, deleteEntry, newId } from '../lib/store';
import { cleanAmount, fmtKcal, macrosFor, parseNumber, sum } from '../lib/nutrition';
import { MEAL_LABEL } from '../lib/meals';
import { finishFlow, href } from '../lib/router';
import { showToast } from '../lib/toast';

export interface ReviewItem {
  name: string;
  amount: number;
  per100: Macros;
  /** A food from the list, when the item was matched rather than estimated. */
  food?: Food;
}

function foodFor(item: ReviewItem, source: EntrySource): Food {
  return (
    item.food ?? {
      id: `${source}:${newId()}`,
      name: item.name,
      unit: 'g',
      per100: { ...item.per100 },
      defaultAmount: item.amount,
    }
  );
}

/**
 * Editable list of estimated items with totals and an "Add all" button.
 * Shared by the photo and describe screens.
 */
export function EstimateReview({
  items,
  meal,
  date,
  source,
  title,
  note,
  numbered,
  secondary,
}: {
  items: ReviewItem[];
  meal: MealId;
  date: string;
  source: EntrySource;
  title: string;
  note: string;
  numbered?: boolean;
  secondary: { label: string; onClick: () => void };
}) {
  const [amounts, setAmounts] = useState(() => items.map((it) => String(it.amount)));
  const values = amounts.map((a) => cleanAmount(parseNumber(a)));
  const units: Unit[] = items.map((it) => it.food?.unit ?? 'g');
  const perItem = items.map((it, i) => macrosFor(foodFor(it, source), values[i] ?? 0));
  const totals = sum(perItem);
  const counted = values.filter((v) => v > 0).length;

  const addAll = () => {
    const created = addEntries(
      items.flatMap((it, i) => {
        const amount = values[i] ?? 0;
        if (amount <= 0) return [];
        const food = foodFor(it, source);
        return [{ date, meal, name: food.name, amount, unit: units[i], food, ...perItem[i], source }];
      }),
    );
    showToast(
      `Added ${created.length} ${created.length === 1 ? 'item' : 'items'} to ${MEAL_LABEL[meal]}`,
      { label: 'Undo', run: () => created.forEach((e) => deleteEntry(e.id)) },
      { carry: true },
    );
    finishFlow(href('/', { date }));
  };

  return (
    <>
      <div class="stack-2 pad-4">
        <h2 class="section-title">{title}</h2>
        <span class="muted small-text">{note}</span>
      </div>

      <div class="list">
        {items.map((it, i) => {
          const m = perItem[i];
          return (
            <div class="photo-row">
              {numbered && <span class="badge">{i + 1}</span>}
              <div class="row-main">
                <span class="row-title small">{it.food?.name ?? it.name}</span>
                <span class="row-sub num">
                  {fmtKcal(m.kcal)} kcal · P {Math.round(m.p)} · C {Math.round(m.c)} · F {Math.round(m.f)}
                </span>
              </div>
              <label for={`amount-${i}`} class="sr-only">
                {it.name} amount in {units[i]}
              </label>
              <div class="input-wrap grams">
                <input
                  id={`amount-${i}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={amounts[i]}
                  onFocus={(e) => (e.target as HTMLInputElement).select()}
                  onInput={(e) => {
                    const next = [...amounts];
                    next[i] = (e.target as HTMLInputElement).value.replace(/[^\d]/g, '');
                    setAmounts(next);
                  }}
                />
                <span class="input-suffix">{units[i]}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div class="strip">
        <span class="strip-label num">
          P {Math.round(totals.p)} g · C {Math.round(totals.c)} g · F {Math.round(totals.f)} g
        </span>
        <span class="strip-value kcal num">{fmtKcal(totals.kcal)} kcal</span>
      </div>

      <div class="footer">
        <div class="footer-inner">
          <button type="button" class="btn-secondary retake" onClick={secondary.onClick}>
            {secondary.label}
          </button>
          <button type="button" class="btn-primary" disabled={counted === 0} onClick={addAll}>
            {counted === items.length ? 'Add all' : `Add ${counted}`} to {MEAL_LABEL[meal]}
          </button>
        </div>
      </div>
    </>
  );
}
