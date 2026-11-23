// The bottom tab bar (New car, Garage, History) and the settings link in the top bar.
import { el, svg, ICONS } from '../ui.js';
import { activeTab } from '../routes.js';

import { TAB_ORDER } from '../swipe.js';

// In TAB_ORDER, which swiping between tabs follows too.
const ICON = { new: ICONS.plus, garage: ICONS.garage, history: ICONS.history };
const TABS = TAB_ORDER.map(key => [`#/${key}`, key, ICON[key]]);

// `carIsMine`: whether the car on a #/car/ page is in the garage (its page then belongs to Garage).
// The bar is built once and then only updated: rebuilding it on every tab change made it flicker
// (the tapped link vanished mid-tap, so Android's tap highlight flashed for a frame).
export function renderTabs(route, t, carIsMine) {
  const tabs = document.getElementById('tabs');
  const settingsLink = document.getElementById('settings-link');
  const active = activeTab(route, carIsMine);
  if (tabs.children.length !== TABS.length) {
    tabs.replaceChildren(
      ...TABS.map(([href, key, icon]) =>
        el('a', { href, class: 'tab', 'data-tab': key }, svg(icon), el('span', {}, '')),
      ),
    );
  }
  for (const a of tabs.children) {
    const key = a.dataset.tab;
    if (key === active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
    const label = a.querySelector('span');
    if (label.textContent !== t.nav[key]) label.textContent = t.nav[key];
  }
  settingsLink.setAttribute('aria-label', t.nav.settings);
  settingsLink.setAttribute('aria-current', route.startsWith('#/settings') ? 'page' : 'false');
}
