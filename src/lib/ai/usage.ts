import { useEffect, useState } from 'preact/hooks';

/**
 * A log of every request this device sends to an AI provider, and what the
 * providers told us about their limits. Only on this device: it's for seeing
 * where requests go, not part of the food log.
 */

export const USAGE_KEY = 'calorie-tracker:ai-usage';
const KEEP_DAYS = 30;
const MAX_RECORDS = 3000;

export type UsageKind = 'photo' | 'text' | 'correction' | 'models';

export type UsageOutcome =
  | 'ok'
  /** Google's per-minute limit (requests or tokens). */
  | 'minute-limit'
  /** Google's daily limit. */
  | 'day-limit'
  /** A limit without details, or Anthropic's rate limit. */
  | 'limit'
  | 'busy'
  | 'failed'
  | 'cancelled';

export interface UsageRecord {
  at: number;
  /** Requests made for the same estimate share this. */
  op: string;
  provider: 'gemini' | 'claude';
  model: string;
  kind: UsageKind;
  outcome: UsageOutcome;
  /** How long the request took. */
  ms: number;
  tokensIn?: number;
  /** Output tokens, thinking included. */
  tokensOut?: number;
}

export interface ModelLimits {
  /** Requests per day, as Google last reported it. */
  perDay?: number;
  perMinute?: number;
  /** Google said the daily limit is used up; skip the model until then. */
  dayUsedUpUntil?: number;
}

interface UsageData {
  records: UsageRecord[];
  limits: Record<string, ModelLimits>;
}

function load(): UsageData {
  try {
    const raw = JSON.parse(localStorage.getItem(USAGE_KEY) ?? 'null');
    if (raw && Array.isArray(raw.records)) {
      return { records: raw.records, limits: raw.limits && typeof raw.limits === 'object' ? raw.limits : {} };
    }
  } catch {
    // unreadable: start over
  }
  return { records: [], limits: {} };
}

let data: UsageData = load();
const listeners = new Set<() => void>();

function save() {
  const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
  data.records = data.records.filter((r) => r.at >= cutoff).slice(-MAX_RECORDS);
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full: the log is a convenience, the food log matters more.
  }
  listeners.forEach((l) => l());
}

export function usageRecords(): UsageRecord[] {
  return data.records;
}

export function modelLimits(model: string): ModelLimits {
  return data.limits[model] ?? {};
}

export function allLimits(): Record<string, ModelLimits> {
  return data.limits;
}

export function recordUsage(record: UsageRecord) {
  data = { ...data, records: [...data.records, record] };
  save();
}

export function clearUsage() {
  data = { records: [], limits: data.limits };
  save();
}

let opCounter = 0;
/** An id for one estimate (or model list), grouping the requests made for it. */
export function newOp(): string {
  return `${Date.now().toString(36)}-${(opCounter++).toString(36)}`;
}

/** Remember what Google said about a model's limits. */
export function noteLimit(model: string, scope: 'minute' | 'day', limit: number | undefined, now = Date.now()) {
  const cur = data.limits[model] ?? {};
  const next: ModelLimits =
    scope === 'day'
      ? { ...cur, ...(limit ? { perDay: limit } : {}), dayUsedUpUntil: nextPacificMidnight(now) }
      : { ...cur, ...(limit ? { perMinute: limit } : {}) };
  data = { ...data, limits: { ...data.limits, [model]: next } };
  save();
}

/** True while Google has said the model's daily free uses are gone. */
export function dayUsedUp(model: string, now = Date.now()): boolean {
  return (data.limits[model]?.dayUsedUpUntil ?? 0) > now;
}

/** Try a model again before its limit resets (e.g. after turning on billing). */
export function forgetDayLimit(model: string) {
  const cur = data.limits[model];
  if (!cur?.dayUsedUpUntil) return;
  const { dayUsedUpUntil: _gone, ...rest } = cur;
  data = { ...data, limits: { ...data.limits, [model]: rest } };
  save();
}

export function subscribeUsage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-render when the log changes. */
export function useUsage(): UsageData {
  const [, setTick] = useState(0);
  useEffect(() => {
    const unsubscribe = subscribeUsage(() => setTick((t) => t + 1));
    return () => {
      unsubscribe();
    };
  }, []);
  return data;
}

// ── Google's day ──────────────────────────────────────────────────────────

const PACIFIC = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function pacificClock(ts: number): { h: number; m: number; s: number } {
  const parts = Object.fromEntries(PACIFIC.formatToParts(new Date(ts)).map((p) => [p.type, p.value]));
  return { h: Number(parts.hour), m: Number(parts.minute), s: Number(parts.second) };
}

/** When the current day began in California, where Google resets its daily limits. */
export function pacificDayStart(now = Date.now()): number {
  const { h, m, s } = pacificClock(now);
  let start = now - ((h * 60 + m) * 60 + s) * 1000 - (now % 1000);
  // On the days the clocks change, the day is 23 or 25 hours long.
  const { h: at } = pacificClock(start);
  if (at === 23) start += 3_600_000;
  else if (at === 1) start -= 3_600_000;
  return start;
}

/** When Google's daily limits reset next (midnight in California). */
export function nextPacificMidnight(now = Date.now()): number {
  return pacificDayStart(pacificDayStart(now) + 26 * 3_600_000);
}

// ── Reading Google's limit errors ─────────────────────────────────────────

export interface QuotaInfo {
  scope: 'minute' | 'day' | 'unknown';
  /** The limit's size, when Google says. */
  limit?: number;
  /** How long Google asks to wait. */
  retryAfterMs?: number;
}

const seconds = (text: unknown) => {
  const m = /([\d.]+)\s*s/.exec(String(text ?? ''));
  return m ? Math.round(Number(m[1]) * 1000) : undefined;
};

/**
 * Google's 429 errors say which limit was hit (QuotaFailure: e.g.
 * GenerateRequestsPerDayPerProjectPerModel-FreeTier, value 20) and how long to
 * wait (RetryInfo). The Gemini SDK puts the error's JSON in the message.
 */
export function parseGeminiQuota(message: string): QuotaInfo {
  let body: any;
  try {
    const start = message.indexOf('{');
    body = start >= 0 ? JSON.parse(message.slice(start)) : undefined;
  } catch {
    body = undefined;
  }
  const details: any[] = Array.isArray(body?.error?.details) ? body.error.details : [];
  const violation = details.find((d) => /QuotaFailure/.test(d?.['@type'] ?? ''))?.violations?.[0];
  const retry = details.find((d) => /RetryInfo/.test(d?.['@type'] ?? ''))?.retryDelay;
  const id = `${violation?.quotaId ?? ''} ${violation?.quotaMetric ?? ''}`;
  const text = String(body?.error?.message ?? message);
  const scope: QuotaInfo['scope'] = /PerDay/i.test(id) ? 'day' : /PerMinute/i.test(id) ? 'minute' : 'unknown';
  const limit = Number(violation?.quotaValue ?? /limit:\s*(\d+)/.exec(text)?.[1]);
  const retryAfterMs = seconds(retry) ?? seconds(/retry in ([\d.]+s)/i.exec(text)?.[1]);
  return {
    scope,
    ...(Number.isFinite(limit) && limit > 0 ? { limit } : {}),
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
  };
}

// ── Summaries for the usage screen ────────────────────────────────────────

/** Requests that count toward a provider's limits (listing models doesn't). */
export const counts = (r: UsageRecord) => r.kind !== 'models';

export interface Tally {
  requests: number;
  failed: number;
  tokensIn: number;
  tokensOut: number;
}

export function tally(records: UsageRecord[]): Tally {
  const t: Tally = { requests: 0, failed: 0, tokensIn: 0, tokensOut: 0 };
  for (const r of records) {
    if (!counts(r)) continue;
    t.requests++;
    if (r.outcome !== 'ok' && r.outcome !== 'cancelled') t.failed++;
    t.tokensIn += r.tokensIn ?? 0;
    t.tokensOut += r.tokensOut ?? 0;
  }
  return t;
}

export interface Operation {
  op: string;
  at: number;
  kind: UsageKind;
  requests: UsageRecord[];
}

/** Requests grouped by the estimate they were made for, newest first. */
export function operations(records: UsageRecord[], limit = 20): Operation[] {
  const byOp = new Map<string, Operation>();
  for (const r of records) {
    const op = byOp.get(r.op);
    if (op) op.requests.push(r);
    else byOp.set(r.op, { op: r.op, at: r.at, kind: r.kind, requests: [r] });
  }
  return [...byOp.values()].sort((a, b) => b.at - a.at).slice(0, limit);
}

/** Requests per model since Google's last daily reset, most used first. */
export function perModelToday(records: UsageRecord[], now = Date.now()): { model: string; provider: UsageRecord['provider']; tally: Tally }[] {
  const since = pacificDayStart(now);
  const groups = new Map<string, UsageRecord[]>();
  for (const r of records) {
    if (r.at < since || !counts(r)) continue;
    groups.set(r.model, [...(groups.get(r.model) ?? []), r]);
  }
  return [...groups]
    .map(([model, rs]) => ({ model, provider: rs[0].provider, tally: tally(rs) }))
    .sort((a, b) => b.tally.requests - a.tally.requests);
}
