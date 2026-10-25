# RideGuide: working rules

- Keep README.md up to date whenever a change affects usage, formulas, structure or deployment.
- Before pushing, `npm test` and `npm run test:browser` must both pass (`npm run test:all`).
  The app's cost engine is `src/engine.js` (tested by `test/cost.test.mjs`).
  `src/engine-sheet.js` is "sheet mode", the spreadsheet port; it must keep matching the
  spreadsheet fixtures and is not used by the app.
- New behaviour gets a test: a unit test for logic, a browser test (`test/browser/`) for what the
  user does on screen. When a change moves numbers on screen on purpose, update the expected
  values in the browser tests in the same commit.
- Format with `npm run format` (Prettier, same settings as Lift Log) before committing.
- Do not change a formula or a default in `src/engine.js` without the owner's approval; when one
  changes on purpose, update its tests and the formula table in README.md in the same change.
- Keep `src/engine.js`, `src/engine-sheet.js`, `src/model.js`, `src/wizard-flow.js`,
  `src/format.js`, `src/compare.js` and `src/routes.js` free of DOM, storage and network code
  (plain functions with unit tests) so they can move to a backend. Logic goes there, not in
  `src/views/`.
- All storage goes through the adapter in `src/storage.js`. All UI text goes in `src/i18n.js`,
  in both English and Danish.
- No build step and no runtime dependencies unless the owner agrees to add them.
- Bump the version in `src/version.js` and `package.json` (kept equal; a test checks) with every
  change that ships. It shows on the loading screen and in Settings, and names the offline cache.
  Add new app files to the `SHELL` list in `sw.js`.
- Changes to saved data shape go through `migrate()` in `src/model.js`, with a test.
- Push to GitHub without asking once a change Pedro asked for is built and `npm test` passes
  (his standing instruction, 2026-10-21). Don't push work he hasn't asked for.
- **Never commit personal data or secrets** to this public repo: no saved car data, exports,
  personal spreadsheets (e.g. life_sheet.xlsx) or real figures from them, and no API keys or
  tokens. A future data provider's key must not live in the repo; ask Pedro how it should be held.
  Exception, Pedro's decision (2026-10-24): the spreadsheet cars in `src/seed.js` and the
  spreadsheet values in `data/` stay as they are; don't replace or scrub them.

## Layout and commands

```
index.html, css/*.css      page shell; one stylesheet per area (order set in index.html)
src/app.js                 state, saving, routing, actions      src/routes.js   addresses, tabs
src/views/*.js             screens and their parts (wizard, result, fields, cars, settings, tabs)
src/wizard-flow.js         wizard steps   src/format.js numbers   src/compare.js comparison
src/engine.js              cost engine    src/engine-sheet.js sheet mode (tests only)
src/model.js               car record, settings, migrate(), validation
src/storage.js             storage adapter   src/backup.js backups   src/update.js update check
src/i18n.js                all UI text (EN + DA)   src/version.js version   src/boot.js version label
test/*.test.mjs            unit tests           test/browser/*.spec.mjs browser tests
```

```bash
npm install && npx playwright install chromium   # once
npm start             # http://127.0.0.1:8000/ride-guide/
npm test              # unit tests
npm run test:browser  # browser tests (mobile-emulated Chromium); PW_CHROMIUM=<path> to reuse a Chromium
npm run test:all      # both, before pushing
npm run format        # Prettier
```

README.md "How it works" explains the files, the data flow, engine vs sheet mode, storage and tests.

## Address and shared-origin rules

RideGuide lives at https://germani144-ride.github.io/ride-guide/ (repo `germani144-ride/ride-guide`, moved from `Germani144/ride-guide` on 2026-10-20).

**One installable app per address.** Chrome on Android lets only one app per address (origin) be installed: a second app on the same address shows "This app is already installed" and can't be installed (found 2026-10-20). So every app Pedro installs needs its own address. Nap Log is the installed app on `germani144.github.io`; Lift Log moved to `germani144-lift.github.io`, Home log to `germani144-home.github.io` and RideGuide to `germani144-ride.github.io` (each its own free GitHub organization). Changes that apply to every app at once are made from Pedro's orchestration chat; they never touch UI or calculations. Never move RideGuide back onto an address another installable app uses (`rideguide.dk`'s DNS is on Cloudflare, which Pedro doesn't manage here). The rules below still apply, so RideGuide stays clean if it ever shares an address again.

- **Service worker:** Cache names start with `rideguide-` (`CACHE` in `sw.js` is built from the version in `src/version.js`). On activate, delete only caches with that prefix (never "every cache but the current one"). Read from this app's own cache (`caches.open(C).then(c => c.match(...))`), never the global `caches.match()`. Only handle requests whose URL starts with `self.registration.scope`; leave other apps, the GitHub API and other origins alone.
- **Updates (cache-first, same in all of Pedro's apps since 2026-10-25):** open the app from this version's own cache, never network-first (with many files it made every open wait for one round trip per file). The install downloads every app file fresh (`?v=` plus `cache: 'reload'`) into the new version's cache and fails as a whole if one file fails; files not in the cache are fetched with `{cache: 'no-cache'}`; store only `r.ok` responses. Register the worker with `{scope: './', updateViaCache: 'none'}`, call `reg.update()` when the app becomes visible, and reload once on `controllerchange` (not on the first install). So a release only reaches phones if the version in `src/version.js` changes. `test/browser/offline.spec.mjs` checks that opening downloads no app files and that a release takes over by itself.
- **Content-Security-Policy** (in `index.html`): only this app's own address. No inline `<script>` blocks or inline event handlers (put code in `src/`). A feature that must call another address adds exactly that address to `connect-src`; never loosen the rest.
- **Storage:** all storage goes through the adapter in `src/storage.js`, whose key is `rideguide.v1` (always `rideguide.`-prefixed).
- **Manifest:** `scope` and `start_url` are `./`. **Never change the manifest `id`**, not even to fix an install problem, unless Pedro explicitly asks for it in that chat. The id is how Android recognises the installed app: changing it orphans the installed copy. If installing fails on the phone, investigate and report; don't change the id.
- The manifest `id` is `/ride-guide/app`.
