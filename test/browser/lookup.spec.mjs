// Plate lookup: the car is filled in from the plate. The lookup service is played by the test.
import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures.mjs';

const SERVICE = 'https://nummerplade-tjek.dk/api/v1/vehicles/*';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };

// Answers lookups like the service would, and remembers what the app asked.
async function playService(page, status, body) {
  const asked = [];
  await page.route(SERVICE, route => {
    asked.push({ url: route.request().url(), key: route.request().headers()['x-api-key'] });
    return route.fulfill({
      status,
      headers: CORS,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  return asked;
}

async function saveKey(page, app, key = 'my-test-key') {
  await app.open('#/settings');
  await page.locator('#set-plateKey').fill(key);
  await page.locator('#set-plateKey').press('Enter');
  await expect(page.locator('.toast')).toHaveText('Saved');
}

async function typePlate(page, plate) {
  await page.locator('#tabs').getByRole('link', { name: 'New car' }).click();
  await page.getByRole('button', { name: /Yes, I have it/ }).click();
  await page.locator('.plate-input').fill(plate);
}

test('typing a plate fills in the car, year, fuel and fuel use', async ({ page, app }) => {
  const asked = await playService(page, 200, {
    status: 'ok',
    data: {
      plate: 'AB12345',
      vehicle: { make: 'FORD', model: 'MONDEO', model_year: 2016, fuel_type: 'Benzin' },
      environment: { fuel_usage: 17.2, ev_consumption: null },
    },
  });
  await saveKey(page, app);
  await typePlate(page, 'ab12345');
  await expect(page.locator('.step-hint')).toContainText('looked up in the Danish motor register');
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('heading', { name: 'Which car is it?' })).toBeVisible();
  expect(asked).toEqual([{ url: 'https://nummerplade-tjek.dk/api/v1/vehicles/AB12345', key: 'my-test-key' }]);
  await expect(page.locator('.lookup-note')).toHaveText(
    'Filled in from the plate: the car, model year, fuel, fuel use. Check it and correct anything that is off.',
  );
  await expect(page.locator('#f-name')).toHaveValue('Ford Mondeo');
  await expect(page.locator('#f-year')).toHaveValue('2016');
  await expect(page.getByRole('radio', { name: 'Petrol' })).toBeChecked();

  // A correction survives going back and forward: the same plate is not looked up again.
  await page.locator('#f-name').fill('Mondeo Titanium');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('#f-name')).toHaveValue('Mondeo Titanium');
  expect(asked).toHaveLength(1);

  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: /Pay upfront/ }).click();
  await page.locator('#f-price').fill('86.000');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('#f-kmPerUnit')).toHaveValue('17.2');
  await expect(page.locator('.lookup-note')).toContainText('official figure');
});

test.describe('a plate the register does not know', () => {
  test.use({ expectedErrors: [/Failed to load resource.*404/] });

  test('says so and lets you fill in the car yourself', async ({ page, app }) => {
    await playService(page, 404, { error: 'Vehicle not found' });
    await saveKey(page, app);
    await typePlate(page, 'zz99999');
    await expect(page.getByRole('button', { name: 'Fill in myself' })).toBeHidden();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.locator('.lookup-status')).toHaveText(
      'No car found with that plate. Check the plate, or fill in the car yourself.',
    );
    await expect(page.getByRole('button', { name: 'Next' })).toBeEnabled();
    await page.getByRole('button', { name: 'Fill in myself' }).click();
    await expect(page.getByRole('heading', { name: 'Which car is it?' })).toBeVisible();
    await expect(page.locator('.lookup-note')).toHaveCount(0);
    await expect(page.locator('#f-name')).toHaveValue('');
  });
});

test('without a key nothing is looked up, and the hint says how to turn it on', async ({ page, app }) => {
  const asked = await playService(page, 200, {});
  await app.open('#/new');
  await page.getByRole('button', { name: /Yes, I have it/ }).click();
  await expect(page.locator('.step-hint')).toContainText('add a lookup key in Settings');
  await page.locator('.plate-input').fill('ab12345');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Which car is it?' })).toBeVisible();
  expect(asked).toEqual([]);
});

test('the key stays on the device: saved, but left out of a backup', async ({ page, app }) => {
  await saveKey(page, app, ' secret-key-123 ');
  await app.saved();
  expect((await app.state()).plateKey).toBe('secret-key-123');
  await expect(page.getByRole('link', { name: 'autotelli.dk' })).toHaveAttribute(
    'href',
    'https://autotelli.dk',
  );

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const backup = await readFile(await (await download).path(), 'utf8');
  expect(backup).not.toContain('secret-key-123');
  expect(JSON.parse(backup).plateKey).toBe('');

  await page.reload();
  await page.locator('#splash').waitFor({ state: 'detached' });
  await expect(page.locator('#set-plateKey')).toHaveValue('secret-key-123');
});
