// The explanations under "Where the money goes" (src/explain.js) quote the app's own numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, DEFAULT_SETTINGS, PART_KEYS } from '../src/engine.js';
import { newCar, toEngineInput } from '../src/model.js';
import { explainParts } from '../src/explain.js';
import { STRINGS } from '../src/i18n.js';
import { money } from '../src/format.js';

const settings = { ...DEFAULT_SETTINGS, years: 2 };
const run = car => calculate(toEngineInput(car, { year: 2026, kmPerYear: 10000, years: 2 }), settings);

test('every line with an amount has an explanation, in both languages', () => {
  const cars = [
    newCar({
      method: 'cash',
      fuel: 'petrol',
      year: 2016,
      price: 86000,
      marketValue: 90000,
      upfrontRepairs: 36000,
      kmPerUnit: 16,
    }),
    newCar({
      method: 'cash',
      fuel: 'petrol',
      year: 2016,
      price: 124000,
      marketValue: 90000,
      kmPerUnit: 16,
      insuranceMo: 520,
      greenTaxMo: 215,
    }),
    newCar({
      method: 'finance',
      fuel: 'electric',
      year: 2026,
      price: 300000,
      downPayment: 0.2,
      apr: 0.06,
      financeMonths: 60,
      kmPerUnit: 6,
      parkingMo: 300,
    }),
    newCar({
      method: 'lease',
      fuel: 'diesel',
      leaseMo: 4000,
      oneTimePayment: 5000,
      returnFee: 1500,
      yearsOfUse: 3,
      kmPerUnit: 18,
    }),
  ];
  for (const car of cars) {
    const r = run(car);
    for (const lang of ['en', 'da']) {
      const why = explainParts(r, car, settings, STRINGS[lang], lang);
      for (const k of PART_KEYS) {
        if (Math.abs(r.parts[k]) > 0.5)
          assert.ok(why[k] && !why[k].includes('{'), `${car.method} ${lang} ${k}: ${why[k]}`);
      }
    }
  }
});

test('the numbers in the explanations are the ones used', () => {
  const car = newCar({
    method: 'cash',
    fuel: 'petrol',
    year: 2016,
    price: 124000,
    marketValue: 90000,
    kmPerUnit: 16,
    insuranceMo: 520,
    greenTaxMo: 215,
  });
  const r = run(car);
  const why = explainParts(r, car, settings, STRINGS.en, 'en');
  const kr = v => `${money(v, 'en')} kr`;
  assert.match(why.insurance, /520 kr a month/);
  assert.equal(Math.round(r.parts.insurance), 520, 'insurance is exactly as typed');
  assert.ok(
    why.depreciation.includes(
      `You pay ${kr(124000)}. It is worth ${kr(90000)} now and about ${kr(r.residual)}`,
    ),
  );
  assert.ok(why.depreciation.includes(`= ${kr(124000 - r.residual)}, spread over 24 months`));
  assert.ok(Math.abs(r.parts.depreciation * 24 - (124000 - r.residual)) < 1e-6);
  assert.ok(why.greenTax.startsWith(`${kr(1290)} per half year`));
  assert.ok(why.energy.startsWith('10,000 km a year ÷ 16 km per litre × 17.50 kr per litre'));
  assert.ok(Math.abs(r.parts.energy - (10000 / 12 / 16) * 17.5) < 1e-6);
  assert.match(why.washing, /^100 kr a month/);
  assert.match(why.buffer, /^A 5% safety margin/);
});

test('repairs after buying are explained with the amount entered', () => {
  const car = newCar({
    method: 'cash',
    fuel: 'petrol',
    year: 2016,
    price: 86000,
    marketValue: 90000,
    upfrontRepairs: 36000,
    kmPerUnit: 16,
  });
  const why = explainParts(run(car), car, settings, STRINGS.en, 'en');
  assert.ok(why.repairs.startsWith('36,000 kr in repairs paid right after buying'));
  assert.ok(why.depreciation.startsWith('You pay 86,000 kr. It is worth 90,000 kr now'));
});
