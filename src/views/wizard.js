// "New car": the landing page. A decision tree that asks one thing per screen, starting with the
// most general question (do you have the plate?). Which step comes next and what each step asks
// lives in ../wizard-flow.js; this file draws the steps.
import { METHODS, formatPlate, validate } from '../model.js';
import {
  FIRST_STEP,
  newDraft,
  stepProgress,
  nextStep,
  stepAfterPlateAnswer,
  choosePaymentMethod,
  stepFields,
  stepItems,
  labelKey,
} from '../wizard-flow.js';
import { fmt } from '../i18n.js';
import { el, svg, ICONS, euStrip, carTitle } from '../ui.js';
import { choiceList, textField, numberField, switchField, fuelPicker } from './fields.js';
import { renderResult } from './result.js';

export function renderWizard(ctx) {
  const { state, t } = ctx;
  if (!state.draft) state.draft = newDraft();
  const draft = state.draft;
  const car = draft.car;
  const { n, total } = stepProgress(draft);

  const goTo = step => {
    draft.trail.push(draft.step);
    draft.step = step;
    if (step === 'result') draft.jump = false;
    ctx.save();
    ctx.render({ animate: true });
  };
  const back = () => {
    if (!draft.trail.length) return;
    draft.step = draft.trail.pop();
    ctx.save();
    ctx.render({ animate: true, back: true });
  };
  const advance = () => goTo(nextStep(draft));

  // ----- header: progress and escape hatch -----
  const editing = draft.editingId ? state.cars.find(c => c.id === draft.editingId) : null;
  const head = el(
    'div',
    { class: 'wizard-head' },
    el('p', { class: 'step-count' }, fmt(t.wizard.stepOf, { n, total })),
    el(
      'button',
      {
        type: 'button',
        class: 'link',
        onclick: () => {
          state.draft = null;
          ctx.save();
          editing ? ctx.go(`#/car/${editing.id}`) : ctx.render();
        },
      },
      editing ? t.wizard.discard : t.wizard.startOver,
    ),
  );
  const track = el(
    'div',
    {
      class: 'track',
      role: 'progressbar',
      'aria-valuemin': '1',
      'aria-valuemax': String(total),
      'aria-valuenow': String(n),
    },
    el('span', { style: `width:${(n / total) * 100}%` }),
  );

  const body = el('section', { class: 'step', 'aria-live': 'polite' });
  const intro =
    !editing && draft.step === FIRST_STEP && !draft.trail.length
      ? el('header', { class: 'intro' }, el('h1', {}, t.intro.title), el('p', {}, t.intro.sub))
      : editing
        ? el('p', { class: 'editing' }, fmt(t.wizard.editing, { name: carTitle(editing, t) }))
        : null;

  // ----- step content -----
  if (draft.step === 'plate') {
    body.append(
      el('h2', {}, t.steps.plate.title),
      choiceList(
        ['yes', 'no'],
        k => t.steps.plate[k],
        draft.hasPlate,
        k => {
          draft.hasPlate = k;
          if (k === 'no') car.plate = '';
          goTo(stepAfterPlateAnswer(draft));
        },
      ),
    );
  } else if (draft.step === 'method') {
    body.append(
      el('h2', {}, t.steps.method.title),
      choiceList(
        METHODS,
        k => t.steps.method[k],
        draft.editingId || draft.jump ? car.method : null,
        k => {
          choosePaymentMethod(car, k);
          advance();
        },
      ),
    );
  } else if (draft.step === 'result') {
    body.append(renderResult(ctx, draft));
  } else {
    body.append(renderForm(ctx, draft, advance));
  }

  const nav =
    draft.trail.length && draft.step !== FIRST_STEP
      ? el('button', { type: 'button', class: 'back', onclick: back }, svg(ICONS.back), t.wizard.back)
      : null;

  return el('div', { class: 'wizard' }, intro, head, track, nav, body);
}

// A step that asks for typed answers: the plate, the car, or numbers (cost, fuel, running costs).
function renderForm(ctx, draft, advance) {
  const { state, t } = ctx;
  const { step, car } = draft;
  const lang = state.lang;
  const fields = stepFields(step, car);
  const form = el('form', { class: 'form', novalidate: true });
  form.append(el('h2', {}, step === 'cost' ? t.steps.cost[car.method] : t.steps[step].title));
  const hint = ['plateEntry', 'running', 'driving'].includes(step) ? t.steps[step].hint : null;

  const errorNodes = {};
  const showErrors = errs => {
    for (const [f, node] of Object.entries(errorNodes)) {
      node.textContent = errs[f] ? t.errors[errs[f]] : '';
      node.closest('.field')?.classList.toggle('invalid', Boolean(errs[f]));
    }
  };

  if (step === 'plateEntry') {
    const input = el('input', {
      class: 'plate-input',
      type: 'text',
      value: car.plate,
      autocomplete: 'off',
      autocapitalize: 'characters',
      spellcheck: 'false',
      maxlength: '9',
      'aria-label': t.fields.plate[0],
      placeholder: 'AB 12 345',
      oninput: e => {
        const formatted = formatPlate(e.target.value);
        e.target.value = formatted;
        car.plate = formatted;
        ctx.save();
      },
    });
    errorNodes.plate = el('p', { class: 'error', id: 'err-plate' });
    form.append(
      el(
        'div',
        { class: 'field plate-field' },
        el('label', { class: 'plate plate-lg plate-edit' }, euStrip(), input),
        errorNodes.plate,
      ),
    );
    setTimeout(() => input.focus(), 0);
  }

  if (step === 'car') {
    form.append(textField('name', car.name, t, v => (car.name = v), ctx, errorNodes));
    form.append(numberField('year', car, t, lang, ctx, errorNodes, { decimals: false }));
    form.append(fuelPicker(car, t, ctx));
  }

  if (['cost', 'driving', 'running'].includes(step)) {
    for (const item of stepItems(step, car)) {
      form.append(
        item.switch
          ? switchField(item.switch, car, t, ctx)
          : numberField(item.field, car, t, lang, ctx, errorNodes, { label: labelKey(item.field, car) }),
      );
    }
  }

  if (hint) form.append(el('p', { class: 'hint step-hint' }, hint));

  form.append(
    el('div', { class: 'actions' }, el('button', { type: 'submit', class: 'primary' }, t.wizard.next)),
  );
  form.addEventListener('submit', e => {
    e.preventDefault();
    const errors = validate(car, fields);
    showErrors(errors);
    const first = fields.find(f => errors[f]);
    if (first) {
      form.querySelector(`[data-field="${first}"]`)?.focus();
      return;
    }
    advance();
  });
  return form;
}
