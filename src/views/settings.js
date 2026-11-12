import { LANGS } from '../i18n.js';
import { parseNumber, sanitizePlateKey } from '../model.js';
import { DEFAULT_SETTINGS } from '../engine.js';
import { el, assumptionBars, toast } from '../ui.js';
import { plain, money, inputNumberText } from '../format.js';
import { fmt } from '../i18n.js';
import { AREAS, homePrice } from '../prices.js';
import { fetchServedVersion, forceUpdate } from '../update.js';

const LANG_NAMES = { en: 'English', da: 'Dansk' };

// [setting key, unit key, stored as a fraction]
const GROUPS = {
  money: [
    ['returnRate', 'pctYear', true],
    ['buffer', 'pct', true],
  ],
  running: [
    ['tyreSetPrice', 'kr', false],
    ['tyreLifeKm', 'km', false],
    ['tyreLifeKmEv', 'km', false],
    ['winterTyres'],
    ['tyreSwapPrice', 'kr', false],
    ['washingMo', 'krMonth', false],
  ],
  energy: [
    ['petrolPrice', 'krLitre', false],
    ['dieselPrice', 'krLitre', false],
    ['homeElPrice', 'krKwh', false],
    ['evPublicPrice', 'krKwh', false],
    ['evPublicShare', 'pct', true],
    ['evWinterExtra', 'pct', true],
    ['energyGrowth', 'pctYear', true],
  ],
};

export function renderSettings(ctx) {
  const { state, t } = ctx;
  const lang = state.lang;
  const s = state.settings;
  const ts = t.settings;

  const langs = el(
    'div',
    { class: 'segmented', role: 'radiogroup', 'aria-label': ts.language },
    LANGS.map(l =>
      el(
        'button',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': String(l === lang),
          onclick: () => {
            state.lang = l;
            ctx.save();
            ctx.render();
          },
        },
        LANG_NAMES[l],
      ),
    ),
  );

  const field = ([key, unit, fraction]) => {
    const [label, help] = ts.fields[key];
    const id = `set-${key}`;
    if (typeof DEFAULT_SETTINGS[key] === 'boolean') {
      return el(
        'div',
        { class: 'field switch-field' },
        el(
          'label',
          { class: 'switch', for: id },
          el('input', {
            id,
            type: 'checkbox',
            role: 'switch',
            checked: s[key],
            onchange: e => {
              s[key] = e.target.checked;
              ctx.save();
              toast(ts.saved);
            },
          }),
          el('span', { class: 'switch-text' }, label),
        ),
        help ? el('p', { class: 'hint' }, help) : null,
      );
    }
    const shown = fraction ? s[key] * 100 : s[key];
    const def = fraction ? DEFAULT_SETTINGS[key] * 100 : DEFAULT_SETTINGS[key];
    return el(
      'div',
      { class: 'field' },
      el('label', { for: id }, label),
      el(
        'div',
        { class: 'input-wrap setting-input' },
        el('input', {
          id,
          type: 'text',
          inputmode: 'decimal',
          value: inputNumberText(shown, lang),
          placeholder: inputNumberText(def, lang),
          oninput: e => {
            const v = parseNumber(e.target.value);
            s[key] = v == null || v < 0 ? DEFAULT_SETTINGS[key] : fraction ? v / 100 : v;
            ctx.save();
          },
          // Saved while typing; confirm when the field is left or Enter is pressed.
          onchange: () => toast(ts.saved),
          onkeydown: e => {
            if (e.key === 'Enter') e.target.blur();
          },
        }),
        el('span', { class: 'unit' }, ts.units[unit]),
      ),
      el(
        'p',
        { class: 'hint' },
        help ? `${help} ` : '',
        `${ts.defaultIs} ${plain(def, lang)}${lang === 'en' && unit.startsWith('pct') ? '' : ' '}${ts.units[unit]}.`,
      ),
    );
  };

  const file = el('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'visually-hidden',
    id: 'import-file',
    onchange: e => {
      const f = e.target.files?.[0];
      if (f) ctx.importBackup(f);
      e.target.value = '';
    },
  });

  const section = (key, top = null) =>
    el(
      'section',
      { class: 'setting' },
      el('h2', {}, ts.groups[key][0]),
      ts.groups[key][1] ? el('p', { class: 'hint' }, ts.groups[key][1]) : null,
      top,
      GROUPS[key].map(field),
    );

  return el(
    'div',
    { class: 'settings-view' },
    el('header', { class: 'view-head' }, el('h1', {}, ts.title)),
    el('p', { class: 'hint' }, ts.autoSave),
    el('section', { class: 'setting' }, el('h2', {}, ts.language), langs),
    el(
      'section',
      { class: 'setting' },
      el('h2', {}, ts.groups.span[0]),
      el('p', { class: 'hint' }, ts.groups.span[1]),
      assumptionBars(ctx),
    ),
    section('money'),
    section('running'),
    section('energy', fetchLatest(ctx)),
    pricesSection(ctx),
    plateSection(ctx),
    el(
      'section',
      { class: 'setting' },
      el('h2', {}, ts.data),
      el('p', { class: 'hint' }, ts.dataHint),
      el(
        'div',
        { class: 'actions stack' },
        el('button', { type: 'button', class: 'secondary', onclick: () => ctx.exportBackup() }, ts.export),
        el('label', { class: 'button secondary', for: 'import-file' }, ts.import, file),
      ),
    ),
    el('p', { class: 'version' }, `RideGuide ${ctx.version}`),
    updateButton(ts),
  );
}

// "Fetch latest" at the top of Fuel and electricity, with what was fetched and when.
function fetchLatest(ctx) {
  const { state } = ctx;
  const lang = state.lang;
  const p = state.prices;
  const s = state.settings;
  const tp = ctx.t.settings.prices;
  const kr = v => money(v, lang, 2);

  const status = () => {
    if (!p.updatedAt) return [tp.never];
    const when = new Date(p.updatedAt).toLocaleString(lang === 'da' ? 'da-DK' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    const lines = [fmt(tp.updated, { when })];
    lines.push(fmt(tp.fuel, { petrol: kr(s.petrolPrice), diesel: kr(s.dieselPrice) }));
    if (p.spot > 0)
      lines.push(
        fmt(tp.el, { home: kr(s.homeElPrice), spot: kr(p.spot), area: p.area, addOn: kr(p.elAddOn) }),
      );
    return lines;
  };

  const btn = el(
    'button',
    {
      type: 'button',
      class: 'secondary',
      onclick: async () => {
        btn.disabled = true;
        btn.textContent = tp.fetching;
        const got = await ctx.updatePrices({ force: true });
        const found = [got?.petrol, got?.diesel, got?.spot].filter(v => v != null).length;
        toast(found === 3 ? tp.done : found ? tp.partial : tp.failed);
        if (!found) {
          btn.disabled = false;
          btn.textContent = tp.fetch;
        }
      },
    },
    tp.fetch,
  );

  return el(
    'div',
    { class: 'fetch-latest' },
    el('div', { class: 'actions' }, btn),
    el(
      'div',
      { class: 'price-status', role: 'status' },
      status().map(line => el('p', { class: 'hint' }, line)),
    ),
  );
}

// Today's prices: automatic updates, the electricity price area and the add-on.
function pricesSection(ctx) {
  const { state } = ctx;
  const lang = state.lang;
  const p = state.prices;
  const s = state.settings;
  const tp = ctx.t.settings.prices;

  const area = el(
    'div',
    { class: 'segmented', role: 'radiogroup', 'aria-label': tp.area },
    AREAS.map(a =>
      el(
        'button',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': String(a === p.area),
          onclick: async () => {
            if (p.area === a) return;
            p.area = a;
            p.updatedAt = ''; // the old spot price was for the other area
            ctx.save();
            ctx.render();
            if (p.auto) await ctx.updatePrices({ force: true });
          },
        },
        tp.areas[a],
      ),
    ),
  );

  return el(
    'section',
    { class: 'setting' },
    el('h2', {}, tp.title),
    el(
      'div',
      { class: 'field switch-field' },
      el(
        'label',
        { class: 'switch', for: 'set-pricesAuto' },
        el('input', {
          id: 'set-pricesAuto',
          type: 'checkbox',
          role: 'switch',
          checked: p.auto,
          onchange: e => {
            p.auto = e.target.checked;
            ctx.save();
            toast(ctx.t.settings.saved);
            if (p.auto) ctx.updatePrices();
          },
        }),
        el('span', { class: 'switch-text' }, tp.auto),
      ),
      el('p', { class: 'hint' }, tp.autoHint),
    ),
    el('div', { class: 'field' }, el('label', {}, tp.area), area),
    el(
      'div',
      { class: 'field' },
      el('label', { for: 'set-elAddOn' }, tp.addOn),
      el(
        'div',
        { class: 'input-wrap setting-input' },
        el('input', {
          id: 'set-elAddOn',
          type: 'text',
          inputmode: 'decimal',
          value: inputNumberText(p.elAddOn, lang),
          placeholder: inputNumberText(0.55, lang),
          oninput: e => {
            const v = parseNumber(e.target.value);
            p.elAddOn = v == null || v < 0 ? 0.55 : v;
            // With a fetched spot price, the home price follows the add-on right away.
            if (p.spot > 0) s.homeElPrice = homePrice(p.spot, p.elAddOn);
            ctx.save();
          },
          onchange: () => {
            toast(ctx.t.settings.saved);
            ctx.render();
          },
          onkeydown: e => {
            if (e.key === 'Enter') e.target.blur();
          },
        }),
        el('span', { class: 'unit' }, ctx.t.settings.units.krKwh),
      ),
      el('p', { class: 'hint' }, tp.addOnHint),
    ),
    el('p', { class: 'hint' }, tp.credit),
  );
}

// The user's own key for the plate lookup, and where the data comes from.
function plateSection(ctx) {
  const { state } = ctx;
  const tp = ctx.t.settings.plate;
  const link = (href, text) => el('a', { href, target: '_blank', rel: 'noopener' }, text);
  return el(
    'section',
    { class: 'setting' },
    el('h2', {}, tp.title),
    el('p', { class: 'hint' }, tp.hint),
    el(
      'div',
      { class: 'field' },
      el('label', { for: 'set-plateKey' }, tp.key),
      el(
        'div',
        { class: 'input-wrap' },
        el('input', {
          id: 'set-plateKey',
          type: 'text',
          value: state.plateKey,
          autocomplete: 'off',
          autocapitalize: 'off',
          spellcheck: 'false',
          maxlength: '200',
          oninput: e => {
            state.plateKey = sanitizePlateKey(e.target.value);
            ctx.save();
          },
          onchange: () => toast(ctx.t.settings.saved),
          onkeydown: e => {
            if (e.key === 'Enter') e.target.blur();
          },
        }),
      ),
      el('p', { class: 'hint' }, tp.keyHint),
    ),
    el('p', { class: 'hint' }, link('https://nummerplade-tjek.dk/api-registrering/', tp.getKey)),
    el('p', { class: 'hint' }, `${tp.credit} `, link('https://autotelli.dk', 'autotelli.dk'), '.'),
  );
}

function updateButton(ts) {
  const current = String(globalThis.RIDEGUIDE_VERSION ?? '');
  const btn = el(
    'button',
    {
      type: 'button',
      class: 'secondary small update-button',
      onclick: async () => {
        btn.textContent = ts.checking;
        btn.disabled = true;
        const latest = await fetchServedVersion();
        btn.textContent = ts.checkUpdates;
        btn.disabled = false;
        if (!latest) {
          alert(ts.unreachable);
          return;
        }
        if (latest === current) {
          alert(ts.upToDate.replace('{v}', current));
          return;
        }
        if (!confirm(ts.updateAvailable.replace('{latest}', latest).replace('{v}', current))) return;
        btn.textContent = ts.updating;
        btn.disabled = true;
        await forceUpdate();
      },
    },
    ts.checkUpdates,
  );
  return el('div', { class: 'update-row' }, btn);
}
