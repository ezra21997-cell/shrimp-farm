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

const close = (a, b, rel = 1e-9, abs = 1e-9) => Math.abs(a - b) <= abs + rel * Math.max(Math.abs(a), Math.abs(b));
const sortedTransit = (s) => [...s.transit].sort((x, y) => x.i - y.i || x.d - y.d);

function assertSameFarm(a, b) {
  assert.ok(close(a.pending, b.pending), `pending ${a.pending} vs ${b.pending}`);
  assert.ok(close(a.runEarnings, b.runEarnings));
  const ta = sortedTransit(a), tb = sortedTransit(b);
  assert.equal(ta.length, tb.length, 'transit length');
  ta.forEach((u, k) => {
    assert.equal(u.i, tb[k].i);
    assert.ok(close(u.v, tb[k].v));
    assert.ok(close(u.d, tb[k].d, 1e-9, 1e-6), `d ${u.d} vs ${tb[k].d}`);
  });
  a.acc.forEach((x, i) => assert.ok(close(x, b.acc[i], 1e-9, 1e-6), `acc ${i}`));
}

test('offline catch-up matches live play and respects cooler cap', () => {
  const a = E.newState(0);
  const b = E.newState(0);
  a.tanks[0] = b.tanks[0] = 20;
  E.catchUp(a, 30 * 60 * 1000);                    // 30 minutes away in one go
  for (let t = 1; t <= 1800; t++) E.catchUp(b, t * 1000);  // 30 minutes live
  assertSameFarm(a, b);

  const c = E.newState(0);
  const res = E.catchUp(c, 72 * 3600 * 1000);      // 3 days away
  assert.equal(c.pending, E.coolerCapacity(c));
  assert.ok(res.full);
});

test('tick is step-size independent with several tanks at high levels', () => {
  const mk = () => {
    const s = E.newState(0);
    s.tanks = [1, 3, 7, 12, 60, 150, 499, 1000];
    s.research.feed = 4;
    s.pearls = 3;
    s.research.cold = 11;
    s.acc = [0.3, 0, 1.1, 0.5, 0, 0.9, 0.2, 1.19];
    return s;
  };
  const a = mk(), b = mk(), c = mk();
  const T = 3600 + 0.123;
  E.tick(a, T);
  const n = 216007;                                  // ~60 fps for an hour
  for (let k = 0; k < n; k++) E.tick(b, T / n);
  // Irregular steps, including some larger than an interval or a whole trip.
  let left = T, k = 0;
  while (left > 0) {
    const dt = Math.min(left, [0.016, 0.7, 2.9, 0.004, 31.3, 0.25][k++ % 6]);
    E.tick(c, dt);
    left -= dt;
  }
  assert.ok(a.pending > 0);
  assert.ok(a.transit.length > 10);
  assertSameFarm(a, b);
  assertSameFarm(a, c);
});

test('nothing is counted before the first unit reaches the cooler', () => {
  const s = E.newState(0);
  const T = E.unitInterval(1);
  const travel = E.pathLength(0) / E.BELT_SPEED;
  E.tick(s, T + 0.01);                     // first unit has just spawned
  assert.equal(s.pending, 0);
  assert.equal(s.transit.length, 1);
  assert.ok(close(s.transit[0].d, 0.01 * E.BELT_SPEED));
  E.tick(s, travel - 0.02);                // still riding
  assert.equal(s.pending, 0);
  assert.equal(s.runEarnings, 0);
  const r = E.tick(s, 0.02);               // lands
  assert.ok(close(s.pending, E.unitValue(s, 0)));
  assert.equal(r.arrived.length, 1);
  assert.deepEqual(r.arrived[0], { i: 0, v: E.unitValue(s, 0), lost: false });
  assert.ok(close(r.made, E.unitValue(s, 0)));
});

test('a far tank takes longer to deliver', () => {
  const s = E.newState(0);
  s.tanks[0] = 0; s.tanks[1] = 0; s.tanks[3] = 1;   // only tank 3 (test-only setup)
  const T = E.unitInterval(1);
  E.tick(s, T + E.pathLength(3) / E.BELT_SPEED - 0.01);
  assert.equal(s.pending, 0);
  E.tick(s, 0.02);
  assert.ok(close(s.pending, E.unitValue(s, 3)));
});

test('steady-state income matches totalRate', () => {
  const s = E.newState(0);
  s.tanks = [40, 25, 11, 3, 1, 0, 0, 0];
  s.research.cold = 11;
  const secs = 6 * 3600;
  const r = E.tick(s, secs);
  assert.equal(r.lost, 0);
  const expected = E.totalRate(s) * secs;
  assert.ok(Math.abs(s.pending - expected) / expected < 0.005, `${s.pending} vs ${expected}`);
  // Value on the belt is bounded by one trip's worth of income per tank.
  const onBelt = s.transit.reduce((t, u) => t + u.v, 0);
  assert.ok(onBelt > 0 && onBelt < E.totalRate(s) * (E.pathLength(4) / E.BELT_SPEED + 3));
});

test('multi-day catch-up fills the cooler exactly and reports what was lost', () => {
  const s = E.newState(0);
  s.tanks = [30, 12, 5, 0, 0, 0, 0, 0];
  const probe = structuredClone(s);
  probe.research.cold = 1e6;                          // no cap, to measure total output
  const days = 3 * 86400;
  E.tick(probe, days);
  const produced = probe.pending;
  const res = E.catchUp(s, days * 1000);
  const cap = E.coolerCapacity(s);
  assert.equal(s.pending, cap);
  assert.ok(res.full);
  assert.equal(res.made, cap);
  assert.ok(close(res.lost, produced - cap, 1e-9));
  assert.ok(res.arrived.length > 0 && res.arrived.length <= E.ARRIVED_CAP);
  assert.ok(res.arrived.every((a) => a.lost));
  assert.ok(close(s.runEarnings, cap));
  // Already full: everything that lands is lost.
  const again = E.catchUp(s, days * 1000 + 60_000);
  assert.ok(again.wasFullAlready && again.full);
  assert.equal(again.made, 0);
  assert.ok(again.lost > 0);
});

test('cooler fills mid-step: arrivals flip to lost at the right unit', () => {
  const s = E.newState(0);
  s.tanks[0] = 5;
  const v = E.unitValue(s, 0);
  s.pending = E.coolerCapacity(s) - 2.5 * v;           // room for 2.5 units
  for (let k = 0; k < 5; k++) s.transit.push({ i: 0, v, d: k * 0.1 });
  const r = E.tick(s, E.pathLength(0) / E.BELT_SPEED);
  assert.deepEqual(r.arrived.map((a) => a.lost), [false, false, true, true, true]);
  assert.ok(close(r.made, 2.5 * v));
  assert.ok(close(r.lost, 2.5 * v));
});

test('handFeed only pays on arrival', () => {
  const s = E.newState(0);
  s.tanks[0] = 4;
  assert.equal(E.handFeed(s, 3), 0);                   // locked tank
  const v = E.handFeed(s, 0);
  assert.equal(v, E.tankRate(s, 0));
  assert.equal(s.cash, 0);
  assert.equal(s.pending, 0);
  assert.equal(s.runEarnings, 0);
  assert.deepEqual(s.transit, [{ i: 0, v, d: 0 }]);
  s.acc[0] = -1e9;                                     // keep the tank's own units out (clamped to 0)
  const travel = E.pathLength(0) / E.BELT_SPEED;
  const r = E.tick(s, travel);
  assert.ok(r.arrived.some((a) => a.v === v));
  assert.ok(s.pending >= v);
});

test('upgrades do not change units already on the belt', () => {
  const s = E.newState(0);
  s.tanks[0] = 5;
  E.tick(s, 3);
  const before = s.transit.map((u) => u.v);
  s.tanks[0] = 200;
  assert.deepEqual(s.transit.map((u) => u.v), before);
  E.tick(s, 0.01);
  assert.deepEqual(s.transit.slice(0, before.length).map((u) => u.v), before);
});

test('unitValue times rate equals tankRate', () => {
  const s = E.newState(0);
  for (const lv of [1, 2, 9, 10, 11, 12, 13, 100, 1000]) {
    s.tanks[0] = lv;
    assert.ok(close(E.unitValue(s, 0) / E.unitInterval(lv), E.tankRate(s, 0)));
  }
  assert.equal(E.unitInterval(1), 2.6);
  assert.equal(E.unitInterval(1000), 1.2);
  assert.equal(E.pathLength(2), E.FEED_LEN + E.MAIN_TO_COOLER + 2 * E.SPACING);
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
  s.runEarnings = E.PRESTIGE_MIN * 27;
  s.research.feed = 3;
  s.tanks[0] = 50;
  const got = E.prestige(s, 0);
  assert.equal(got, 3);
  assert.equal(s.pearls, 3);
  assert.equal(s.research.feed, 3);
  assert.equal(s.tanks[0], 1);
});

test('prestige clears the conveyor', () => {
  const s = E.newState(0);
  s.tanks[0] = 50;
  E.tick(s, 10);
  E.handFeed(s, 0);
  assert.ok(s.transit.length > 0);
  s.runEarnings = E.PRESTIGE_MIN;
  E.prestige(s, 0);
  assert.deepEqual(s.transit, []);
  assert.deepEqual(s.acc, E.SPECIES.map(() => 0));
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

test('sanitize repairs the conveyor and loads old saves', () => {
  const old = E.sanitize({ cash: 5, tanks: [3, 1] }, 0);   // save from before the conveyor
  assert.deepEqual(old.transit, []);
  assert.deepEqual(old.acc, E.SPECIES.map(() => 0));
  E.tick(old, 60);                                            // and it runs
  assert.ok(old.pending > 0);

  const s = E.sanitize({
    tanks: [3, 1],
    acc: [0.5, 'x', 7, null, -1],
    transit: [
      { i: 0, v: 10, d: 1 },          // fine
      { i: 1, v: 5, d: 999 },         // d clamped to path end
      { i: 0, v: 5, d: -3 },          // d clamped to 0
      { i: 8, v: 1, d: 0 },           // no such tank
      { i: 2, v: 1, d: 0 },           // locked tank
      { i: 0.5, v: 1, d: 0 },
      { i: 0, v: -1, d: 0 },
      { i: 0, v: Infinity, d: 0 },
      { i: 0, v: 1, d: NaN },
      { i: '0', v: '2', d: '0.5' },   // numeric strings are fine
      null, 'junk', 7,
    ],
  }, 0);
  assert.deepEqual(s.transit, [
    { i: 0, v: 10, d: 1 },
    { i: 1, v: 5, d: E.pathLength(1) },
    { i: 0, v: 5, d: 0 },
    { i: 0, v: 2, d: 0.5 },
  ]);
  assert.equal(s.acc.length, E.SPECIES.length);
  assert.equal(s.acc[0], 0.5);
  assert.equal(s.acc[1], 0);
  assert.equal(s.acc[2], 0);                                  // locked
  const big = E.sanitize({ transit: Array.from({ length: 5000 }, () => ({ i: 0, v: 1, d: 0 })) }, 0);
  assert.equal(big.transit.length, E.TRANSIT_CAP);
  assert.equal(E.sanitize({ transit: 'nope', acc: {} }, 0).transit.length, 0);
});
