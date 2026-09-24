import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Entry, Food, Ingredient, MealId, Serving } from '../lib/types';
import {
  addEntry,
  deleteEntry,
  isFavorite,
  lastAmount,
  newId,
  recentFoods,
  toggleFavorite,
  updateEntry,
  useData,
} from '../lib/store';
import { entriesFor, fmtKcal, macroSplit, oneDecimal, parseNumber } from '../lib/nutrition';
import {
  customIngredient,
  dishFood,
  dishTotals,
  ingredientFromFood,
  ingredientMacros,
  isDish,
  portionIngredients,
  roundAmount,
  scaleIngredients,
} from '../lib/dish';
import { useFoodSearch } from '../lib/foodSearch';
import { builtinFood } from '../lib/foods';
import { MEAL_LABEL } from '../lib/meals';
import { todayKey } from '../lib/dates';
import { finishFlow, goBack, href } from '../lib/router';
import { showToast } from '../lib/toast';
import { toastNote } from '../lib/humor';
import { MacroLabel, MealPicker, SplitBar } from '../components/Common';
import { AmountInput } from '../components/AmountInput';
import { ChevronLeft, Close, Minus, Plus, Search, Star } from '../components/Icons';

/** Where the editor starts from. */
export type DishStart =
  | { kind: 'entry'; entry: Entry }
  /** An entry logged as a single food, about to get more ingredients. */
  | { kind: 'split-entry'; entry: Entry }
  /** A dish food from the list, favorites or recent. */
  | { kind: 'food'; food: Food; amount?: number }
  /** A single food that becomes the first ingredient of a new dish. */
  | { kind: 'from-food'; food: Food; amount: number }
  | { kind: 'new' };

interface Initial {
  id: string;
  name: string;
  ingredients: Ingredient[];
  servings?: Serving[];
  entry?: Entry;
}

function initial(start: DishStart): Initial {
  switch (start.kind) {
    case 'entry':
      return {
        id: start.entry.food?.id ?? `dish:${newId()}`,
        name: start.entry.name,
        ingredients: start.entry.ingredients ?? [],
        servings: start.entry.food?.servings,
        entry: start.entry,
      };
    case 'split-entry': {
      const { entry } = start;
      // Logged before dishes had ingredients: use the list's recipe for that amount.
      const recipe = entry.food && builtinFood(entry.food.id);
      if (recipe && isDish(recipe) && entry.amount) {
        return { id: recipe.id, name: entry.name, ingredients: portionIngredients(recipe, entry.amount), servings: recipe.servings, entry };
      }
      return {
        id: `dish:${newId()}`,
        name: entry.name,
        ingredients: entry.food && entry.amount ? [ingredientFromFood(entry.food, entry.amount)] : [],
        entry,
      };
    }
    case 'food': {
      const amount = start.amount ?? lastAmount(start.food.id) ?? start.food.defaultAmount ?? 100;
      return { id: start.food.id, name: start.food.name, ingredients: portionIngredients(start.food, amount), servings: start.food.servings };
    }
    case 'from-food':
      return { id: `dish:${newId()}`, name: start.food.name, ingredients: [ingredientFromFood(start.food, start.amount)] };
    default:
      return { id: `dish:${newId()}`, name: '', ingredients: [] };
  }
}

const stepFor = (amount: number) => (amount >= 100 ? 10 : amount >= 20 ? 5 : 1);

const FRACTIONS: [string, number][] = [
  ['½', 0.5],
  ['1', 1],
  ['1½', 1.5],
  ['2', 2],
];

function IngredientPicker({ onPick, onClose }: { onPick: (i: Ingredient) => void; onClose: () => void }) {
  const data = useData();
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState(false);
  const [c, setC] = useState({ name: '', amount: '', kcal: '', p: '', c: '', f: '' });
  const own = useMemo(() => [...recentFoods(data.entries).map((r) => r.food), ...data.favorites], [data.entries, data.favorites]);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => searchRef.current?.focus({ preventScroll: true }), []);
  const { local, online, onlineFoods, retry } = useFoodSearch(query, own, 8);

  const pick = (food: Food) => onPick(ingredientFromFood(food, lastAmount(food.id) ?? food.defaultAmount ?? 100));
  const row = (food: Food) => (
    <button type="button" class="pick-row" onClick={() => pick(food)}>
      <span class="row-main">
        <span class="row-title small">{food.name}</span>
        <span class="row-sub">
          {food.brand ? `${food.brand} · ` : ''}
          {fmtKcal(food.per100.kcal)} kcal per 100 {food.unit}
        </span>
      </span>
      <Plus size={18} />
    </button>
  );

  const customAmount = parseNumber(c.amount);
  const customReady = c.name.trim() && customAmount > 0;
  const field = (key: keyof typeof c, label: string, props: Record<string, unknown> = {}) => (
    <label class="mini-field">
      <span>{label}</span>
      <input
        class="input"
        inputMode="decimal"
        value={c[key]}
        onInput={(e) => setC({ ...c, [key]: (e.target as HTMLInputElement).value })}
        {...props}
      />
    </label>
  );

  return (
    <section class="card stack-12 picker" aria-label="Add an ingredient">
      <div class="picker-head">
        <h2 class="section-title">Add an ingredient</h2>
        <button type="button" class="icon-btn ink" aria-label="Close" onClick={onClose}>
          <Close size={18} />
        </button>
      </div>
      {!custom ? (
        <>
          <div class="search">
            <label for="ingredient-search" class="sr-only">
              Search foods
            </label>
            <span class="search-icon">
              <Search />
            </span>
            <input
              id="ingredient-search"
              type="search"
              autoComplete="off"
              autoCorrect="off"
              enterKeyHint="search"
              placeholder="Search foods, e.g. rice, olive oil"
              value={query}
              ref={searchRef}
              onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            />
          </div>
          {query.trim() && (
            <div class="list">
              {local.map(row)}
              {online.state === 'loading' && (
                <div class="list-empty loading-row">
                  <span class="spinner" /> Searching products…
                </div>
              )}
              {online.state === 'error' && (
                <div class="list-empty">
                  {online.message}{' '}
                  <button type="button" class="link-btn" onClick={retry}>
                    Retry
                  </button>
                </div>
              )}
              {onlineFoods.slice(0, 8).map(row)}
              {local.length === 0 && online.state !== 'loading' && onlineFoods.length === 0 && (
                <div class="list-empty">Nothing found. Add it as a custom ingredient.</div>
              )}
            </div>
          )}
          <button
            type="button"
            class="link-btn left"
            onClick={() => {
              setC({ ...c, name: query.trim() });
              setCustom(true);
            }}
          >
            Add a custom ingredient
          </button>
        </>
      ) : (
        <form
          class="stack-12"
          onSubmit={(e) => {
            e.preventDefault();
            if (!customReady) return;
            const n = (v: string) => Math.max(0, parseNumber(v));
            onPick(customIngredient(c.name.trim(), customAmount, { kcal: n(c.kcal), p: n(c.p), c: n(c.c), f: n(c.f) }));
          }}
        >
          <label class="mini-field wide">
            <span>Name</span>
            <input
              class="input"
              id="custom-name"
              value={c.name}
              placeholder="e.g. Pesto"
              onInput={(e) => setC({ ...c, name: (e.target as HTMLInputElement).value })}
            />
          </label>
          <div class="mini-grid">
            {field('amount', 'Amount (g)', { id: 'custom-amount' })}
            {field('kcal', 'Calories', { id: 'custom-kcal' })}
          </div>
          <div class="mini-grid three">
            {field('p', 'Protein g')}
            {field('c', 'Carbs g')}
            {field('f', 'Fat g')}
          </div>
          <p class="field-hint">Calories and macros for the amount above — check the label, or a rough guess is fine.</p>
          <div class="button-pair">
            <button type="button" class="btn-secondary" onClick={() => setCustom(false)}>
              Back to search
            </button>
            <button type="submit" class="btn-primary" disabled={!customReady}>
              Add
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/**
 * A dish and its ingredients: change any amount, remove or add ingredients,
 * or scale the whole portion. Nutrition is always the sum of the ingredients.
 */
export function DishEditor({ start, meal: initialMeal, date }: { start: DishStart; meal: MealId; date: string }) {
  const data = useData();
  const init = useMemo(() => initial(start), []);
  const entry = init.entry;
  const [name, setName] = useState(init.name);
  // Ingredients at portion 1, and the portion shown; amounts on screen are base × factor.
  const [base, setBase] = useState<Ingredient[]>(init.ingredients);
  const [factor, setFactor] = useState(1);
  const [picking, setPicking] = useState(init.ingredients.length === 0);
  const [meal, setMeal] = useState<MealId>(entry?.meal ?? initialMeal);
  const listRef = useRef<HTMLDivElement>(null);

  const current = scaleIngredients(base, factor);
  const kept = current.filter((i) => i.amount > 0);
  const t = dishTotals(kept);
  const split = macroSplit(t);
  const baseTotal = dishTotals(init.ingredients).amount;

  const goals = data.settings.goals;
  const others = entriesFor(data.entries, date).filter((e) => e.id !== entry?.id);
  const left = goals.kcal - others.reduce((s, e) => s + e.kcal, 0) - t.kcal;

  const setAmount = (id: string, amount: number) => {
    if (factor > 0) setBase(base.map((i) => (i.id === id ? { ...i, amount: amount / factor } : i)));
    else {
      setFactor(1);
      setBase(current.map((i) => (i.id === id ? { ...i, amount } : i)));
    }
  };

  const remove = (ing: Ingredient) => {
    const before = base;
    setBase(base.filter((i) => i.id !== ing.id));
    showToast(`Removed ${ing.name}`, { label: 'Undo', run: () => setBase(before) });
  };

  const add = (ing: Ingredient) => {
    const f = factor > 0 ? factor : 1;
    if (factor <= 0) setFactor(1);
    setBase([...(factor > 0 ? base : current), { ...ing, amount: ing.amount / f }]);
    setPicking(false);
    requestAnimationFrame(() => listRef.current?.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };

  const dishName = name.trim() || 'My dish';
  // A changed built-in dish is the person's own dish now, so it gets its own id
  // (otherwise opening it later would show the original recipe).
  const [ownId] = useState(() => `dish:${newId()}`);
  const changed = base !== init.ingredients || name !== init.name;
  const dishId = init.id.startsWith('db:') && changed ? ownId : init.id;
  const fav = isFavorite(dishId);
  const food = () => dishFood(dishId, dishName, kept, init.servings);

  const fields = () => ({
    date,
    meal,
    name: dishName,
    amount: roundAmount(t.amount),
    unit: food().unit,
    food: food(),
    kcal: t.kcal,
    p: t.p,
    c: t.c,
    f: t.f,
    ingredients: kept,
  });

  const save = () => {
    if (kept.length === 0) return;
    if (entry) {
      updateEntry(entry.id, fields());
      showToast('Saved', undefined, { carry: true });
      goBack(href('/', { date }));
      return;
    }
    const created = addEntry({ ...fields(), source: 'food' });
    showToast(`Added to ${MEAL_LABEL[meal]}`, { label: 'Undo', run: () => deleteEntry(created.id) }, { carry: true, note: toastNote('added') });
    finishFlow(href('/', { date }));
  };

  const removeEntry = () => {
    if (!entry) return;
    deleteEntry(entry.id);
    const { id: _id, createdAt: _c, ...rest } = entry;
    showToast(`Removed ${entry.name}`, { label: 'Undo', run: () => addEntry(rest) }, { carry: true, note: toastNote('removed') });
    goBack(href('/', { date }));
  };

  // Portion chips: servings the dish came with, plus simple multiples of what it started as.
  const servingChips = (init.servings ?? [])
    .filter((s) => baseTotal > 0 && s.amount > 0)
    .map((s) => [s.label, s.amount / baseTotal] as [string, number]);
  const same = (a: number, b: number) => Math.abs(a - b) < 0.001;
  const portions: [string, number][] = [
    ...servingChips,
    ...FRACTIONS.filter(([, f]) => !servingChips.some(([, g]) => same(f, g))).map(([label, f]) => [`${label}×`, f] as [string, number]),
  ];

  return (
    <>
      <main class="screen with-footer">
        <header class="topbar">
          <button
            type="button"
            class="icon-btn ink"
            aria-label="Back"
            onClick={() => goBack(entry ? href('/', { date }) : href('/add', { meal, date }))}
          >
            <ChevronLeft />
          </button>
          <h1>{entry ? 'Edit dish' : 'Dish'}</h1>
          <button
            type="button"
            class={`icon-btn ink${fav ? ' fav-on' : ''}`}
            aria-pressed={fav}
            aria-label="Save dish to favorites"
            disabled={kept.length === 0}
            onClick={() => {
              toggleFavorite(food());
              showToast(fav ? 'Removed from favorites' : 'Dish saved to favorites', undefined, {
                note: fav ? undefined : toastNote('favorite'),
              });
            }}
          >
            <Star filled={fav} />
          </button>
        </header>

        <label for="dish-name" class="sr-only">
          Dish name
        </label>
        <input
          id="dish-name"
          class="input title-input"
          placeholder="Name this dish"
          maxLength={80}
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />

        <section aria-label="Nutrition for this dish" class="card stack-16">
          <div class="big-kcal">
            <span class="num">{fmtKcal(t.kcal)}</span>
            <span class="unit">kcal · {roundAmount(t.amount)} g</span>
          </div>
          <SplitBar {...split} />
          <div class="grid-3 gap-12">
            <div class="stack-2">
              <MacroLabel kind="p">Protein</MacroLabel>
              <span class="macro-value num">{oneDecimal(t.p)} g</span>
            </div>
            <div class="stack-2">
              <MacroLabel kind="c">Carbs</MacroLabel>
              <span class="macro-value num">{oneDecimal(t.c)} g</span>
            </div>
            <div class="stack-2">
              <MacroLabel kind="f">Fat</MacroLabel>
              <span class="macro-value num">{oneDecimal(t.f)} g</span>
            </div>
          </div>
        </section>

        {baseTotal > 0 && (
          <section class="stack-8" aria-label="Portion">
            <span class="field-label">Portion</span>
            <div class="chips">
              {portions.map(([label, f]) => (
                <button type="button" class="pill" aria-pressed={same(factor, f)} onClick={() => setFactor(f)}>
                  {label}
                </button>
              ))}
            </div>
          </section>
        )}

        <section class="stack-10" aria-labelledby="ingredients-title">
          <div class="section-head">
            <h2 id="ingredients-title" class="section-title">
              Ingredients
            </h2>
            <span class="eyebrow small">
              {kept.length} {kept.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          {current.length > 0 && (
            <div class="list" ref={listRef}>
              {current.map((ing) => {
                const m = ingredientMacros(ing);
                const step = stepFor(ing.amount);
                return (
                  <div class="ing-row">
                    <div class="ing-top">
                      <span class="ing-name">{ing.name}</span>
                      <span class="ing-kcal num">{fmtKcal(m.kcal)} kcal</span>
                      <button type="button" class="part-remove" aria-label={`Remove ${ing.name}`} onClick={() => remove(ing)}>
                        <Close size={16} />
                      </button>
                    </div>
                    <div class="ing-bottom">
                      <span class="row-sub num">
                        P {oneDecimal(m.p)} · C {oneDecimal(m.c)} · F {oneDecimal(m.f)}
                      </span>
                      <div class="mini-stepper">
                        <button
                          type="button"
                          aria-label={`Less ${ing.name}`}
                          onClick={() => setAmount(ing.id, roundAmount(Math.max(0, ing.amount - step)))}
                        >
                          <Minus size={16} />
                        </button>
                        <AmountInput
                          id={`ing-${ing.id}`}
                          value={ing.amount}
                          unit={ing.unit}
                          label={`${ing.name} amount in ${ing.unit}`}
                          onChange={(n) => setAmount(ing.id, n)}
                        />
                        <button type="button" aria-label={`More ${ing.name}`} onClick={() => setAmount(ing.id, roundAmount(ing.amount + step))}>
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {picking ? (
            <IngredientPicker onPick={add} onClose={() => setPicking(false)} />
          ) : (
            <button type="button" class="btn-secondary" onClick={() => setPicking(true)}>
              <Plus size={18} /> Add ingredient
            </button>
          )}
        </section>

        {entry && (
          <section class="stack-8">
            <span class="field-label">Meal</span>
            <MealPicker value={meal} onChange={setMeal} />
          </section>
        )}

        <div class="strip">
          <span class="strip-label">{date === todayKey() ? 'Left today after this' : 'Left that day after this'}</span>
          <span class={`strip-value num${left < 0 ? ' over' : ''}`}>
            {left < 0 ? `${fmtKcal(-left)} over` : `${fmtKcal(left)} kcal`}
          </span>
        </div>
      </main>

      <div class="footer">
        <div class="footer-inner">
          {entry && (
            <button type="button" class="btn-secondary btn-danger" onClick={removeEntry}>
              Delete
            </button>
          )}
          <button type="button" class="btn-primary" disabled={kept.length === 0} onClick={save}>
            {entry ? 'Save' : `Add to ${MEAL_LABEL[meal]}`} · {fmtKcal(t.kcal)} kcal
          </button>
        </div>
      </div>
    </>
  );
}
