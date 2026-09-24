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
  millions of [Open Food Facts](https://world.openfoodfacts.org) products below it for single foods. Or add from
  **Recent** and **Favorites** with one tap (tap again to undo).
- **Portion** – grams/ml with ±buttons, serving presets, live calories and macros, "left today after this",
  star to save as a favorite.
- **Barcode** – scans EAN/UPC codes with the camera (works on iPhone through a bundled WebAssembly
  decoder), or type the number. Products are looked up on Open Food Facts.
- **Describe** – type (or dictate) what you ate right in Add food, e.g. "2 eggs, a slice of toast with butter
  and a latte". Without any key it matches your words to the food list — free and offline. With an AI key, the
  AI estimates any food or dish, amounts included.
- **Photo estimate** – snap your plate; the AI identifies each item and estimates its weight and
  nutrition. Adjust the grams, then add everything at once. Needs an AI key (a free Gemini key works).
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
- **Settings** – daily calorie and macro goals, appearance, API key, sync, export / import a backup, delete all data.
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

  **Busy or out of free uses:** with **Switch models automatically** on (the default), a model that answers
  "overloaded" (503) is retried once, and a model that is busy, out of free uses (429) or unavailable hands over
  to the next one: the newest Flash-Lite and Flash, then other Flash models on your key, then a Gemma model — up
  to five in total. The screen shows which model is being tried and which one answered.

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
- The AI setup syncs too: the Gemini and Claude keys, the chosen AI and model. Enter a key once and every
  device can use it; removing a key removes it everywhere. Each key goes by its own time, so picking a model on a
  device without a key never erases the key set on another.

Things to know: public relays are run by volunteers and can be slow or go away, which is why several are used
and why each device keeps a full copy — keep exporting a backup now and then. Anyone with the 12 words can read
and change your log and use your AI keys. **Delete all entries** deletes on every synced device.

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
npm run build      # type-check and build to dist/
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
