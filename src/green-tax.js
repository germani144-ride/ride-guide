// Danish green tax (grøn ejerafgift) for a passenger car, per half year, from the official rate
// tables (brændstofforbrugsafgiftsloven, 2026 rates, Skatteministeriet:
// https://svmn.dk/tal-og-metode/satser/satser-og-beloebsgraenser-i-lovgivningen/braendstofforbrugsafgiftsloven).
// Plain functions, no DOM. Used to fill in the green tax after a plate lookup; the user can
// always change it. The rates change every year: update TAX_YEAR and the tables each January.
//
// Which table applies depends on when the car was first registered:
//   before 3 Oct 2017            km per litre, table A1 (petrol) or B1 (diesel)
//   3 Oct 2017 to 30 June 2021   km per litre, table A2 (petrol) or B2 (diesel)
//   from 1 July 2021             CO2 in g/km, table C (electric cars have 0 g/km)
// Diesel cars also pay an equalisation charge (udligningsafgift), included below, and 500 kr
// more per half year without an approved particle filter.

export const TAX_YEAR = 2026;

// [lowest km per litre, kr per half year], best first; a car pays the first row it reaches.
const PETROL_OLD = [
  [20.0, 460],
  [18.2, 880],
  [16.7, 1290],
  [15.4, 1740],
  [14.3, 2160],
  [13.3, 2570],
  [12.5, 2990],
  [11.8, 3400],
  [11.1, 3830],
  [10.5, 4260],
  [10.0, 4680],
  [9.1, 5500],
  [8.3, 6380],
  [7.7, 7210],
  [7.1, 8040],
  [6.7, 8880],
  [6.3, 9740],
  [5.9, 10580],
  [5.6, 11410],
  [5.3, 12290],
  [5.0, 13120],
  [4.8, 13960],
  [4.5, 14800],
  [0, 15660],
];
const PETROL_2017 = [
  [50.0, 460],
  [44.4, 520],
  [40.0, 540],
  [36.4, 570],
  [33.3, 600],
  [28.6, 640],
  [25.0, 700],
  [22.2, 760],
  [20.0, 800],
  [18.2, 1220],
  [16.7, 1630],
  [15.4, 2080],
  [14.3, 2500],
  [13.3, 2910],
  [12.5, 3330],
  [11.8, 3740],
  [11.1, 4180],
  [10.5, 4600],
  [10.0, 5020],
  [9.1, 5840],
  [8.3, 6720],
  [7.7, 7550],
  [7.1, 8380],
  [6.7, 9230],
  [6.3, 10080],
  [5.9, 10920],
  [5.6, 11760],
  [5.3, 12630],
  [5.0, 13470],
  [4.8, 14300],
  [4.5, 15140],
  [0, 16000],
];
// Diesel: the totals, tax plus equalisation charge.
const DIESEL_OLD = [
  [32.1, 120],
  [28.1, 520],
  [25.0, 930],
  [22.5, 1460],
  [20.5, 1980],
  [18.8, 2480],
  [17.3, 3020],
  [16.1, 3540],
  [15.0, 4040],
  [14.1, 4580],
  [13.2, 5080],
  [12.5, 5630],
  [11.9, 6140],
  [11.3, 6650],
  [10.2, 7680],
  [9.4, 8740],
  [8.7, 9760],
  [8.1, 10810],
  [7.5, 11810],
  [7.0, 12850],
  [6.6, 13920],
  [6.2, 14930],
  [5.9, 16000],
  [5.6, 17040],
  [5.4, 18080],
  [5.1, 19170],
  [0, 20240],
];
const DIESEL_2017 = [
  [56.3, 580],
  [50.0, 640],
  [45.0, 660],
  [41.0, 690],
  [37.6, 720],
  [32.1, 760],
  [28.1, 1220],
  [25.0, 1690],
  [22.5, 1800],
  [20.5, 2320],
  [18.8, 2820],
  [17.3, 3360],
  [16.1, 3880],
  [15.0, 4380],
  [14.1, 4920],
  [13.2, 5420],
  [12.5, 5980],
  [11.9, 6480],
  [11.3, 6990],
  [10.2, 8020],
  [9.4, 9080],
  [8.7, 10100],
  [8.1, 11150],
  [7.5, 12160],
  [7.0, 13190],
  [6.6, 14260],
  [6.2, 15280],
  [5.9, 16340],
  [5.6, 17390],
  [5.4, 18420],
  [5.1, 19510],
  [0, 20580],
];
// [highest g CO2 per km, tax, diesel equalisation charge]; a car pays the first row it fits under.
const CO2 = [
  [58, 460, 120],
  [65, 520, 120],
  [73, 540, 120],
  [80, 570, 120],
  [87, 600, 120],
  [102, 640, 120],
  [116, 700, 520],
  [131, 760, 930],
  [145, 800, 1000],
  [160, 1220, 1100],
  [174, 1630, 1190],
  [189, 2080, 1280],
  [203, 2500, 1380],
  [218, 2910, 1470],
  [232, 3330, 1590],
  [246, 3740, 1680],
  [262, 4180, 1800],
  [277, 4600, 1880],
  [290, 5020, 1970],
  [319, 5840, 2180],
  [350, 6720, 2360],
  [377, 7550, 2550],
  [409, 8380, 2770],
  [433, 9230, 2930],
  [461, 10080, 3110],
  [492, 10920, 3340],
  [519, 11760, 3520],
  [548, 12630, 3710],
  [581, 13470, 3920],
  [605, 14300, 4120],
  [645, 15140, 4370],
  [Infinity, 16000, 4580],
];
const NO_PARTICLE_FILTER = 500; // 1,000 kr a year

const byKmPerLitre = (table, kml) => table.find(([min]) => kml >= min)[1];

// `fuel`: 'petrol' | 'diesel' | 'electric'; `registered`: first registration as 'YYYY-MM-DD';
// `kmPerLitre`, `co2` (g/km) and `particleFilter` (false: known to have none) as the register has
// them. Returns kr per half year, or null if the register's figures are not enough to tell.
export function greenTaxHalfYear({ fuel, registered, kmPerLitre = 0, co2 = null, particleFilter = null }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(registered ?? ''))) return null;
  const diesel = fuel === 'diesel';
  const filter = diesel && particleFilter === false ? NO_PARTICLE_FILTER : 0;
  if (registered >= '2021-07-01') {
    const g = fuel === 'electric' ? 0 : co2;
    if (!(g >= 0) || g === null) return null;
    const [, tax, equalisation] = CO2.find(([max]) => g <= max);
    return tax + (diesel ? equalisation : 0) + filter;
  }
  if (fuel === 'electric') return null; // older electric cars: not covered here
  if (!(kmPerLitre > 0) || (fuel !== 'petrol' && !diesel)) return null;
  const newer = registered >= '2017-10-03';
  const table = diesel ? (newer ? DIESEL_2017 : DIESEL_OLD) : newer ? PETROL_2017 : PETROL_OLD;
  return byKmPerLitre(table, kmPerLitre) + filter;
}
