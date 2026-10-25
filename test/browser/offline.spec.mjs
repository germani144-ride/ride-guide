import { test, expect } from './fixtures.mjs';

test('the app starts offline once it has been opened', async ({ page, context, app }) => {
  await app.open('#/history');
  // Wait until the service worker controls the page and has cached the app.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise(r => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    }
  });
  await context.setOffline(true);
  await page.reload();
  await page.locator('#splash').waitFor({ state: 'detached' });
  await expect(page.locator('.rows li')).toHaveCount(7);
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.locator('.version')).toContainText('RideGuide v');
});

// Opening the app must not wait for the server (one round trip per file made it slow), and a new
// release must still reach the phone by itself. Runs on its own copy of the app and its own server,
// so the test can "release" a version by bumping src/version.js, like a real release.
test('opens from the phone without downloading the app; a new release takes over by itself', async ({
  page,
}) => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const http = await import('node:http');
  const root = new URL('../../', import.meta.url).pathname;
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'rideguide-release-'));
  fs.cpSync(root, copy, {
    recursive: true,
    filter: f => !/[/\\](\.git|node_modules|test|test-results)([/\\]|$)/.test(f),
  });
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  const asked = []; // what the server is asked for
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/ride-guide\//, '');
    asked.push(rel);
    const file = path.join(copy, rel === '' ? 'index.html' : rel);
    if (!file.startsWith(copy) || !fs.existsSync(file) || fs.statSync(file).isDirectory())
      return res.writeHead(404).end();
    res.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(fs.readFileSync(file));
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}/ride-guide/`;
  const version = () => page.evaluate(() => self.RIDEGUIDE_VERSION).catch(() => null); // null while reloading
  try {
    await page.goto(base + '#/history');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise(r =>
          navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }),
        );
      }
    });
    await page.reload(); // anything not saved at install is kept from here on
    await page.locator('#splash').waitFor({ state: 'detached' });
    const before = await version();
    asked.length = 0;
    await page.reload();
    await page.locator('#splash').waitFor({ state: 'detached' });
    const appFiles = asked.filter(
      u => /(^|\.html|\.js|\.css)$/.test(u) && !['sw.js', 'src/version.js'].includes(u),
    );
    expect(appFiles, 'opening the app downloaded app files').toEqual([]);

    // "release" 99.0 on the server: only the version changes, like a real release
    const vf = path.join(copy, 'src/version.js');
    fs.writeFileSync(
      vf,
      fs.readFileSync(vf, 'utf8').replace(/RIDEGUIDE_VERSION = '[\d.]+'/, "RIDEGUIDE_VERSION = '99.0'"),
    );
    await page.reload(); // opens as usual (still the old version); the new one installs meanwhile
    await expect
      .poll(version, { message: `reloads into 99.0 by itself (was ${before})`, timeout: 15_000 })
      .toBe('99.0');
    const keys = await page.evaluate(async () =>
      (await caches.keys()).filter(k => k.startsWith('rideguide-')),
    );
    expect(keys).toEqual(['rideguide-v99.0']);
  } finally {
    server.close();
    fs.rmSync(copy, { recursive: true, force: true });
  }
});
