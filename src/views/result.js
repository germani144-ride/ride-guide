// The wizard's last step (what the car costs, with save buttons) and the list of answers,
// which a car's own page shows too.
import { DRIVING_FIELDS, costFields, runningFields, toShown, switchOn } from '../model.js';
import { plain } from '../format.js';
import { labelKey } from '../wizard-flow.js';
import {
  el,
  euStrip,
  evaluate,
  priceBlock,
  factsList,
  breakdownBar,
  carTitle,
  assumptionBars,
} from '../ui.js';

export function renderResult(ctx, draft) {
  const { state, t } = ctx;
  const car = draft.car;
  const lang = state.lang;
  const r = evaluate(car, state.settings);
  const { bar, legend } = breakdownBar(r.parts, t, lang);
  const editing = Boolean(draft.editingId);

  const change = step => {
    draft.trail.push('result');
    draft.jump = true;
    draft.step = step;
    ctx.save();
    ctx.render({ animate: true });
  };

  return el(
    'div',
    { class: 'result' },
    el('h2', {}, t.steps.result.title),
    el(
      'div',
      { class: 'result-head' },
      car.plate
        ? el('span', { class: 'plate plate-md' }, euStrip(), el('span', { class: 'plate-text' }, car.plate))
        : null,
      el('p', { class: 'result-name' }, carTitle(car, t)),
    ),
    priceBlock(r, t, lang),
    assumptionBars(ctx, car),
    factsList(r, car, t, lang, state.settings),
    el('h3', {}, t.result.breakdown),
    bar,
    legend,
    answers(car, t, lang, change),
    el(
      'div',
      { class: 'actions stack' },
      editing
        ? el(
            'button',
            { type: 'button', class: 'primary', onclick: () => ctx.saveDraft({}) },
            t.result.saveChanges,
          )
        : [
            el(
              'button',
              { type: 'button', class: 'primary', onclick: () => ctx.saveDraft({ mine: true }) },
              t.result.saveMine,
            ),
            el(
              'button',
              { type: 'button', class: 'secondary', onclick: () => ctx.saveDraft({ mine: false }) },
              t.result.save,
            ),
          ],
    ),
  );
}

export function answers(car, t, lang, onChange) {
  const val = f => {
    const unit = t.fields[labelKey(f, car)][1];
    const n = toShown(f, car[f]);
    return `${plain(n, lang)}${unit ? ` ${unit}` : ''}`;
  };
  const row = f => el('div', {}, el('dt', {}, t.fields[labelKey(f, car)][0]), el('dd', {}, val(f)));
  const flag = key =>
    el('div', {}, el('dt', {}, t.switches[key][0]), el('dd', {}, switchOn(car, key) ? t.yes : t.no));
  const groups = [
    [
      'car',
      'plate',
      [
        el('div', {}, el('dt', {}, t.fields.name[0]), el('dd', {}, carTitle(car, t))),
        car.plate ? el('div', {}, el('dt', {}, t.fields.plate[0]), el('dd', {}, car.plate)) : null,
        el('div', {}, el('dt', {}, t.fields.year[0]), el('dd', {}, String(car.year || ''))),
        el('div', {}, el('dt', {}, t.fields.fuel[0]), el('dd', {}, t.fuel[car.fuel])),
      ],
    ],
    [
      'payment',
      'method',
      [
        el('div', {}, el('dt', {}, t.result.methodLabel), el('dd', {}, t.steps.method[car.method][0])),
        ...costFields(car).map(row),
        ...(car.method === 'lease'
          ? ['leaseFixed', 'serviceIncluded', 'tyresIncluded']
          : ['depreciationAuto']
        ).map(flag),
      ],
    ],
    ['driving', 'driving', DRIVING_FIELDS.map(row)],
    [
      'running',
      'running',
      [
        ...runningFields(car).map(row),
        car.method === 'lease' && switchOn(car, 'serviceIncluded') ? null : flag('maintenanceAuto'),
      ],
    ],
  ];
  return el(
    'div',
    { class: 'answers' },
    groups.map(([key, step, rows]) =>
      el(
        'section',
        { class: 'answer-group' },
        el(
          'div',
          { class: 'answer-head' },
          el('h3', {}, t.result.groups[key]),
          onChange
            ? el('button', { type: 'button', class: 'link', onclick: () => onChange(step) }, t.result.change)
            : null,
        ),
        el('dl', { class: 'facts small' }, rows),
      ),
    ),
  );
}
