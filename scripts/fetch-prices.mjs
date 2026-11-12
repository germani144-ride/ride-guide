// Run by the GitHub Action (.github/workflows/prices.yml): asks OK and Energi Data Service for
// today's prices and writes prices.json, which the app reads. Node 20+, no dependencies.
//   node scripts/fetch-prices.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { OK_URL, AREAS, spotUrl, pricesFile } from '../src/prices.js';

const FILE = new URL('../prices.json', import.meta.url);

async function getJson(url) {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error(`could not fetch ${url}: ${e.message}`);
    return null;
  }
}

const previous = await readFile(FILE, 'utf8')
  .then(JSON.parse)
  .catch(() => null);
const ok = await getJson(OK_URL);
const spot = {};
for (const area of AREAS) spot[area] = await getJson(spotUrl(area));

const file = pricesFile({ ok, spot, previous });
if (file.petrol == null && file.diesel == null && AREAS.every(a => file.spot[a] == null)) {
  console.error('no prices at all; prices.json left as it was');
  process.exit(1);
}
await writeFile(FILE, `${JSON.stringify(file, null, 2)}\n`);
console.log(JSON.stringify(file));
