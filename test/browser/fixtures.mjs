// Shared setup for the browser tests: a fresh app on a fixed date, and a check that nothing
// logged an error (including Content-Security-Policy violations) during the test.
import { test as base, expect } from '@playwright/test';

// Cars' ages (and so their costs) depend on today's date; fix it so expected numbers stay put.
export const TODAY = new Date('2026-10-24T12:00:00+02:00');

// prices.json (written by the GitHub Action), played by the tests. By default it holds prices
// equal to the app's defaults (petrol 17.5, diesel 19.5, home electricity 0.68 × 1.25 + 0.55 =
// 1.40), so fetching today's prices changes no number on screen. A test can call app.prices() to
// answer otherwise; `spot` is in kr per kWh.
export function pricesJson({ petrol = 17.5, diesel = 19.5, spot = 0.68 } = {}) {
  return { updatedAt: '2026-10-24T04:17:00.000Z', petrol, diesel, spot: { DK1: spot - 0.1, DK2: spot } };
}
async function playPrices(page, { status = 200, ...prices } = {}) {
  const asked = [];
  await page.route('**/prices.json*', route => {
    asked.push(route.request().url());
    return route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(pricesJson(prices)),
    });
  });
  return asked;
}

export const test = base.extend({
  // Every page, also one a test opens itself, gets the played price sources.
  priceSources: [
    async ({ page }, use) => {
      await playPrices(page);
      await use(null);
    },
    { auto: true },
  ],
  // Console errors a test causes on purpose (e.g. a lookup the server answers with 404).
  expectedErrors: [[], { option: true }],
  errors: [
    async ({ page, expectedErrors }, use) => {
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => m.type() === 'error' && errors.push(m.text()));
      await use(errors);
      const unexpected = errors.filter(e => !expectedErrors.some(re => re.test(e)));
      expect(unexpected, 'errors in the browser console').toEqual([]);
    },
    { auto: true },
  ],
  app: async ({ page }, use) => {
    await page.clock.setFixedTime(TODAY);
    await use({
      // Answers price requests with these prices from now on; returns the URLs asked.
      prices: answer => playPrices(page, answer),
      // Opens the app at a route and waits for the loading screen to go away.
      async open(hash = '#/new') {
        await page.goto(hash);
        await page.locator('#splash').waitFor({ state: 'detached' });
      },
      // The saved state, as the app stores it.
      state: () => page.evaluate(() => JSON.parse(localStorage.getItem('rideguide.v1'))),
      // Writes a pending save to storage now (the app does this when it is hidden or closed).
      async saved() {
        await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      },
    });
  },
});

export { expect };
