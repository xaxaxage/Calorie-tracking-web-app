import type { Entry, MealId } from '../lib/types';
import { addEntry, deleteEntry, useData } from '../lib/store';
import { longDate } from '../lib/dates';
import { entriesFor, fmtGrams, fmtKcal, sum } from '../lib/nutrition';
import { MEAL_LABEL } from '../lib/meals';
import { goBack, href, navigate } from '../lib/router';
import { showToast } from '../lib/toast';
import { toastNote } from '../lib/humor';
import { ChevronLeft, Plus, Trash } from '../components/Icons';

function describe(e: Entry): string {
  const amount = e.amount ? `${fmtGrams(e.amount)} ${e.unit ?? 'g'} · ` : '';
  const parts = e.ingredients?.length ? ` · ${e.ingredients.length} ingredients` : '';
  return `${amount}${fmtKcal(e.kcal)} kcal · P ${Math.round(e.p)} · C ${Math.round(e.c)} · F ${Math.round(e.f)}${parts}`;
}

export function MealDetail({ meal, date }: { meal: MealId; date: string }) {
  const data = useData();
  const items = entriesFor(data.entries, date, meal).sort((a, b) => a.createdAt - b.createdAt);
  const totals = sum(items);

  const remove = (e: Entry) => {
    deleteEntry(e.id);
    const { id: _id, createdAt: _c, ...rest } = e;
    showToast(`Removed ${e.name}`, { label: 'Undo', run: () => addEntry(rest) }, { note: toastNote('removed') });
  };

  return (
    <>
      <main class="screen with-footer">
        <header class="topbar">
          <button type="button" class="icon-btn ink" aria-label="Back" onClick={() => goBack(href('/', { date }))}>
            <ChevronLeft />
          </button>
          <h1>{MEAL_LABEL[meal]}</h1>
          <span class="spacer-44" />
        </header>

        <div class="strip">
          <span class="strip-label">{longDate(date)}</span>
          <span class="strip-value num">{fmtKcal(totals.kcal)} kcal</span>
        </div>

        <div class="list">
          {items.length === 0 ? (
            <div class="list-empty">Nothing logged in {MEAL_LABEL[meal].toLowerCase()} yet.</div>
          ) : (
            items.map((e) => (
              <div class="food-row">
                <button
                  type="button"
                  class="row-main"
                  aria-label={`Edit ${e.name}`}
                  onClick={() => navigate(`/entry/${encodeURIComponent(e.id)}`)}
                >
                  <span class="row-title">{e.name}</span>
                  <span class="row-sub num">{describe(e)}</span>
                </button>
                <button type="button" class="round-add" aria-label={`Remove ${e.name}`} onClick={() => remove(e)}>
                  <Trash />
                </button>
              </div>
            ))
          )}
        </div>
        {items.length > 0 && (
          <p class="field-hint">Tap an item to change the amount, its ingredients, or the meal it's in.</p>
        )}
      </main>

      <div class="footer">
        <div class="footer-inner">
          <button
            type="button"
            class="btn-primary"
            onClick={() => navigate(href('/add', { meal, date }), { startFlow: true })}
          >
            <Plus /> Add food to {MEAL_LABEL[meal]}
          </button>
        </div>
      </div>
    </>
  );
}
