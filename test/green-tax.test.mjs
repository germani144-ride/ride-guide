// Green tax from the official 2026 rate tables.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greenTaxHalfYear, TAX_YEAR } from '../src/green-tax.js';

test('the rates are for this year (update the tables each January)', () => {
  assert.equal(TAX_YEAR, 2026);
});

test('petrol before October 2017: km per litre, table A1', () => {
  // a 2016 Mondeo at 16.9 km/l: 1,290 kr, the 215 kr a month in the spreadsheet
  assert.equal(greenTaxHalfYear({ fuel: 'petrol', registered: '2016-05-01', kmPerLitre: 16.9 }), 1290);
  assert.equal(greenTaxHalfYear({ fuel: 'petrol', registered: '2016-05-01', kmPerLitre: 20 }), 460);
  assert.equal(greenTaxHalfYear({ fuel: 'petrol', registered: '2010-01-01', kmPerLitre: 16.7 }), 1290);
  assert.equal(greenTaxHalfYear({ fuel: 'petrol', registered: '2010-01-01', kmPerLitre: 16.69 }), 1740);
  assert.equal(greenTaxHalfYear({ fuel: 'petrol', registered: '2004-01-01', kmPerLitre: 4 }), 15660);
});

test('from 3 October 2017 to June 2021: tables A2 and B2', () => {
  assert.equal(greenTaxHalfYear({ fuel: 'petrol', registered: '2017-10-03', kmPerLitre: 16.9 }), 1630);
  assert.equal(greenTaxHalfYear({ fuel: 'petrol', registered: '2017-10-02', kmPerLitre: 16.9 }), 1290);
  assert.equal(greenTaxHalfYear({ fuel: 'diesel', registered: '2019-01-01', kmPerLitre: 21 }), 2320);
});

test('diesel includes the equalisation charge, and 500 kr more without a particle filter', () => {
  assert.equal(greenTaxHalfYear({ fuel: 'diesel', registered: '2011-01-01', kmPerLitre: 18 }), 3020);
  assert.equal(
    greenTaxHalfYear({ fuel: 'diesel', registered: '2011-01-01', kmPerLitre: 18, particleFilter: false }),
    3520,
  );
  assert.equal(
    greenTaxHalfYear({ fuel: 'diesel', registered: '2011-01-01', kmPerLitre: 18, particleFilter: true }),
    3020,
  );
});

test('from July 2021: CO2 per km; electric cars pay the lowest rate', () => {
  assert.equal(greenTaxHalfYear({ fuel: 'electric', registered: '2022-03-01' }), 460); // e.g. ID.3: 460
  assert.equal(greenTaxHalfYear({ fuel: 'petrol', registered: '2023-01-01', co2: 120 }), 760);
  assert.equal(greenTaxHalfYear({ fuel: 'petrol', registered: '2023-01-01', co2: 131 }), 760);
  assert.equal(greenTaxHalfYear({ fuel: 'diesel', registered: '2023-01-01', co2: 120 }), 760 + 930);
  assert.equal(greenTaxHalfYear({ fuel: 'petrol', registered: '2023-01-01', co2: 700 }), 16000);
});

test('not enough to tell: no answer rather than a guess', () => {
  assert.equal(greenTaxHalfYear({ fuel: 'petrol', registered: '', kmPerLitre: 16.9 }), null);
  assert.equal(greenTaxHalfYear({ fuel: 'petrol', registered: '2016-05-01' }), null);
  assert.equal(greenTaxHalfYear({ fuel: 'petrol', registered: '2023-01-01', kmPerLitre: 16 }), null);
  assert.equal(greenTaxHalfYear({ fuel: 'electric', registered: '2019-01-01' }), null);
});
