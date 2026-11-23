// Number formatting for the interface, in English or Danish. Plain functions, no DOM.
import { toShown } from './model.js';

const locale = lang => (lang === 'da' ? 'da-DK' : 'en-GB');

// Whole kroner by default: 12,345 (en) or 12.345 (da).
export function money(v, lang, digits = 0) {
  return new Intl.NumberFormat(locale(lang), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v || 0);
}

// Up to two decimals, no padding: 2.5 (en) or 2,5 (da).
export function plain(v, lang) {
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 2 }).format(v || 0);
}

// A number as typed into an input: no thousands separators (so it reads back the same way),
// at most 4 decimals, with a Danish decimal comma.
export function inputNumberText(v, lang) {
  const s = String(+Number(v).toFixed(4));
  return lang === 'da' ? s.replace('.', ',') : s;
}

// A car field as shown in its input: in the unit it is typed in (percent, kr per half year,
// kWh per 100 km for an electric car's use), and empty for zero so the placeholder shows.
export function toInputText(field, v, lang, car) {
  return v ? inputNumberText(toShown(field, v, car), lang) : '';
}
