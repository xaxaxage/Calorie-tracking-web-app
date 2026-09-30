/** When and from which commit this build was made, e.g. "2026-09-24 18:05 · 1a2b3c4". */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** The shared Claude connector's host, e.g. "calorie-tracking-web-app.vercel.app" (see src/lib/connector.ts). */
  readonly VITE_CONNECTOR_HOST?: string;
}
