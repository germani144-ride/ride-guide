// Swipe between tabs: which tab a swipe leads to, and how a finger's movement is read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TAB_ORDER, swipeTarget, readGesture, swipeOffset } from '../src/swipe.js';

test("tabs follow the bottom bar's order; nothing before the first or after the last", () => {
  assert.deepEqual(TAB_ORDER, ['new', 'garage', 'history']);
  assert.equal(swipeTarget('new', 'next'), 'garage');
  assert.equal(swipeTarget('garage', 'next'), 'history');
  assert.equal(swipeTarget('history', 'prev'), 'garage');
  assert.equal(swipeTarget('garage', 'prev'), 'new');
  assert.equal(swipeTarget('new', 'prev'), null);
  assert.equal(swipeTarget('history', 'next'), null);
  assert.equal(swipeTarget(null, 'next'), null); // Settings: not a tab
  assert.equal(swipeTarget('garage', 'up'), null);
});

test('scrolling wins: a swipe starts only sideways enough, and 12px vertical cancels it', () => {
  assert.equal(readGesture(5, 0), 'pending');
  assert.equal(readGesture(10, 0), 'swipe');
  assert.equal(readGesture(-10, 8), 'swipe'); // 10 ≥ 1.2 × 8
  assert.equal(readGesture(10, 9), 'pending'); // not 1.2× more sideways yet
  assert.equal(readGesture(40, 12), 'scroll');
  assert.equal(readGesture(0, -12), 'scroll');
});

test('the page follows half the finger, arms at 70px, and resists at the ends', () => {
  assert.deepEqual(swipeOffset(-60, true), { x: -30, armed: false });
  assert.deepEqual(swipeOffset(-70, true), { x: -35, armed: true });
  assert.deepEqual(swipeOffset(120, true), { x: 60, armed: true });
  assert.deepEqual(swipeOffset(100, false), { x: 15, armed: false });
  assert.deepEqual(swipeOffset(-400, false), { x: -24, armed: false });
});
