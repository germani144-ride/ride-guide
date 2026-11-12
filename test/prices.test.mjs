// Today's prices: reading the sources and turning them into the prices RideGuide uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fuelFromOk,
  spotFromEds,
  homePrice,
  spotUrl,
  pricesStale,
  applyPrices,
  sanitizePrices,
  DEFAULT_PRICES,
  pricesFile,
  readPricesFile,
} from '../src/prices.js';
import { migrate, emptyState, STATE_VERSION } from '../src/model.js';
import { DEFAULT_SETTINGS } from '../src/engine.js';

const station = prices => ({ facility_number: 1, street: 'X', prices });

test('fuel: the median pump price across OK stations, regular products only', () => {
  const ok = {
    items: [
      station([
        { product_name: 'Blyfri 95', price: 14.29 },
        { product_name: 'Svovlfri Diesel', price: 13.19 },
        { product_name: 'Oktan 100', price: 15.49 },
        { product_name: 'HVO100', price: 16.99 },
      ]),
      station([
        { product_name: 'Blyfri 95 E10', price: '14,49' },
        { product_name: 'Diesel', price: 13.39 },
      ]),
      station([
        { product_name: 'Blyfri 95', price: 13.99 },
        { product_name: 'Diesel+', price: 14.5 },
      ]),
      station([{ product_name: 'Blyfri 95', price: 0 }]), // nonsense: ignored
    ],
  };
  assert.deepEqual(fuelFromOk(ok), { petrol: 14.29, diesel: 13.29 });
  assert.deepEqual(fuelFromOk({}), { petrol: null, diesel: null });
  assert.deepEqual(fuelFromOk(null), { petrol: null, diesel: null });
});

test('electricity: the average spot price in kr per kWh, and the home price', () => {
  const eds = { records: [{ DayAheadPriceDKK: 500 }, { DayAheadPriceDKK: 700 }, { DayAheadPriceDKK: -60 }] };
  assert.equal(Math.round(spotFromEds(eds) * 1000) / 1000, 0.38);
  assert.equal(spotFromEds({ records: [{ SpotPriceDKK: 900 }] }), 0.9); // the older dataset
  assert.equal(spotFromEds({ records: [] }), null);
  assert.equal(homePrice(0.68, 0.55), 1.4); // spot + 25% VAT + tariffs, tax and supplier
  assert.equal(homePrice(0, 0.55), 0.55);
});

test('the spot price is asked for one area over the last 30 whole days', () => {
  const url = new URL(spotUrl('DK2'));
  assert.equal(url.origin + url.pathname, 'https://api.energidataservice.dk/dataset/DayAheadPrices');
  assert.equal(url.searchParams.get('filter'), '{"PriceArea":["DK2"]}');
  assert.equal(url.searchParams.get('startOffset'), '-P30D');
  assert.equal(url.searchParams.get('limit'), '0');
});

test('prices are fetched again after 12 hours', () => {
  const now = new Date('2026-11-12T12:00:00Z');
  assert.equal(pricesStale('', now), true);
  assert.equal(pricesStale('2026-11-12T01:00:00Z', now), false);
  assert.equal(pricesStale('2026-11-11T23:00:00Z', now), true);
});

test('fetched prices go into the settings; a source that failed changes nothing', () => {
  const settings = { ...DEFAULT_SETTINGS };
  const prices = { ...DEFAULT_PRICES };
  const now = new Date('2026-11-12T10:00:00Z');
  const changed = applyPrices(settings, prices, { petrol: 14.29, diesel: null, spot: 0.6 }, now);
  assert.deepEqual(changed, ['petrolPrice', 'homeElPrice']);
  assert.equal(settings.petrolPrice, 14.29);
  assert.equal(settings.dieselPrice, DEFAULT_SETTINGS.dieselPrice);
  assert.equal(settings.homeElPrice, 1.3);
  assert.equal(prices.spot, 0.6);
  assert.equal(prices.updatedAt, now.toISOString());

  const untouched = { ...DEFAULT_PRICES };
  assert.deepEqual(applyPrices(settings, untouched, { petrol: null, diesel: null, spot: null }, now), []);
  assert.equal(untouched.updatedAt, '');
});

test('data upgrade to v11: prices update by themselves, DK2, 0.55 kr on top', () => {
  const old = { ...emptyState('da'), version: 10 };
  delete old.prices;
  const s = migrate(old);
  assert.equal(s.version, STATE_VERSION);
  assert.deepEqual(s.prices, { auto: true, area: 'DK2', elAddOn: 0.55, updatedAt: '', spot: 0 });
  assert.deepEqual(sanitizePrices({ auto: false, area: 'DK9', elAddOn: -1, updatedAt: 'x', spot: 0.5 }), {
    ...DEFAULT_PRICES,
    auto: false,
    spot: 0.5,
  });
  const kept = migrate({
    ...s,
    prices: { auto: false, area: 'DK1', elAddOn: 0.7, updatedAt: '2026-11-12T10:00:00Z' },
  });
  assert.deepEqual(kept.prices, {
    auto: false,
    area: 'DK1',
    elAddOn: 0.7,
    updatedAt: '2026-11-12T10:00:00Z',
    spot: 0,
  });
});

test('prices.json: built from the sources; a source that failed keeps its last value', () => {
  const ok = {
    items: [
      {
        prices: [
          { product_name: 'Blyfri 95', price: 15.89 },
          { product_name: 'Svovlfri Diesel', price: 17.89 },
        ],
      },
      {
        prices: [
          { product_name: 'Blyfri 95', price: 15.89 },
          { product_name: 'Svovlfri Diesel', price: 17.89 },
        ],
      },
    ],
  };
  const dk2 = { records: [{ DayAheadPriceDKK: 1532.457 }, { DayAheadPriceDKK: 1596.595947 }] };
  const now = new Date('2026-11-12T04:17:00Z');
  const file = pricesFile({ ok, spot: { DK1: null, DK2: dk2 }, previous: { spot: { DK1: 0.9 } }, now });
  assert.deepEqual(
    { ...file, sources: undefined },
    {
      updatedAt: '2026-11-12T04:17:00.000Z',
      petrol: 15.89,
      diesel: 17.89,
      spot: { DK1: 0.9, DK2: 1.5645 },
      sources: undefined,
    },
  );
  const failed = pricesFile({ ok: null, spot: {}, previous: file, now });
  assert.equal(failed.petrol, 15.89);
  assert.equal(failed.spot.DK2, 1.5645);
  assert.deepEqual(pricesFile({ ok: null, spot: {}, now }).spot, { DK1: null, DK2: null });
});

test('prices.json: what the app reads for its price area', () => {
  const file = { petrol: 15.89, diesel: 17.89, spot: { DK1: 0.9, DK2: 1.56 } };
  assert.deepEqual(readPricesFile(file, 'DK2'), { petrol: 15.89, diesel: 17.89, spot: 1.56 });
  assert.deepEqual(readPricesFile(file, 'DK1').spot, 0.9);
  assert.deepEqual(readPricesFile({ petrol: 'x', spot: { DK2: null } }, 'DK2'), {
    petrol: null,
    diesel: null,
    spot: null,
  });
  assert.deepEqual(readPricesFile(null, 'DK2'), { petrol: null, diesel: null, spot: null });
});
