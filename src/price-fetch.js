// Today's prices, the network part: reads prices.json from the app's own address. The GitHub
// Action writes it twice a day (see src/prices.js for why the phone doesn't ask the sources).
// Resolves to { petrol, diesel, spot }, each null if missing; never throws.
import { readPricesFile } from './prices.js';

const TIMEOUT_MS = 10000;

export async function fetchPrices(area) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // '?check=' makes the service worker leave it alone, so this is always today's file.
    const res = await fetch(`./prices.json?check=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
    return readPricesFile(res.ok ? await res.json() : null, area);
  } catch {
    return readPricesFile(null, area); // offline or timed out
  } finally {
    clearTimeout(timer);
  }
}
