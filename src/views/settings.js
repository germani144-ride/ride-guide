import { LANGS } from '../i18n.js';
import { parseNumber } from '../model.js';
import { DEFAULT_SETTINGS } from '../engine.js';
import { el, assumptionBars, toast } from '../ui.js';
import { plain, inputNumberText } from '../format.js';
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

  const section = key =>
    el(
      'section',
      { class: 'setting' },
      el('h2', {}, ts.groups[key][0]),
      ts.groups[key][1] ? el('p', { class: 'hint' }, ts.groups[key][1]) : null,
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
    section('energy'),
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
