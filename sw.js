// Offline support.
//
// RideGuide has its own address now, but several apps once shared one origin (and so one
// CacheStorage). So this worker still only creates, reads and deletes caches whose name starts
// with PREFIX, and only handles requests inside its own folder.
//
// Strategy: cache first. Opening never waits for the network: every file comes from this
// version's cache, so a phone always runs one complete version and it opens instantly, even
// offline. (Network-first made every open wait for one round trip per file: found 2026-10-25.)
// The browser checks sw.js and src/version.js (imported below) for changes on every open
// (updateViaCache: 'none'; app.js also asks when the app comes back to the screen). Bumping the
// version in src/version.js names a new cache, so the new worker downloads every file fresh
// before it takes over, and app.js reloads once. So a release must bump the version.
importScripts('./src/version.js'); // sets self.RIDEGUIDE_VERSION
const PREFIX = 'rideguide-';
const CACHE = `${PREFIX}v${self.RIDEGUIDE_VERSION}`; // a new version gets a fresh cache
const NETWORK_TIMEOUT_MS = 4000;
const SHELL = [
  './',
  './index.html',
  './css/base.css',
  './css/layout.css',
  './css/forms.css',
  './css/plate.css',
  './css/wizard.css',
  './css/results.css',
  './css/lists.css',
  './css/settings.css',
  './manifest.webmanifest',
  './src/version.js',
  './src/boot.js',
  './src/update.js',
  './src/app.js',
  './src/engine.js',
  './src/model.js',
  './src/storage.js',
  './src/i18n.js',
  './src/seed.js',
  './src/ui.js',
  './src/views/wizard.js',
  './src/views/cars.js',
  './src/views/settings.js',
  './src/views/fields.js',
  './src/views/result.js',
  './src/views/tabs.js',
  './src/backup.js',
  './src/wizard-flow.js',
  './src/format.js',
  './src/compare.js',
  './src/routes.js',
  './fonts/barlow-latin-400-normal.woff2',
  './fonts/barlow-latin-500-normal.woff2',
  './fonts/barlow-latin-600-normal.woff2',
  './fonts/barlow-condensed-latin-600-normal.woff2',
  './fonts/barlow-condensed-latin-700-normal.woff2',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

const SCOPE = self.registration.scope; // e.g. https://germani144.github.io/ride-guide/

self.addEventListener('install', e => {
  // '?v=' makes GitHub's CDN fetch each file anew and cache: 'reload' skips the phone's HTTP
  // cache, so a release can never mix in an old copy. If any file fails, the install fails and
  // the phone stays on the current version.
  e.waitUntil(
    caches
      .open(CACHE)
      .then(c =>
        Promise.all(
          SHELL.map(async u => {
            const res = await fetch(`${u}?v=${CACHE}`, { cache: 'reload', credentials: 'same-origin' });
            if (!res.ok) throw new Error(`could not save ${u} for offline use`);
            await c.put(u, res);
          }),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// Anything not in the cache comes from the server once ('no-cache': revalidated, not GitHub
// Pages' 10-minute max-age) and is kept if it worked.
async function fromNetwork(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), NETWORK_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: 'no-cache', credentials: 'same-origin', signal: ctrl.signal });
    if (res.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(url, res.clone());
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fromCache(url, isPage) {
  const cache = await caches.open(CACHE);
  return (
    (await cache.match(url, { ignoreSearch: true })) ||
    (isPage ? cache.match(new URL('./index.html', SCOPE).href) : undefined)
  );
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(SCOPE)) return; // not ours: leave it alone
  // "Check for updates" must reach the server, never this worker's cache.
  if (new URL(req.url).searchParams.has('check')) return;
  const url = req.url.split('#')[0];
  const isPage = req.mode === 'navigate';
  e.respondWith(
    (async () => (await fromCache(url, isPage)) || (await fromNetwork(url).catch(() => Response.error())))(),
  );
});
