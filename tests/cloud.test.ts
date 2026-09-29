// @vitest-environment node
import '../mcp/setup';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { addEntry, getData, reload } from '../src/lib/store';
import { connectorToken, newPhrase } from '../src/lib/sync/crypto';
import { buildParts } from '../src/lib/sync/parts';
import { RelaySync } from '../mcp/relays';
import { startRelay } from './fakeRelay';

vi.stubGlobal('__MCP_VERSION__', '1.0.0-test');

type Handler = (typeof import('../mcp/cloud'))['default'];

async function serve(handler: Handler): Promise<{ base: string; server: Server }> {
  const server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

/** "Today" in a time zone, as YYYY-MM-DD. */
const todayIn = (zone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date());

describe('connector address', () => {
  it('is 128 bits from the sync key: the same every time, different for another key', async () => {
    const phrase = newPhrase();
    const token = await connectorToken(phrase);
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(await connectorToken(`  ${phrase.toUpperCase()} `)).toBe(token);
    expect(await connectorToken(newPhrase())).not.toBe(token);
  });
});

describe('online connector', () => {
  const relay = startRelay();
  const phrase = newPhrase();
  let base = '';
  let server: Server;
  let token = '';
  const clients: Client[] = [];
  let phone: RelaySync;

  beforeAll(async () => {
    await new Promise((r) => setTimeout(r, 50));
    // The phone logs a breakfast and syncs it.
    phone = new RelaySync(phrase, [relay.url()]);
    await phone.pull();
    addEntry({ date: todayIn('Pacific/Kiritimati'), meal: 'breakfast', name: 'Porridge', amount: 250, unit: 'g', kcal: 180, p: 6, c: 30, f: 4, source: 'quick' });
    await phone.push(buildParts(getData()).keys());
    localStorage.clear();
    reload();

    process.env.SYNC_KEY = phrase;
    process.env.RELAYS = relay.url();
    const { default: handler } = await import('../mcp/cloud');
    ({ base, server } = await serve(handler));
    token = await connectorToken(phrase);
  });

  afterAll(async () => {
    await Promise.all(clients.map((c) => c.close()));
    phone.close();
    await new Promise((r) => server.close(r));
    await relay.close();
    delete process.env.SYNC_KEY;
    delete process.env.RELAYS;
  });

  async function connect(query = '') {
    const client = new Client({ name: 'test', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp/${token}${query}`)));
    clients.push(client);
    return client;
  }

  const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
    const text = r.content.map((c) => c.text).join('\n');
    return { error: !!r.isError, text, json: r.isError ? null : JSON.parse(text) };
  };

  it('says it is running and whether the sync key is set, without giving the address away', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toMatch(/is running/);
    expect(text).toMatch(/SYNC_KEY\): set/);
    expect(text).not.toContain(token);
  });

  it('answers only at the secret address', async () => {
    for (const path of [`/mcp/${'0'.repeat(32)}`, `/mcp/${token.slice(0, 31)}`, `/mcp?token=${'0'.repeat(32)}`, '/sse', `/x/${token}`]) {
      const res = await fetch(`${base}${path}`, { method: 'POST', body: '{}' });
      expect(res.status, path).toBe(404);
    }
    const get = await fetch(`${base}/mcp/${token}`, { headers: { accept: 'text/event-stream' } });
    expect(get.status).toBe(405);
  });

  it('lists the tools and reads the log the phone synced, for "today" in the given time zone', async () => {
    const client = await connect('?tz=Pacific/Kiritimati');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['delete_entry', 'get_day', 'get_summary', 'log_food', 'search_foods', 'set_goals', 'update_entry']);
    expect(client.getInstructions()).toContain('log_food');

    const day = await call(client, 'get_day');
    expect(day.error, day.text).toBe(false);
    expect(day.json.date).toBe(todayIn('Pacific/Kiritimati'));
    expect(day.json.meals.breakfast.map((e: { name: string }) => e.name)).toEqual(['Porridge']);
  });

  it('logs food that the phone then pulls from the relays', async () => {
    const client = await connect('?tz=Pacific/Kiritimati');
    const logged = await call(client, 'log_food', {
      meal: 'lunch',
      items: [{ name: 'Lentil soup', grams: 350, kcal_per_100g: 60, protein_per_100g: 4, carbs_per_100g: 9, fat_per_100g: 1 }],
    });
    expect(logged.error, logged.text).toBe(false);

    localStorage.clear();
    reload();
    const reader = new RelaySync(phrase, [relay.url()]);
    await reader.pull();
    reader.close();
    const lunch = getData().entries.filter((e) => e.meal === 'lunch');
    expect(lunch.map((e) => [e.name, e.date])).toEqual([['Lentil soup', todayIn('Pacific/Kiritimati')]]);
  });

  it('takes the token as a query too, as when Vercel passes on a rewritten path', async () => {
    expect(await (await fetch(`${base}/mcp`)).text()).toMatch(/is running/);
    const client = new Client({ name: 'test', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp?token=${token}&tz=Pacific/Kiritimati`)));
    clients.push(client);
    const day = await call(client, 'get_day');
    expect(day.json.date).toBe(todayIn('Pacific/Kiritimati'));
  });

  it('uses another time zone when the address says so', async () => {
    const client = await connect('?tz=Etc/GMT%2B12');
    const day = await call(client, 'get_day');
    expect(day.json.date).toBe(todayIn('Etc/GMT+12'));
  });
});

describe('online connector without a sync key', () => {
  it('explains the setup instead of answering', async () => {
    vi.resetModules();
    process.env.SYNC_KEY = '';
    const { default: handler } = await import('../mcp/cloud');
    const { base, server } = await serve(handler);
    try {
      expect(await (await fetch(`${base}/`)).text()).toMatch(/SYNC_KEY\): not set/);
      const res = await fetch(`${base}/mcp/${'a'.repeat(32)}`, { method: 'POST', body: '{}' });
      expect(res.status).toBe(503);
      expect(await res.text()).toMatch(/SYNC_KEY environment variable of this connector's Vercel project/);
    } finally {
      await new Promise((r) => server.close(r));
      delete process.env.SYNC_KEY;
    }
  });
});

describe('connector address in the app', () => {
  it('takes the Vercel address however it was pasted, and adds the time zone', async () => {
    const { connectorHost, connectorUrl } = await import('../src/lib/connector');
    expect(connectorHost('calorie-tracker-abc.vercel.app')).toBe('calorie-tracker-abc.vercel.app');
    expect(connectorHost(' https://Calorie-Tracker-abc.vercel.app/ ')).toBe('calorie-tracker-abc.vercel.app');
    expect(connectorHost('https://calorie-tracker-abc.vercel.app/mcp/123?tz=x')).toBe('calorie-tracker-abc.vercel.app');
    expect(connectorHost('not an address')).toBe('');
    expect(connectorHost('localhost')).toBe('');
    const token = 'a'.repeat(32);
    expect(connectorUrl('x.vercel.app', token, 'Europe/Kyiv')).toBe(`https://x.vercel.app/mcp/${token}?tz=Europe/Kyiv`);
    expect(new URL(connectorUrl('x.vercel.app', token, 'Etc/GMT+12')).searchParams.get('tz')).toBe('Etc/GMT+12');
    expect(connectorUrl('x.vercel.app', token)).toBe(`https://x.vercel.app/mcp/${token}`);
  });
});
