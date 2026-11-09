# Calorie Tracker — notes for Claude

The owner's general preferences (design, animations, sync, connector, testing, git) are in their **app-playbook**
skill. Read it first. This file holds what's specific to this app.

## What and where

- iPhone home-screen web app: https://xaxaxage.github.io/Calorie-tracking-web-app/
- Branch `claude/iphone-calorie-tracker-qy02mh` is the default and deploy branch. Each push runs
  `.github/workflows/deploy.yml` (tests, build, `build:cloud`, deploy to Pages).
- Shared Claude connector: https://calories.xaxaxage.vercel.app (Vercel project built from `vercel.json`;
  `CONNECTOR_SECRET` set there). Its host is `SHARED_CONNECTOR_HOST` in `src/lib/connector.ts`.
- `src/screens/` screens, `src/components/` shared UI, `src/lib/` store, foods, nutrition, theme, motion, humor,
  router, Open Food Facts, scanner, photos.
- `src/lib/ai/` Gemini and Claude estimates, usage tracking; `src/lib/sync/` 12-word sync over Nostr.
- `mcp/` Claude connector: `connector.ts` tools, `server.ts` Desktop (stdio), `cloud.ts` and `seal.ts` online (HTTP).
- `tests/` Vitest unit tests (`fakeRelay.ts` is a local Nostr relay for tests).

## Commands

`npm run dev` · `npm test` · `npm run typecheck` · `npm run build` (app + Desktop extension in `dist/mcp/`) ·
`npm run build:cloud` (online connector in `.vercel/output/`) · `npx vite preview --port 4173` for end-to-end tests.

## Decisions for this app (newest first)

- Photo estimate: a review step after the photo (note, Retake / Choose another, Estimate). Nothing is sent before
  Estimate, and only estimated photos are kept. Photos handed over from Add food / Describe are estimated at once.
- The connector is shared by everyone. Addresses are `/mcp/<sealed key>?tz=…`, made at `POST /link`. The old
  `/mcp/<32 hex>` address works only while `SYNC_KEY` is set on Vercel.
- Settings has a "Use with Claude" card under Sync; the Desktop extension and "your own server" are folds in it.
- Gemini: the default model is `gemini-flash-lite-latest`, and switching models automatically is on. Daily-limit
  models are skipped until midnight Pacific time. Overloaded (503) models rest for 5→30 minutes. AI usage meters use
  the free-tier numbers (Flash 20/day and 5/min, Flash-Lite 500/day and 15/min).
- Open Food Facts search: up to 3 tries, at most 8 searches a minute, "isn't answering" (not "offline").
- Meal photos are kept in IndexedDB (on by default), never synced or backed up.
- Sync uses weekly parts for entries, plus meta, ai, `device:<id>` and retired markers. HKDF salt is
  `calorie-tracker-sync`.
- Humor never jokes about weight, "good"/"bad" food or willpower (a test enforces it).

## Known gaps

- The Playwright end-to-end scripts were written outside the repo, so a new session has none. Add them under
  `tests/e2e/` when touching a flow, mocking Gemini, Anthropic and Open Food Facts with `context.route`.
- The habit and gym trackers' repos and connector domains aren't recorded yet. When they come up, add them to the
  app-playbook skill.
