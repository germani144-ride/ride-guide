// Plate lookup, the network part: asks Nummerplade Tjek about one plate. The key is the user's
// own (typed in Settings, kept on this device) and is sent to that service only.
// Resolves to { found } or { error: 'notFound' | 'badKey' | 'limit' | 'unreachable' }.
import { lookupUrl, lookupErrorKey, carFromLookup } from './plate-data.js';

const TIMEOUT_MS = 8000;

export async function lookUpCar(plate, key) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(lookupUrl(plate), {
      headers: { 'X-API-Key': key, Accept: 'application/json' },
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: ctrl.signal,
    });
    if (!res.ok) return { error: lookupErrorKey(res.status) };
    const found = carFromLookup(await res.json());
    return found ? { found } : { error: 'notFound' };
  } catch {
    return { error: lookupErrorKey(0) }; // offline, timed out, or the browser blocked the call
  } finally {
    clearTimeout(timer);
  }
}
