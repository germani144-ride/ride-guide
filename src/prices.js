// Today's fuel and electricity prices, the plain part: where to ask, how to read the answers and
// how to turn them into the prices RideGuide uses. No DOM, storage or network.
//
// Neither source lets a web app on another address read it (no CORS; found 2026-11-12), so the
// phone never calls them. A GitHub Action (.github/workflows/prices.yml, running
// scripts/fetch-prices.mjs twice a day) asks both and writes prices.json next to the app, built by
// pricesFile() below; the app reads that file from its own address (src/price-fetch.js).
//
// - Petrol and diesel: OK's public price list (no key), the pump price at every OK station. We
//   take the median across stations, a typical Danish pump price (chains move together).
// - Electricity at home: the day-ahead spot price for the price area (Energi Data Service, free,
//   no key), averaged over the last 30 days, plus 25% VAT, plus a fixed amount the user can edit
//   for grid tariffs, electricity tax and the supplier's fee (all incl. VAT).
// - Public charging has no open source, so it stays typed in Settings.

export const OK_URL = 'https://mobility-prices.ok.dk/api/v1/fuel-prices';
export const EDS_ORIGIN = 'https://api.energidataservice.dk';
export const AREAS = ['DK1', 'DK2'];
export const VAT = 0.25;
export const SPOT_DAYS = 30;
export const STALE_HOURS = 12; // fetch again when the last prices are older than this

// Price settings, kept apart from the cost engine's settings:
//   auto: update the prices by themselves once a day
//   area: electricity price area (DK1 west, DK2 east)
//   elAddOn: kr per kWh on top of the spot price incl. VAT (grid tariffs, tax, supplier)
//   updatedAt: when prices were last fetched (ISO), spot: the 30-day spot average (kr per kWh, excl. VAT)
export const DEFAULT_PRICES = { auto: true, area: 'DK2', elAddOn: 0.55, updatedAt: '', spot: 0 };

export function sanitizePrices(raw) {
  const out = { ...DEFAULT_PRICES };
  if (typeof raw?.auto === 'boolean') out.auto = raw.auto;
  if (AREAS.includes(raw?.area)) out.area = raw.area;
  if (typeof raw?.elAddOn === 'number' && Number.isFinite(raw.elAddOn) && raw.elAddOn >= 0)
    out.elAddOn = raw.elAddOn;
  if (typeof raw?.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt)))
    out.updatedAt = raw.updatedAt;
  if (typeof raw?.spot === 'number' && Number.isFinite(raw.spot)) out.spot = raw.spot;
  return out;
}

// The spot prices for both areas over the last 30 whole days, in DKK per MWh. One request: asking
// twice in a row gets "429 Too Many Requests".
export function spotUrl() {
  const q = new URLSearchParams({
    start: 'StartOfDay',
    startOffset: `-P${SPOT_DAYS}D`,
    end: 'StartOfDay',
    filter: JSON.stringify({ PriceArea: AREAS }),
    columns: 'PriceArea,DayAheadPriceDKK',
    limit: '0',
  });
  return `${EDS_ORIGIN}/dataset/DayAheadPrices?${q}`;
}

const round2 = v => Math.round(v * 100) / 100;

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const num = v => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

// Product names at OK: "Blyfri 95" (E10) and "Diesel" or "Svovlfri Diesel". Premium and
// alternative products (95+, Oktan 100, HVO, Diesel+) are left out.
const isPetrol = name => /^blyfri\s*95(\s*e10)?$/i.test(name.trim());
const isDiesel = name => /^(svovlfri\s+)?diesel$/i.test(name.trim());

// { petrol, diesel } in kr per litre (median across stations), each null if missing.
export function fuelFromOk(json) {
  const petrol = [];
  const diesel = [];
  for (const station of Array.isArray(json?.items) ? json.items : []) {
    for (const p of Array.isArray(station?.prices) ? station.prices : []) {
      const name = String(p?.product_name ?? '');
      const price = num(p?.price);
      if (!(price > 5 && price < 50)) continue; // ignore obvious nonsense
      if (isPetrol(name)) petrol.push(price);
      else if (isDiesel(name)) diesel.push(price);
    }
  }
  const m = list => (list.length ? round2(median(list)) : null);
  return { petrol: m(petrol), diesel: m(diesel) };
}

// The average spot price in kr per kWh (excl. VAT), or null. Reads DayAheadPriceDKK (DKK/MWh),
// or SpotPriceDKK from the older dataset. With `area`, only that area's records count (records
// without a PriceArea count for any area).
export function spotFromEds(json, area = null) {
  const values = (Array.isArray(json?.records) ? json.records : [])
    .filter(r => !area || r?.PriceArea == null || r.PriceArea === area)
    .map(r => num(r?.DayAheadPriceDKK ?? r?.SpotPriceDKK))
    .filter(v => Number.isFinite(v));
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length / 1000;
}

// The file the GitHub Action writes: { updatedAt, petrol, diesel, spot: { DK1, DK2 } }, kr per
// litre and kr per kWh excl. VAT. `ok`: OK's answer; `eds`: Energi Data Service's answer for both
// areas. A source that failed this time keeps its value from `previous`.
export function pricesFile({ ok, eds, previous = null, now = new Date() }) {
  const fuel = ok ? fuelFromOk(ok) : { petrol: null, diesel: null };
  const out = {
    updatedAt: now.toISOString(),
    petrol: fuel.petrol ?? previous?.petrol ?? null,
    diesel: fuel.diesel ?? previous?.diesel ?? null,
    spot: {},
    sources: 'OK (mobility-prices.ok.dk), Energi Data Service DayAheadPrices, 30-day average',
  };
  for (const area of AREAS) {
    const v = eds ? spotFromEds(eds, area) : null;
    out.spot[area] = v != null ? Math.round(v * 10000) / 10000 : (previous?.spot?.[area] ?? null);
  }
  return out;
}

// What the app takes from prices.json for one price area: { petrol, diesel, spot }, each null if
// the file has no usable value.
export function readPricesFile(json, area) {
  const ok = v => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  const spot = json?.spot?.[area];
  return {
    petrol: ok(json?.petrol),
    diesel: ok(json?.diesel),
    spot: typeof spot === 'number' && Number.isFinite(spot) ? spot : null,
  };
}

// What a kWh at home costs: spot price plus VAT, plus tariffs, tax and supplier (incl. VAT).
export function homePrice(spot, addOn) {
  return round2(spot * (1 + VAT) + addOn);
}

export function pricesStale(updatedAt, now = new Date()) {
  const t = Date.parse(updatedAt);
  return Number.isNaN(t) || now - t > STALE_HOURS * 3600 * 1000;
}

// Puts fetched prices on the settings and price state; only what was found changes.
// Returns the names of the settings that changed value.
export function applyPrices(settings, prices, fetched, now = new Date()) {
  const changed = [];
  const set = (key, v) => {
    if (v == null || !(v > 0)) return;
    if (settings[key] !== v) changed.push(key);
    settings[key] = v;
  };
  set('petrolPrice', fetched.petrol);
  set('dieselPrice', fetched.diesel);
  if (fetched.spot != null) {
    prices.spot = round2(fetched.spot * 1000) / 1000;
    set('homeElPrice', homePrice(fetched.spot, prices.elAddOn));
  }
  if (fetched.petrol != null || fetched.diesel != null || fetched.spot != null)
    prices.updatedAt = now.toISOString();
  return changed;
}
