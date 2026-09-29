import './setup';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { connectorToken } from '../src/lib/sync/crypto';
import { createConnector, relaysFrom } from './connector';

/**
 * Calorie Tracker online, for claude.ai and the Claude phone apps: the same
 * connector as the Claude Desktop extension, over MCP's Streamable HTTP.
 * Built for Vercel's free plan (vite.cloud.config.ts); it also runs anywhere
 * Node does: `SYNC_KEY="…" PORT=8787 node index.mjs`.
 *
 * Its address is https://<host>/mcp/<token>, with the token derived from the
 * sync key (the app shows the whole address). Anything else gets a 404.
 * `?tz=Europe/Kyiv` on the address (the app adds it) sets the time zone for
 * "today" and meal times; servers run on UTC.
 */

declare const __MCP_VERSION__: string;

const deviceName = (process.env.DEVICE_NAME ?? '').trim().slice(0, 60) || 'Claude (online connector)';

const connector = createConnector({
  syncKey: process.env.SYNC_KEY ?? '',
  relays: relaysFrom(process.env.RELAYS),
  // Instances come and go, so the id can't come from the machine: one per name.
  device: { id: createHash('sha256').update(`calorie-tracker-mcp-cloud|${deviceName}`).digest('hex').slice(0, 32), name: deviceName },
  host: 'cloud',
});

const token = connector.setupProblem ? null : connectorToken(connector.phrase);

function send(res: ServerResponse, status: number, text: string, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(text);
}

function sameToken(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function validZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function status(): string {
  const key = !connector.setupProblem ? 'set' : connector.phrase ? 'not a valid 12-word phrase' : 'not set';
  return [
    `Calorie Tracker connector for Claude, version ${__MCP_VERSION__}, is running.`,
    `Sync key (SYNC_KEY): ${key}.`,
    '',
    connector.setupProblem ??
      "To use it, add the address the app shows (Settings → Sync between devices → Use with Claude on your phone) as a custom connector in Claude.",
  ].join('\n');
}

/** Requests being answered, so relay connections close only once all are done. */
let active = 0;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://connector');
  const given = url.searchParams.get('token') ?? /^\/mcp\/([^/]+)\/?$/.exec(url.pathname)?.[1];
  if (given == null) {
    if (['/', '/health', '/mcp', '/mcp/'].includes(url.pathname)) return send(res, 200, status());
    return send(res, 404, 'Not found');
  }
  if (!token) return send(res, 503, connector.setupProblem!);
  if (!sameToken(given, await token)) return send(res, 404, 'Not found');
  // No server-to-client stream (it would keep a serverless function running) and no sessions to end.
  if (req.method !== 'POST') return send(res, 405, 'Method not allowed', { allow: 'POST' });

  const zone = url.searchParams.get('tz') ?? process.env.TIME_ZONE;
  if (zone && validZone(zone)) process.env.TZ = zone;

  active++;
  const server = connector.newServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
    // A serverless instance sleeps between requests, so don't leave relay connections to go stale.
    if (--active === 0) connector.sync?.disconnect();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) send(res, 500, 'Something went wrong.');
  }
}

// A stray error in a library must not take down requests in flight: log it and carry on.
process.on('uncaughtException', (err) => console.error('Unexpected error, still running:', err));
process.on('unhandledRejection', (err) => console.error('Unexpected error, still running:', err));

// Run directly (not imported by Vercel): serve on PORT.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 8787;
  createServer((req, res) => void handler(req, res)).listen(port, () => {
    console.error(`Calorie Tracker connector ${__MCP_VERSION__} is listening on port ${port}.`);
    if (connector.setupProblem) console.error(connector.setupProblem);
  });
}
