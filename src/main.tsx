import { render } from 'preact';
import './styles.css';
import './screens.css';
import { App } from './app';
import { initRouter } from './lib/router';
import { loadSyncConfig } from './lib/sync/state';
import { getData, subscribe } from './lib/store';
import { applyTheme } from './lib/theme';

// Keep the color palette in step with Settings.
let shownTheme = '';
function syncTheme() {
  const { theme, customThemes } = getData().settings;
  const key = `${theme}|${JSON.stringify(customThemes)}`;
  if (key === shownTheme) return;
  shownTheme = key;
  applyTheme(theme, customThemes);
}
syncTheme();
subscribe(syncTheme);

initRouter();
render(<App />, document.getElementById('app')!);

// Resume device sync if this device has a sync key (the sync code loads only then).
if (loadSyncConfig()) {
  import('./lib/sync/engine').then((m) => m.startSync()).catch((err) => console.warn('Sync could not start', err));
}

// Ask the browser not to evict saved entries when storage runs low.
navigator.storage?.persist?.().catch(() => undefined);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker failed', err));
  });
}
