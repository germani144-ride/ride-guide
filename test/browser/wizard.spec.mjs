import { test, expect } from './fixtures.mjs';

test('add a car through the wizard and save it as my car', async ({ page, app }) => {
  await app.open('#/new');
  await expect(page.getByRole('heading', { name: 'What will this car really cost you?' })).toBeVisible();
  await expect(page.locator('.step-count')).toHaveText('Step 1 of 7');

  await page.getByRole('button', { name: /Not yet/ }).click();
  await page.locator('#f-name').fill('Test Hatchback');
  await page.locator('#f-year').fill('2026');
  await page.getByRole('radio', { name: 'Petrol' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByRole('button', { name: /Pay upfront/ }).click();
  await expect(page.getByRole('heading', { name: 'What does it cost?' })).toBeVisible();
  // Leaving the price empty is not allowed.
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('#err-price')).toHaveText('Fill this in to continue.');
  await page.locator('#f-price').fill('250.000');
  await page.getByRole('button', { name: 'Next' }).click();

  await page.locator('#f-kmPerUnit').fill('16');
  await page.getByRole('button', { name: 'Next' }).click();

  await page.locator('#f-insuranceMo').fill('500');
  await page.locator('#f-greenTaxMo').fill('1200'); // per half year
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('heading', { name: 'Here is what it costs' })).toBeVisible();
  await expect(page.locator('.price-num')).toHaveText('5,863');
  await expect(page.locator('.price-sub-num')).toHaveText('7.04');
  await expect(page.locator('.facts').first()).toContainText('250,000 kr');

  await page.getByRole('button', { name: 'Save as my car' }).click();
  await expect(page.locator('.toast')).toHaveText('Saved to your garage');
  await expect(page.getByRole('heading', { name: 'Test Hatchback' })).toBeVisible();
  await app.saved();
  const car = (await app.state()).cars[0];
  expect(car).toMatchObject({
    name: 'Test Hatchback',
    method: 'cash',
    price: 250000,
    mine: true,
    greenTaxMo: 200,
  });

  await page.locator('#tabs').getByRole('link', { name: 'Garage' }).click();
  await expect(page.locator('.rows li')).toHaveCount(1);
  await expect(page.locator('.row-name')).toHaveText('Test Hatchback');
});

test('a lease asks its own terms and switches', async ({ page, app }) => {
  await app.open('#/new');
  await page.getByRole('button', { name: /Not yet/ }).click();
  await page.locator('#f-name').fill('Lease Car');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: /^Lease/ }).click();
  await expect(page.getByRole('heading', { name: 'What are the lease terms?' })).toBeVisible();
  await expect(page.locator('#s-serviceIncluded')).toBeChecked();
  await expect(page.locator('#s-tyresIncluded')).not.toBeChecked();
  await page.locator('#f-leaseMo').fill('3000');
  await page.locator('#f-yearsOfUse').fill('3');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.locator('#f-kmPerUnit').fill('15');
  await page.getByRole('button', { name: 'Next' }).click();
  // With service in the lease, maintenance is not asked.
  await expect(page.locator('#s-maintenanceAuto')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.price-sub-num')).toHaveText('5.00');
});

test('a fixed lease keeps its own period and its full one-time payment', async ({ page, app }) => {
  await app.open('#/history');
  await page.locator('.span-field').nth(0).getByRole('radio', { name: '1', exact: true }).click();
  await page.locator('.row', { hasText: 'Y GM' }).click();
  // The years bar is replaced by the lease's own period.
  await expect(page.locator('.span-locked')).toHaveText('Fixed by the lease: 3 years');
  const facts = page.locator('.facts').first();
  await expect(facts).toContainText('Paid up front11,500 kr');
  await expect(facts).toContainText('Total (3 years)');
});

test('a flexible lease asks its shortest and longest period and stays within them', async ({ page, app }) => {
  await app.open('#/new');
  await page.getByRole('button', { name: /Not yet/ }).click();
  await page.locator('#f-name').fill('Subscription Car');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: /^Lease/ }).click();
  await page.locator('#f-leaseMo').fill('4000');
  await page.locator('#f-oneTimePayment').fill('5000');
  await expect(page.locator('#f-yearsOfUse')).toBeVisible();
  await page.locator('label[for="s-leaseFixed"]').click();
  await expect(page.locator('#f-yearsOfUse')).toHaveCount(0);
  await page.locator('#f-leaseMinYears').fill('2');
  await page.locator('#f-leaseMaxYears').fill('1');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('#err-leaseMaxYears')).toHaveText(
    'The longest period must be at least the shortest.',
  );
  await page.locator('#f-leaseMinYears').fill('1');
  await page.locator('#f-leaseMaxYears').fill('2');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.locator('#f-kmPerUnit').fill('6');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  // Years of ownership is 3 by default; this lease can only run up to 2.
  await expect(page.locator('.span-hint')).toHaveText(
    'This lease can run 1–2 years, so it is shown for 2 years.',
  );
  await expect(page.locator('.facts').first()).toContainText('Paid up front5,000 kr');
  await expect(page.locator('.facts').first()).toContainText('Total (2 years)');
  // Only the years the lease can run can be picked; the one used is highlighted.
  const years = page.locator('.span-field').nth(0);
  await expect(years.getByRole('radio', { name: '3', exact: true })).toBeDisabled();
  await expect(years.getByRole('radio', { name: '10', exact: true })).toBeDisabled();
  await expect(years.getByRole('radio', { name: '2', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.locator('.span-field').nth(0).getByRole('radio', { name: '1', exact: true }).click();
  await expect(page.locator('.span-hint')).toHaveText(
    'This lease can run 1–2 years, so it is shown for 1 year.',
  );
  await expect(page.locator('.facts').first()).toContainText('Paid up front5,000 kr');
});

test('a market value different from the price sets the value at the end', async ({ page, app }) => {
  await app.open('#/new');
  await page.getByRole('button', { name: /Not yet/ }).click();
  await page.locator('#f-name').fill('Good Deal');
  await page.locator('#f-year').fill('2026');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: /Pay upfront/ }).click();
  await page.locator('#f-price').fill('200000');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.locator('#f-kmPerUnit').fill('16');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  const facts = page.locator('.facts').first();
  const sameAsPrice = await facts.locator('div', { hasText: 'Value after' }).locator('dd').textContent();
  await expect(page.locator('.answers')).toContainText('Market valueSame as the price');

  // Change the payment answers: same price, but the car is worth 10% more.
  await page.locator('.answer-group').nth(1).getByRole('button', { name: 'Change' }).click();
  await page.locator('button.choice', { hasText: 'Pay upfront' }).click();
  await page.locator('#f-marketValue').fill('220000');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.answers')).toContainText('Market value220,000 kr');
  await expect(facts).toContainText('Paid up front200,000 kr');
  const parse = s => Number(s.replace(/[^\d]/g, ''));
  const withMarket = await facts.locator('div', { hasText: 'Value after' }).locator('dd').textContent();
  expect(Math.abs(parse(withMarket) / parse(sameAsPrice) - 1.1)).toBeLessThan(0.001);
});
