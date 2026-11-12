// Plate lookup, the plain part: where to ask, how to read the answer, and how to put it on a car.
// No DOM, storage or network here; src/lookup.js makes the call.
//
// The data comes from Nummerplade Tjek (https://nummerplade-tjek.dk, by autotelli.dk), which
// republishes the Danish motor register. Its answer looks like
//   { status, data: { plate, vehicle: { make, model, variant, model_year, fuel_type, … },
//                     environment: { fuel_usage (km/l), ev_consumption (Wh/km), … } } }
// The reader below is forgiving on purpose: numbers may come as text, and a missing field is
// simply left for the user to fill in.
import { FUELS } from './model.js';
import { greenTaxHalfYear } from './green-tax.js';

export const LOOKUP_ORIGIN = 'https://nummerplade-tjek.dk';

// A plate worth asking about: letters and digits only once spaces are gone.
export function lookupPlate(plate) {
  const p = String(plate ?? '')
    .toUpperCase()
    .replace(/[^A-ZÆØÅ0-9]/g, '');
  return p.length >= 2 && p.length <= 7 ? p : '';
}

export function lookupUrl(plate) {
  return `${LOOKUP_ORIGIN}/api/v1/vehicles/${encodeURIComponent(lookupPlate(plate))}`;
}

// Which message a failed lookup gets, from the HTTP status (0: no answer at all).
export function lookupErrorKey(status) {
  if (status === 404 || status === 400) return 'notFound';
  if (status === 401 || status === 403) return 'badKey';
  if (status === 429) return 'limit';
  return 'unreachable';
}

function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(
    String(v ?? '')
      .trim()
      .replace(',', '.'),
  );
  return Number.isFinite(n) ? n : 0;
}

// "FORD" → "Ford", "MONDEO" → "Mondeo"; names that already have lower case are left alone, and
// short all-capital names (BMW, VW, ID.3) stay as they are.
function tidyName(text) {
  const s = String(text ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!s || s !== s.toUpperCase()) return s;
  return s
    .split(' ')
    .map(w => (w.length <= 3 || /\d/.test(w) ? w : w[0] + w.slice(1).toLowerCase()))
    .join(' ');
}

// The register's fuel names. A plug-in hybrid is costed as the fuel it burns.
function fuelFrom(text) {
  const s = String(text ?? '').toLowerCase();
  if (!s) return null;
  if (s.includes('diesel')) return 'diesel';
  if (s.includes('benzin') || s.includes('petrol')) return 'petrol';
  if (s === 'el' || s.includes('elektri') || s.includes('electric')) return 'electric';
  return null;
}

// Every [key, value] in an object and the objects inside it (two levels down is plenty). Keys
// inside an object carry its name: { co2: { wltp: 125 } } gives ['co2.wltp', 125].
function entries(obj, depth = 2, prefix = '') {
  if (!obj || typeof obj !== 'object' || depth < 0) return [];
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix + k;
    return v && typeof v === 'object' && !Array.isArray(v)
      ? [[key, v], ...entries(v, depth - 1, `${key}.`)]
      : [[key, v]];
  });
}

// A date as 'YYYY-MM-DD' from '2016-03-14', '2016-03-14T00:00:00Z' or '14-03-2016', else ''.
function isoDate(v) {
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})[-./](\d{2})[-./](\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

// The first registration date, wherever the answer keeps it.
function firstRegistration(vehicle) {
  for (const [k, v] of entries(vehicle)) {
    if (/first.*reg|reg.*first|foerste|første/i.test(k) && isoDate(v)) return isoDate(v);
  }
  return '';
}

// CO2 in g/km (the WLTP figure if both are given), or null.
function co2From(env) {
  const hits = entries(env).filter(([k, v]) => /co2/i.test(k) && toNumber(v) > 0);
  const wltp = hits.find(([k]) => /wltp/i.test(k));
  return (wltp ?? hits[0]) ? toNumber((wltp ?? hits[0])[1]) : null;
}

// true / false if the answer says whether there is a particle filter, else null.
function particleFilterFrom(env) {
  const hit = entries(env).find(([k]) => /particle|partikel/i.test(k));
  if (!hit) return null;
  const v = hit[1];
  if (typeof v === 'boolean') return v;
  if (/^(ja|yes|true|1)$/i.test(String(v).trim())) return true;
  if (/^(nej|no|false|0)$/i.test(String(v).trim())) return false;
  return null;
}

// A green tax amount the answer carries itself (kr per half year), or null. Amounts that look
// yearly are halved.
function greenTaxFrom(d) {
  for (const [k, v] of entries(d, 3)) {
    if (!/green_?tax|ejerafgift|owner_?tax|periodic_?tax|ownership_?tax/i.test(k)) continue;
    const n = toNumber(v);
    if (n > 0) return /year|annual|aarlig|årlig/i.test(k) && !/half|halv/i.test(k) ? n / 2 : n;
  }
  return null;
}

// Reads the service's answer into the car fields RideGuide knows:
//   { name, year, fuel, kmPerUnit, greenTaxMo }, each only if the answer has it (green tax: from
//   the answer, else worked out from the official rates). null if it has no car.
export function carFromLookup(json) {
  const d = json?.data ?? json;
  const v = d?.vehicle;
  if (!v || typeof v !== 'object') return null;
  const env = d.environment && typeof d.environment === 'object' ? d.environment : {};
  const found = {};

  const name = [tidyName(v.make), tidyName(v.model)].filter(Boolean).join(' ').slice(0, 60);
  if (name) found.name = name;

  const firstRegistered = String(v.first_registration ?? v.first_registration_date ?? '').slice(0, 4);
  const year = Math.round(toNumber(v.model_year)) || Math.round(toNumber(firstRegistered));
  if (year > 1900 && year < 2100) found.year = year;

  const fuel = fuelFrom(v.fuel_type ?? env.fuel_type);
  if (fuel && FUELS.includes(fuel)) found.fuel = fuel;

  // Petrol and diesel: km per litre. Electric: the register has Wh per km; RideGuide counts km per kWh.
  const whPerKm = toNumber(env.ev_consumption ?? v.ev_consumption);
  const kmPerLitre = toNumber(env.fuel_usage ?? v.fuel_usage);
  if (found.fuel === 'electric' && whPerKm > 0) found.kmPerUnit = Math.round(10000 / whPerKm) / 10;
  else if (found.fuel && found.fuel !== 'electric' && kmPerLitre > 0)
    found.kmPerUnit = Math.round(kmPerLitre * 10) / 10;

  // Green tax: the register's own amount if the answer has it; else the official rate tables.
  const halfYear =
    greenTaxFrom(d) ??
    (found.fuel
      ? greenTaxHalfYear({
          fuel: found.fuel,
          registered: firstRegistration(v),
          kmPerLitre: kmPerLitre,
          co2: co2From(env),
          particleFilter: particleFilterFrom(env),
        })
      : null);
  if (halfYear > 0) found.greenTaxMo = Math.round((halfYear / 6) * 100) / 100;

  return Object.keys(found).length ? found : null;
}

// Puts what was found on the car and returns the names of the fields it filled.
export function applyLookup(car, found) {
  const filled = [];
  for (const f of ['name', 'year', 'fuel', 'kmPerUnit', 'greenTaxMo']) {
    if (found?.[f] == null) continue;
    car[f] = found[f];
    filled.push(f);
  }
  return filled;
}
