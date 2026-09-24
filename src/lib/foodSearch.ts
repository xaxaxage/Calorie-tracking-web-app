import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Food } from './types';
import { FOODS, searchFoods } from './foods';
import { LookupError, searchProducts } from './openfoodfacts';

export type OnlineSearch =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'done'; foods: Food[] }
  | { state: 'error'; message: string };

const cache = new Map<string, Food[]>();

/**
 * Search the food list (plus any foods passed in, like recent ones) as you
 * type, and Open Food Facts once the text is 3+ characters and typing pauses.
 */
export function useFoodSearch(query: string, own: Food[], limit = 12) {
  const q = query.trim();
  const [online, setOnline] = useState<OnlineSearch>({ state: 'idle' });
  const [retry, setRetry] = useState(0);

  const local = useMemo(() => {
    if (!q) return [];
    const pool = new Map<string, Food>();
    for (const f of [...own, ...FOODS]) if (!pool.has(f.id)) pool.set(f.id, f);
    return searchFoods([...pool.values()], q, limit);
  }, [q, own, limit]);

  useEffect(() => {
    if (q.length < 3) {
      setOnline({ state: 'idle' });
      return;
    }
    const key = q.toLowerCase();
    const hit = cache.get(key);
    if (hit) {
      setOnline({ state: 'done', foods: hit });
      return;
    }
    setOnline({ state: 'loading' });
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchProducts(q, controller.signal)
        .then((foods) => {
          cache.set(key, foods);
          setOnline({ state: 'done', foods });
        })
        .catch((err) => {
          if (err?.name === 'AbortError') return;
          setOnline({ state: 'error', message: err instanceof LookupError ? err.message : 'Online search failed. Try again.' });
        });
    }, 650);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, retry]);

  const localIds = new Set(local.map((f) => f.id));
  const onlineFoods = online.state === 'done' ? online.foods.filter((f) => !localIds.has(f.id)) : [];
  return { local, online, onlineFoods, retry: () => setRetry((n) => n + 1) };
}
