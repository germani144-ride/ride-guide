// The bottom tab bar (New car, Garage, History) and the settings link in the top bar.
import { el, svg, ICONS } from '../ui.js';
import { activeTab } from '../routes.js';

import { TAB_ORDER } from '../swipe.js';

// In TAB_ORDER, which swiping between tabs follows too.
const ICON = { new: ICONS.plus, garage: ICONS.garage, history: ICONS.history };
const TABS = TAB_ORDER.map(key => [`#/${key}`, key, ICON[key]]);

// `carIsMine`: whether the car on a #/car/ page is in the garage (its page then belongs to Garage).
export function renderTabs(route, t, carIsMine) {
  const tabs = document.getElementById('tabs');
  const settingsLink = document.getElementById('settings-link');
  const active = activeTab(route, carIsMine);
  tabs.replaceChildren(
    ...TABS.map(([href, key, icon]) =>
      el(
        'a',
        { href, class: 'tab', 'aria-current': key === active ? 'page' : null },
        svg(icon),
        el('span', {}, t.nav[key]),
      ),
    ),
  );
  settingsLink.setAttribute('aria-label', t.nav.settings);
  settingsLink.setAttribute('aria-current', route.startsWith('#/settings') ? 'page' : 'false');
}
