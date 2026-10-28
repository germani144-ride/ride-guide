import { test, expect } from './fixtures.mjs';

// The spreadsheet cars the app starts with, at 3 years and 10,000 km a year.
const HISTORY = [
  ['Fiesta GM', '4,480 kr per month', '5.38 kr per km'],
  ['MondeoI', '3,777 kr per month', '4.53 kr per km'],
  ['MondeoD', '3,455 kr per month', '4.15 kr per km'],
  ['MondeoIII', '3,649 kr per month', '4.38 kr per km'],
  ['CeedGM', '5,236 kr per month', '6.28 kr per km'],
  ['Y GM', '4,954 kr per month', '5.94 kr per km'],
  ['Scenic GM', '4,765 kr per month', '5.72 kr per km'],
];
const AT_20000_KM = ['3.14', '3.36', '3.02', '3.22', '3.69', '3.11', '3.00'].map(v => `${v} kr per km`);

test('history lists every car with its cost', async ({ page, app }) => {
  await app.open('#/history');
  const rows = await page
    .locator('.rows li')
    .evaluateAll(items =>
      items.map(li => ['.row-name', '.row-month', '.row-km'].map(s => li.querySelector(s).textContent)),
    );
  expect(rows).toEqual(HISTORY);
});

test('the km and years bars change every car', async ({ page, app }) => {
  await app.open('#/history');
  await page.locator('.span-field').nth(1).getByRole('radio', { name: '20' }).click();
  await expect(page.locator('.rows li .row-km')).toHaveText(AT_20000_KM);
  await page.locator('.span-field').nth(0).getByRole('radio', { name: '5' }).click();
  await app.saved();
  expect((await app.state()).settings).toMatchObject({ kmPerYear: 20000, years: 5 });
});

test('compare two cars', async ({ page, app }) => {
  await app.open('#/history');
  await page.getByRole('button', { name: 'Compare' }).click();
  await page.locator('.rows li', { hasText: 'MondeoD' }).locator('label').click();
  await page.locator('.rows li', { hasText: 'MondeoIII' }).locator('label').click();
  await page.getByRole('button', { name: 'Compare 2 cars' }).click();
  await expect(page.getByRole('heading', { name: 'Comparison' })).toBeVisible();
  const cols = page.locator('.compare-col');
  await expect(cols).toHaveCount(2);
  await expect(cols.nth(0)).toContainText('Cheapest');
  await expect(cols.nth(0).locator('.price-sub-num')).toHaveText('4.15');
  await expect(cols.nth(1).locator('.price-sub-num')).toHaveText('4.38');
  await expect(cols.nth(1).locator('.diff')).toHaveText('+195 kr per month');
});

test('a car page shows the breakdown, can be marked as mine and deleted', async ({ page, app }) => {
  await app.open('#/history');
  await page.locator('.row', { hasText: 'MondeoD' }).click();
  await expect(page.getByRole('heading', { name: 'MondeoD' })).toBeVisible();
  await expect(page.locator('.price-sub-num')).toHaveText('4.15');
  await expect(page.locator('.legend li').first()).toContainText('Maintenance and repairs1,100 kr');
  await page.getByRole('button', { name: 'This is my car' }).click();
  await expect(page.locator('.toast')).toHaveText('Added to your garage');
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Delete car' }).click();
  await expect(page.locator('.toast')).toHaveText('Car deleted');
  await expect(page.locator('.rows li')).toHaveCount(6);
});

test('on a narrow phone the comparison columns get tighter', async ({ page, app }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await app.open('#/history');
  const ids = (await app.state()).cars.slice(1, 4).map(c => c.id);
  await app.open(`#/compare/${ids.join(',')}`);
  await expect(page.locator('.compare-col').first()).toHaveCSS('padding', '8px');
  await expect(page.locator('.compare-grid')).toHaveCSS('gap', '6px');
});

test('each line under Where the money goes opens to show how it is calculated', async ({ page, app }) => {
  await app.open('#/history');
  await page.locator('.row', { hasText: 'MondeoD' }).click();
  await expect(page.locator('.breakdown-hint')).toHaveText(
    "Monthly averages over 3 years, in today's money. Tap a line to see how it is calculated.",
  );
  const insurance = page.locator('.legend li', { hasText: 'Insurance' });
  await expect(insurance.locator('.legend-why')).toBeHidden();
  await insurance.locator('summary').click();
  await expect(insurance.locator('.legend-why')).toHaveText(/^As you entered it: [\d,]+ kr a month\.$/);
  const typed = (await insurance.locator('.legend-why').textContent()).match(/([\d,]+) kr a month/)[1];
  await expect(insurance.locator('.legend-val')).toHaveText(`${typed} kr`);
});
