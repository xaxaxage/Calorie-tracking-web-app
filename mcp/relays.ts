import { SimplePool, useWebSocketImplementation } from 'nostr-tools/pool';
import { finalizeEvent, type Event } from 'nostr-tools/pure';
import { normalizeURL } from 'nostr-tools/utils';
import WebSocketFromWs from 'ws';
import { applyMerged, getData } from '../src/lib/store';
import { buildParts, mergePart, parsePart } from '../src/lib/sync/parts';
import { decryptText, deriveKeys, encryptText, partLabel, sha256, type SyncKeys } from '../src/lib/sync/crypto';

/**
 * The app's device sync, without a device: pulls the encrypted parts from the
 * relays into the in-memory store, and uploads the parts a tool changed. The
 * phone treats this like any other synced device.
 */

const KIND = 30078;
/** Same limit as the app: strfry relays reject events over 64 KB. */
const MAX_CONTENT = 60_000;
/** Download everything this often; in between, only what changed. */
const FULL_PULL_EVERY = 5 * 60_000;
/** Device clocks differ, so look back this far (seconds) when asking only for recent changes. */
const LOOKBACK = 15 * 60;

/** The relays couldn't be reached. */
export class OfflineError extends Error {}

export class RelaySync {
  private pool: SimplePool;
  private keys?: Promise<SyncKeys>;
  /** Relay label → the newest version this server has seen or sent. */
  private seen = new Map<string, { id: string; hash: string; createdAt: number }>();
  private labels = new Map<string, string>();
  private lastFullPull = 0;
  private lastPullStarted = 0;
  /** When the data was last brought up to date, for showing stale data offline. */
  lastPullAt = 0;

  constructor(
    private phrase: string,
    readonly relays: string[],
  ) {
    // Not Node's built-in WebSocket: when a relay is down it reports the error again from inside
    // close(), and nostr-tools closes on error, so it recurses until the stack overflows.
    useWebSocketImplementation(WebSocketFromWs);
    this.pool = new SimplePool();
  }

  /** How many parts (weeks, favorites and goals, AI setup) the relays hold for this key. */
  get partCount(): number {
    return this.seen.size;
  }

  private getKeys(): Promise<SyncKeys> {
    return (this.keys ??= deriveKeys(this.phrase));
  }

  private async label(name: string): Promise<string> {
    let label = this.labels.get(name);
    if (!label) {
      label = await partLabel((await this.getKeys()).nameKey, name);
      this.labels.set(name, label);
    }
    return label;
  }

  private connected(): number {
    const status = this.pool.listConnectionStatus();
    return this.relays.filter((r) => status.get(normalizeURL(r))).length;
  }

  /** Bring the store up to date with the relays. */
  async pull(): Promise<void> {
    const keys = await this.getKeys();
    const full = Date.now() - this.lastFullPull > FULL_PULL_EVERY;
    const started = Math.floor(Date.now() / 1000);
    const events = await this.pool.querySync(
      this.relays,
      { kinds: [KIND], authors: [keys.pubkey], limit: 5000, ...(full ? {} : { since: this.lastPullStarted - LOOKBACK }) },
      { maxWait: 8000 },
    );
    if (events.length === 0 && this.connected() === 0) {
      throw new OfflineError("Couldn't reach any of the sync relays. Check the internet connection and try again.");
    }

    // Newest version of each part (relays may hold different versions).
    const newest = new Map<string, Event>();
    for (const e of events) {
      const label = e.tags.find((t) => t[0] === 'd')?.[1];
      if (!label || e.pubkey !== keys.pubkey || e.kind !== KIND) continue;
      const cur = newest.get(label);
      if (!cur || e.created_at > cur.created_at || (e.created_at === cur.created_at && e.id < cur.id)) newest.set(label, e);
    }
    for (const [label, e] of [...newest].sort((a, b) => a[1].created_at - b[1].created_at)) {
      await this.take(label, e, keys);
    }
    if (full) this.lastFullPull = Date.now();
    this.lastPullStarted = started;
    this.lastPullAt = Date.now();
  }

  private async take(label: string, event: Event, keys: SyncKeys): Promise<void> {
    const known = this.seen.get(label);
    if (known && (known.id === event.id || event.created_at < known.createdAt)) return;
    let text: string;
    let raw: unknown;
    try {
      text = await decryptText(keys.encKey, event.content);
      raw = JSON.parse(text);
    } catch (err) {
      console.error('Skipped a sync part that could not be read:', (err as Error).message);
      return;
    }
    const part = parsePart(raw);
    if (!part) return;
    this.seen.set(label, { id: event.id, hash: await sha256(text), createdAt: event.created_at });
    const before = getData();
    const after = mergePart(before, part);
    if (after !== before) applyMerged(after);
  }

  /**
   * Upload the named parts where they differ from the relays' copy.
   * Returns how many went up, and the names no relay accepted.
   */
  async push(names: Iterable<string>): Promise<{ sent: number; failed: string[] }> {
    const keys = await this.getKeys();
    const parts = buildParts(getData());
    const failed: string[] = [];
    let sent = 0;
    for (const name of new Set(names)) {
      const part = parts.get(name);
      if (!part) continue;
      const json = JSON.stringify(part);
      const hash = await sha256(json);
      const label = await this.label(name);
      const known = this.seen.get(label);
      if (known?.hash === hash) continue;
      const content = await encryptText(keys.encKey, json);
      if (content.length > MAX_CONTENT) {
        throw new Error(`The week ${name} is too large to sync (${Math.round(content.length / 1000)} KB).`);
      }
      // Relays keep the newest version by timestamp, so never go backwards.
      const createdAt = Math.max(Math.floor(Date.now() / 1000), (known?.createdAt ?? 0) + 1);
      const event = finalizeEvent({ kind: KIND, created_at: createdAt, tags: [['d', label]], content }, keys.secretKey);
      const results = await Promise.allSettled(this.pool.publish(this.relays, event, { maxWait: 8000 }));
      if (results.some((r) => r.status === 'fulfilled')) {
        this.seen.set(label, { id: event.id, hash, createdAt });
        sent++;
      } else failed.push(name);
    }
    return { sent, failed };
  }

  close() {
    this.pool.destroy();
  }
}
