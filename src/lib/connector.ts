/**
 * The online Claude connector's address (mcp/cloud.ts): the host of the
 * person's own deployment, a secret token derived from the sync key, and
 * their time zone, so "today" and meal times match the phone.
 */

const HOST_KEY = 'calorie-tracker:connector-host';

/** "calorie-tracker-abc.vercel.app" from whatever was pasted: an address with or without https://, or a whole URL. */
export function connectorHost(text: string): string {
  const t = text.trim();
  if (!t) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return url.hostname.includes('.') ? url.host.toLowerCase() : '';
  } catch {
    return '';
  }
}

export function connectorUrl(host: string, token: string, zone?: string): string {
  // Slashes read better unescaped ("Europe/Kyiv"); a "+" must stay escaped.
  const tz = zone ? `?tz=${encodeURIComponent(zone).replace(/%2F/gi, '/')}` : '';
  return `https://${host}/mcp/${token}${tz}`;
}

/** The host typed on this device, kept here only (it's no secret, just not worth syncing). */
export function savedConnectorHost(): string {
  try {
    return localStorage.getItem(HOST_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveConnectorHost(host: string) {
  try {
    if (host) localStorage.setItem(HOST_KEY, host);
    else localStorage.removeItem(HOST_KEY);
  } catch {
    // Private browsing: it just isn't remembered.
  }
}

export function timeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}
