// Swipe between tabs, with real touch events (Pixel 7 emulation has touch).
import { test, expect } from './fixtures.mjs';

// Drags one finger from (x, y) by (dx, dy) in small steps; `before(release)` runs before letting go.
async function drag(page, x, y, dx, dy, { steps = 12, before } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, px, py) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x: px, y: py }],
    });
  await touch('touchStart', x, y);
  for (let i = 1; i <= steps; i++) await touch('touchMove', x + (dx * i) / steps, y + (dy * i) / steps);
  if (before) await before();
  await touch('touchEnd');
}

const mid = async page => {
  const v = page.viewportSize();
  return { x: v.width / 2, y: v.height / 2 };
};

test('swiping left goes to the next tab, with a label that lights up past the threshold', async ({
  page,
  app,
}) => {
  await app.open('#/garage');
  const { x, y } = await mid(page);
  await drag(page, x + 80, y, -160, 4, {
    before: async () => {
      await expect(page.locator('.swipe-label')).toHaveText('History ›');
      await expect(page.locator('.swipe-label')).toHaveClass(/armed/);
      await expect(page.locator('#tabs a[href="#/history"]')).toHaveClass(/swipe-armed/);
    },
  });
  await expect(page).toHaveURL(/#\/history$/);
  await expect(page.locator('#tabs a[aria-current="page"]')).toHaveText('History');
  await expect(page.locator('.swipe-label')).not.toHaveClass(/show/);

  // and right, back to the previous tab
  await drag(page, x - 80, y, 160, 0);
  await expect(page).toHaveURL(/#\/garage$/);
});

test('a short swipe springs back and stays on the tab', async ({ page, app }) => {
  await app.open('#/garage');
  const { x, y } = await mid(page);
  await drag(page, x, y, -50, 0, {
    before: async () => {
      await expect(page.locator('.swipe-label')).toHaveText('History ›');
      await expect(page.locator('.swipe-label')).not.toHaveClass(/armed/);
    },
  });
  await page.waitForTimeout(350);
  await expect(page).toHaveURL(/#\/garage$/);
  await expect(page.locator('#view')).not.toHaveAttribute('style', /translateX\((?!0)/);
});

test('at the last tab the page resists and nothing switches', async ({ page, app }) => {
  await app.open('#/history');
  const { x, y } = await mid(page);
  await drag(page, x + 100, y, -200, 0, {
    before: async () => {
      const shift = await page
        .locator('#view')
        .evaluate(v => new DOMMatrix(getComputedStyle(v).transform).m41);
      expect(Math.abs(shift)).toBeLessThanOrEqual(24);
      await expect(page.locator('.swipe-label')).not.toHaveClass(/show/);
    },
  });
  await page.waitForTimeout(350);
  await expect(page).toHaveURL(/#\/history$/);
});

test('scrolling down, or a sideways drag that is mostly vertical, is not a swipe', async ({ page, app }) => {
  await app.open('#/history');
  const { x, y } = await mid(page);
  await drag(page, x, y + 150, -30, -300);
  await page.waitForTimeout(350);
  await expect(page).toHaveURL(/#\/history$/);
  await drag(page, x + 80, y, -100, 90); // 12px vertical comes first
  await page.waitForTimeout(350);
  await expect(page).toHaveURL(/#\/history$/);
});

test('swiping in a field, in the wizard, or on the year and km choices does nothing', async ({
  page,
  app,
}) => {
  // Inside the wizard, in a field
  await app.open('#/new');
  await page.getByRole('button', { name: /Not yet/ }).click();
  const name = await page.locator('#f-name').boundingBox();
  await drag(page, name.x + name.width - 20, name.y + name.height / 2, -200, 0);
  await page.waitForTimeout(350);
  await expect(page).toHaveURL(/#\/new$/);
  await expect(page.locator('#f-name')).toBeVisible();

  // On the years-of-ownership choices (marked data-noswipe)
  await app.open('#/history');
  const bar = await page.locator('.span-field').first().boundingBox();
  await drag(page, bar.x + bar.width - 20, bar.y + bar.height - 15, 200, 0);
  await page.waitForTimeout(350);
  await expect(page).toHaveURL(/#\/history$/);
});

test.describe('with reduced motion', () => {
  test('the tab still switches, without the slide', async ({ page, app }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await app.open('#/garage');
    const { x, y } = await mid(page);
    await drag(page, x - 80, y, 160, 0);
    await expect(page).toHaveURL(/#\/new$/);
    await expect(page.locator('#view')).not.toHaveClass(/swipe-in/);
  });
});

test('the bottom bar is updated in place, not rebuilt, so it does not flicker', async ({ page, app }) => {
  await app.open('#/history');
  await page.locator('#tabs a[href="#/garage"]').evaluate(a => (a.dataset.marker = 'same'));
  await page.locator('#tabs').getByRole('link', { name: 'Garage' }).click();
  await expect(page.locator('#tabs a[aria-current="page"]')).toHaveText('Garage');
  await page.locator('#tabs').getByRole('link', { name: 'New car' }).click();
  await expect(page.locator('#tabs a[aria-current="page"]')).toHaveText('New car');
  await expect(page.locator('#tabs a[data-marker="same"]')).toHaveCount(1);
  await expect(page.locator('#tabs a[aria-current]')).toHaveCount(1);
  const flash = await page
    .locator('#tabs a')
    .first()
    .evaluate(a => getComputedStyle(a).webkitTapHighlightColor);
  expect(flash).toBe('rgba(0, 0, 0, 0)');
});
