import { WebSocketServer, type WebSocket } from 'ws';
import type { AddressInfo } from 'node:net';
import { verifyEvent, type Event } from 'nostr-tools/pure';

/** Enough of a Nostr relay for the sync client: replaceable events, REQ with since/limit. */
export function startRelay() {
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
