// Run by the GitHub Action (.github/workflows/prices.yml): asks OK and Energi Data Service for
// today's prices and writes prices.json, which the app reads. Node 20+, no dependencies.
//   node scripts/fetch-prices.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { OK_URL, AREAS, spotUrl, pricesFile } from '../src/prices.js';

const FILE = new URL('../prices.json', import.meta.url);

const wait = ms => new Promise(r => setTimeout(r, ms));

// Asks up to three times; "429 Too Many Requests" and server errors get a pause first.
async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.ok) return await res.json();
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      console.error(`could not fetch ${url} (attempt ${attempt}): ${e.message}`);
      if (attempt === 3) return null;
      await wait(attempt * 20000);
    }
  }
}

const previous = await readFile(FILE, 'utf8')
  .then(JSON.parse)
  .catch(() => null);
const ok = await getJson(OK_URL);
const eds = await getJson(spotUrl());

const file = pricesFile({ ok, eds, previous });
if (file.petrol == null && file.diesel == null && AREAS.every(a => file.spot[a] == null)) {
  console.error('no prices at all; prices.json left as it was');
  process.exit(1);
}
await writeFile(FILE, `${JSON.stringify(file, null, 2)}\n`);
console.log(JSON.stringify(file));
