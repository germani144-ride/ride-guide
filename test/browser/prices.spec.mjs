// Today's fuel and electricity prices: fetched by themselves and on request. The price sources
// are played by the tests (see fixtures.mjs).
import { test, expect } from './fixtures.mjs';

test("the app fetches today's prices by itself, and the costs follow them", async ({ page, app }) => {
  const asked = await app.prices({ petrol: 14.29, diesel: 13.19, spot: 600 });
  await app.open('#/history');
  await expect.poll(async () => (await app.saved(), (await app.state()).settings.petrolPrice)).toBe(14.29);
  expect(asked.some(u => u.startsWith('https://mobility-prices.ok.dk/api/v1/fuel-prices'))).toBe(true);
  const eds = asked.find(u => u.startsWith('https://api.energidataservice.dk/dataset/DayAheadPrices'));
  expect(decodeURIComponent(eds)).toContain('"PriceArea":["DK2"]');
  const s = (await app.state()).settings;
  expect(s).toMatchObject({ petrolPrice: 14.29, dieselPrice: 13.19, homeElPrice: 1.3 }); // 0.6 × 1.25 + 0.55
  // 5.38 kr per km at the default prices (see settings.spec.mjs); cheaper fuel, cheaper km.
  await expect(page.locator('.row-km').first()).not.toHaveText('5.38 kr per km');

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.locator('#set-petrolPrice')).toHaveValue('14.29');
  await expect(page.locator('.price-status')).toContainText('Petrol 14.29 and diesel 13.19 kr per litre');
  await expect(page.locator('.price-status')).toContainText(
    'Home electricity 1.30 kr per kWh: spot price 0.60 kr (DK2, average of the last 30 days)',
  );
});

test('the add-on and the price area change the home electricity price', async ({ page, app }) => {
  await app.prices({ spot: 600 });
  await app.open('#/settings');
  await expect(page.locator('#set-homeElPrice')).toHaveValue('1.3');
  await page.locator('#set-elAddOn').fill('0.75');
  await page.locator('#set-elAddOn').press('Enter');
  await app.saved();
  expect((await app.state()).settings.homeElPrice).toBe(1.5);

  const asked = await app.prices({ spot: 400 });
  await page.getByRole('radio', { name: 'DK1, west' }).click();
  await expect(page.locator('.price-status')).toContainText('spot price 0.40 kr (DK1');
  expect(decodeURIComponent(asked.at(-1))).toContain('"PriceArea":["DK1"]');
  await app.saved();
  expect((await app.state()).settings.homeElPrice).toBe(1.25); // 0.4 × 1.25 + 0.75
});

test('with automatic updates off, your own prices stay', async ({ page, app }) => {
  await app.open('#/settings');
  await page.locator('label[for="set-pricesAuto"]').click();
  await page.locator('#set-petrolPrice').fill('16');
  await page.locator('#set-petrolPrice').press('Enter');
  await app.saved();
  const asked = await app.prices({ petrol: 14 });
  await page.reload();
  await page.locator('#splash').waitFor({ state: 'detached' });
  await expect(page.locator('#set-petrolPrice')).toHaveValue('16');
  expect(asked).toEqual([]);
});

test.describe('when the price sources cannot be reached', () => {
  test.use({ expectedErrors: [/Failed to load resource.*503/] });

  test('the button says so and the prices stay as they were', async ({ page, app }) => {
    await app.open('#/settings');
    await app.prices({ petrol: 99, status: 503 });
    await page.getByRole('button', { name: "Get today's prices" }).click();
    await expect(page.locator('.toast')).toHaveText(
      "Couldn't get today's prices. Check the connection and try again.",
    );
    await expect(page.locator('#set-petrolPrice')).toHaveValue('17.5');
  });
});
