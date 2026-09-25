import './setup';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { applyMerged, getData } from '../src/lib/store';
import { isValidPhrase, normalizePhrase } from '../src/lib/sync/crypto';
import { DEFAULT_RELAYS, isRelayUrl } from '../src/lib/sync/state';
import { COMPONENTS_HINT } from '../src/lib/ai/shared';
import { OfflineError, RelaySync } from './relays';
import {
  dayReport,
  editEntry,
  findFoods,
  logFood,
  removeEntry,
  setGoals,
  summaryReport,
  ToolError,
  type WriteResult,
} from './tools';

/**
 * Calorie Tracker for Claude Desktop: a local MCP server that reads and
 * writes the same food log as the app, through the app's encrypted device
 * sync. Set SYNC_KEY to the 12 words from the app (Settings → Sync).
 */

declare const __MCP_VERSION__: string;

const INSTRUCTIONS = `These tools read and change the user's Calorie Tracker food log: the same log as in the app on their phone, kept in sync.

Dates are YYYY-MM-DD in the user's local time; leave the date out for today. Meals are breakfast, lunch, dinner and snack; leave the meal out to pick one by the time of day.

To log food, call log_food. If search_foods (or an earlier entry from get_day) has the food, pass its food_id and the grams. Otherwise estimate it yourself: a short, plain name that says how it's prepared ("Scrambled eggs", "Latte, whole milk"), the amount in grams, and typical nutrition per 100 g as prepared — or the product's own values when a brand or product you know is named. Convert cups, slices, spoons and pieces to grams; with no amount given, assume one typical portion. For drinks count 1 ml as 1 g (or set unit to "ml").

If the user gives a raw or dry weight ("80 g dry pasta"), keep that weight, use raw or dry values and put "raw" or "dry" in the name.

${COMPONENTS_HINT}

Things eaten alongside each other ("soup and a bread roll") are separate items; something described with what's in it or on it ("toast with butter") is one dish with components.

To change or delete an entry, get its id from get_day first. After logging, tell the user briefly what was added and where the day stands against their goal.`;

// ── Configuration ─────────────────────────────────────────────────────────

const phrase = normalizePhrase(process.env.SYNC_KEY ?? '');
const relays = (process.env.RELAYS ?? '')
  .split(/[\s,]+/)
  .filter(isRelayUrl);
const setupProblem = !phrase
  ? 'The sync key is not set. In the app, open Settings → Sync, turn sync on and copy the 12 words; then add them as SYNC_KEY in the Claude Desktop settings for this server (or reinstall the extension and paste them).'
  : !isValidPhrase(phrase)
    ? 'The sync key is not a valid 12-word phrase. Copy it again from the app (Settings → Sync → Show sync key) and update the server settings in Claude Desktop.'
    : null;

const sync = setupProblem ? null : new RelaySync(phrase, relays.length ? relays : DEFAULT_RELAYS);

const NO_DATA =
  'No synced food log was found for this sync key. In the app, check that sync is on (Settings → Sync) and that the 12 words match the ones set up in Claude Desktop.';

/** Parts no relay accepted yet; retried on the next request. */
const pending = new Set<string>();

// ── Running tools ─────────────────────────────────────────────────────────

type Reply = { content: { type: 'text'; text: string }[]; isError?: boolean };

const reply = (value: unknown): Reply => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 1) }] });
const failure = (message: string): Reply => ({ content: [{ type: 'text', text: message }], isError: true });

// One request at a time, so a write never races a pull.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}

async function retryPending(s: RelaySync) {
  if (pending.size === 0) return;
  const { failed } = await s.push([...pending]);
  pending.clear();
  failed.forEach((n) => pending.add(n));
}

function explain(err: unknown, writing: boolean): Reply {
  if (err instanceof ToolError) return failure(err.message);
  if (err instanceof OfflineError) return failure(writing ? `${err.message} Nothing was changed.` : err.message);
  console.error(err);
  return failure(`Something went wrong: ${(err as Error)?.message ?? String(err)}`);
}

function read(run: () => unknown | Promise<unknown>) {
  return serial(async (): Promise<Reply> => {
    if (!sync) return failure(setupProblem!);
    try {
      let note: string | undefined;
      try {
        await sync.pull();
        await retryPending(sync);
      } catch (err) {
        if (!(err instanceof OfflineError) || !sync.lastPullAt) throw err;
        note = `Offline: this is the food log as of ${new Date(sync.lastPullAt).toLocaleTimeString()}.`;
      }
      if (!note && sync.partCount === 0) note = NO_DATA;
      const value = (await run()) as object;
      return reply(note ? { note, ...value } : value);
    } catch (err) {
      return explain(err, false);
    }
  });
}

function write(run: () => WriteResult<object>) {
  return serial(async (): Promise<Reply> => {
    if (!sync) return failure(setupProblem!);
    try {
      await sync.pull();
      await retryPending(sync);
      if (sync.partCount === 0) return failure(`${NO_DATA} Nothing was changed.`);
      const before = getData();
      const { result, touched } = run();
      const { sent, failed } = await sync.push(touched);
      if (failed.length > 0 && sent === 0) {
        applyMerged(before);
        return failure("Couldn't reach any of the sync relays, so nothing was saved. Check the internet connection and try again.");
      }
      failed.forEach((n) => pending.add(n));
      const note = failed.length ? 'Saved, but not every change reached the relays yet; it will finish uploading on the next request.' : undefined;
      return reply(note ? { note, ...result } : result);
    } catch (err) {
      return explain(err, true);
    }
  });
}

// ── Tools ─────────────────────────────────────────────────────────────────

const server = new McpServer({ name: 'calorie-tracker', version: __MCP_VERSION__ }, { instructions: INSTRUCTIONS });

const date = z.string().optional().describe('Day as YYYY-MM-DD in the user\'s local time. Leave out for today.');
const meal = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
const grams = z.number().positive().max(5000).describe('Amount eaten in grams (for drinks, ml).');
const unit = z.enum(['g', 'ml']).optional().describe('"ml" for drinks; grams otherwise.');
const per100 = (what: string, max: number) => z.number().min(0).max(max).describe(`${what} per 100 g as eaten.`);
const nutrition = {
  grams,
  unit,
  kcal_per_100g: per100('Calories (kcal)', 900),
  protein_per_100g: per100('Protein in grams', 100),
  carbs_per_100g: per100('Carbohydrates in grams', 100),
  fat_per_100g: per100('Fat in grams', 100),
};
const name = z.string().min(1).max(80).describe('Short plain name with how it\'s prepared, e.g. "White rice, cooked".');
const component = z.object({ name, ...nutrition });

server.registerTool(
  'get_day',
  {
    title: 'Food log for a day',
    description:
      "Everything logged on a day, by meal, with each entry's id, amount, calories and macros (and a dish's ingredients), plus the day's totals against the user's goals.",
    inputSchema: { date },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  ({ date }) => read(() => dayReport(date)),
);

server.registerTool(
  'get_summary',
  {
    title: 'Daily totals over a period',
    description: 'Calories and macros per day over a period (default: the last 7 days), with averages over the days that have entries.',
    inputSchema: {
      from: z.string().optional().describe('First day, YYYY-MM-DD. Default: 6 days before "to".'),
      to: z.string().optional().describe('Last day, YYYY-MM-DD. Default: today.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  ({ from, to }) => read(() => summaryReport(from, to)),
);

server.registerTool(
  'search_foods',
  {
    title: 'Find foods',
    description:
      "Search the user's favorites, their recently logged foods and the app's food list (nutrition per 100 g). Without a query, lists favorites and recent foods. With online: true it also searches Open Food Facts for packaged products (or looks up a barcode number).",
    inputSchema: {
      query: z.string().optional().describe('Food name, brand or barcode.'),
      online: z.boolean().optional().describe('Also search Open Food Facts (packaged products).'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  ({ query, online }) => read(() => findFoods(query, online)),
);

server.registerTool(
  'log_food',
  {
    title: 'Log food',
    description:
      'Add food to a meal. Each item is either a food_id (from search_foods or get_day) with grams, or your own estimate: name, grams and nutrition per 100 g — for a composed dish, its components instead (then the dish totals are worked out from them).',
    inputSchema: {
      meal: meal.optional().describe('Leave out to choose by the time of day.'),
      date,
      items: z
        .array(
          z.object({
            food_id: z.string().optional().describe('A known food from search_foods or get_day; then only grams is needed.'),
            name: name.optional(),
            components: z.array(component).max(30).optional().describe('For a composed dish: its main components, each with grams and nutrition per 100 g. Leave out for a single food.'),
            grams: grams.optional(),
            unit,
            kcal_per_100g: nutrition.kcal_per_100g.optional(),
            protein_per_100g: nutrition.protein_per_100g.optional(),
            carbs_per_100g: nutrition.carbs_per_100g.optional(),
            fat_per_100g: nutrition.fat_per_100g.optional(),
          }),
        )
        .min(1)
        .max(30),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  (input) => write(() => logFood(input)),
);

server.registerTool(
  'update_entry',
  {
    title: 'Change an entry',
    description:
      "Change a logged entry: its amount (a dish's ingredients scale with it), meal, day or name. Get the id from get_day.",
    inputSchema: {
      id: z.string().describe('Entry id from get_day.'),
      grams: grams.optional().describe('New amount in grams (or ml).'),
      meal: meal.optional(),
      date: z.string().optional().describe('Move to this day, YYYY-MM-DD.'),
      name: z.string().max(80).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  (input) => write(() => editEntry(input)),
);

server.registerTool(
  'delete_entry',
  {
    title: 'Delete an entry',
    description: 'Remove a logged entry (on every synced device). Get the id from get_day.',
    inputSchema: { id: z.string().describe('Entry id from get_day.') },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  ({ id }) => write(() => removeEntry(id)),
);

server.registerTool(
  'set_goals',
  {
    title: 'Set daily goals',
    description: 'Change the daily calorie and macro goals. Give only the ones to change.',
    inputSchema: {
      kcal: z.number().min(500).max(10000).optional(),
      protein_g: z.number().positive().max(1000).optional(),
      carbs_g: z.number().positive().max(1000).optional(),
      fat_g: z.number().positive().max(1000).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  (input) => write(() => setGoals(input)),
);

// ── Start ─────────────────────────────────────────────────────────────────

async function main() {
  if (setupProblem) console.error(setupProblem);
  const transport = new StdioServerTransport();
  const stop = () => {
    sync?.close();
    process.exit(0);
  };
  transport.onclose = stop;
  process.stdin.on('end', stop);
  await server.connect(transport);
  console.error(`Calorie Tracker MCP server ${__MCP_VERSION__} is running.`);
  // Fetch the log now, so the first question doesn't wait for it.
  if (sync) serial(() => sync.pull()).catch((err) => console.error('First sync failed:', (err as Error).message));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
