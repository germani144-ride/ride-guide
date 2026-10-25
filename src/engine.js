// RideGuide cost engine.
// Simulates a car month by month over the years of ownership (a lease over its own period, see
// leasePeriod() in model.js), so lease, cash and finance are compared on equal terms. Every
// payment is discounted at the return your money could earn (compounding), which both counts the
// money tied up in a car and makes a big payment now comparable with small payments later. The result is the equivalent fixed monthly cost.
//
// Pure functions only: no DOM, no storage, no network. Safe to run in a browser, Node, or a
// future backend without changes. The spreadsheet's formulas live on in engine-sheet.js.

// Settings the user can change (Settings page). Prices are Danish, in today's money (2026).
export const DEFAULT_SETTINGS = {
  years: 3, // years of ownership: the time span every car is compared over
  kmPerYear: 10000, // km driven per year, the same for every car compared
  returnRate: 0.04, // yearly return on money you don't spend on the car (compounding)
  buffer: 0.05, // safety margin on owned cars
  energyGrowth: 0, // yearly change in fuel and electricity prices
  petrolPrice: 17.5, // kr per litre, October 2026 (shared by every car; live prices are planned)
  dieselPrice: 19.5, // kr per litre, October 2026
  homeElPrice: 1.4, // kr per kWh charging at home
  evPublicShare: 0.2, // share of charging done at public chargers
  evPublicPrice: 3.5, // kr per kWh at public (street and fast) chargers
  evWinterExtra: 0.1, // extra energy use over the year for electric cars (cold weather)
  tyreSetPrice: 3500, // four tyres including fitting
  tyreLifeKm: 30000,
  tyreLifeKmEv: 25000, // heavier cars with instant torque wear tyres faster
  winterTyres: false, // a second set, swapped twice a year
  tyreSwapPrice: 400,
  inspectionPrice: 500, // periodic inspection (syn): at 4 years, then every 2 years
  washingMo: 100,
};

// Value curve: a bigger loss in the first year, then a yearly loss that shrinks as the car ages,
// from `start` (in the second year) towards `floor`, with time constant `tau` years:
//   yearly loss at age a = floor + (start - floor) * e^(-(a - 1) / tau)
// Driving more than kmNorm per year adds kmRate to the yearly loss per kmStep km (less if you
// drive less). Calibrated so a 10-15 year old car loses about 6-7% a year, as Danish market
// values do (TjekBil's estimates for a 2016 car: 81,000 -> 58,000 kr over 5 years).
export const VALUE_CURVE = {
  petrol: { firstYear: 0.2, start: 0.15, floor: 0.06 },
  diesel: { firstYear: 0.2, start: 0.15, floor: 0.06 },
  electric: { firstYear: 0.22, start: 0.17, floor: 0.07 },
  tau: 4,
  kmNorm: 15000,
  kmStep: 5000,
  kmRate: 0.01,
  min: 0.03,
  max: 0.3,
};

// Maintenance and repairs (tyres not included): a yearly base plus a cost per km,
// growing with the car's age.
export const MAINTENANCE = {
  petrol: { baseYear: 3000, perKm: 0.25 },
  diesel: { baseYear: 3500, perKm: 0.25 },
  electric: { baseYear: 2000, perKm: 0.15 },
  ageGrowth: 0.08,
  maxAge: 15,
};

// Share of the insurance premium that follows the car's value (the rest is fixed).
export const INSURANCE_VALUE_SHARE = 0.5;
export const INSPECTION = { firstAge: 4, every: 2 };

// Order of the parts in the breakdown.
export const PART_KEYS = [
  'lease',
  'depreciation',
  'capital',
  'interest',
  'energy',
  'insurance',
  'greenTax',
  'maintenance',
  'tyres',
  'other',
  'parking',
  'buffer',
];

/**
 * @typedef {Object} CarInput
 * @property {'cash'|'finance'|'lease'} method
 * @property {'petrol'|'diesel'|'electric'} fuel
 * @property {number} age               car's age in years when you get it (0 = new)
 * @property {number} price             purchase price (owned cars)
 * @property {number} downPayment       fraction of price paid up front (1 = cash)
 * @property {number} apr               ÅOP as a fraction
 * @property {number} financeMonths
 * @property {boolean} depreciationAuto use the value curve; otherwise depreciationFactor
 * @property {number} depreciationFactor yearly loss for the manual mode: value = price / (1+f)^years
 * @property {number} leaseMo
 * @property {number} oneTimePayment   paid when the lease starts
 * @property {number} returnFee        paid when the car is handed back, at the end
 * @property {number} [years]          this car's own period, overriding settings.years (a lease
 *                                     runs for its own period; see leasePeriod() in model.js)
 * @property {boolean} serviceIncluded lease covers maintenance and inspection
 * @property {boolean} tyresIncluded   lease covers tyres
 * @property {number} kmPerYear
 * @property {number} kmPerUnit         km per litre (or km per kWh)
 * @property {number} [pricePerUnit]    kr per litre (or per kWh at home); defaults to the settings
 * @property {number} insuranceMo       today's premium per month
 * @property {number} greenTaxMo
 * @property {boolean} maintenanceAuto  use the maintenance curve; otherwise maintenanceMo
 * @property {number} maintenanceMo
 * @property {number} parkingMo
 */

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Excel PMT with fv = 0, returned as a positive payment for a positive loan.
export function pmt(ratePerPeriod, nper, pv) {
  if (!nper || !pv) return 0;
  if (ratePerPeriod === 0) return pv / nper;
  return (pv * ratePerPeriod) / (1 - Math.pow(1 + ratePerPeriod, -nper));
}

// Yearly loss in value at a given age (years, 1 or more), adjusted for km per year.
export function yearlyValueLoss(fuel, kmPerYear, age = 1) {
  const c = VALUE_CURVE[fuel] ?? VALUE_CURVE.petrol;
  const base = c.floor + (c.start - c.floor) * Math.exp(-(Math.max(1, age) - 1) / VALUE_CURVE.tau);
  const extra = (VALUE_CURVE.kmRate * (num(kmPerYear) - VALUE_CURVE.kmNorm)) / VALUE_CURVE.kmStep;
  return clamp(base + extra, VALUE_CURVE.min, VALUE_CURVE.max);
}

// Share of the new price left at a given age (years). After the first year the yearly loss
// changes with age, so the value is built up month by month.
export function valueCurve(fuel, kmPerYear, age) {
  const c = VALUE_CURVE[fuel] ?? VALUE_CURVE.petrol;
  const a = Math.max(0, age);
  if (a < 1) return 1 - c.firstYear * a;
  const n = Math.max(1, Math.ceil((a - 1) * 12));
  const h = (a - 1) / n;
  let log = Math.log(1 - c.firstYear);
  for (let i = 0; i < n; i++) log += h * Math.log(1 - yearlyValueLoss(fuel, kmPerYear, 1 + (i + 0.5) * h));
  return Math.exp(log);
}

// Number of inspections a car has had by a given age.
function inspectionsBy(age) {
  if (age < INSPECTION.firstAge - 1e-9) return 0;
  return Math.floor((age - INSPECTION.firstAge + 1e-9) / INSPECTION.every) + 1;
}

/**
 * @param {CarInput} input
 * @param {Partial<typeof DEFAULT_SETTINGS>} [settings]
 */
export function calculate(input, settings = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const months = Math.max(1, Math.round(num(input.years ?? s.years) * 12));
  const rm = Math.pow(1 + num(s.returnRate), 1 / 12) - 1; // monthly rate, compounding
  const disc = k => Math.pow(1 + rm, -k);
  let annuity = 0; // value today of 1 kr paid at the end of every month
  for (let k = 1; k <= months; k++) annuity += disc(k);

  const lease = input.method === 'lease';
  const owned = !lease;
  const fuel = VALUE_CURVE[input.fuel] ? input.fuel : 'petrol';
  const electric = fuel === 'electric';
  const kmYear = num(input.kmPerYear ?? s.kmPerYear);
  const kmMo = kmYear / 12;
  const age0 = Math.max(0, num(input.age));
  const price = owned ? num(input.price) : 0;

  const valueAt = years => {
    if (!price) return 0;
    if (input.depreciationAuto === false) return price / Math.pow(1 + num(input.depreciationFactor), years);
    return (price * valueCurve(fuel, kmYear, age0 + years)) / valueCurve(fuel, kmYear, age0);
  };

  const pv = {}; // value today of each part
  const paid = {}; // plain sum paid within the time span
  const add = (key, amount, k) => {
    if (!amount) return;
    pv[key] = (pv[key] || 0) + amount * disc(k);
    paid[key] = (paid[key] || 0) + amount;
  };

  // ----- owning: price, loan, sale at the end -----
  let upfront = 0;
  let residual = 0;
  let loanLeft = 0;
  let interestPaid = 0;
  let capitalPv = 0;
  let instalments = 0;
  if (owned && price) {
    const down = input.method === 'cash' ? price : clamp(num(input.downPayment), 0, 1) * price;
    const loan = price - down;
    const apr = num(input.apr);
    const n = Math.round(num(input.financeMonths));
    const payment = loan > 0 && n > 0 ? pmt(apr / 12, n, loan) : 0;
    let balance = loan;
    upfront = down;
    capitalPv = down;
    for (let k = 1; k <= months; k++) {
      if (k > n || balance <= 1e-9) break;
      const interest = balance * (apr / 12);
      balance -= payment - interest;
      interestPaid += interest;
      instalments += payment;
      capitalPv += payment * disc(k);
    }
    loanLeft = Math.max(0, balance);
    residual = valueAt(months / 12);
    capitalPv += (loanLeft - residual) * disc(months);
  }

  // ----- leasing: one lease over the period; one-time payment at the start, return fee at the end -----
  let leaseFirst = 0;
  if (lease) {
    leaseFirst = num(input.oneTimePayment);
    add('lease', num(input.returnFee), months);
    upfront = leaseFirst;
  }

  // ----- month by month -----
  const life = electric ? s.tyreLifeKmEv : s.tyreLifeKm;
  const pumpOrHome =
    input.pricePerUnit ?? (electric ? s.homeElPrice : fuel === 'diesel' ? s.dieselPrice : s.petrolPrice);
  const unitPrice = electric
    ? (1 - num(s.evPublicShare)) * num(pumpOrHome) + num(s.evPublicShare) * num(s.evPublicPrice)
    : num(pumpOrHome);
  const kmPerUnit = electric ? num(input.kmPerUnit) / (1 + num(s.evWinterExtra)) : num(input.kmPerUnit);
  const m = MAINTENANCE[fuel];
  const serviceByLease = lease && input.serviceIncluded !== false;
  const tyresByLease = lease && input.tyresIncluded === true;

  for (let k = 1; k <= months; k++) {
    const mid = (k - 0.5) / 12; // years since you got the car, mid-month
    const age = age0 + mid;
    if (lease) add('lease', num(input.leaseMo), k);
    const growth = Math.pow(1 + num(s.energyGrowth), (k - 1) / 12);
    add('energy', kmPerUnit ? (kmMo / kmPerUnit) * unitPrice * growth : 0, k);

    const ins = num(input.insuranceMo);
    const insShare =
      owned && price ? 1 - INSURANCE_VALUE_SHARE + (INSURANCE_VALUE_SHARE * valueAt(mid)) / price : 1;
    add('insurance', ins * insShare, k);
    add('greenTax', num(input.greenTaxMo), k);
    add('parking', num(input.parkingMo), k);

    if (!serviceByLease) {
      const maint =
        input.maintenanceAuto === false
          ? num(input.maintenanceMo)
          : ((m.baseYear + m.perKm * kmYear) / 12) *
            (1 + MAINTENANCE.ageGrowth * Math.min(age, MAINTENANCE.maxAge));
      add('maintenance', maint, k);
      if (inspectionsBy(age0 + k / 12) > inspectionsBy(age0 + (k - 1) / 12))
        add('other', num(s.inspectionPrice), k);
    }
    if (!tyresByLease) {
      add(
        'tyres',
        (kmMo * num(s.tyreSetPrice)) / (num(life) || 1) +
          (s.winterTyres ? (2 * num(s.tyreSwapPrice)) / 12 : 0),
        k,
      );
    }
    add('other', num(s.washingMo), k);
  }

  // ----- equivalent monthly cost per part -----
  const eq = v => (v || 0) / annuity;
  const parts = Object.fromEntries(PART_KEYS.map(key => [key, 0]));
  for (const key of Object.keys(pv)) parts[key] = eq(pv[key]);
  if (lease) parts.lease += eq(leaseFirst);
  if (owned && price) {
    // Capital cost split into the plain loss in value, loan interest, and what the money tied
    // up in the car would have earned (negative when paying later beats paying now).
    parts.depreciation = (price - residual) / months;
    parts.interest = interestPaid / months;
    parts.capital = eq(capitalPv) - parts.depreciation - parts.interest;
  }
  if (owned) {
    const before = PART_KEYS.reduce((a, key) => a + parts[key], 0);
    parts.buffer = num(s.buffer) * before;
  }

  const perMonth = PART_KEYS.reduce((a, key) => a + parts[key], 0);
  const paidRunning = Object.values(paid).reduce((a, v) => a + v, 0);
  return {
    months,
    kmMo,
    owned,
    parts,
    perMonth,
    perKm: kmMo ? perMonth / kmMo : 0,
    period: perMonth * months,
    upfront,
    paidMonthly: (paidRunning + instalments) / months,
    residual,
    loanLeft,
    interestPaid,
    yearlyValueLoss: yearlyValueLoss(fuel, kmYear, Math.max(1, age0)),
  };
}
