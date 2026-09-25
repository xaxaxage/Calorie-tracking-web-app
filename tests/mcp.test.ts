import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import { createServer, type AddressInfo, type Socket } from 'node:net';
import { finalizeEvent, verifyEvent, type Event } from 'nostr-tools/pure';
import { addEntry, getData, reload, toggleFavorite, updateSettings } from '../src/lib/store';
import { builtinFood } from '../src/lib/foods';
import { addDays, todayKey } from '../src/lib/dates';
import { decryptText, deriveKeys, encryptText, newPhrase, partLabel } from '../src/lib/sync/crypto';
import { weekName } from '../src/lib/sync/parts';
import {
  checkDate,
  dayReport,
  editEntry,
  findFoods,
  logFood,
  removeEntry,
  setGoals,
  summaryReport,
  ToolError,
} from '../mcp/tools';
import { OfflineError, RelaySync } from '../mcp/relays';

const wrap = {
  name: 'Chicken wrap',
  components: [
    { name: 'Flour tortilla', grams: 60, kcal_per_100g: 310, protein_per_100g: 8, carbs_per_100g: 50, fat_per_100g: 8 },
    { name: 'Grilled chicken', grams: 100, kcal_per_100g: 165, protein_per_100g: 31, carbs_per_100g: 0, fat_per_100g: 3.6 },
    { name: 'Garlic sauce', grams: 20, kcal_per_100g: 450, protein_per_100g: 1, carbs_per_100g: 5, fat_per_100g: 48 },
  ],
};
const latte = { name: 'Latte, oat milk', grams: 300, unit: 'ml' as const, kcal_per_100g: 45, protein_per_100g: 1, carbs_per_100g: 6.5, fat_per_100g: 1.7 };

beforeEach(() => {
  localStorage.clear();
  reload();
});

describe('log_food', () => {
  it('logs estimates, dishes with ingredients and known foods, and reports the day', () => {
    const { result, touched } = logFood({
      meal: 'lunch',
      date: '2026-09-21',
      items: [wrap, latte, { food_id: 'db:banana', grams: 120 }],
    });
    expect(touched).toEqual(['2026-W39']);
    expect(result.logged.map((e) => e.name)).toEqual(['Chicken wrap', 'Latte, oat milk', 'Banana']);

    const [w, l, b] = getData().entries;
    expect(w.ingredients!.map((i) => [i.name, i.amount])).toEqual([['Flour tortilla', 60], ['Grilled chicken', 100], ['Garlic sauce', 20]]);
    expect(w.amount).toBe(180);
    expect(w.kcal).toBeCloseTo(186 + 165 + 90);
    expect(w.food!.ingredients).toHaveLength(3);
    expect(w.source).toBe('text');
    expect(l).toMatchObject({ unit: 'ml', amount: 300, source: 'text' });
    expect(l.kcal).toBeCloseTo(135);
    expect(b).toMatchObject({ name: 'Banana', amount: 120, source: 'food' });
    expect(b.kcal).toBeCloseTo((builtinFood('db:banana')!.per100.kcal * 120) / 100);
    expect(result.day_eaten.kcal).toBe(Math.round(w.kcal + l.kcal + b.kcal));
  });

  it('logs a built-in dish with its ingredients scaled to the portion', () => {
    logFood({ meal: 'dinner', items: [{ food_id: 'db:pizza', grams: 110 }] });
    const e = getData().entries[0];
    expect(e.ingredients!.map((i) => i.amount)).toEqual([60, 20, 30]);
    expect(e.date).toBe(todayKey());
  });

  it('uses the last amount of a food when none is given', () => {
    logFood({ meal: 'snack', items: [{ food_id: 'db:almonds', grams: 25 }] });
    logFood({ meal: 'snack', items: [{ food_id: 'db:almonds' }] });
    expect(getData().entries.map((e) => e.amount)).toEqual([25, 25]);
  });

  it('makes estimated numbers add up, like the app does for its AI', () => {
    logFood({ meal: 'snack', items: [{ name: 'Rice cake', grams: 10, kcal_per_100g: 900, protein_per_100g: 8, carbs_per_100g: 80, fat_per_100g: 3 }] });
    expect(getData().entries[0].food!.per100.kcal).toBe(4 * 8 + 4 * 80 + 9 * 3);
  });

  it('explains what is missing', () => {
    expect(() => logFood({ items: [{ name: 'Mystery', grams: 100 }] })).toThrow(/per 100 g/);
    expect(() => logFood({ items: [{ food_id: 'db:nope' }] })).toThrow(/search_foods/);
    expect(() => logFood({ items: [{ kcal_per_100g: 1, protein_per_100g: 1, carbs_per_100g: 1, fat_per_100g: 1, grams: 1 }] })).toThrow(/name/);
    expect(() => logFood({ items: [{ ...latte, grams: 0 }] })).toThrow(ToolError);
    expect(() => logFood({ items: [{ name: 'Wrap', components: [{ ...wrap.components[0] }, { name: 'Sauce', grams: 10 } as never] }] })).toThrow(/Sauce/);
    expect(getData().entries).toHaveLength(0);
  });
});

describe('update_entry and delete_entry', () => {
  it('scales a dish, recomputes a food, moves between days and refuses quick adds', () => {
    const { result } = logFood({ meal: 'lunch', date: '2026-09-21', items: [wrap, { food_id: 'db:banana', grams: 100 }] });
    const [wrapId, bananaId] = result.logged.map((e) => e.id);

    const half = editEntry({ id: wrapId, grams: 90 });
    expect(half.result.updated.ingredients!.map((i) => i.amount)).toEqual([30, 50, 10]);
    expect(getData().entries[0].kcal).toBeCloseTo((186 + 165 + 90) / 2);

    const moved = editEntry({ id: bananaId, grams: 200, meal: 'snack', date: '2026-09-28', name: 'Big banana' });
    expect(moved.touched).toEqual(['2026-W39', '2026-W40']);
    expect(getData().entries[1]).toMatchObject({ amount: 200, meal: 'snack', date: '2026-09-28', name: 'Big banana' });
    expect(getData().entries[1].kcal).toBeCloseTo(builtinFood('db:banana')!.per100.kcal * 2);

    const quick = addEntry({ date: '2026-09-21', meal: 'snack', name: 'Cake', kcal: 300, p: 3, c: 40, f: 14, source: 'quick' });
    expect(() => editEntry({ id: quick.id, grams: 50 })).toThrow(/plain calories/);
    expect(() => editEntry({ id: quick.id })).toThrow(/Nothing to change/);
    expect(() => editEntry({ id: 'nope', meal: 'lunch' })).toThrow(/get_day/);
  });

  it('deletes with a tombstone, so other devices delete it too', () => {
    const { result } = logFood({ meal: 'lunch', date: '2026-09-21', items: [latte] });
    const { touched } = removeEntry(result.logged[0].id);
    expect(touched).toEqual(['2026-W39']);
    expect(getData().entries).toHaveLength(0);
    expect(getData().meta.deletedEntries[result.logged[0].id]).toMatchObject({ date: '2026-09-21' });
  });
});

describe('reading', () => {
  it('reports a day by meal with totals against the goals', () => {
    logFood({ meal: 'dinner', items: [wrap] });
    logFood({ meal: 'breakfast', items: [{ food_id: 'db:banana', grams: 100 }] });
    const day = dayReport();
    expect(day.meals.breakfast.map((e) => e.name)).toEqual(['Banana']);
    expect(day.meals.dinner[0].ingredients).toHaveLength(3);
    expect(day.eaten.kcal).toBe(Math.round(186 + 165 + 90 + 89));
    expect(day.remaining_kcal).toBe(day.goals.kcal - day.eaten.kcal);
    expect(JSON.stringify(day)).not.toContain('AIza');
  });

  it('summarises a period, averaging only the days with entries', () => {
    const today = todayKey();
    logFood({ meal: 'lunch', date: today, items: [{ ...latte, grams: 1000 }] });
    logFood({ meal: 'lunch', date: addDays(today, -2), items: [{ ...latte, grams: 2000 }] });
    const week = summaryReport();
    expect(week.days).toHaveLength(7);
    expect(week.days_logged).toBe(2);
    expect(week.average_per_logged_day.kcal).toBe(675);
    expect(() => summaryReport('2026-01-01', '2026-12-31')).toThrow(/93 days/);
    expect(() => summaryReport('2026-09-10', '2026-09-01')).toThrow(/after/);
  });

  it('finds own foods first, and lists favorites and recent foods without a query', async () => {
    toggleFavorite(builtinFood('db:almonds')!);
    logFood({ meal: 'lunch', items: [{ ...wrap, name: 'Yogurt bowl special' }] });
    const own = await findFoods(undefined);
    expect(own.favorites!.map((f) => f.food_id)).toEqual(['db:almonds']);
    expect(own.recent![0]).toMatchObject({ name: 'Yogurt bowl special', last_amount: 180 });
    const found = await findFoods('yogurt');
    expect(found.results![0].name).toBe('Yogurt bowl special');
    expect(found.results!.some((f) => f.food_id.startsWith('db:greek-yogurt'))).toBe(true);
  });

  it('searches Open Food Facts when asked, and can log what it found', async () => {
    const product = {
      code: '5000159461122',
      product_name: 'Snickers',
      brands: 'Mars',
      nutriments: { 'energy-kcal_100g': 481, proteins_100g: 8.6, carbohydrates_100g: 59.5, fat_100g: 22.5 },
      serving_quantity: 50,
      serving_size: '1 bar (50 g)',
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ products: [product] }), { status: 200 })));
    try {
      const found = await findFoods('snickers', true);
      const bar = found.open_food_facts![0];
      expect(bar).toMatchObject({ name: 'Snickers', brand: 'Mars', per_100: { kcal: 481 } });
      logFood({ meal: 'snack', items: [{ food_id: bar.food_id }] });
      expect(getData().entries[0]).toMatchObject({ name: 'Snickers', source: 'barcode', amount: bar.usual_amount });

      vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
      const offline = await findFoods('snickers', true);
      expect(offline.open_food_facts_error).toMatch(/didn't answer/);
      expect(offline.results).toBeDefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reads dates', () => {
    expect(checkDate(undefined)).toBe(todayKey());
    expect(checkDate('yesterday')).toBe(addDays(todayKey(), -1));
    expect(() => checkDate('2026-02-30')).toThrow(/YYYY-MM-DD/);
    expect(() => checkDate('next week')).toThrow(ToolError);
  });

  it('sets only the goals given', () => {
    updateSettings({ goals: { kcal: 2300, p: 150, c: 250, f: 75 } });
    expect(setGoals({ kcal: 2000 }).result.goals).toEqual({ kcal: 2000, protein_g: 150, carbs_g: 250, fat_g: 75 });
    expect(setGoals({ protein_g: 170 }).touched).toEqual(['meta']);
    expect(getData().settings.goals).toEqual({ kcal: 2000, p: 170, c: 250, f: 75 });
    expect(() => setGoals({ kcal: 100 })).toThrow(/between/);
  });
});

/** Enough of a Nostr relay for the sync client: replaceable events, REQ with since/limit. */
function startRelay() {
  const events = new Map<string, Event>();
  let refuse = false;
  const server = new WebSocketServer({ port: 0 });
  server.on('connection', (ws: WebSocket) => {
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg[0] === 'EVENT') {
        const e: Event = msg[1];
        if (refuse || !verifyEvent(e)) return ws.send(JSON.stringify(['OK', e.id, false, 'blocked']));
        const key = `${e.pubkey}:${e.kind}:${e.tags.find((t) => t[0] === 'd')?.[1]}`;
        const old = events.get(key);
        if (!old || e.created_at > old.created_at) events.set(key, e);
        ws.send(JSON.stringify(['OK', e.id, true, '']));
      } else if (msg[0] === 'REQ') {
        const [, id, filter] = msg;
        for (const e of events.values()) {
          if (filter.authors?.includes(e.pubkey) && (!filter.since || e.created_at >= filter.since)) ws.send(JSON.stringify(['EVENT', id, e]));
        }
        ws.send(JSON.stringify(['EOSE', id]));
      }
    });
  });
  return {
    url: () => `ws://127.0.0.1:${(server.address() as AddressInfo).port}`,
    events,
    refuse: (on: boolean) => (refuse = on),
    close: () => new Promise((r) => server.close(r)),
  };
}

describe('relay sync', () => {
  const relay = startRelay();
  const phrase = newPhrase();
  const clients: RelaySync[] = [];
  const client = (relays = [relay.url()]) => {
    const c = new RelaySync(phrase, relays);
    clients.push(c);
    return c;
  };
  beforeAll(() => new Promise((r) => setTimeout(r, 50)));
  afterAll(async () => {
    clients.forEach((c) => c.close());
    await relay.close();
  });

  it('uploads encrypted parts and another client reads them back', async () => {
    const a = client();
    await a.pull();
    expect(a.partCount).toBe(0);
    const { touched } = logFood({ meal: 'lunch', date: '2026-09-21', items: [wrap] });
    setGoals({ kcal: 1900 });
    expect(await a.push([...touched, 'meta'])).toEqual({ sent: 2, failed: [] });
    expect(await a.push([...touched, 'meta'])).toEqual({ sent: 0, failed: [] });
    const stored = JSON.stringify([...relay.events.values()]);
    expect(stored).not.toContain('Chicken');
    expect(stored).not.toContain(weekName('2026-09-21'));

    localStorage.clear();
    reload();
    const b = client();
    await b.pull();
    expect(b.partCount).toBe(2);
    expect(getData().entries.map((e) => e.name)).toEqual(['Chicken wrap']);
    expect(getData().entries[0].ingredients).toHaveLength(3);
    expect(getData().settings.goals.kcal).toBe(1900);

    // A later change from the first client arrives on the next (incremental) pull.
    const id = getData().entries[0].id;
    editEntry({ id, grams: 90 });
    await a.pull();
    await a.push(['2026-W39']);
    localStorage.clear();
    reload();
    await b.pull();
    // b's store was wiped but it had seen this part already, so only the newer version is applied.
    expect(getData().entries.map((e) => e.amount)).toEqual([90]);
  });

  it('shows up in the device list, and stops when the key was replaced in the app', async () => {
    const keys = await deriveKeys(phrase);
    const device = { id: 'claude-test-device-01', name: 'Claude Desktop · Windows', version: '1.20260925.1200' };
    const c = new RelaySync(phrase, [relay.url()], device);
    clients.push(c);
    await c.pull();
    await c.announce();
    const label = await partLabel(keys.nameKey, `device:${device.id}`);
    const stored = [...relay.events.values()].find((e) => e.tags.some((t) => t[0] === 'd' && t[1] === label))!;
    expect(JSON.parse(await decryptText(keys.encKey, stored.content))).toMatchObject({
      kind: 'device',
      id: device.id,
      deviceName: 'Claude Desktop · Windows',
      type: 'claude',
      version: '1.20260925.1200',
    });
    // Not again right away.
    await c.announce();
    expect([...relay.events.values()].find((e) => e.tags.some((t) => t[1] === label))!.id).toBe(stored.id);

    // Another device replaces the key: every part it knew becomes "retired".
    const retired = await encryptText(keys.encKey, JSON.stringify({ kind: 'retired', at: Date.now() }));
    for (const e of [...relay.events.values()].filter((e) => e.pubkey === stored.pubkey)) {
      const d = e.tags.find((t) => t[0] === 'd')![1];
      const next = finalizeEvent({ kind: 30078, created_at: e.created_at + 1, tags: [['d', d]], content: retired }, keys.secretKey);
      relay.events.set(`${next.pubkey}:30078:${d}`, next);
    }
    const fresh = new RelaySync(phrase, [relay.url()], device);
    clients.push(fresh);
    await fresh.pull();
    expect(fresh.retiredAt).toBeGreaterThan(0);
  });

  it('reports a relay that refuses uploads', async () => {
    const c = client();
    await c.pull();
    logFood({ meal: 'lunch', date: '2026-09-21', items: [latte] });
    relay.refuse(true);
    expect(await c.push(['2026-W39'])).toEqual({ sent: 0, failed: ['2026-W39'] });
    relay.refuse(false);
  });

  it('does not announce itself under a key with no food log', async () => {
    const other = newPhrase();
    const c = new RelaySync(other, [relay.url()], { id: 'claude-unused-key-01', name: 'Claude Desktop · Windows', version: '1' });
    clients.push(c);
    const before = relay.events.size;
    await c.pull();
    await c.announce();
    expect(c.partCount).toBe(0);
    expect(relay.events.size).toBe(before);
  });

  it('says when no relay can be reached, without crashing', async () => {
    const c = client(['ws://127.0.0.1:1', 'ws://127.0.0.1:2']);
    await expect(c.pull()).rejects.toBeInstanceOf(OfflineError);
  });

  it('survives a relay that never answers, and leaves it out for a while', async () => {
    // Accepts connections and stays silent, like a relay that is blocked or overloaded.
    const sockets: Socket[] = [];
    const silent = createServer((s) => sockets.push(s));
    await new Promise<void>((r) => silent.listen(0, '127.0.0.1', r));
    const silentUrl = `ws://127.0.0.1:${(silent.address() as AddressInfo).port}`;
    try {
      logFood({ meal: 'lunch', date: '2026-09-21', items: [latte] });
      const c = client([relay.url(), silentUrl]);
      await c.pull();
      expect(await c.push(['2026-W39'])).toEqual({ sent: 1, failed: [] });
      const started = Date.now();
      await c.pull();
      expect(Date.now() - started).toBeLessThan(1500);

      await expect(client([silentUrl]).pull()).rejects.toBeInstanceOf(OfflineError);
      // A late error from a socket given up on would surface here and fail the run.
      await new Promise((r) => setTimeout(r, 300));
    } finally {
      sockets.forEach((s) => s.destroy());
      silent.close();
    }
  }, 20_000);
});
