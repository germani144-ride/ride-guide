// Form controls used by the "New car" wizard: choice buttons, text and number fields, switches
// and the fuel picker. Each control writes straight into the car being edited and saves.
import { FUELS, parseNumber, fromShown, switchOn } from '../model.js';
import { toInputText } from '../format.js';
import { el } from '../ui.js';

export function choiceList(keys, labelFor, selected, onPick) {
  return el(
    'div',
    { class: 'choices' },
    keys.map(k => {
      const [title, sub] = labelFor(k);
      return el(
        'button',
        {
          type: 'button',
          class: `choice${selected === k ? ' selected' : ''}`,
          onclick: () => onPick(k),
        },
        el('span', { class: 'choice-title' }, title),
        el('span', { class: 'choice-sub' }, sub),
      );
    }),
  );
}

export function textField(field, value, t, onValue, ctx, errorNodes) {
  const [label, , placeholder] = t.fields[field];
  const id = `f-${field}`;
  errorNodes[field] = el('p', { class: 'error', id: `err-${field}` });
  return el(
    'div',
    { class: 'field' },
    el('label', { for: id }, label),
    el(
      'div',
      { class: 'input-wrap' },
      el('input', {
        id,
        type: 'text',
        value,
        placeholder,
        'data-field': field,
        autocomplete: 'off',
        maxlength: '60',
        'aria-describedby': `err-${field}`,
        oninput: e => {
          onValue(e.target.value);
          ctx.save();
        },
      }),
    ),
    errorNodes[field],
  );
}

export function numberField(field, car, t, lang, ctx, errorNodes, { label = field, decimals = true } = {}) {
  const [name, unit, help] = t.fields[label];
  const id = `f-${field}`;
  errorNodes[field] = el('p', { class: 'error', id: `err-${field}` });
  const input = el('input', {
    id,
    type: 'text',
    inputmode: decimals ? 'decimal' : 'numeric',
    'data-field': field,
    value: toInputText(field, car[field], lang, car),
    placeholder: '0',
    autocomplete: 'off',
    'aria-describedby': `err-${field}${help ? ` help-${field}` : ''}`,
    oninput: e => {
      const v = parseNumber(e.target.value);
      car[field] = v == null ? 0 : fromShown(field, v, car);
      ctx.save();
    },
  });
  return el(
    'div',
    { class: 'field' },
    el('label', { for: id }, name),
    el('div', { class: 'input-wrap' }, input, unit ? el('span', { class: 'unit' }, unit) : null),
    help ? el('p', { class: 'hint', id: `help-${field}` }, help) : null,
    errorNodes[field],
  );
}

export function switchField(key, car, t, ctx) {
  const [label, help] = t.switches[key];
  const id = `s-${key}`;
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
        checked: switchOn(car, key),
        onchange: e => {
          car[key] = e.target.checked;
          ctx.save();
          ctx.render();
        },
      }),
      el('span', { class: 'switch-text' }, label),
    ),
    help ? el('p', { class: 'hint' }, help) : null,
  );
}

export function fuelPicker(car, t, ctx) {
  const group = el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': t.fields.fuel[0] });
  for (const f of FUELS) {
    group.append(
      el(
        'button',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': String(car.fuel === f),
          onclick: e => {
            car.fuel = f;
            for (const b of group.children) b.setAttribute('aria-checked', String(b === e.currentTarget));
            ctx.save();
          },
        },
        t.fuel[f],
      ),
    );
  }
  return el('div', { class: 'field' }, el('span', { class: 'label' }, t.fields.fuel[0]), group);
}
