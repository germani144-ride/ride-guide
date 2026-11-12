// Today's prices, the network part: asks OK (petrol, diesel) and Energi Data Service (spot
// electricity) at the same time. Neither needs a key. Resolves to { petrol, diesel, spot }, each
// null if that source failed; never throws.
import { OK_URL, spotUrl, fuelFromOk, spotFromEds } from './prices.js';

const TIMEOUT_MS = 10000;

async function getJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: ctrl.signal,
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null; // offline, timed out, or blocked
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPrices(area) {
  const [ok, eds] = await Promise.all([getJson(OK_URL), getJson(spotUrl(area))]);
  const fuel = ok ? fuelFromOk(ok) : { petrol: null, diesel: null };
  return { ...fuel, spot: eds ? spotFromEds(eds) : null };
}
