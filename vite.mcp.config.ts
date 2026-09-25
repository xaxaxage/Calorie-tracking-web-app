import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { defineConfig, type Plugin } from 'vite';

/**
 * Builds the Claude Desktop connector (mcp/server.ts) into one file with
 * everything included, and packs it as a Claude Desktop extension (.mcpb):
 * a zip with a manifest, the server and an icon. Claude Desktop runs it with
 * its own Node.js, so nothing else needs installing.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** Semver that grows with every build, so Claude Desktop sees a new download as an update. */
function version(): string {
  const d = new Date();
  return `1.${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}.${d.getUTCHours() * 100 + d.getUTCMinutes()}`;
}

const VERSION = version();
const ENTRY = 'calorie-tracker-mcp.mjs';

const TOOLS = [
  { name: 'get_day', description: 'Food log for a day, by meal, with totals against your goals.' },
  { name: 'get_summary', description: 'Daily calories and macros over a period, with averages.' },
  { name: 'search_foods', description: 'Search your favorites, recent foods, the food list and Open Food Facts.' },
  { name: 'log_food', description: 'Add food to a meal — a known food or an estimate, dishes with their ingredients.' },
  { name: 'update_entry', description: "Change an entry's amount, meal, day or name." },
  { name: 'delete_entry', description: 'Remove an entry.' },
  { name: 'set_goals', description: 'Change the daily calorie and macro goals.' },
];

function manifest() {
  return {
    manifest_version: '0.3',
    name: 'calorie-tracker',
    display_name: 'Calorie Tracker',
    version: VERSION,
    description: 'Read and log your food in Calorie Tracker, synced with the app on your phone.',
    long_description:
      'Ask Claude what you ate, how today is going or how the week looked, and log meals by just describing them. Uses the app\'s end-to-end encrypted device sync: paste the 12-word sync key from the app (Settings → Sync → Show sync key). Your food log stays encrypted on the relays; only your devices can read it.',
    author: { name: 'xaxaxage', url: 'https://github.com/xaxaxage' },
    homepage: 'https://xaxaxage.github.io/Calorie-tracking-web-app/',
    repository: { type: 'git', url: 'https://github.com/xaxaxage/Calorie-tracking-web-app' },
    icon: 'icon.png',
    server: {
      type: 'node',
      entry_point: 'server/index.mjs',
      mcp_config: {
        command: 'node',
        args: ['${__dirname}/server/index.mjs'],
        env: { SYNC_KEY: '${user_config.sync_key}' },
      },
    },
    tools: TOOLS,
    keywords: ['calories', 'nutrition', 'food log', 'diet'],
    compatibility: { platforms: ['win32', 'darwin', 'linux'], runtimes: { node: '>=20.0.0' } },
    user_config: {
      sync_key: {
        type: 'string',
        title: 'Sync key (12 words)',
        description: 'In the app: Settings → Sync → Show sync key. Turn sync on there first if it is off.',
        sensitive: true,
        required: true,
      },
    },
  };
}

function extension(): Plugin {
  return {
    name: 'calorie-tracker-mcpb',
    apply: 'build',
    generateBundle(_options, bundle) {
      const server = bundle[ENTRY];
      if (!server || server.type !== 'chunk') throw new Error(`${ENTRY} was not built`);
      const zip = zipSync(
        {
          'manifest.json': strToU8(JSON.stringify(manifest(), null, 2)),
          'server/index.mjs': strToU8(server.code),
          'icon.png': readFileSync('public/icons/icon-512.png'),
        },
        { level: 9 },
      );
      this.emitFile({ type: 'asset', fileName: 'calorie-tracker.mcpb', source: zip });
    },
  };
}

export default defineConfig({
  define: { __MCP_VERSION__: JSON.stringify(VERSION) },
  plugins: [extension()],
  // No browser code here: keep the web app's public/ folder out of this build.
  publicDir: false,
  build: {
    ssr: 'mcp/server.ts',
    outDir: 'dist/mcp',
    emptyOutDir: true,
    target: 'node20',
    minify: true,
    rollupOptions: { output: { format: 'es', entryFileNames: ENTRY, codeSplitting: false } },
  },
  ssr: { noExternal: true, target: 'node' },
});
