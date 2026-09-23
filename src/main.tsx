import { render } from 'preact';
import './styles.css';
import './screens.css';
import { App } from './app';
import { initRouter } from './lib/router';

initRouter();
render(<App />, document.getElementById('app')!);

// Ask the browser not to evict saved entries when storage runs low.
navigator.storage?.persist?.().catch(() => undefined);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker failed', err));
  });
}
