# RideGuide

What will this car really cost you? Lease, buy cash, or finance, per month (and per km).
Built from the `car_comparison` tab in my `life_sheet.xlsx`, as an installable offline web app.

Live: https://germani144-ride.github.io/ride-guide/ (open on the phone and choose **Install**). It has its
own address because Chrome on Android installs only one app per address; it moved from
`germani144.github.io` on 2026-10-20.

## Use it

The app has three tabs:

- **New car** (the landing page) asks one question per screen, from the most general to the
  most specific:
  1. Do you have the license plate? If yes, type it in (Danish format `AB 12 345`).
  2. Which car is it: make and model, model year, fuel (petrol, diesel or electric).
  3. How will you pay: pay upfront, finance or lease.
  4. The terms for that choice:
     - pay upfront: price, market value (optional, if the car is worth more or less than you pay),
       repairs right after buying (optional, e.g. a timing belt you know is due);
       loss in value is estimated (switch it off to type your own yearly rate)
     - finance: price, market value, repairs after buying, down payment (below 100%), ÅOP, loan period; loss in value
       as above
     - lease: monthly lease, one-time payment, return fee; whether the period is fixed (default)
       with its lease period, or flexible (a lease you can end early, such as a car
       subscription) with its shortest and longest period; and switches for "service included"
       (default on) and "tyres included" (default off)
  5. Fuel: fuel or energy use. Prices are shared by every car (Settings).
  6. Running costs: insurance and parking per month, green tax per half year (as on the bill;
     the app divides it by 6); maintenance is estimated
     (switch it off to type your own; not asked when the lease includes service).
  7. The result: cost per month (the big number), kr per km, where the money goes (tap any line
     to see how it is calculated, with the car's own numbers), for the shared years of
     ownership and km per year (two bars right there). Save it as **my car** or just to **history**. Any answer
     can be changed from the result screen.
- **Garage** shows the cars you marked as yours.
- **History** shows every car you have added. Tap **Compare** to put 2 or 3 side by side.

Years of ownership (default 3) and km per year (default 10,000) are the same for every car, so
cars are always compared on equal terms. Two bars at the top of Garage, History, the comparison,
a car's page and the result change them for all cars at once (also in Settings). A car only stores
its own fuel use. A lease runs its own period: a fixed lease always its lease period (on its page
the years bar is replaced by "Fixed by the lease: 3 years"), a flexible lease the years of
ownership kept within its shortest and longest period (on its page only those years can be
picked, and the one used is highlighted).

On a car's page you can mark it as yours, edit it, **try another way to pay** (same car,
new payment method, so lease vs. finance is two taps away), compare it, or delete it.

Settings (top right) holds the language (English or Danish), the years of ownership and km per
year, the return on your money (4% a year), the safety margin on owned cars (5%), the running-cost
prices (tyres, winter tyres, washing), fuel and electricity
(petrol, diesel, electricity at home and at public chargers, public charging share, extra winter
use for electric cars, yearly price change),
and backup export and import. Settings save automatically as you
change them; a "Saved" message confirms it. The app version is next to the name in the header, at the
bottom of Settings and on the loading screen. **Check for updates** (bottom of Settings) asks the
server which version it serves right now: if it is newer, the app updates on the spot (it refreshes
the service worker, deletes only its own `rideguide-` caches and reloads), so there is no need to
close the app or reinstall. It also shows whether a push actually went live.

Numbers can be typed the Danish or English way: `13,69`, `13.69`, `250.000` and `250 000`
all work. The license plate is stored with the car; automatic lookup of green tax and fuel use
from the plate is not connected yet.

Data is stored in the browser on the device only. Older data (v0.1 and v2) is upgraded
automatically: cars switch to the estimated loss in value and maintenance (their typed values are
kept for the manual mode), the old 15% buffer becomes the new 5% default, and the old 5-year
default span becomes 3 years. Km per year saved on each car is kept but no longer used.

## Run locally

No build step and no runtime dependencies. Node 18+ is only needed for the tests and tools.

```bash
npm install                      # once: dev tools (Playwright, Prettier)
npx playwright install chromium  # once: the browser the browser tests use
npm start                        # then open http://127.0.0.1:8000/ride-guide/
npm test                         # unit tests: engine, sheet mode, model, wizard, helpers
npm run test:browser             # the real app in mobile-emulated Chromium
npm run test:all                 # both
npm run format                   # Prettier (same settings as Lift Log)
```

Opening `index.html` straight from disk does not work, because ES modules need a server.

## How the numbers are calculated

`src/engine.js` simulates each car month by month over one **shared time span** (years of
ownership, default 3) at one **shared km per year** (default 10,000), so every car is compared
on the same terms. Owned cars are sold at the end
at their estimated value (any loan left is paid off from the sale). A lease runs once, over its own
period (`leasePeriod()` in `src/model.js`): a fixed lease its lease period, a flexible lease the
years of ownership within its shortest and longest period. The one-time payment and the return
fee are always paid in full.

Every payment is **discounted** at the return your money could earn (default 4% a year,
compounding monthly). That counts the money tied up in a car and makes a big payment now
comparable with small payments later. The result is the **equivalent fixed monthly cost**:
the steady monthly amount with the same value today as all the car's payments.
All prices are in today's money.

| Part | How it is calculated |
|---|---|
| Loss in value | price paid − value at the end, spread evenly per month. The value starts from the market value (the price if none is given), so a good deal lowers the loss and a markup raises it; the loan and the money paid up front use the price. Value curve: −20% in the first year, then a yearly loss that shrinks with age: 6% + 9% × e^(−(age − 1) ÷ 4), so 15% in the second year, about 9% at 5 years and about 6–7% for cars over 10 (electric: −22%, then 7% + 10% × the same). The yearly rate goes up 1 point per 5,000 km above 15,000 km a year, and down when you drive less (limits 3–30%). Checked against TjekBil's market values for a 2016 car. A used car continues from its age (model year). Manual mode: value = market value ÷ (1 + yearly rate)^years. |
| Money tied up in the car | equivalent monthly cost of (down payment + instalments + loan left at the end − sale value) at the return rate, minus loss in value and interest. Negative ("saved by paying later") when a cheap loan beats paying cash. |
| Loan interest | interest paid within the span, spread per month. Instalments follow PMT(ÅOP ÷ 12, loan period, loan). |
| Repairs after buying | as typed, paid when you get the car (in "Paid up front"), spread evenly per month; not part of the car's value or the loan. The return that money could have earned is under money tied up. |
| Lease | monthly lease + the one-time payment at the start + the return fee at the end, over the lease's own period, discounted. |
| Fuel / power | km per month ÷ km per unit × price, growing by the yearly price change. Prices are settings shared by every car: petrol 17.50 and diesel 19.50 kr per litre (October 2026), electricity 1.40 kr per kWh at home and 3.50 at public chargers (FDM 2026). Electric: 80% home + 20% public, and 10% extra use in the cold. |
| Insurance | as typed, per month (insurers keep charging the same). |
| Maintenance and repairs | (yearly base + per km × km a year) ÷ 12 × (1 + 8% × age), age up to 15. Petrol 3,000 kr + 0.25 kr/km, diesel 3,500 kr + 0.25 kr/km, electric 2,000 kr + 0.15 kr/km. Skipped when the lease includes service. |
| Tyres | km × (four tyres 3,500 kr ÷ tyre life 30,000 km; electric 25,000 km), plus two swaps a year (400 kr each) with winter tyres. Skipped when the lease includes tyres. |
| Washing | 100 kr a month (Settings). Periodic inspection (syn) and roadside assistance are not counted. |
| Green tax | typed per half year, as on the bill, stored and counted per month (÷ 6). |
| Parking | as typed, per month. |
| Safety margin | owned cars only: 5% on top of everything else. |

Results: **kr per km** = cost per month ÷ km per month. **Total** = cost per month × months.
**Paid up front** = down payment (cash: the price) plus repairs after buying, or the lease's one-time payment.
**Paid out per month** = plain average of everything paid after the start (instalments, lease,
running costs), without discounting or the sale.

With the defaults, a new 300,000 kr car driven 20,000 km a year for 5 years comes out close to
FDM's 2026 car budget (petrol about 4.3 kr/km, electric about 3.6 kr/km; FDM: 4.32 and 3.86);
`test/cost.test.mjs` keeps it within 0.35 kr/km.

Defaults come from: [FDM, cost of a car in 2026](https://fdm.dk/nyheder/nyt-om-trafik-og-biler/hvad-koster-det-at-holde-bil-i-2026-faa-svaret-her)
(home/public charging split, totals) and a Danish price survey for
[tyres](https://www.skagenonline.dk/faq/hvad-koster-nye-daek-inkl-montering).
The value and maintenance curves are first estimates, to be replaced by data (the survival model
for maintenance is planned).

**Sheet mode.** `src/engine-sheet.js` is the original port of the spreadsheet's formulas
(the Fiesta GM column onward). The app no longer uses it; it stays as the reference the tests
check against `life_sheet.xlsx`. The first three sheet columns (Avensis, Aygo, A4) use an older
formula generation; their values are kept in `data/sheet_fixtures.json`.

`src/model.js` maps each car to the engine's inputs by payment method: a lease has no price,
paying upfront is 100% down, and numbers that belong to another method count as zero (they stay
saved, so switching back loses nothing).

## Planned

- **Look up a car by its plate**: green tax, fuel use, and ideally market value.
- **Today's Danish fuel and electricity prices**, fetched automatically instead of typed in
  Settings (they vary a lot). Needs a price source the app may call from the browser.
- **Service plan for your own cars** (Garage): from the odometer reading, the last service and
  your km per year, show what is due and roughly when (e.g. "around March 2027, 60,000 km: oil
  and oil filter, air filter"), starting from a general schedule by fuel type that you can edit
  from the car's service book. A "Due soon" note in the app and an "Add to calendar" button for
  reminders (true push notifications would need a server).
- **Predictive maintenance, later**: once there is real repair data (for example from logging
  repairs with date, km and cost in the app), a survival model (Kaplan-Meier, Cox) can replace
  the maintenance curve. The MSc repo (Germani144/vehicle-maintenance) has no survival analysis
  and its Brazil data is made up, so it is not used.
- **Car sharing as a way to pay** (Hyre, GreenMobility and the like), next to lease, cash and
  finance. Kept simple so it fits every service's pricing (per day, per minute, prepaid): a monthly
  subscription fee plus your typical usage cost per month (trips, and fuel or charging if not
  included). A per-day or per-minute calculator can come later if it matters.

## How it works

### Files

```
index.html                    page shell: top bar, loading screen, tab bar, Content-Security-Policy
css/                          one stylesheet per area, loaded in this order:
                              base (colours, fonts) · layout (top bar, tabs, loading screen, toast)
                              · forms · plate · wizard · results · lists · settings
src/version.js, src/boot.js   app version; shows it in the header and on the loading screen
src/app.js                    the shell: app state, saving, routing, the actions screens call
src/routes.js                 addresses (#/new, #/garage, #/history, #/car/:id, #/compare/:ids,
                              #/settings) and which tab is active
src/views/                    the screens: wizard, result, cars (Garage, History, car page,
                              comparison), settings; and their parts: fields, tabs
src/wizard-flow.js            the New car wizard's steps: order, fields, switches
src/ui.js                     shared interface pieces (el(), price, breakdown, bars, plate, toast)
src/format.js                 numbers in English or Danish
src/compare.js                what the comparison highlights
src/explain.js                how each part of the cost is calculated, in words (no DOM)
src/engine.js                 the cost engine
src/engine-sheet.js           sheet mode: the spreadsheet's formulas (tests only)
src/model.js                  the car record, payment methods, settings, migrate(), validation
src/storage.js                the storage adapter (localStorage)
src/backup.js                 backup export and import
src/update.js                 "Check for updates"
src/i18n.js                   every interface text, English and Danish
src/seed.js                   the spreadsheet cars a new install starts with
sw.js, manifest.webmanifest   offline support and install
fonts/, icons/                Barlow (SIL Open Font License, OFL.txt) and the app icon
data/                         spreadsheet values for the sheet-mode tests
test/                         unit tests (*.test.mjs) and browser tests (browser/*.spec.mjs)
```

Files without DOM, storage or network code, so they can run on a server too: `engine.js`,
`engine-sheet.js`, `model.js`, `wizard-flow.js`, `format.js`, `compare.js` and `routes.js`.

### Data flow

1. `app.js` loads the saved state through `storage.js`, upgrades it with `migrate()` (or starts
   from the spreadsheet cars) and draws the screen for the current address.
2. A screen reads the state and the language's texts; to show a car's cost it calls
   `evaluate()` in `ui.js`, which turns the car into engine inputs (`toEngineInput()` in
   `model.js`, adding the shared km per year) and runs `calculate()` from `engine.js` with the
   settings (years, return rate, prices…).
3. Typing or tapping changes the state directly (a field writes into the car being edited) and
   calls `save()`; actions such as saving a car or deleting one live in `app.js`. Then the
   screen is drawn again.
4. `save()` writes the whole state a moment later, and at once when the app is hidden or closed.

### Engine and sheet mode

`src/engine.js` is the cost model the app uses (see the formulas above); `test/cost.test.mjs`
checks each part. `src/engine-sheet.js` is the original port of the spreadsheet: the app no
longer uses it, but `test/engine.test.mjs` keeps it matching the spreadsheet's values in `data/`,
as a reference.

### Storage

Everything is stored on the phone, in `localStorage` under the key `rideguide.v1`, as one JSON
object: `{ version, lang, settings, cars, draft }`. `draft` is a car being added in the wizard.
Only `src/storage.js` touches storage; moving to a server later means one more adapter with the
same `load()` and `save()`. When the shape of saved data changes, `STATE_VERSION` goes up and
`migrate()` in `src/model.js` upgrades older data (with a test). Backups are the same JSON.

### Tests

- Unit tests (`npm test`, Node's built-in runner):
  - `test/cost.test.mjs`: the cost engine: value curve, money tied up, finance, the lease period,
    maintenance, tyres, washing, electricity, insurance, safety margin, and that the defaults
    stay near FDM's 2026 budget.
  - `test/engine.test.mjs`: sheet mode against the spreadsheet: the seven current columns in
    `data/sheet_fixtures.json` within 0.01 kr, and three financed scenarios in
    `data/sheet_fixtures_financed.json` (set on a copy of the workbook and recalculated in
    LibreOffice).
  - `test/model.test.mjs`: payment methods, data upgrades (v0.1 to v6), switches, plates, number
    parsing, validation, the breakdown adding up, the version matching in `src/version.js` and
    `package.json`, the update check, and every app file being in the offline list in `sw.js`.
  - `test/wizard-flow.test.mjs` and `test/helpers.test.mjs`: the wizard's steps, number
    formatting, the comparison, routes and switches.
- Browser tests (`npm run test:browser`, Playwright, Pixel 7 emulation): adding a car (cash and
  lease), History, the years and km bars, the comparison, a car's page, Settings (saving,
  reload, update check), English and Danish, and starting offline. The date is fixed so the
  expected numbers stay put, and any console error, including a Content-Security-Policy
  violation, fails the test.

## Built to grow

The pieces that would change for a commercial version are kept separate:

- **Engine and model** have no browser dependencies, so they can run unchanged on a server
  (Node) or be ported to another backend language with the tests as the acceptance test.
- **Storage** sits behind `load()` and `save()`. Swapping localStorage for an API with
  accounts means adding one adapter, not touching the UI.
- **Saved data** carries a `version` field, and `migrate()` upgrades older versions.
- **The decision tree** is a small table of steps in `src/wizard-flow.js`, so a plate lookup
  step that prefills the car can slot in after the plate question.
- **Strings** are all in `src/i18n.js`, so more languages are one block each.

## Security

Everything stays on the phone: RideGuide sends no data anywhere. `index.html` sets a strict
Content-Security-Policy: scripts, styles, fonts, images and network requests may only come from
RideGuide's own address, so no injected or third-party script can run or send data out. Keep it
that way: no inline `<script>` blocks or `onclick="…"` attributes (put code in `src/`), and if a
feature ever needs another address (a plate lookup or price service), add exactly that address to
`connect-src` in the policy.

## Deploy

GitHub Pages serves the repository root from `main`. Bump the version in `src/version.js`
(and `package.json`) with every change that ships: it shows on the loading screen and in
Settings, and names the offline cache, so phones pick up the new files. After pushing, fetch
`https://germani144-ride.github.io/ride-guide/src/version.js` and check the new version is live;
if GitHub Pages didn't publish it, another push re-triggers the build.

The service worker opens the app from its cache (cache-first), so opening never waits for the
network and works offline. Network-first made every open wait for one round trip per file
(found 2026-10-25), so don't go back to it. How a release reaches a phone: `src/app.js` asks the
browser to check `sw.js` and `src/version.js` on every start and when the app comes back to the
screen (`updateViaCache: 'none'`). The new version names a new cache, so the new worker
downloads every file fresh (`?v=` so GitHub's CDN can't hand out an old copy, and
`cache: 'reload'`) and only takes over once all of them arrived; `src/app.js` then reloads once (not while a field is being typed in).
The first open after a release still shows the old version for a moment. That is also why every
shipped change must bump the version: without it, phones keep the old files. It still only creates, reads and deletes caches named
`rideguide-*` and only handles requests inside `/ride-guide/`, so it stays clean if it ever shares
an origin with another app again.
The manifest has its own `id` (`/ride-guide/app`) and `scope` (`./`). Never change the `id` of an
installed app: phones treat a new id as a different app.
