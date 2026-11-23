// Swipe between tabs, the plain part: which tab a swipe leads to, and how a finger's movement is
// read. No DOM; src/views/swipe-tabs.js follows the finger. Same feel as Lift Log and Nap Log.

// The bottom bar's tabs, in their order on screen.
export const TAB_ORDER = ['new', 'garage', 'history'];

export const START_X = 10; // px sideways before a swipe starts...
export const SIDEWAYS_RATIO = 1.2; // ...and this much more sideways than vertical
export const CANCEL_Y = 12; // px vertical before the swipe starts: it's a scroll, never a swipe
export const ARM_X = 70; // px sideways: letting go switches tab
export const FOLLOW = 0.5; // the page moves about half the finger's distance
export const RESIST = 0.15; // at the first or last tab the page moves only a little...
export const RESIST_MAX = 24; // ...and no further than this

// The tab a swipe leads to from tab `from` ('new' | 'garage' | 'history' | null), or null.
// `dir`: 'next' (finger moves left) or 'prev' (finger moves right).
export function swipeTarget(from, dir) {
  const i = TAB_ORDER.indexOf(from);
  if (i < 0) return null;
  const j = dir === 'next' ? i + 1 : dir === 'prev' ? i - 1 : -1;
  return TAB_ORDER[j] ?? null;
}

// What a finger that has moved (dx, dy) from where it touched down is doing, while undecided:
// 'scroll' (give it to the page), 'swipe' (start following it) or 'pending' (not sure yet).
export function readGesture(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ay >= CANCEL_Y) return 'scroll';
  if (ax >= START_X && ax >= SIDEWAYS_RATIO * ay) return 'swipe';
  return 'pending';
}

// Where the page is drawn for a sideways movement dx, and whether letting go switches tab.
export function swipeOffset(dx, hasTarget) {
  if (!hasTarget) return { x: Math.sign(dx) * Math.min(Math.abs(dx) * RESIST, RESIST_MAX), armed: false };
  return { x: dx * FOLLOW, armed: Math.abs(dx) >= ARM_X };
}
