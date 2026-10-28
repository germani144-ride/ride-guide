// How each part of "Where the money goes" is calculated, in words and with the car's own
// numbers, so every amount on screen can be checked. Plain functions, no DOM.
import { fmt } from './i18n.js';
import { money, plain } from './format.js';
import { switchOn } from './model.js';

// `r`: the result of calculate() (with r.details); `car`: the saved car; `settings`: the settings.
// Returns { part: sentence } for every part with an amount.
export function explainParts(r, car, settings, t, lang) {
  const e = t.explain;
  const d = r.details;
  const kr = v => `${money(v, lang)} ${t.fields.price[1]}`;
  const years = r.months / 12;
  const span = fmt(years === 1 ? t.result.periodOne : t.result.period, { years: plain(years, lang) });
  const electric = car.fuel === 'electric';
  const out = {};

  out.depreciation = fmt(e.depreciation, {
    price: kr(d.price),
    start: kr(d.marketValue),
    end: kr(r.residual),
    span,
    how: switchOn(car, 'depreciationAuto')
      ? e.curveAuto
      : fmt(e.curveManual, { rate: plain(car.depreciationFactor * 100, lang) }),
    loss: kr(d.price - r.residual),
    months: r.months,
  });
  out.capital = fmt(r.parts.capital < 0 ? e.capitalNegative : e.capital, {
    rate: plain(settings.returnRate * 100, lang),
    span,
  });
  out.interest = fmt(e.interest, {
    loan: kr(d.loan),
    apr: plain(car.apr * 100, lang),
    total: kr(r.interestPaid),
    span,
    months: r.months,
  });
  out.lease = fmt(e.lease, {
    leaseMo: kr(car.leaseMo),
    oneTime: kr(car.oneTimePayment),
    returnFee: kr(car.returnFee),
    span,
  });
  out.energy =
    fmt(electric ? e.energyEl : e.energy, {
      km: money(d.kmPerYear, lang),
      kmPerUnit: plain(d.kmPerUnit, lang),
      entered: plain(car.kmPerUnit, lang),
      winter: plain(settings.evWinterExtra * 100, lang),
      price: money(d.unitPrice, lang, 2),
      home: money(settings.homeElPrice, lang, 2),
      public: money(settings.evPublicPrice, lang, 2),
      share: plain(settings.evPublicShare * 100, lang),
    }) + (settings.energyGrowth ? fmt(e.energyGrowth, { g: plain(settings.energyGrowth * 100, lang) }) : '');
  out.insurance = fmt(e.asEntered, { amount: kr(car.insuranceMo) });
  out.greenTax = fmt(e.greenTax, { half: kr(car.greenTaxMo * 6) });
  out.maintenance = switchOn(car, 'maintenanceAuto')
    ? fmt(e.maintenance, {
        fuel: t.fuel[car.fuel].toLowerCase(),
        km: money(d.kmPerYear, lang),
        base: kr(d.maintenanceBaseYear),
        from: plain(d.ageStart, lang),
        to: plain(d.ageEnd, lang),
        avg: kr(r.parts.maintenance * 12),
      })
    : fmt(e.asEntered, { amount: kr(car.maintenanceMo) });
  out.tyres =
    fmt(e.tyres, {
      km: money(d.kmPerYear, lang),
      set: kr(settings.tyreSetPrice),
      life: money(d.tyreLifeKm, lang),
    }) + (settings.winterTyres ? fmt(e.winterTyres, { swap: kr(settings.tyreSwapPrice) }) : '');
  out.washing = fmt(e.washing, { amount: kr(settings.washingMo) });
  out.parking = fmt(e.asEntered, { amount: kr(car.parkingMo) });
  out.buffer = fmt(e.buffer, { pct: plain(settings.buffer * 100, lang) });
  return out;
}
