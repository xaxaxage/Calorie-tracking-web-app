import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';
import preact from '@preact/preset-vite';

/** Emit sw.js with a precache list of every file in the build. */
function serviceWorker(): Plugin {
  return {
    name: 'calorie-tracker-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const pub = ['manifest.webmanifest', ...readdirSync('public/icons').map((f) => `icons/${f}`)];
      const files = [...new Set([...built, ...pub])].sort();
      const hash = createHash('sha256').update(files.join('|')).digest('hex').slice(0, 10);
      const version = `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${hash}`;
      const source = readFileSync('sw-template.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__ASSETS__', JSON.stringify(files.map((f) => `./${f}`)));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  // Relative base so the build works from any sub-path (e.g. GitHub Pages).
  base: './',
  plugins: [preact(), serviceWorker()],
  build: {
    target: ['es2020', 'safari15'],
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
