import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/economy.js';

test('upgrade costs grow exponentially', () => {
  const s = E.newState(0);
  const c1 = E.upgradeCost(s, 0);
  s.tanks[0] = 11;
  const c11 = E.upgradeCost(s, 0);
  assert.ok(Math.abs(c11 / c1 - Math.pow(E.SPECIES[0].growth, 10)) < 1e-9);
});

test('bulk cost equals sum of single costs', () => {
  const s = E.newState(0);
  s.tanks[0] = 5;
  let sum = 0;
  const t = structuredClone(s);
  for (let k = 0; k < 10; k++) { sum += E.upgradeCost(t, 0); t.tanks[0]++; }
  assert.ok(Math.abs(E.upgradeCost(s, 0, 10) - sum) / sum < 1e-9);
});

test('maxAffordable never overspends', () => {
  const s = E.newState(0);
  for (const cash of [5, 10, 123, 9999, 1e6, 1e12]) {
    const n = E.maxAffordable(s, 0, cash);
    if (n) assert.ok(E.upgradeCost(s, 0, n) <= cash);
    assert.ok(E.upgradeCost(s, 0, n + 1) > cash);
  }
});

test('offline catch-up matches live play and respects cooler cap', () => {
  const a = E.newState(0);
  const b = E.newState(0);
  a.tanks[0] = b.tanks[0] = 20;
  E.catchUp(a, 30 * 60 * 1000);                  // 30 minutes away in one go
  for (let i = 0; i < 1800; i++) E.advance(b, 1);  // 30 minutes live
  assert.ok(Math.abs(a.pending - b.pending) < 1e-6);

  const c = E.newState(0);
  const res = E.catchUp(c, 72 * 3600 * 1000);      // 3 days away
  assert.equal(c.pending, E.coolerCapacity(c));
  assert.ok(res.full);
});

test('clock going backwards earns nothing', () => {
  const s = E.newState(10_000);
  const r = E.catchUp(s, 0);
  assert.equal(r.made, 0);
  assert.equal(s.pending, 0);
});

test('tanks unlock in order', () => {
  const s = E.newState(0);
  s.cash = 1e20;
  assert.equal(E.unlockTank(s, 2), false);
  assert.equal(E.unlockTank(s, 1), true);
  assert.equal(E.unlockTank(s, 2), true);
});

test('prestige keeps pearls + research, resets tanks', () => {
  const s = E.newState(0);
  s.runEarnings = E.PRESTIGE_MIN * 16;
  s.research.feed = 3;
  s.tanks[0] = 50;
  const got = E.prestige(s, 0);
  assert.equal(got, 4);
  assert.equal(s.pearls, 4);
  assert.equal(s.research.feed, 3);
  assert.equal(s.tanks[0], 1);
});

test('fmt', () => {
  assert.equal(E.fmt(17720), '17.7K');
  assert.equal(E.fmt(999999), '1.00M');
  assert.equal(E.fmt(999950), '1.00M');
  assert.equal(E.fmt(99960), '100K');
  assert.equal(E.fmt(9.96), '10');
  assert.equal(E.fmt(2e6), '2.00M');
  assert.equal(E.fmt(12), '12');
  for (let k = 1; k < 40; k++) assert.doesNotMatch(E.fmt(999.7 * Math.pow(1000, k)), /^1000/);
});

test('maxAffordable finds exactly n levels when cash equals their cost', () => {
  const s = E.newState(0);
  for (const lv of [1, 7, 30]) for (let n = 1; n < 60; n++) {
    s.tanks[0] = lv;
    assert.equal(E.maxAffordable(s, 0, E.upgradeCost(s, 0, n)), n);
  }
});

test('sanitize repairs garbage saves', () => {
  const s = E.sanitize({ cash: '1e30', tanks: 'abc', research: { feed: 'x', cold: 50 }, buyMode: '10', pearls: -3 }, 0);
  assert.equal(s.cash, 1e30);
  assert.deepEqual(s.tanks, [1, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(s.research.feed, 0);
  assert.equal(s.research.cold, E.RESEARCH.cold.max);
  assert.equal(s.buyMode, 1);
  assert.equal(s.pearls, 0);
  const t = E.sanitize({ tanks: [5, 0, 9, 2.7], cash: NaN, pending: 1e300 }, 0);
  assert.deepEqual(t.tanks.slice(0, 4), [5, 0, 0, 0]);
  assert.equal(t.cash, 0);
  assert.equal(t.pending, E.coolerCapacity(t));
  assert.deepEqual(E.sanitize(null, 0), E.newState(0));
});
