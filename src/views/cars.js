// Garage (cars marked as mine), History (every car), a car's own page, and the comparison.
import { fmt } from '../i18n.js';
import {
  el,
  svg,
  ICONS,
  plate,
  evaluate,
  priceBlock,
  factsList,
  breakdownBar,
  carTitle,
  carSubline,
  assumptionBars,
  spanText,
} from '../ui.js';
import { money } from '../format.js';
import { compareResults } from '../compare.js';
import { answers } from './result.js';

export const MAX_COMPARE = 3;

function carRow(ctx, car, { selectable = false } = {}) {
  const { state, t } = ctx;
  const lang = state.lang;
  const r = evaluate(car, state.settings);
  const selected = ctx.ui.selected.has(car.id);
  const full = !selected && ctx.ui.selected.size >= MAX_COMPARE;

  const info = el(
    'div',
    { class: 'row-info' },
    car.plate ? plate(car.plate) : null,
    el('p', { class: 'row-name' }, carTitle(car, t)),
    el(
      'p',
      { class: 'row-sub' },
      carSubline(car, t, lang),
      car.mine && !ctx.route.startsWith('#/garage')
        ? el('span', { class: 'mine-tag' }, t.history.mine)
        : null,
    ),
  );
  const figures = el(
    'div',
    { class: 'row-figures' },
    el('p', { class: 'row-month' }, money(r.perMonth, lang), el('span', {}, ` ${t.result.perMonth}`)),
    el('p', { class: 'row-km' }, `${money(r.perKm, lang, 2)} ${t.result.perKm}`),
  );

  if (selectable) {
    return el(
      'li',
      {},
      el(
        'label',
        { class: `row selectable${selected ? ' selected' : ''}${full ? ' disabled' : ''}` },
        el('input', {
          type: 'checkbox',
          checked: selected,
          disabled: full,
          onchange: e => {
            if (e.target.checked) ctx.ui.selected.add(car.id);
            else ctx.ui.selected.delete(car.id);
            ctx.render();
          },
        }),
        el('span', { class: 'check' }, svg(ICONS.check)),
        info,
        figures,
      ),
    );
  }
  return el('li', {}, el('a', { class: 'row', href: `#/car/${encodeURIComponent(car.id)}` }, info, figures));
}

function emptyState(text, action, href) {
  return el(
    'div',
    { class: 'empty' },
    el('p', {}, text),
    el('a', { class: 'button secondary', href }, action),
  );
}

export function renderGarage(ctx) {
  const { state, t } = ctx;
  const cars = state.cars.filter(c => c.mine);
  return el(
    'div',
    { class: 'list-view' },
    el('header', { class: 'view-head' }, el('h1', {}, t.garage.title)),
    cars.length ? assumptionBars(ctx) : null,
    cars.length
      ? el(
          'ul',
          { class: 'rows' },
          cars.map(c => carRow(ctx, c)),
        )
      : emptyState(t.garage.empty, t.garage.emptyAction, '#/history'),
  );
}

export function renderHistory(ctx) {
  const { state, t } = ctx;
  const selecting = ctx.ui.selecting;
  const toggle = el(
    'button',
    {
      type: 'button',
      class: selecting ? 'link' : 'secondary small',
      onclick: () => {
        ctx.ui.selecting = !selecting;
        if (!ctx.ui.selecting) ctx.ui.selected.clear();
        ctx.render();
      },
    },
    selecting ? t.history.cancel : t.history.compare,
  );

  const n = ctx.ui.selected.size;
  const bar = selecting
    ? el(
        'div',
        { class: 'compare-bar' },
        el('p', {}, t.history.pick),
        el(
          'button',
          {
            type: 'button',
            class: 'primary',
            disabled: n < 2,
            onclick: () => ctx.go(`#/compare/${[...ctx.ui.selected].map(encodeURIComponent).join(',')}`),
          },
          fmt(t.history.compareN, { n }),
        ),
      )
    : null;

  return el(
    'div',
    { class: `list-view${selecting ? ' selecting' : ''}` },
    el(
      'header',
      { class: 'view-head' },
      el('h1', {}, t.history.title),
      state.cars.length > 1 ? toggle : null,
    ),
    state.cars.length ? assumptionBars(ctx) : null,
    state.cars.length
      ? el(
          'ul',
          { class: 'rows' },
          state.cars.map(c => carRow(ctx, c, { selectable: selecting })),
        )
      : emptyState(t.history.empty, t.history.emptyAction, '#/new'),
    bar,
  );
}

export function renderCar(ctx, id) {
  const { state, t } = ctx;
  const lang = state.lang;
  const car = state.cars.find(c => c.id === id);
  if (!car) {
    return el('div', { class: 'list-view' }, emptyState(t.car.notFound, t.history.title, '#/history'));
  }
  const r = evaluate(car, state.settings);
  const { bar, legend } = breakdownBar(r.parts, t, lang);

  const actions = el(
    'div',
    { class: 'actions stack' },
    el(
      'button',
      {
        type: 'button',
        class: car.mine ? 'secondary' : 'primary',
        onclick: () =>
          ctx.updateCar(car.id, { mine: !car.mine }, car.mine ? t.toast.removedGarage : t.toast.addedGarage),
      },
      car.mine ? t.car.removeGarage : t.car.addGarage,
    ),
    el('button', { type: 'button', class: 'secondary', onclick: () => ctx.editCar(car.id) }, t.car.edit),
    el(
      'button',
      { type: 'button', class: 'secondary', onclick: () => ctx.tryOtherMethod(car.id) },
      t.car.tryOther,
    ),
    state.cars.length > 1
      ? el(
          'button',
          {
            type: 'button',
            class: 'secondary',
            onclick: () => {
              ctx.ui.selecting = true;
              ctx.ui.selected = new Set([car.id]);
              ctx.go('#/history');
            },
          },
          t.car.compareWith,
        )
      : null,
    el(
      'button',
      {
        type: 'button',
        class: 'danger',
        onclick: () => {
          if (confirm(fmt(t.car.confirmDelete, { name: carTitle(car, t) }))) ctx.deleteCar(car.id);
        },
      },
      t.car.delete,
    ),
  );

  return el(
    'article',
    { class: 'car-view' },
    el(
      'a',
      { class: 'back', href: car.mine ? '#/garage' : '#/history' },
      svg(ICONS.back),
      car.mine ? t.garage.title : t.history.title,
    ),
    el(
      'header',
      { class: 'car-head' },
      car.plate ? plate(car.plate, 'md') : null,
      el('h1', {}, carTitle(car, t)),
      el(
        'p',
        { class: 'row-sub' },
        carSubline(car, t, lang),
        car.mine ? el('span', { class: 'mine-tag' }, t.car.inGarage) : null,
      ),
    ),
    priceBlock(r, t, lang),
    assumptionBars(ctx, car),
    factsList(r, car, t, lang, state.settings),
    el('h3', {}, t.result.breakdown),
    bar,
    legend,
    el('h3', { class: 'answers-title' }, t.car.answers),
    answers(car, t, lang, null),
    actions,
  );
}

export function renderCompare(ctx, ids) {
  const { state, t } = ctx;
  const lang = state.lang;
  const cars = ids
    .map(id => state.cars.find(c => c.id === id))
    .filter(Boolean)
    .slice(0, MAX_COMPARE);
  const results = cars.map(c => evaluate(c, state.settings));
  const { cheapest, extraPerMonth, mergedParts } = compareResults(results);

  const cols = cars.map((car, i) => {
    const r = results[i];
    const best = cheapest[i];
    const { bar } = breakdownBar(r.parts, t, lang);
    const diff = extraPerMonth[i];
    return el(
      'section',
      { class: `compare-col${best ? ' best' : ''}` },
      best
        ? el('p', { class: 'best-tag' }, t.compare.cheapest)
        : el('p', { class: 'best-tag placeholder' }, ''),
      car.plate ? plate(car.plate) : null,
      el('h2', {}, el('a', { href: `#/car/${encodeURIComponent(car.id)}` }, carTitle(car, t))),
      el('p', { class: 'row-sub' }, t.method[car.method]),
      priceBlock(r, t, lang, { compact: true }),
      diff > 0.5 ? el('p', { class: 'diff' }, fmt(t.compare.more, { amount: money(diff, lang) })) : null,
      el(
        'dl',
        { class: 'facts small' },
        el('div', {}, el('dt', {}, t.result.upfront), el('dd', {}, money(r.upfront, lang))),
        el('div', {}, el('dt', {}, t.result.cashOut), el('dd', {}, money(r.paidMonthly, lang))),
        el(
          'div',
          {},
          el('dt', {}, `${t.result.spent} (${spanText(r.months / 12, t, lang)})`),
          el('dd', {}, money(r.period, lang)),
        ),
        r.owned && r.residual > 0
          ? el(
              'div',
              {},
              el('dt', {}, fmt(t.result.residual, { span: spanText(r.months / 12, t, lang) })),
              el('dd', {}, money(r.residual, lang)),
            )
          : null,
      ),
      bar,
    );
  });

  // One legend for all columns, built from the parts any of the cars has.
  const { legend } = breakdownBar(mergedParts, t, lang);
  for (const v of legend.querySelectorAll('.legend-val')) v.remove();

  return el(
    'div',
    { class: 'compare-view' },
    el('a', { class: 'back', href: '#/history' }, svg(ICONS.back), t.history.title),
    el('header', { class: 'view-head' }, el('h1', {}, t.compare.title)),
    assumptionBars(ctx),
    el('div', { class: `compare-grid n${cols.length}` }, cols),
    legend,
  );
}
