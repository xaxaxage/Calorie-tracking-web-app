# Calorie Tracker

A calorie and macro tracker built for iPhone, designed to run in Chrome (or Safari) and to be added to the
home screen like an app. It follows the "Calorie Tracker" design: Today, History, Add food, portion picker,
barcode scanner, photo estimate and quick add.

## Features

- **Today** – calories left ring, eaten vs. goal, protein / carbs / fat progress, four meals. Step back
  through previous days with the arrows.
- **History** – week chart against your goal (under = teal, over = orange), daily average, average macros,
  and a list of days you can open.
- **Add food** – pick the meal, search ~140 built-in foods plus millions of products from
  [Open Food Facts](https://world.openfoodfacts.org), or add from **Recent** and **Favorites** with one tap
  (tap again to undo).
- **Portion** – grams/ml with ±buttons, serving presets, live calories and macros, "left today after this",
  star to save as a favorite.
- **Barcode** – scans EAN/UPC codes with the camera (works on iPhone through a bundled WebAssembly
  decoder), or type the number. Products are looked up on Open Food Facts.
- **Photo estimate** – snap your plate; Claude identifies each item and estimates its weight and
  nutrition. Adjust the grams, then add everything at once. Needs your own Anthropic API key (Settings).
- **Quick add** – just calories (and optionally macros), with a hint when the macros don't add up.
- **Copy meal** – copy any meal from the last two weeks into another meal or day.
- **Edit** – open a meal to change an item's amount, move it to another meal, or delete it (with undo).
- **Settings** – daily calorie and macro goals, API key, export / import a backup, delete all data.
- Works offline (except online search, barcode lookups and photo estimates) once loaded.

## Use it on your iPhone

1. Open the app's URL in Chrome on the iPhone (see *Deploy* below for the address).
2. Tap the **Share** button in the address bar → **Add to Home Screen**.
3. Launch it from the new icon. It opens full screen, and your data stays on the phone.

The first time you scan a barcode, allow camera access when asked.

### Photo estimates

Photo estimates call the Anthropic API directly from your phone using your own key:

1. Create a key at [console.anthropic.com](https://console.anthropic.com/settings/keys).
2. In the app, open **Settings** (gear on Today) → **Photo estimates** → paste the key → **Save key**.

The key is stored only on your device. Each estimate is billed to your Anthropic account. The request uses
`claude-opus-5` with structured JSON output, and `fallbacks: "default"` so a declined request is retried on
Anthropic's recommended fallback model.

## Your data

There is no server and no account. Everything lives in the browser storage (`localStorage`) of the app on
your phone, as one JSON record under the key `calorie-tracker:v1`:

- **entries** – one per logged item: day, meal, name, amount, calories and macros, plus a copy of the food's
  per-100 g values so the portion can be edited later
- **favorites** – foods you starred
- **settings** – daily goals and your Anthropic API key

Photos are not kept: they are only sent to Anthropic while estimating. Online search and barcode lookups send
just the search text or barcode number to Open Food Facts.

Things to know when this is your main tracker:

- **Use the home screen icon, not a Chrome tab.** On iPhone the home screen app has its own storage, separate
  from Chrome, so entries made in one don't show up in the other.
- **Removing the icon can delete its data**, as can clearing website data. Export a backup first.
- **Back up regularly:** Settings → Export backup opens the share sheet — save the file to Files / iCloud Drive.
  Settings → Import backup restores it (for example on a new phone). Backups leave out your API key.
- **One device only:** there is no sync between devices.
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
(ZXing WebAssembly) elsewhere, including iPhone. Photo estimates use the official
[`@anthropic-ai/sdk`](https://github.com/anthropics/anthropic-sdk-typescript). A small service worker,
generated at build time, caches the app for offline use.

```
src/
  app.tsx            routes → screens
  screens/           Today, History, AddFood, FoodDetail (portion/edit), Scan, Photo,
                     QuickAdd, CopyMeal, MealDetail, Settings
  components/        icons and shared UI (bottom nav, meal picker, toast)
  lib/               store (local storage), foods (built-in list), nutrition math, dates,
                     router, Open Food Facts client, barcode scanner, Claude photo estimates
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
