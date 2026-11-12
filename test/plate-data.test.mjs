// Plate lookup: reading the service's answer and putting it on a car.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupPlate, lookupUrl, lookupErrorKey, carFromLookup, applyLookup } from '../src/plate-data.js';
import { newCar, migrate, emptyState, sanitizePlateKey, STATE_VERSION } from '../src/model.js';

const answer = (vehicle, environment = {}) => ({
  status: 'ok',
  data: { plate: 'AB12345', vehicle, environment },
});

test('the plate is sent without spaces, and nonsense is not sent at all', () => {
  assert.equal(lookupPlate('ab 12 345'), 'AB12345');
  assert.equal(lookupPlate('  '), '');
  assert.equal(lookupPlate('A'), '');
  assert.equal(lookupUrl('AB 12 345'), 'https://nummerplade-tjek.dk/api/v1/vehicles/AB12345');
  assert.equal(lookupUrl('ÆØ 12 345'), 'https://nummerplade-tjek.dk/api/v1/vehicles/%C3%86%C3%9812345');
});

test('a petrol car: name tidied, model year, fuel and km per litre', () => {
  const found = carFromLookup(
    answer(
      { make: 'FORD', model: 'MONDEO', variant: '1,5 EcoBoost', model_year: 2016, fuel_type: 'Benzin' },
      { fuel_usage: 17.2 },
    ),
  );
  assert.deepEqual(found, { name: 'Ford Mondeo', year: 2016, fuel: 'petrol', kmPerUnit: 17.2 });
});

test('an electric car: Wh per km becomes km per kWh', () => {
  const found = carFromLookup(
    answer(
      { make: 'Tesla', model: 'MODEL Y', model_year: '2022', fuel_type: 'El' },
      { fuel_usage: null, ev_consumption: 160 },
    ),
  );
  assert.deepEqual(found, { name: 'Tesla Model Y', year: 2022, fuel: 'electric', kmPerUnit: 6.3 });
});

test('short and numbered names keep their capitals; numbers may come as text', () => {
  const found = carFromLookup(
    answer({ make: 'VW', model: 'ID.3', model_year: '2021', fuel_type: 'El' }, { ev_consumption: '155,0' }),
  );
  assert.equal(found.name, 'VW ID.3');
  assert.equal(found.kmPerUnit, 6.5);
  assert.equal(
    carFromLookup(answer({ make: 'BMW', model: 'X1', fuel_type: 'Diesel' }, { fuel_usage: '21,3' }))
      .kmPerUnit,
    21.3,
  );
});

test('missing pieces are left out, not guessed', () => {
  assert.deepEqual(carFromLookup(answer({ make: 'SKODA', model: 'OCTAVIA' })), { name: 'Skoda Octavia' });
  // model year missing: the year it was first registered
  assert.equal(carFromLookup(answer({ make: 'KIA', first_registration: '2019-03-14' })).year, 2019);
  // a plug-in hybrid is costed as the fuel it burns
  assert.equal(carFromLookup(answer({ make: 'KIA', fuel_type: 'Benzin/El' })).fuel, 'petrol');
  // an unknown fuel is left for the user, and so is its consumption
  assert.deepEqual(
    carFromLookup(answer({ make: 'TOYOTA', model: 'MIRAI', fuel_type: 'Brint' }, { fuel_usage: 10 })),
    {
      name: 'Toyota Mirai',
    },
  );
  assert.equal(carFromLookup(answer({})), null);
  assert.equal(carFromLookup({ error: 'not found' }), null);
  assert.equal(carFromLookup(null), null);
});

test('what was found goes on the car, and the filled fields are reported', () => {
  const car = newCar({ name: '', insuranceMo: 520 });
  const filled = applyLookup(car, { name: 'Ford Mondeo', year: 2016, fuel: 'petrol', greenTaxMo: 215 });
  assert.deepEqual(filled, ['name', 'year', 'fuel', 'greenTaxMo']);
  assert.equal(car.greenTaxMo, 215);
  assert.equal(car.name, 'Ford Mondeo');
  assert.equal(car.year, 2016);
  assert.equal(car.kmPerUnit, 0); // not found: still to be typed
  assert.equal(car.insuranceMo, 520);
});

test('a failed lookup gets the right message', () => {
  assert.equal(lookupErrorKey(404), 'notFound');
  assert.equal(lookupErrorKey(400), 'notFound');
  assert.equal(lookupErrorKey(401), 'badKey');
  assert.equal(lookupErrorKey(403), 'badKey');
  assert.equal(lookupErrorKey(429), 'limit');
  assert.equal(lookupErrorKey(502), 'unreachable');
  assert.equal(lookupErrorKey(0), 'unreachable');
});

test('data upgrade to v10: the lookup key starts empty and survives a reload', () => {
  const old = { ...emptyState('da'), version: 9 };
  delete old.plateKey;
  const s = migrate(old);
  assert.equal(s.version, STATE_VERSION);
  assert.equal(s.plateKey, '');
  assert.equal(migrate({ ...s, plateKey: '  abc 123\n' }).plateKey, 'abc123');
  assert.equal(migrate({ ...s, plateKey: 42 }).plateKey, '');
  assert.equal(sanitizePlateKey('x'.repeat(500)).length, 200);
});

test('green tax: worked out from the registration date and fuel use, or CO2', () => {
  const mondeo = carFromLookup(
    answer(
      {
        make: 'FORD',
        model: 'MONDEO',
        model_year: 2016,
        fuel_type: 'Benzin',
        first_registration_date: '2016-05-12',
      },
      { fuel_usage: 16.9, co2_emission: 138 },
    ),
  );
  assert.equal(mondeo.greenTaxMo, 215); // 1,290 kr per half year
  const ev = carFromLookup(
    answer(
      {
        make: 'TESLA',
        model: 'MODEL Y',
        fuel_type: 'El',
        registration: { first_registration: '01-03-2022' },
      },
      {
        ev_consumption: 160,
      },
    ),
  );
  assert.equal(ev.greenTaxMo, 76.67); // 460 kr per half year
  const newPetrol = carFromLookup(
    answer(
      { make: 'KIA', fuel_type: 'Benzin', first_registration: '2023-02-01' },
      { co2: { nedc: 99, wltp: 125 } },
    ),
  );
  assert.equal(newPetrol.greenTaxMo, 126.67); // 760 kr: the WLTP figure counts
});

test('green tax: the amount in the answer wins; nothing to go on, nothing filled', () => {
  const stated = carFromLookup(
    answer({ make: 'FORD', fuel_type: 'Benzin', first_registration: '2016-05-12' }, { fuel_usage: 16.9 }),
  );
  assert.equal(stated.greenTaxMo, 215);
  const withTax = { ...answer({ make: 'FORD', fuel_type: 'Benzin' }) };
  withTax.data.taxes = { green_tax_half_year: 1200 };
  assert.equal(carFromLookup(withTax).greenTaxMo, 200);
  const yearly = answer({ make: 'FORD', fuel_type: 'Benzin', green_tax_yearly: 2400 });
  assert.equal(carFromLookup(yearly).greenTaxMo, 200);
  assert.equal(
    carFromLookup(answer({ make: 'FORD', fuel_type: 'Benzin' }, { fuel_usage: 16.9 })).greenTaxMo,
    undefined,
  );
});
