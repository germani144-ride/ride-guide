// "Check for updates" (Settings). An installed app only picks up a new version when it is fully
// closed and reopened, and GitHub Pages has once silently failed to publish a push. This asks the
// server which version it is serving right now, and on request forces a fresh copy.
//
// The served version is read from src/version.js (which also names the offline cache in sw.js).
// Only caches named "rideguide-…" are ever deleted: other apps may share the origin.

const CACHE_PREFIX = 'rideguide-';

// Pulls the version out of the text of src/version.js, or null.
export function versionFromSource(text) {
  return (/RIDEGUIDE_VERSION\s*=\s*'([\d.]+)'/.exec(String(text ?? '')) || [])[1] || null;
}

export async function fetchServedVersion() {
  try {
    const res = await fetch(`./src/version.js?check=${Date.now()}`, { cache: 'no-store' });
    return res.ok ? versionFromSource(await res.text()) : null;
  } catch {
    return null;
  }
}

// Drops this app's own caches, installs the new service worker (which caches the new version
// afresh), waits for it to take over, and reloads into the new version.
export async function forceUpdate() {
  try {
    for (const k of await caches.keys()) if (k.startsWith(CACHE_PREFIX)) await caches.delete(k);
  } catch {
    /* no CacheStorage */
  }
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.update();
      const sw = reg.installing || reg.waiting;
      if (sw) {
        await new Promise(resolve => {
          const done = () => {
            if (sw.state === 'activated' || sw.state === 'redundant') resolve();
          };
          sw.addEventListener('statechange', done);
          done();
          setTimeout(resolve, 8000); // don't hang on a slow network: with the caches gone, the reload asks the server
        });
      }
    }
  } catch {
    /* offline or unsupported: with the caches gone, the reload asks the server */
  }
  location.reload();
}
