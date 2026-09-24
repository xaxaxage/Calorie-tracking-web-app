import { useState } from 'preact/hooks';
import type { EntrySource, Food, Ingredient, Macros, MealId, Unit } from '../lib/types';
import { addEntries, deleteEntry, newId } from '../lib/store';
import { fmtKcal, macrosFor, sum } from '../lib/nutrition';
import { dishFood, dishTotals, ingredientId, ingredientMacros, isDish, portionIngredients, roundAmount } from '../lib/dish';
import { MEAL_LABEL } from '../lib/meals';
import { finishFlow, href } from '../lib/router';
import { showToast } from '../lib/toast';
import { toastNote } from '../lib/humor';
import { AmountInput } from './AmountInput';
import type { EstimatedItem } from '../lib/ai/shared';
import { ChevronRight, Close } from './Icons';

export interface ReviewPart {
  name: string;
  amount: number;
  per100: Macros;
}

export interface ReviewItem {
  name: string;
  amount: number;
  per100: Macros;
  /** A food from the list, when the item was matched rather than estimated. */
  food?: Food;
  /** The parts of a dish, from the AI. */
  components?: ReviewPart[];
}

/** An AI estimate as a review item, dish components included. */
export function toReviewItem(it: EstimatedItem): ReviewItem {
  return {
    name: it.name,
    amount: it.grams,
    per100: it.per100,
    components: it.components?.map((c) => ({ name: c.name, amount: c.grams, per100: c.per100 })),
  };
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
 * One row of the review. A dish keeps its parts at "base" amounts and a
 * portion factor, so typing a new total scales every part without rounding
 * drift, and changing one part leaves the others alone.
 */
interface Row {
  amount: number;
  parts?: Ingredient[];
  factor: number;
  open: boolean;
}

function startRow(item: ReviewItem): Row {
  if (item.components && item.components.length > 0) {
    const parts = item.components.map((c) => ({ id: ingredientId(), name: c.name, amount: c.amount, unit: 'g' as Unit, per100: { ...c.per100 } }));
    return { amount: item.amount, parts, factor: 1, open: false };
  }
  if (item.food && isDish(item.food)) {
    return { amount: item.amount, parts: portionIngredients(item.food, item.amount), factor: 1, open: false };
  }
  return { amount: item.amount, factor: 1, open: false };
}

/** The parts at the row's current portion. */
const partsNow = (row: Row): Ingredient[] =>
  (row.parts ?? []).map((p) => ({ ...p, amount: roundAmount(p.amount * row.factor) }));

const rowAmount = (row: Row) => (row.parts ? dishTotals(partsNow(row)).amount : row.amount);

/**
 * Editable list of estimated items with totals and an "Add all" button.
 * Dishes can be opened to adjust or remove their ingredients.
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
  const [rows, setRows] = useState<Row[]>(() => items.map(startRow));
  const update = (i: number, next: Row) => setRows((all) => all.map((r, j) => (j === i ? next : r)));

  const perItem: Macros[] = rows.map((row, i) =>
    row.parts ? dishTotals(partsNow(row)) : macrosFor(foodFor(items[i], source), row.amount),
  );
  const totals = sum(perItem);
  const counted = rows.filter((r) => rowAmount(r) > 0).length;

  const setAmount = (i: number, amount: number) => {
    const row = rows[i];
    if (!row.parts) return update(i, { ...row, amount });
    const base = dishTotals(row.parts).amount;
    update(i, { ...row, factor: base > 0 ? amount / base : 0 });
  };

  const setPartAmount = (i: number, id: string, amount: number) => {
    const row = rows[i];
    // At a zero portion, start over from what's shown so the edit takes effect.
    const factor = row.factor > 0 ? row.factor : 1;
    const parts = (row.factor > 0 ? row.parts! : partsNow(row)).map((p) => (p.id === id ? { ...p, amount: amount / factor } : p));
    update(i, { ...row, parts, factor });
  };

  const removePart = (i: number, id: string) => {
    const before = rows;
    const row = rows[i];
    const gone = row.parts!.find((p) => p.id === id)!;
    update(i, { ...row, parts: row.parts!.filter((p) => p.id !== id) });
    showToast(`Removed ${gone.name}`, { label: 'Undo', run: () => setRows(before) });
  };

  const addAll = () => {
    const created = addEntries(
      items.flatMap((it, i) => {
        const row = rows[i];
        const amount = rowAmount(row);
        if (amount <= 0) return [];
        if (row.parts) {
          const ingredients = partsNow(row).filter((p) => p.amount > 0);
          const food = dishFood(it.food?.id ?? `${source}:${newId()}`, it.food?.name ?? it.name, ingredients, it.food?.servings);
          const t = dishTotals(ingredients);
          return [{ date, meal, name: food.name, amount: roundAmount(t.amount), unit: food.unit, food, kcal: t.kcal, p: t.p, c: t.c, f: t.f, ingredients, source }];
        }
        const food = foodFor(it, source);
        return [{ date, meal, name: food.name, amount, unit: food.unit, food, ...perItem[i], source }];
      }),
    );
    showToast(
      `Added ${created.length} ${created.length === 1 ? 'item' : 'items'} to ${MEAL_LABEL[meal]}`,
      { label: 'Undo', run: () => created.forEach((e) => deleteEntry(e.id)) },
      { carry: true, note: toastNote('added') },
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
          const row = rows[i];
          const m = perItem[i];
          const unit: Unit = row.parts ? 'g' : it.food?.unit ?? 'g';
          const parts = row.parts ? partsNow(row) : [];
          return (
            <div class="review-item">
              <div class="photo-row">
                {numbered && <span class="badge">{i + 1}</span>}
                <div class="row-main">
                  <span class="row-title small">{it.food?.name ?? it.name}</span>
                  <span class="row-sub num">
                    {fmtKcal(m.kcal)} kcal · P {Math.round(m.p)} · C {Math.round(m.c)} · F {Math.round(m.f)}
                  </span>
                  {row.parts && (
                    <button
                      type="button"
                      class="parts-toggle"
                      aria-expanded={row.open}
                      onClick={() => update(i, { ...row, open: !row.open })}
                    >
                      <ChevronRight size={14} strokeWidth={2.6} />
                      {parts.length} {parts.length === 1 ? 'ingredient' : 'ingredients'}
                    </button>
                  )}
                </div>
                <AmountInput
                  id={`amount-${i}`}
                  value={rowAmount(row)}
                  unit={unit}
                  label={`${it.name} amount in ${unit}`}
                  onChange={(n) => setAmount(i, n)}
                />
              </div>
              {row.parts && row.open && (
                <div class="parts">
                  {parts.map((p) => {
                    const pm = ingredientMacros(p);
                    return (
                      <div class="part-row">
                        <div class="row-main">
                          <span class="part-name">{p.name}</span>
                          <span class="row-sub num">{fmtKcal(pm.kcal)} kcal</span>
                        </div>
                        <AmountInput
                          id={`part-${i}-${p.id}`}
                          value={p.amount}
                          unit={p.unit}
                          label={`${p.name} amount in ${p.unit}`}
                          onChange={(n) => setPartAmount(i, p.id, n)}
                        />
                        <button type="button" class="part-remove" aria-label={`Remove ${p.name}`} onClick={() => removePart(i, p.id)}>
                          <Close size={16} />
                        </button>
                      </div>
                    );
                  })}
                  {parts.length === 0 && <div class="list-empty">No ingredients left — this dish won't be added.</div>}
                </div>
              )}
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
