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

// Every frame while swiping: the page is never wider than the screen (which made Chrome re-fit
// the page and push the fixed bottom bar below the screen edge), and the bar stays at the bottom.
test('swiping never makes the page wider than the screen, and the bottom bar stays put', async ({
  page,
  app,
}) => {
  const startWatch = () =>
    page.evaluate(() => {
      window.__bad = [];
      window.__frames = 0;
      const tick = () => {
        const doc = document.documentElement;
        const bar = document.getElementById('tabs').getBoundingClientRect();
        const width = window.innerWidth;
        if (doc.scrollWidth > width) window.__bad.push(`scrollWidth ${doc.scrollWidth} > ${width}`);
        if (Math.abs(bar.bottom - window.innerHeight) > 1)
          window.__bad.push(`bar bottom ${bar.bottom} vs screen ${window.innerHeight}`);
        window.__frames++;
        window.__raf = requestAnimationFrame(tick);
      };
      tick();
    });
  const stopWatch = async () => {
    await page.waitForTimeout(400); // let the slide-in and spring-back finish
    return page.evaluate(() => {
      cancelAnimationFrame(window.__raf);
      return { bad: [...new Set(window.__bad)], frames: window.__frames };
    });
  };
  const { x, y } = await mid(page);
  const check = async (label, swipes) => {
    await startWatch();
    for (const [dx, opts] of swipes) await drag(page, x - dx / 2, y, dx, 0, opts);
    const { bad, frames } = await stopWatch();
    expect(frames, label).toBeGreaterThan(5);
    expect(bad, label).toEqual([]);
  };

  await app.open('#/garage');
  const slow = { steps: 30 };
  const fast = { steps: 3 };
  await check('slow, both ways', [
    [-220, slow], // to History
    [220, slow], // back to Garage
  ]);
  await check('fast, both ways', [
    [-220, fast],
    [220, fast],
  ]);
  await check('short swipes that spring back', [
    [-50, slow],
    [50, slow],
  ]);

  // scrolled down on a long page
  await app.open('#/history');
  await page.evaluate(() => window.scrollTo(0, 400));
  await check('scrolled down: resisting at the last tab, then to Garage', [
    [-220, slow],
    [220, fast],
  ]);
  await expect(page).toHaveURL(/#\/garage$/);
});
