import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Food, MealId } from '../lib/types';
import { FOODS, searchFoods } from '../lib/foods';
import {
  addEntry,
  deleteEntry,
  lastAmount,
  recentFoods,
  rememberFood,
  useData,
} from '../lib/store';
import { fmtGrams, fmtKcal, macrosFor } from '../lib/nutrition';
import { MEAL_LABEL } from '../lib/meals';
import { finishFlow, href, navigate } from '../lib/router';
import { LookupError, searchProducts } from '../lib/openfoodfacts';
import { MealPicker } from '../components/Common';
import { Barcode, Bolt, Camera, Chat, Check, ChevronRight, Close, Copy, Plus, Search } from '../components/Icons';

type Tab = 'recent' | 'favorites';

interface Listed {
  food: Food;
  amount: number;
}

const onlineCache = new Map<string, Food[]>();

function describe({ food, amount }: Listed): string {
  const kcal = macrosFor(food, amount).kcal;
  const base = `${fmtGrams(amount)} ${food.unit} · ${fmtKcal(kcal)} kcal`;
  return food.brand ? `${food.brand} · ${base}` : base;
}

function FoodRow({
  item,
  meal,
  added,
  onOpen,
  onToggle,
}: {
  item: Listed;
  meal: MealId;
  added: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  return (
    <div class="food-row">
      <button type="button" class="row-main" onClick={onOpen}>
        <span class="row-title">{item.food.name}</span>
        <span class="row-sub">{describe(item)}</span>
      </button>
      <button
        type="button"
        class={`round-add${added ? ' done' : ''}`}
        aria-label={`${added ? 'Added' : 'Add'} ${item.food.name} to ${MEAL_LABEL[meal]}`}
        aria-pressed={added}
        onClick={onToggle}
      >
        {added ? <Check /> : <Plus />}
      </button>
    </div>
  );
}

type Online =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'done'; foods: Food[] }
  | { state: 'error'; message: string };

export function AddFood({ meal, date, initialQuery, initialTab }: { meal: MealId; date: string; initialQuery: string; initialTab: Tab }) {
  const data = useData();
  const [query, setQuery] = useState(initialQuery);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [added, setAdded] = useState<Record<string, string>>({});
  const [online, setOnline] = useState<Online>({ state: 'idle' });
  const [retry, setRetry] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep search and tab in the URL so coming back from a food restores them.
  useEffect(() => {
    const url = `#${href('/add', { meal, date, q: query.trim() || undefined, tab: tab === 'recent' ? undefined : tab })}`;
    history.replaceState(history.state, '', url);
  }, [meal, date, query, tab]);

  const recent = useMemo(() => recentFoods(data.entries), [data.entries]);
  const favorites: Listed[] = data.favorites.map((food) => ({
    food,
    amount: lastAmount(food.id) ?? food.defaultAmount ?? 100,
  }));

  const q = query.trim();
  const localResults: Listed[] = useMemo(() => {
    if (!q) return [];
    const pool = new Map<string, Food>();
    for (const f of [...recent.map((r) => r.food), ...data.favorites, ...FOODS]) if (!pool.has(f.id)) pool.set(f.id, f);
    return searchFoods([...pool.values()], q, 15).map((food) => ({
      food,
      amount: lastAmount(food.id) ?? food.defaultAmount ?? 100,
    }));
  }, [q, recent, data.favorites]);

  useEffect(() => {
    if (q.length < 3) {
      setOnline({ state: 'idle' });
      return;
    }
    const key = q.toLowerCase();
    const cached = onlineCache.get(key);
    if (cached) {
      setOnline({ state: 'done', foods: cached });
      return;
    }
    setOnline({ state: 'loading' });
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchProducts(q, controller.signal)
        .then((foods) => {
          onlineCache.set(key, foods);
          setOnline({ state: 'done', foods });
        })
        .catch((err) => {
          if (err?.name === 'AbortError') return;
          setOnline({
            state: 'error',
            message: err instanceof LookupError ? err.message : 'Online search failed. Try again.',
          });
        });
    }, 650);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, retry]);

  const localIds = new Set(localResults.map((r) => r.food.id));
  const onlineResults: Listed[] =
    online.state === 'done'
      ? online.foods.filter((f) => !localIds.has(f.id)).map((food) => ({ food, amount: food.defaultAmount ?? 100 }))
      : [];

  const setMeal = (m: MealId) => navigate(href('/add', { meal: m, date, q: q || undefined, tab: tab === 'recent' ? undefined : tab }), { replace: true });

  const open = (item: Listed) => {
    rememberFood(item.food);
    navigate(href(`/food/${encodeURIComponent(item.food.id)}`, { meal, date, amount: item.amount }));
  };

  const toggle = (item: Listed) => {
    const key = item.food.id;
    const existing = added[key];
    if (existing) {
      deleteEntry(existing);
      const next = { ...added };
      delete next[key];
      setAdded(next);
      return;
    }
    const m = macrosFor(item.food, item.amount);
    const entry = addEntry({
      date,
      meal,
      name: item.food.name,
      amount: item.amount,
      unit: item.food.unit,
      food: item.food,
      ...m,
      source: item.food.id.startsWith('off:') ? 'barcode' : 'food',
    });
    setAdded({ ...added, [key]: entry.id });
  };

  const renderList = (items: Listed[], empty: string) =>
    items.length === 0 ? (
      <div class="list-empty">{empty}</div>
    ) : (
      items.map((item) => (
        <FoodRow
          item={item}
          meal={meal}
          added={!!added[item.food.id]}
          onOpen={() => open(item)}
          onToggle={() => toggle(item)}
        />
      ))
    );

  const tool = (path: string) => `#${href(path, { meal, date })}`;

  return (
    <main class="screen gap-16">
      <header class="topbar">
        <button type="button" class="icon-btn ink" aria-label="Close" onClick={() => finishFlow(href('/', { date }))}>
          <Close />
        </button>
        <h1>Add food</h1>
        <span class="spacer-44" />
      </header>

      <MealPicker value={meal} onChange={setMeal} />

      <form
        class="search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          inputRef.current?.blur();
        }}
      >
        <label for="food-search" class="sr-only">
          Search foods
        </label>
        <span class="search-icon">
          <Search />
        </span>
        <input
          ref={inputRef}
          id="food-search"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          placeholder="Search foods or brands"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        />
        {query && (
          <button
            type="button"
            class="search-clear"
            aria-label="Clear search"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
          >
            <Close size={16} />
          </button>
        )}
      </form>

      {q ? (
        <section aria-label="Search results" class="stack-10">
          <div class="list">{renderList(localResults, `No foods in the list match “${q}”.`)}</div>
          {q.length >= 3 && (
            <>
              <h2 class="list-section-label">From Open Food Facts</h2>
              <div class="list">
                {online.state === 'loading' && (
                  <div class="list-empty loading-row">
                    <span class="spinner" /> Searching products…
                  </div>
                )}
                {online.state === 'error' && (
                  <div class="list-empty">
                    {online.message}{' '}
                    <button type="button" class="link-btn" onClick={() => setRetry((r) => r + 1)}>
                      Retry
                    </button>
                  </div>
                )}
                {online.state === 'done' && renderList(onlineResults, 'No products found online.')}
              </div>
            </>
          )}
          <a class="describe-row" href={`#${href('/describe', { meal, date, text: q })}`}>
            <span class="tile-icon green">
              <Chat />
            </span>
            <span class="describe-copy">
              <strong>Describe “{q}”</strong>
              <span>Log it from a plain-text description</span>
            </span>
            <ChevronRight size={18} />
          </a>
          <a class="quick-hint" href={tool('/quick')}>
            Can't find it? <strong>Quick add calories</strong>
          </a>
        </section>
      ) : (
        <>
          <a class="describe-row" href={tool('/describe')}>
            <span class="tile-icon green">
              <Chat />
            </span>
            <span class="describe-copy">
              <strong>Describe what you ate</strong>
              <span>“2 eggs, toast with butter and a latte”</span>
            </span>
            <ChevronRight size={18} />
          </a>

          <div class="tiles">
            <a href={tool('/scan')} class="tile">
              <span class="tile-icon teal">
                <Barcode />
              </span>
              <span>Barcode</span>
            </a>
            <a href={tool('/photo')} class="tile">
              <span class="tile-icon plum">
                <Camera />
              </span>
              <span>Photo</span>
            </a>
            <a href={tool('/quick')} class="tile">
              <span class="tile-icon orange">
                <Bolt />
              </span>
              <span>Quick add</span>
            </a>
            <a href={tool('/copy')} class="tile">
              <span class="tile-icon red">
                <Copy />
              </span>
              <span>Copy meal</span>
            </a>
          </div>

          <section class="stack-8">
            <div role="tablist" aria-label="Food lists" class="tabs">
              {(['recent', 'favorites'] as const).map((t) => (
                <button type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                  {t === 'recent' ? 'Recent' : 'Favorites'}
                </button>
              ))}
            </div>
            <div class="list" role="tabpanel">
              {tab === 'recent'
                ? renderList(recent, 'Foods you log will show up here. Search above to get started.')
                : renderList(favorites, 'Tap the star on a food to keep it here.')}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
