# Calorie Tracker

A calorie and macro tracker built for iPhone, designed to run in Chrome (or Safari) and to be added to the
home screen like an app. It follows the "Calorie Tracker" design: Today, History, Add food, portion picker,
barcode scanner, photo estimate and quick add.

## Features

- **Today** – calories left ring, eaten vs. goal, protein / carbs / fat progress, four meals. Step back
  through previous days with the arrows.
- **History** – week chart against your goal (under = teal, over = orange), daily average, average macros,
  and a list of days you can open.
- **Add food** – pick the meal and start typing: one field takes a whole meal ("2 eggs, toast with butter and
  a latte") or the name of one food. As soon as you type, the page becomes the describe menu — **Estimate with
  Gemini** (or press Return) and **Match from food list** — with matching foods from ~140 built-in ones and
  millions of [Open Food Facts](https://world.openfoodfacts.org) products below it for single foods (its search
  is often overloaded lately, so the app tries up to three times and stays under its limit of 10 searches a
  minute). Or add from **Recent** and **Favorites** with one tap (tap again to undo).
- **Portion** – grams/ml with ±buttons, serving presets, live calories and macros, "left today after this",
  star to save as a favorite.
- **Barcode** – scans EAN/UPC codes with the camera (works on iPhone through a bundled WebAssembly
  decoder), or type the number. Products are looked up on Open Food Facts.
- **Describe** – type (or dictate) what you ate right in Add food, e.g. "2 eggs, a slice of toast with butter
  and a latte". Without any key it matches your words to the food list — free and offline. With an AI key, the
  AI estimates any food or dish, amounts included.
- **Photo estimate** – snap your plate; the AI identifies each item and estimates its weight and
  nutrition. Adjust the grams, then add everything at once. Needs an AI key (a free Gemini key works).
  Add a note for what the photo can't show ("fried in butter, I ate half") — or type the description first in
  Add food and tap **Add a photo too** — and both go to the AI together.
- **Meal photos** – with **Settings → Logging → Keep meal photos** on (the default), every photo you take for an
  estimate is kept on the phone with its meal: it shows on that meal's screen, and **Meal photos** (linked from
  Settings) lists them all by day. **Save to Photos** — on the photo right after taking it, in the photo viewer, or
  for a whole day — puts them in your Photos app through the share sheet (**Save Image**); iPhone doesn't let web
  apps add to Photos without that tap. Photos stay on the device: not synced, not in backups.
- **Correct the AI** – under any AI estimate, **Something off?** takes a correction in your own words ("it's
  brown rice, about 180 g", "no oil", "the drink is Coke Zero"). The AI updates the list, keeping the amounts you
  changed and the items you removed; corrections add up, and **Undo** goes back one step.
- **Dishes with ingredients** – a dish (pizza, burrito, a bowl, your own recipe) is made of ingredients you
  control: change any amount with ± or by typing, remove one (with undo), add one from the food list, Open Food
  Facts or as a custom item, or scale the whole portion (½×, 2×, "1 slice"…). Nutrition is always the sum of the
  ingredients. Built-in dishes come with a recipe, the AI splits composed dishes into their components, **Build a
  dish** starts from scratch, and any logged food can become a dish with **Make it a dish**. Star a dish to reuse
  it from Favorites. Don't want to build your own? **Settings → Logging → Build your own dishes** hides both.
- **Quick add** – just calories (and optionally macros), with a hint when the macros don't add up.
- **Copy meal** – copy any meal from the last two weeks into another meal or day.
- **Edit** – open a meal to change an item's amount, move it to another meal, or delete it (with undo).
- **Appearance** – ten color palettes (four of them dark, plus Auto that follows the phone's dark mode) and your
  own palettes: pick colors, paste a list of hex codes or a [Coolors](https://coolors.co) link, open a shared
  palette file, or take the colors from a photo.
- **Humor mode** – the occasional light-hearted remark (a line under Today's title, playful empty meals, a note on
  some toasts, loading lines while the AI works). One switch turns it off for plain text everywhere.
- **Animations** – quiet motion that shows what changed: screens fade in and their blocks rise into place, the
  calorie ring draws and the numbers count up (and roll on from where they were after you add food), History's
  bars grow, buttons give a little when pressed, and new ingredients and toasts slide in. **Settings →
  Appearance → Animations** turns it all off; it's also off while the phone's Reduce Motion setting is on.
- **Settings** – daily calorie and macro goals, appearance, API key, sync, export / import a backup, delete all data.
- **Claude** (claude.ai, the phone apps, Claude Desktop) – ask Claude about your food log or log meals by
  describing them; each person copies their own connector address from Settings (see below).
- Works offline (except online search, barcode lookups and photo estimates) once loaded.

## Use it on your iPhone

1. Open the app's URL in Chrome on the iPhone (see *Deploy* below for the address).
2. Tap the **Share** button in the address bar → **Add to Home Screen**.
3. Launch it from the new icon. It opens full screen, and your data stays on the phone.

The first time you scan a barcode, allow camera access when asked.

### AI estimates (photo and describe) — free with Gemini

The app can use either AI; pick one in **Settings → AI estimates**:

- **Gemini (free)** – Google gives out Gemini API keys at no cost, with a daily request allowance:
  1. Open [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and sign in with a Google account.
  2. Tap **Create API key** and copy it (no card needed).
  3. In the app: **Settings → AI estimates → Gemini** → paste → **Save key**.

  **Choosing a model:** the default is `gemini-flash-lite-latest` (always Google's newest Flash-Lite, largest free
  allowance); `gemini-flash-latest` is more accurate with fewer free requests. After you save your key, the
  model picker also lists every model that key can use (Gemini and Gemma), and **Other** takes any model ID.
  Free keys can use Flash and Flash-Lite models, each with its own daily allowance; Pro models need billing.

  **Overloaded or out of free uses:** with **Switch models automatically** on (the default), a model that is
  overloaded (503), out of free uses (429) or unavailable hands over to the next one: the newest Flash-Lite and
  Flash, then other Flash models on your key, then a Gemma model — up to five in total. The screen shows which
  model is being tried and which one answered.

  **Overloaded models rest:** free-tier Flash models often answer "This model is currently experiencing high
  demand" (503), and those failed requests seem to count toward the 20 a day. So a model Google calls overloaded
  isn't retried while another can answer; it rests for 5 minutes (doubling up to 30 while it stays overloaded)
  and estimates go to the next model meanwhile. With automatic switching off, or no other model left, it's tried
  once more after a pause; then the error quotes Google and offers **Use Flash-Lite instead**. The AI line on the
  estimate screens and **AI usage** say when a model is resting, with **Try it again now**.

  **Limits are handled carefully:** Google's "limit reached" replies say which limit it was. A model whose
  **daily** free uses are gone is skipped until Google resets them (midnight in California), so it doesn't cost a
  failed request on every estimate; a model at its **per-minute** limit is retried after the few seconds Google
  asks for (up to 15) instead of switching to a lesser model.

  **AI usage** (**Settings → AI estimates → AI usage**) lists every request this device sent: today's count and
  tokens; per model since Google's daily reset, meters like AI Studio's — requests today against the daily limit
  and the busiest minute against the per-minute one, using Google's free-tier limits (Flash: 20 a day, 5 a minute;
  Flash-Lite: 500 a day, 15 a minute) unless Google has reported yours — with "out of free uses until 09:00" and
  **Try it again now**; the last 7 days; and recent estimates with each request they took (model, result, time,
  tokens, and Google's own words when it failed). Aliases like "Flash (newest)" are counted under the model that answered, as AI Studio does, so an
  alias whose model is used up is skipped too, and each model is tried once per estimate. Kept on the device only.

  On the free tier Google may use what you send to improve its products. Free-tier availability depends on your
  country.
- **Claude (paid)** – needs an Anthropic API key with prepaid credit from
  [console.anthropic.com](https://console.anthropic.com/settings/keys). Uses `claude-opus-5` with structured JSON
  output and `fallbacks: "default"`.

Keys are stored on your devices (and, with sync on, passed encrypted to your other devices), requests go
straight from your phone to Google or Anthropic, and backups leave keys out. Describe → **Match from food list** always works without any key.

## Sync between devices

Devices are linked with a **12-word sync key** — no account.

1. On your first device: **Settings → Sync between devices → Create sync key**. Save the 12 words somewhere safe
   (a password manager or Notes), tick the box, and tap **Start syncing**.
2. On each other device: open the app, **Settings → Sync between devices → I have a key**, enter the words and tap
   **Connect**. What's already on that device is combined with the synced log — nothing is overwritten.

After that, every change syncs by itself within a few seconds while the app is open, and on the next launch
otherwise. **Show sync key** displays the words again; **Turn off sync on this device** stops syncing but keeps
the log on that device.

**Devices** lists every device using the key — this one first, then the others with when they were last
active and which version of the app they run (Claude Desktop shows up too). Rename this device with the pencil;
the trash button hides another device from the list on every device (it comes back if it's used again).

**Change sync key** cuts off devices you no longer trust — a lost phone, a computer you don't use anymore, or
someone who saw your words. It makes a new 12-word key and moves your log to it; the old key stops working:
every part stored under it is replaced, so the old words open nothing, and devices still using them stop
syncing and ask for the new key (they keep what they already have). Enter the new key on each device you keep,
and in Claude Desktop's extension settings.

How it works:

- The key is a standard BIP-39 phrase. On the device it is turned (PBKDF2 → HKDF) into a signing key, an
  AES-256-GCM encryption key and a key for naming data. Everything is compressed and encrypted **before** it
  leaves the phone.
- The encrypted data goes to free public [Nostr](https://nostr.com) relays (several at once:
  `relay.damus.io`, `nos.lol`, `relay.primal.net`, `nostr.mom`, editable under **Relays**) as app-data events
  (NIP-78). Relays only see a random public key, opaque labels and ciphertext — no food names, dates or amounts.
- The log is split into weekly parts, so each message stays far below relays' 64 KB limit and only changed weeks
  are uploaded again.
- Every device keeps its full log and merges what it receives: the newest edit of an entry wins, a deletion wins
  over edits made before it, favorites and goals go by time. If a relay loses data, the devices upload it again.
- Each device also writes a small note about itself (name, type, app version, when it was last used —
  refreshed at most every 15 minutes), encrypted like everything else, for the device list.
- The AI setup syncs too: the Gemini and Claude keys, the chosen AI and model. Enter a key once and every
  device can use it; removing a key removes it everywhere. Each key goes by its own time, so picking a model on a
  device without a key never erases the key set on another.

Things to know: public relays are run by volunteers and can be slow or go away, which is why several are used
and why each device keeps a full copy — keep exporting a backup now and then. Anyone with the 12 words can read
and change your log and use your AI keys. **Delete all entries** deletes on every synced device.

## Use with Claude

Claude can read and write your food log — on claude.ai, in the Claude app on your phone and in Claude
Desktop: ask *"what did I eat today?"*, *"how was my protein this week?"*, or just say *"log lunch: chicken
caesar salad and a flat white"* — Claude estimates it (a dish with its ingredients, like the app's own AI)
and it appears in the app on your phone within seconds.

It works through a connector (an MCP server) that uses the same encrypted sync as your devices, so turn on
**Sync between devices** first. Then:

1. In the app: **Settings → Use with Claude → Show my connector address → Copy the address**.
2. In Claude on a computer (claude.ai or Claude Desktop): **Customize → Connectors → + → Add custom
   connector**, name it *Calorie Tracker*, paste the address, **Add**. (Custom connectors work on every
   Claude plan; the Free plan allows one.)
3. That's it — it works in the Claude phone app too (connectors are added on the web or desktop, then used
   everywhere).

Everyone using the app gets their own address the same way; one connector server answers for all of them.
It appears in the app's device list as **Claude (online connector)**.

**What Claude can do:** `get_day` (a day by meal, with totals against your goals), `get_summary` (daily
totals and averages over a period), `search_foods` (your favorites, recent foods, the food list and — when
asked — Open Food Facts), `log_food` (known foods or estimates; dishes with ingredients), `update_entry`
(amount, meal, day, name — a dish's ingredients scale with the amount), `delete_entry` and `set_goals`.
Your AI keys are never given to Claude.

**How the address works:** it is `https://<server>/mcp/<your sync key, sealed>?tz=<your time zone>`. The
server seals your sync key with its own secret (when the app asks it to, at `/link`), so the address
doesn't show the key to anyone, and only that server can open it. Treat it like a password: anyone with it
can read and change your log. The time zone makes "today" and meal times match your phone (servers run on
UTC); if your sync uses relays other than the app's defaults, the address names them too (`&r=…`). After
you change your sync key, the old address stops working: copy the new one and replace it in Claude.

**Privacy:** to answer Claude, the connector server opens your food log, so whoever runs it could see it —
for this app's shared server, that's its maker. What it reads goes into your conversation with Claude, like
anything else you share there. For a log that's opened only by you, host the connector yourself (below) or
use the Claude Desktop extension.

### Host the connector

The connector is `mcp/cloud.ts`, built for [Vercel](https://vercel.com)'s free plan (it runs anywhere Node.js
22 runs, too). The app's own builds use `calorie-tracking-web-app.vercel.app`; to host one — for yourself,
or for your friends — do this once:

1. Open [vercel.com/new](https://vercel.com/new), sign in with GitHub and **import this repository** (fork
   it first if it isn't in your account). Set **Application Preset** to *Other*; the rest comes from
   `vercel.json`.
2. Add an **Environment Variable** `CONNECTOR_SECRET`: 32 or more random characters (from a password
   generator). It seals everyone's addresses; changing it later makes everyone copy a new address. Deploy.
3. Open the project's address listed under **Domains** (not a single deployment's address, which Vercel
   keeps private). It should say *"Connector addresses: ready"*.
4. In the app: **Settings → Use with Claude → Use your own connector server**, enter that address, **Use**.
   Or, for everyone using your build of the app, set `SHARED_CONNECTOR_HOST` in `src/lib/connector.ts` (or
   `VITE_CONNECTOR_HOST` when building).

Optional settings: `TIME_ZONE` (for addresses without `?tz=`), `RELAYS` (for addresses without `&r=`) and
`DEVICE_NAME` (its name in the app's device list). Without `CONNECTOR_SECRET`, a valid `SYNC_KEY` (12 words)
seals addresses instead, and also keeps answering the older single-person address made from it
(`/mcp/<32 hex characters>`).

**Free plan limits** (per month, per Vercel account): 1,000,000 function calls, 4 hours of active CPU (time
spent waiting for the sync relays doesn't count), 360 GB-hours of memory, for personal, non-commercial use.
Going over pauses the project until the 30-day window resets; there's no bill. A question to Claude takes a
few calls of roughly 0.1–0.3 s of CPU each, so 10–20 people asking a few times a day fit — watch **Usage**
in the Vercel dashboard. People's logs are kept in the server's memory only while it's running.

<details>
<summary>Somewhere other than Vercel</summary>

`npm run build:cloud` builds it to `.vercel/output/functions/mcp.func/index.mjs`, one file with everything
included. Any host that runs Node.js 22 and gives it an HTTPS address works: start it with
`CONNECTOR_SECRET="…" PORT=8787 node index.mjs`. It speaks MCP's Streamable HTTP without sessions, so it
suits serverless hosts.

</details>

### Claude Desktop extension (runs on your computer)

Instead of the online connector, Claude Desktop can run the connector on your computer, so your food log is
opened only there (it doesn't reach Claude on your phone, though). It uses the same encrypted sync as your
devices, so turn on **Sync between devices** first.

**Install (Windows or Mac):**

1. Download the extension: in the app, **Settings → Use with Claude → Claude Desktop extension →
   Download**, or directly:
   [`calorie-tracker.mcpb`](https://xaxaxage.github.io/Calorie-tracking-web-app/mcp/calorie-tracker.mcpb).
2. Open the file with Claude Desktop: double-click it, or drag it into **Settings → Extensions**. Click
   **Install**.
3. When it asks for the **sync key**, paste your 12 words (**Show sync key** or **Copy the 12 words** in the app).
4. Start a new chat and ask about your food. (If Claude doesn't use it, check that **Calorie Tracker** is turned
   on in **Settings → Extensions**.)

Claude Desktop runs the extension with its own built-in Node.js; nothing else needs installing. To update,
download and open the file again. It appears in the app's device list as **Claude Desktop · Windows**. If you
change the sync key, paste the new words into the extension's settings too.

It has the same tools as the online connector. **Privacy:** it runs on your computer and talks only to the sync relays (and to Open Food Facts
when Claude searches online). What it reads goes into your conversation with Claude, like anything else you
share there. Your AI keys are never given to Claude. The sync key is stored by Claude Desktop, marked as
sensitive.

<details>
<summary>Without the extension (other MCP apps, Claude Code, manual setup)</summary>

The same server as a single file, for any MCP client. It needs [Node.js](https://nodejs.org) 20 or newer.

1. Download
   [`calorie-tracker-mcp.mjs`](https://xaxaxage.github.io/Calorie-tracking-web-app/mcp/calorie-tracker-mcp.mjs)
   (right-click → **Save link as**), e.g. to `C:\Users\<you>\calorie-tracker-mcp.mjs`.
2. Claude Desktop: **Settings → Developer → Edit Config** opens `%APPDATA%\Claude\claude_desktop_config.json`
   (on a Mac `~/Library/Application Support/Claude/claude_desktop_config.json`). Add:

   ```json
   {
     "mcpServers": {
       "calorie-tracker": {
         "command": "node",
         "args": ["C:\\Users\\<you>\\calorie-tracker-mcp.mjs"],
         "env": { "SYNC_KEY": "your twelve words here" }
       }
     }
   }
   ```

   Then quit Claude Desktop completely (also from the tray icon) and open it again.
3. Claude Code: `claude mcp add calorie-tracker -e SYNC_KEY="your twelve words here" -- node /path/to/calorie-tracker-mcp.mjs`

Optional: `RELAYS` (space- or comma-separated `wss://` URLs) to use other relays than the app's defaults, and
`DEVICE_NAME` for its name in the app's device list.

</details>

## Appearance and humor

**Settings → Appearance** has the palettes. Tap one and the whole app changes at once. Palettes are saved per
device (so your phone can be dark while a laptop stays light) and are included in backups.

To make your own, tap **Your own**:

- set eight colors: background, cards, text, main (buttons, links, tabs), accent (the ring and the + button) and
  one per macro. The whole app previews them while you edit;
- or **Import** from a photo (its main colors are picked out), from a palette file someone shared, or by pasting
  hex codes or a Coolors link (`https://coolors.co/264653-2a9d8f-e9c46a-f4a261-e76f51`). The app works out which
  color is which, and you can adjust them afterwards;
- **Share file** / **Copy as text** gives a small JSON file that imports on any device:

  ```json
  { "name": "Sunset", "colors": { "bg": "#fff7f0", "surface": "#ffffff", "ink": "#2b1a12",
    "primary": "#b23a48", "accent": "#fcb97d", "protein": "#9a031e", "carbs": "#f4a261", "fat": "#5f0f40" } }
  ```

  Names like `background`, `text`, `main` and `accent` work too.

The app derives about forty shades from those colors and adjusts text colors until they are readable (WCAG AA),
so a pastel main color or a low-contrast text color can't make the app unreadable. The built-in palettes are
checked the same way in the tests.

**Humor mode** is on by default and has its own switch under the palettes. The remarks are kind by design: they
joke about the app, the food and the day, never about weight, "good" or "bad" food, or willpower (a test enforces
this). Most toasts stay plain; a note appears on the first one and then on every third.

## Your data

There is no server and no account. Everything lives in the browser storage (`localStorage`) of the app on
your phone, as one JSON record under the key `calorie-tracker:v1`:

- **entries** – one per logged item: day, meal, name, amount, calories and macros, plus a copy of the food's
  per-100 g values so the portion can be edited later, and for a dish its ingredients (name, amount, per-100 g
  values each)
- **favorites** – foods you starred
- **settings** – daily goals, which AI to use, your API keys, palette and humor mode

Photos and descriptions are not kept: they are only sent to the AI you chose while estimating. Online search and barcode lookups send
just the search text or barcode number to Open Food Facts.

Things to know when this is your main tracker:

- **Use the home screen icon, not a Chrome tab.** On iPhone the home screen app has its own storage, separate
  from Chrome, so entries made in one don't show up in the other.
- **Removing the icon can delete its data**, as can clearing website data. Export a backup first.
- **Back up regularly:** Settings → Export backup opens the share sheet — save the file to Files / iCloud Drive.
  Settings → Import backup restores it (for example on a new phone). Backups leave out your API keys.
- **Several devices:** turn on sync (see above) to use the same log on each.
- **Capacity:** a logged food takes about 0.4 KB and browsers allow a few MB per site, which is on the order of
  a couple of years of detailed logging. If saving ever fails, the app shows a red banner.
- **Updates** arrive automatically: after a new version is deployed, it loads on the next launch.

## Development

Requires Node.js 22.

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests (Vitest)
npm run build      # type-check and build to dist/ (the app, plus the Claude Desktop extension in dist/mcp/)
npm run build:cloud  # the online connector for Vercel, in .vercel/output/
npm run preview    # serve the production build
```

To try it on a phone during development, run `npm run dev -- --host` and open the printed network address.
The camera needs HTTPS, so test barcode scanning on the deployed site.

Stack: [Vite](https://vite.dev) + [Preact](https://preactjs.com) + TypeScript, no backend. Barcode decoding
uses the native `BarcodeDetector` where available and [`barcode-detector`](https://github.com/Sec-ant/barcode-detector)
(ZXing WebAssembly) elsewhere, including iPhone. AI estimates use the official
[`@google/genai`](https://github.com/googleapis/js-genai) and
[`@anthropic-ai/sdk`](https://github.com/anthropics/anthropic-sdk-typescript) SDKs, each downloaded only when first used. A small service worker,
generated at build time, caches the app for offline use.

```
src/
  app.tsx            routes → screens
  screens/           Today, History, AddFood, FoodDetail (portion/edit), Scan, Photo, Describe,
                     QuickAdd, CopyMeal, MealDetail, Settings
  components/        icons and shared UI (bottom nav, meal picker, toast)
  lib/               store (local storage), foods (built-in list), nutrition math, dates,
                     router, Open Food Facts client, barcode scanner, textmatch (offline describe)
  lib/ai/            Gemini and Claude estimates for photos and descriptions
  lib/sync/          device sync: sync key and encryption, weekly parts and merging, relay engine
mcp/                 Claude connector: MCP tools and sync without a browser (connector.ts); Claude Desktop over
                     stdio (server.ts, vite.mcp.config.ts) and online over HTTP (cloud.ts, vite.cloud.config.ts)
tests/               unit tests
```

## Deploy

The workflow in `.github/workflows/deploy.yml` tests, builds and publishes the app to GitHub Pages on every
push to `main` (and to this feature branch).

One-time setup: in the repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
After the next push the app is live at `https://<your-user>.github.io/<repo-name>/`.

Any static host works too: upload the contents of `dist/`. The app uses relative paths and hash routes, so
it can live in a sub-folder.

## Credits

- Product data from [Open Food Facts](https://world.openfoodfacts.org), available under the
  [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/).
- Fonts: [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) and
  [Figtree](https://fonts.google.com/specimen/Figtree), SIL Open Font License.
- Built-in food values are typical figures for generic foods (per 100 g/ml), rounded for everyday tracking.
