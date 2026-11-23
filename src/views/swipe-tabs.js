// Swipe between tabs: the page follows the finger, a label at the screen edge names the tab it
// leads to, and letting go past the threshold switches tab. Passive touch listeners only, no
// library; the rules for which tab and when are in src/swipe.js.
import { swipeTarget, readGesture, swipeOffset } from '../swipe.js';

// Where a swipe never starts: fields, the bottom and top bars, forms and dialogs (the wizard's
// steps are forms), and anything marked data-noswipe (bars and charts that take their own taps).
const NO_SWIPE =
  'input, select, textarea, [contenteditable], [role="slider"], form, dialog, [role="dialog"], ' +
  '.tabs, .topbar, [data-noswipe]';

// Listens on the whole page (a short page leaves empty space below the view), and moves `view`.
// `view`: the element that moves. `context()` → { tab, blocked } for the page now on screen
// (tab: 'new' | 'garage' | 'history' | null; blocked: true inside the wizard).
// `labelFor(tab, dir)` → the edge label's text. `go(tab, dir)` switches tab.
export function swipeTabs(view, { context, labelFor, go }) {
  const label = document.createElement('div');
  label.className = 'swipe-label';
  label.setAttribute('aria-hidden', 'true');
  document.body.append(label);

  let g = null; // the gesture in progress: { x0, y0, state, tab, target, dir, armed }

  const tabButton = tab => document.querySelector(`#tabs a[href="#/${tab}"]`);
  const clearArmed = () =>
    document.querySelectorAll('#tabs .swipe-armed').forEach(a => a.classList.remove('swipe-armed'));

  const draw = (x, opacity) => {
    view.style.transform = x ? `translateX(${x}px)` : '';
    view.style.opacity = opacity < 1 ? String(opacity) : '';
  };

  const springBack = () => {
    view.classList.add('swipe-return');
    draw(0, 1);
    view.addEventListener('transitionend', () => view.classList.remove('swipe-return'), { once: true });
    setTimeout(() => view.classList.remove('swipe-return'), 300); // in case no transition ran
  };

  const end = () => {
    label.className = 'swipe-label';
    clearArmed();
    g = null;
  };

  const cancel = () => {
    if (g?.state === 'swipe') springBack();
    end();
  };

  document.addEventListener(
    'touchstart',
    e => {
      g = null;
      if (e.touches.length !== 1) return;
      if (e.target.closest?.(NO_SWIPE)) return;
      const { tab, blocked } = context();
      if (!tab || blocked) return;
      const p = e.touches[0];
      g = { x0: p.clientX, y0: p.clientY, state: 'pending', tab, target: null, dir: null, armed: false };
    },
    { passive: true },
  );

  document.addEventListener(
    'touchmove',
    e => {
      if (!g) return;
      if (e.touches.length !== 1) return cancel(); // a second finger: pinch or zoom, not a swipe
      const p = e.touches[0];
      const dx = p.clientX - g.x0;
      const dy = p.clientY - g.y0;
      if (g.state === 'pending') {
        const read = readGesture(dx, dy);
        if (read === 'scroll') return end();
        if (read === 'pending') return;
        g.state = 'swipe';
        view.classList.remove('swipe-return', 'swipe-in-left', 'swipe-in-right');
      }
      const dir = dx < 0 ? 'next' : 'prev';
      if (dir !== g.dir) {
        g.dir = dir;
        g.target = swipeTarget(g.tab, dir);
        clearArmed();
        label.textContent = g.target ? labelFor(g.target, dir) : '';
      }
      const { x, armed } = swipeOffset(dx, Boolean(g.target));
      g.armed = armed;
      draw(x, 1 - Math.min(Math.abs(x) / 600, 0.25));
      label.className = `swipe-label ${dir === 'next' ? 'right' : 'left'}${g.target ? ' show' : ''}${armed ? ' armed' : ''}`;
      tabButton(g.target)?.classList.toggle('swipe-armed', armed);
    },
    { passive: true },
  );

  document.addEventListener(
    'touchend',
    () => {
      if (!g || g.state !== 'swipe') return end();
      const { armed, target, dir } = g;
      end();
      if (armed && target) {
        draw(0, 1);
        go(target, dir);
      } else springBack();
    },
    { passive: true },
  );
  document.addEventListener('touchcancel', cancel, { passive: true });
}
