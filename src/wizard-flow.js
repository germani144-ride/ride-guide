// The "New car" wizard as plain data and functions: which step comes next, which fields a step
// asks, and in what order. No DOM, so the step logic can be tested (test/wizard-flow.test.mjs).
//
// A draft is the wizard's working state, saved with the app state:
//   { car, hasPlate: 'yes'|'no'|null, step, trail: [steps to go back to], jump, editingId }
// `jump` is set when the user changes one answer from the result screen (or tries another way to
// pay): the wizard then returns to the result instead of walking through every later step.
import { newCar, DRIVING_FIELDS, costFields, runningFields, switchOn } from './model.js';

export const FIRST_STEP = 'plate';

const NEXT_STEP = {
  plate: draft => (draft.hasPlate === 'yes' ? 'plateEntry' : 'car'),
  plateEntry: () => 'car',
  car: () => 'method',
  method: () => 'cost',
  cost: () => 'driving',
  driving: () => 'running',
  running: () => 'result',
};

export function newDraft(overrides = {}) {
  return {
    car: newCar(),
    hasPlate: null,
    step: FIRST_STEP,
    trail: [],
    jump: false,
    editingId: null,
    ...overrides,
  };
}

// Steps on the current branch of the tree, used for "Step n of N".
export function stepPath(draft) {
  const steps = [FIRST_STEP];
  let step = FIRST_STEP;
  while (NEXT_STEP[step]) {
    step = NEXT_STEP[step](draft);
    steps.push(step);
  }
  return steps;
}

export function stepProgress(draft) {
  const steps = stepPath(draft);
  return { n: Math.max(0, steps.indexOf(draft.step)) + 1, total: steps.length };
}

// The step after the current one. When jumping back to the result, a new payment method still
// needs its terms (the cost step); any other changed answer goes straight back to the result.
export function nextStep(draft) {
  if (draft.jump) return draft.step === 'method' ? 'cost' : 'result';
  return NEXT_STEP[draft.step](draft);
}

// The step after answering "Do you have the license plate?".
export function stepAfterPlateAnswer(draft) {
  if (draft.jump) return draft.hasPlate === 'no' ? 'result' : 'plateEntry';
  return nextStep(draft);
}

// Picking a payment method also sets the down payment it implies: paying upfront is 100% down,
// and a loan needs less than 100% (20% unless one was typed).
export function choosePaymentMethod(car, method) {
  car.method = method;
  if (method === 'cash') car.downPayment = 1;
  if (method === 'finance' && car.downPayment >= 1) car.downPayment = 0.2;
  return car;
}

// The fields a form step asks for (and validates), given the car's switches.
export function stepFields(step, car) {
  if (step === 'plateEntry') return ['plate'];
  if (step === 'car') return ['name', 'year'];
  if (step === 'cost') return costFields(car);
  if (step === 'driving') return DRIVING_FIELDS;
  if (step === 'running') return runningFields(car);
  return [];
}

// The switches a step shows; flipping one changes which fields are asked.
export function stepSwitches(step, car) {
  const lease = car.method === 'lease';
  if (step === 'cost')
    return lease ? ['leaseFixed', 'serviceIncluded', 'tyresIncluded'] : ['depreciationAuto'];
  if (step === 'running' && !(lease && switchOn(car, 'serviceIncluded'))) return ['maintenanceAuto'];
  return [];
}

// What a number step shows, in order: { field } or { switch } items. A switch comes right
// before the fields it reveals (the lease period, the manual loss in value).
export function stepItems(step, car) {
  const fields = stepFields(step, car);
  const asked = keys => keys.filter(k => fields.includes(k)).map(field => ({ field }));
  if (step === 'cost' && car.method === 'lease') {
    return [
      ...asked(['leaseMo', 'oneTimePayment', 'returnFee']),
      { switch: 'leaseFixed' },
      ...asked(['yearsOfUse', 'leaseMinYears', 'leaseMaxYears']),
      { switch: 'serviceIncluded' },
      { switch: 'tyresIncluded' },
    ];
  }
  if (step === 'cost') {
    return [
      ...asked(fields.filter(f => f !== 'depreciationFactor')),
      { switch: 'depreciationAuto' },
      ...asked(['depreciationFactor']),
    ];
  }
  return [...fields.map(field => ({ field })), ...stepSwitches(step, car).map(key => ({ switch: key }))];
}

// Which label a field uses: electric cars count energy in kWh, and a lease asks its period.
export function labelKey(field, car) {
  if (car.fuel === 'electric' && field === 'kmPerUnit') return 'kmPerUnitEl';
  if (field === 'yearsOfUse' && car.method === 'lease') return 'yearsOfUseLease';
  return field;
}
