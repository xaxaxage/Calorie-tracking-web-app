import { SimplePool } from 'nostr-tools/pool';
import { finalizeEvent, type Event } from 'nostr-tools/pure';
import { normalizeURL } from 'nostr-tools/utils';
import { applyMerged, getData, subscribe } from '../store';
import { buildParts, mergePart, parsePart, type Part } from './parts';
import { decryptText, deriveKeys, encryptText, normalizePhrase, partLabel, sha256, type SyncKeys } from './crypto';
import {
  clearSyncConfig,
  DEFAULT_RELAYS,
  loadSyncConfig,
  saveSyncConfig,
  setSyncStatus,
  type SyncConfig,
} from './state';

/**
 * Device sync over Nostr relays (NIP-78 app data). Each part of the data is a
 * replaceable event (kind 30078) labelled with an opaque tag; its content is
 * encrypted with a key only phrase holders have. Every device keeps its full
 * copy, merges what it receives and uploads parts that differ, so the relays
 * are a meeting point rather than the source of truth.
 */

const KIND = 30078;
/** strfry relays reject events over 64 KB; stay well below. */
const MAX_CONTENT = 60_000;
const PUSH_DELAY = 2500;
const FULL_SYNC_MIN_GAP = 20_000;

let pool: SimplePool | null = null;
let keys: SyncKeys | null = null;
let config: SyncConfig | null = null;
let unsubscribeStore: (() => void) | null = null;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let lastFullSync = 0;
const labels = new Map<string, string>();
/** Bumped on every connect/disconnect; a sync step that started earlier stops instead of using the new connection. */
let generation = 0;

class Stale extends Error {}
function check(gen: number) {
  if (gen !== generation) throw new Stale();
}

// Run sync steps one at a time so a push never races a pull.
let chain: Promise<unknown> = Promise.resolve();
function queue<T>(task: () => Promise<T>): Promise<T | undefined> {
  const safe = () => task().catch((err) => {
    if (err instanceof Stale) return undefined; // superseded by a newer connection
    throw err;
  });
  const run = chain.then(safe, safe);
  chain = run.catch(() => undefined);
  return run;
}

async function labelFor(name: string): Promise<string> {
  let label = labels.get(name);
  if (!label) {
    label = await partLabel(keys!.nameKey, name);
    labels.set(name, label);
  }
  return label;
}

function relaysOk(): number {
  if (!pool || !config) return 0;
  const status = pool.listConnectionStatus();
  return config.relays.filter((r) => status.get(normalizeURL(r))).length;
}

function save() {
  if (config) saveSyncConfig(config);
}

function report(state: 'synced' | 'error' | 'offline' | 'syncing', message?: string) {
  setSyncStatus({
    state,
    message,
    lastSyncAt: config?.lastSyncAt,
    relaysOk: relaysOk(),
    relaysTotal: config?.relays.length ?? 0,
  });
}

/** Decrypt and merge one event; returns true if local data changed. */
async function takeEvent(event: Event): Promise<boolean> {
  if (!config || !keys || event.pubkey !== keys.pubkey || event.kind !== KIND) return false;
  const label = event.tags.find((t) => t[0] === 'd')?.[1];
  if (!label) return false;
  const known = config.seen[label];
  if (known && (known.id === event.id || event.created_at < known.createdAt)) return false;
  const gen = generation;

  let text: string;
  try {
    text = await decryptText(keys.encKey, event.content);
  } catch (err) {
    console.warn('Could not decrypt a sync part', err);
    return false;
  }
  check(gen);
  const part = parsePart(JSON.parse(text));
  if (!part) return false;
  const hash = await sha256(text);
  check(gen);
  config.seen[label] = { id: event.id, hash, createdAt: event.created_at };

  const before = getData();
  const after = mergePart(before, part);
  if (after !== before) applyMerged(after);
  // If this device has something the relay's copy lacks, upload the merged version.
  const mine = buildParts(after).get(part.name);
  if (!mine || (await sha256(JSON.stringify(mine))) !== hash) schedulePush();
  return after !== before;
}

async function publishPart(part: Part, json: string, hash: string): Promise<boolean> {
  if (!pool || !config || !keys) return false;
  const label = await labelFor(part.name);
  const content = await encryptText(keys.encKey, json);
  if (content.length > MAX_CONTENT) {
    throw new Error(`The week ${part.name} is too large to sync (${Math.round(content.length / 1000)} KB).`);
  }
  // Relays keep the newest version by timestamp, so never go backwards even if clocks differ.
  const previous = config.seen[label]?.createdAt ?? 0;
  const createdAt = Math.max(Math.floor(Date.now() / 1000), previous + 1);
  const event = finalizeEvent({ kind: KIND, created_at: createdAt, tags: [['d', label]], content }, keys.secretKey);
  const gen = generation;
  const results = await Promise.allSettled(pool.publish(config.relays, event, { maxWait: 8000 }));
  check(gen);
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  if (ok === 0) return false;
  config.seen[label] = { id: event.id, hash, createdAt };
  return true;
}

/** Run tasks with at most `limit` at a time; resolves to how many returned false. */
async function runLimited(tasks: (() => Promise<boolean>)[], limit = 6): Promise<number> {
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next++];
      if (!(await task())) failed++;
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return failed;
}

/** Upload parts whose latest known copy on the relays differs from this device's. */
async function pushChanged(): Promise<void> {
  if (!config || !keys) return;
  const gen = generation;
  const uploads: (() => Promise<boolean>)[] = [];
  for (const part of buildParts(getData()).values()) {
    const json = JSON.stringify(part);
    const hash = await sha256(json);
    const label = await labelFor(part.name);
    check(gen);
    if (config.seen[label]?.hash === hash) continue;
    uploads.push(() => publishPart(part, json, hash));
  }
  const failed = await runLimited(uploads);
  check(gen);
  save();
  if (failed > 0) report('offline', "Couldn't reach any relay. Changes will upload when you're back online.");
  else {
    config.lastSyncAt = Date.now();
    save();
    report('synced');
  }
}

/** Download everything, merge, and upload whatever the relays are missing. */
async function fullSync(): Promise<{ added: number }> {
  if (!pool || !config || !keys) return { added: 0 };
  const gen = generation;
  report('syncing');
  lastFullSync = Date.now();
  const before = getData().entries.length;

  const events = await pool.querySync(config.relays, { kinds: [KIND], authors: [keys.pubkey], limit: 5000 }, { maxWait: 10_000 });
  check(gen);
  if (relaysOk() === 0 && events.length === 0) {
    report('offline', "Couldn't reach any relay. Your data is safe on this device and will sync when you're online.");
    return { added: 0 };
  }

  // Newest version of each part (relays may hold different versions).
  const newest = new Map<string, Event>();
  for (const e of events) {
    const label = e.tags.find((t) => t[0] === 'd')?.[1];
    if (!label) continue;
    const cur = newest.get(label);
    if (!cur || e.created_at > cur.created_at || (e.created_at === cur.created_at && e.id < cur.id)) newest.set(label, e);
  }
  for (const e of [...newest.values()].sort((a, b) => a.created_at - b.created_at)) {
    await takeEvent(e);
    check(gen);
  }

  // Upload parts the relays don't have in this exact form (including ones a relay lost).
  const uploads: (() => Promise<boolean>)[] = [];
  for (const part of buildParts(getData()).values()) {
    const json = JSON.stringify(part);
    const hash = await sha256(json);
    const label = await labelFor(part.name);
    check(gen);
    const onRelays = newest.get(label);
    if (onRelays && config.seen[label]?.id === onRelays.id && config.seen[label].hash === hash) continue;
    uploads.push(() => publishPart(part, json, hash));
  }
  const failed = await runLimited(uploads);
  check(gen);

  config.lastSyncAt = Date.now();
  save();
  if (failed > 0) report('offline', "Some changes couldn't be uploaded yet. They'll go up on the next sync.");
  else report('synced');
  return { added: Math.max(0, getData().entries.length - before) };
}

function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    queue(pushChanged).catch((err) => report('error', (err as Error).message));
  }, PUSH_DELAY);
}

function onVisible() {
  if (document.visibilityState !== 'visible' || Date.now() - lastFullSync < FULL_SYNC_MIN_GAP) return;
  queue(fullSync).catch((err) => report('error', (err as Error).message));
}

function onOnline() {
  queue(fullSync).catch((err) => report('error', (err as Error).message));
}

async function connect(cfg: SyncConfig) {
  generation++;
  config = cfg;
  keys = await deriveKeys(cfg.phrase);
  labels.clear();
  pool = new SimplePool({ enableReconnect: true });
  pool.subscribeMany(
    cfg.relays,
    { kinds: [KIND], authors: [keys.pubkey], since: Math.floor(Date.now() / 1000) - 60 },
    {
      onevent: (event) => {
        queue(() => takeEvent(event).then(() => save())).catch((err) => console.warn('Sync update failed', err));
      },
    },
  );
  unsubscribeStore = subscribe(schedulePush);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
}

function disconnect() {
  generation++;
  clearTimeout(pushTimer);
  // pool.destroy() below also ends the live subscription.
  unsubscribeStore?.();
  unsubscribeStore = null;
  document.removeEventListener('visibilitychange', onVisible);
  window.removeEventListener('online', onOnline);
  pool?.destroy();
  pool = null;
  keys = null;
  config = null;
}

/** Resume sync on app start when this device has a sync key. */
export async function startSync(): Promise<void> {
  const cfg = loadSyncConfig();
  if (!cfg || pool) return;
  await connect(cfg);
  await queue(fullSync).catch((err) => report('error', (err as Error).message));
}

/** Turn sync on with a new or existing phrase. Merges this device's data with what's already synced. */
export async function enableSync(phrase: string): Promise<{ added: number }> {
  const result = await enableSyncInner(phrase);
  return result ?? { added: 0 };
}

async function enableSyncInner(phrase: string): Promise<{ added: number } | undefined> {
  disconnect();
  const cfg: SyncConfig = {
    phrase: normalizePhrase(phrase),
    relays: loadSyncConfig()?.relays ?? [...DEFAULT_RELAYS],
    seen: {},
    lastSyncAt: 0,
  };
  saveSyncConfig(cfg);
  await connect(cfg);
  return queue(fullSync);
}

export function syncNow(): Promise<{ added: number }> {
  if (!pool) return startSync().then(() => ({ added: 0 }));
  return queue(fullSync)
    .then((r) => r ?? { added: 0 })
    .catch((err) => {
      report('error', (err as Error).message);
      return { added: 0 };
    });
}

export async function setRelays(relays: string[]): Promise<void> {
  const cfg = loadSyncConfig();
  if (!cfg) return;
  disconnect();
  // A new relay has none of the data yet, so re-check everything.
  saveSyncConfig({ ...cfg, relays, seen: {} });
  await startSync();
}

/** Stop syncing on this device. Its data stays; the other devices keep theirs. */
export function disableSync() {
  disconnect();
  clearSyncConfig();
  setSyncStatus({ state: 'off' });
}
