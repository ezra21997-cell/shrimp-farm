// Pure game math. No DOM, no three.js — so it can be unit-tested in Node.

// Each species is one tank on the farm. Costs grow exponentially per level
// (cost = upgradeBase * growth^(level-1)), income grows linearly per level and
// doubles at milestone levels. Each tier unlocks for far more than the last.
// `unit` is the noun for one unit of product, used in UI copy.
export const SPECIES = [
  { id: 'shrimp',   name: 'Shrimp',       unlock: 0,      rate: 1,      upgradeBase: 7.1,     growth: 1.3, unit: 'shrimp' },
  { id: 'crayfish', name: 'Crayfish',     unlock: 10000,   rate: 10,      upgradeBase: 4100,    growth: 1.286, unit: 'crayfish' },
  { id: 'tilapia',  name: 'Tilapia',      unlock: 3.4e6,    rate: 110,     upgradeBase: 1.4e6,    growth: 1.272, unit: 'tilapia' },
  { id: 'catfish',  name: 'Catfish',      unlock: 2e8,    rate: 1100,    upgradeBase: 8.2e7,  growth: 1.26, unit: 'catfish' },
  { id: 'trout',    name: 'Rainbow Trout',unlock: 6e9,    rate: 11000,  upgradeBase: 2.5e9,    growth: 1.249, unit: 'trout' },
  { id: 'salmon',   name: 'Salmon',       unlock: 1.7e11,   rate: 1.1e5,  upgradeBase: 7e10, growth: 1.239, unit: 'salmon' },
  { id: 'sturgeon', name: 'Sturgeon',     unlock: 4.5e12, rate: 1.2e6,    upgradeBase: 1.8e12, growth: 1.23, unit: 'sturgeon' },
  { id: 'tuna',     name: 'Bluefin Tuna', unlock: 1.2e14,   rate: 1.2e7,  upgradeBase: 4.9e13, growth: 1.221, unit: 'tuna' },
];

export const MILESTONES = [10, 25, 50, 100, 150, 200, 300, 400, 500];

// Research: global upgrades bought in the lab. All exponential.
export const RESEARCH = {
  feed:  { name: 'Premium Feed',   desc: 'All tanks earn ×1.2 per level.',             base: 1.3e5, growth: 8.6, max: Infinity },
  cold:  { name: 'Cold Storage',   desc: 'Cooler holds +2 hours of catch per level.',    base: 520, growth: 12, max: 11 },
  hatch: { name: 'Hatchery Deals', desc: 'Tank upgrades cost 5% less per level.',        base: 1.5e5, growth: 4.5, max: 10 },
};

export const BASE_COOLER_HOURS = 2;
export const PEARL_BONUS = 0.2;          // +20% income per pearl
export const PRESTIGE_MIN = 8.7e8;         // run earnings needed before expanding

// ---------- conveyor geometry (shared with the 3D scene) ----------
// Each tank sends individual units of product along its side feeder, then down
// the main belt into the cooler. Money only counts when a unit lands in the cooler.
export const BELT_SPEED = 1.8;      // world units per second
export const FEED_LEN = 2.6;        // side feeder: tank -> main belt
export const MAIN_TO_COOLER = 4.6;  // main belt from tank 0's junction to the cooler
export const SPACING = 5;           // distance between tanks along the main belt
export const ARRIVED_CAP = 30;      // max individual arrivals tick() reports
export const TRANSIT_CAP = 400;     // max units kept on the belt in a save

// Distance a unit from tank i travels from spawn to the cooler.
export function pathLength(i) {
  return FEED_LEN + MAIN_TO_COOLER + SPACING * i;
}

// Seconds between units for a tank at `level`. Faster at higher levels, down to 1.2s.
export function unitInterval(level) {
  if (!(level >= 1)) return 2.6;
  return Math.max(1.2, 2.6 / (1 + Math.log10(level)));
}

export function newState(now = Date.now()) {
  return {
    v: 1,
    cash: 0,
    pending: 0,          // money packed in the cooler, not yet collected
    runEarnings: 0,      // earned this farm (drives pearls)
    totalEarnings: 0,    // all-time
    pearls: 0,
    tanks: SPECIES.map((_, i) => (i === 0 ? 1 : 0)), // level per tank, 0 = locked
    research: { feed: 0, cold: 0, hatch: 0 },
    buyMode: 1,          // 1, 10, or 'max'
    transit: [],         // units on the belt: { i: tank, v: $ value, d: distance travelled }
    acc: SPECIES.map(() => 0), // seconds since each tank's last unit
    lastSeen: now,
    created: now,
  };
}

// Turn anything (old saves, pasted imports, hand-edited JSON) into a valid
// state. Every number is coerced and bounded; anything unusable gets the default.
export function sanitize(raw, now = Date.now()) {
  const base = newState(now);
  if (!raw || typeof raw !== 'object') return base;
  const num = (v, d, lo = 0) => {
    const x = Number(v);
    return Number.isFinite(x) && x >= lo ? x : d;
  };
  const int = (v, d, lo, hi) => Math.min(hi, Math.floor(num(v, d, lo)));
  const out = base;
  out.cash = num(raw.cash, 0);
  out.pending = num(raw.pending, 0);
  out.runEarnings = num(raw.runEarnings, 0);
  out.totalEarnings = Math.max(num(raw.totalEarnings, 0), out.runEarnings);
  out.pearls = int(raw.pearls, 0, 0, Number.MAX_SAFE_INTEGER);
  const tanks = Array.isArray(raw.tanks) ? raw.tanks : [];
  out.tanks = SPECIES.map((_, i) => int(tanks[i], i === 0 ? 1 : 0, 0, 1e6));
  if (!out.tanks[0]) out.tanks[0] = 1;
  // A tank can't be open if the one before it is locked.
  for (let i = 1; i < out.tanks.length; i++) if (!out.tanks[i - 1]) out.tanks[i] = 0;
  const r = raw.research && typeof raw.research === 'object' ? raw.research : {};
  for (const k of Object.keys(RESEARCH)) out.research[k] = int(r[k], 0, 0, RESEARCH[k].max === Infinity ? 1e6 : RESEARCH[k].max);
  out.buyMode = [1, 10, 'max'].includes(raw.buyMode) ? raw.buyMode : 1;
  out.lastSeen = num(raw.lastSeen, now);
  out.created = num(raw.created, now);
  out.pending = Math.min(out.pending, coolerCapacity(out));
  const acc = Array.isArray(raw.acc) ? raw.acc : [];
  out.acc = SPECIES.map((_, i) => (out.tanks[i] ? Math.min(num(acc[i], 0), unitInterval(out.tanks[i])) : 0));
  const transit = Array.isArray(raw.transit) ? raw.transit : [];
  for (const u of transit) {
    if (out.transit.length >= TRANSIT_CAP) break;
    if (!u || typeof u !== 'object') continue;
    const i = Number(u.i);
    const v = Number(u.v);
    const d = Number(u.d);
    if (!Number.isInteger(i) || i < 0 || i >= SPECIES.length || !out.tanks[i]) continue;
    if (!Number.isFinite(v) || v < 0 || !Number.isFinite(d)) continue;
    out.transit.push({ i, v, d: Math.min(pathLength(i), Math.max(0, d)) });
  }
  return out;
}

export function milestoneCount(level) {
  let n = 0;
  for (const m of MILESTONES) if (level >= m) n++;
  return n;
}

export function nextMilestone(level) {
  return MILESTONES.find((m) => m > level) ?? null;
}

export function globalMultiplier(s) {
  return Math.pow(1.2, s.research.feed) * (1 + PEARL_BONUS * s.pearls);
}

export function tankRate(s, i) {
  const lv = s.tanks[i];
  if (!lv) return 0;
  return SPECIES[i].rate * lv * Math.pow(2, milestoneCount(lv)) * globalMultiplier(s);
}

export function totalRate(s) {
  let r = 0;
  for (let i = 0; i < SPECIES.length; i++) r += tankRate(s, i);
  return r;
}

// Dollar value of one unit from tank i, so steady-state income equals tankRate.
export function unitValue(s, i) {
  return tankRate(s, i) * unitInterval(s.tanks[i]);
}

export function coolerHours(s) {
  return BASE_COOLER_HOURS + 2 * s.research.cold;
}

export function coolerCapacity(s) {
  return Math.max(50, totalRate(s) * coolerHours(s) * 3600);
}

function discount(s) {
  return Math.pow(0.95, s.research.hatch);
}

// Cost of buying `n` levels starting at the current level (geometric series).
export function upgradeCost(s, i, n = 1) {
  const sp = SPECIES[i];
  const lv = s.tanks[i];
  const first = sp.upgradeBase * Math.pow(sp.growth, lv - 1) * discount(s);
  return first * (Math.pow(sp.growth, n) - 1) / (sp.growth - 1);
}

// Most levels affordable with `cash` (0 if not even one).
export function maxAffordable(s, i, cash) {
  const sp = SPECIES[i];
  const first = sp.upgradeBase * Math.pow(sp.growth, s.tanks[i] - 1) * discount(s);
  if (cash < first) return 0;
  let n = Math.floor(Math.log(cash * (sp.growth - 1) / first + 1) / Math.log(sp.growth));
  // Guard against float rounding at the boundary.
  while (n > 0 && upgradeCost(s, i, n) > cash) n--;
  while (upgradeCost(s, i, n + 1) <= cash) n++;
  return n;
}

// Resolve the buy-mode into a concrete level count for display/purchase.
export function buyCount(s, i) {
  if (s.buyMode === 'max') return Math.max(1, maxAffordable(s, i, s.cash));
  return s.buyMode;
}

export function unlockCost(i) {
  return SPECIES[i].unlock;
}

export function researchCost(s, key) {
  const r = RESEARCH[key];
  return r.base * Math.pow(r.growth, s.research[key]);
}

export function pearlsForRun(s) {
  if (s.runEarnings < PRESTIGE_MIN) return 0;
  return Math.floor(Math.cbrt(s.runEarnings / PRESTIGE_MIN) + 1e-9);
}

// ---------- actions (mutate state, return true on success) ----------

export function buyUpgrade(s, i) {
  if (!s.tanks[i]) return false;
  const n = buyCount(s, i);
  const cost = upgradeCost(s, i, n);
  if (cost > s.cash) return false;
  s.cash -= cost;
  s.tanks[i] += n;
  return true;
}

export function unlockTank(s, i) {
  if (s.tanks[i]) return false;
  if (i > 0 && !s.tanks[i - 1]) return false; // unlock in order
  const cost = unlockCost(i);
  if (cost > s.cash) return false;
  s.cash -= cost;
  s.tanks[i] = 1;
  return true;
}

export function buyResearch(s, key) {
  const r = RESEARCH[key];
  if (s.research[key] >= r.max) return false;
  const cost = researchCost(s, key);
  if (cost > s.cash) return false;
  s.cash -= cost;
  s.research[key]++;
  return true;
}

export function collect(s) {
  const amt = s.pending;
  s.cash += amt;
  s.pending = 0;
  return amt;
}

export function prestige(s, now = Date.now()) {
  const gained = pearlsForRun(s);
  if (!gained) return 0;
  const fresh = newState(now);
  fresh.pearls = s.pearls + gained;
  fresh.totalEarnings = s.totalEarnings;
  fresh.research = { ...s.research };   // lab research carries over
  fresh.buyMode = s.buyMode;
  fresh.created = s.created;
  Object.assign(s, fresh);   // also clears transit and acc
  return gained;
}

// Tap a tank: an extra unit goes on the belt. Like every unit, it only pays
// when it lands in the cooler. Returns its value (0 for a locked tank).
export function handFeed(s, i) {
  if (!s.tanks[i]) return 0;
  const v = tankRate(s, i);
  s.transit.push({ i, v, d: 0 });
  return v;
}

// Advance the farm by `seconds`: tanks spawn units on a fixed schedule, units
// ride the conveyor, and each unit's value goes into the cooler when it lands
// there. Once the cooler is full, arriving units are lost. Exact for any step
// size, so live play (tiny steps) and offline catch-up (one big step) agree.
//
// Per tank with interval T and acc a, unit k = 1, 2, … spawns at k*T - a and
// lands pathLength/BELT_SPEED later. Units that spawn and land within the step
// are counted in closed form; units still riding are added to s.transit.
//
// Returns { made, lost, arrived }: made went into the cooler, lost was thrown
// away, arrived lists up to ARRIVED_CAP of the latest individual arrivals as
// { i, v, lost } in the order they landed.
export function tick(s, seconds) {
  const res = { made: 0, lost: 0, arrived: [] };
  if (!(seconds > 0)) return res;
  if (!Array.isArray(s.transit)) s.transit = [];
  if (!Array.isArray(s.acc)) s.acc = [];

  let total = 0;        // value of everything landing this step
  const events = [];    // { t, i, v } — only the latest few per source are kept
  const keep = (t, i, v) => events.push({ t, i, v });

  // Units already on the belt.
  const dist = seconds * BELT_SPEED;
  const riding = [];
  for (const u of s.transit) {
    const L = pathLength(u.i);
    const d = u.d + dist;
    if (d >= L) {
      total += u.v;
      keep((L - u.d) / BELT_SPEED, u.i, u.v);
    } else {
      riding.push({ i: u.i, v: u.v, d });
    }
  }

  // New units from each tank.
  for (let i = 0; i < SPECIES.length; i++) {
    const lv = s.tanks[i];
    if (!lv) { s.acc[i] = 0; continue; }
    const T = unitInterval(lv);
    const v = unitValue(s, i);
    const travel = pathLength(i) / BELT_SPEED;
    // After an upgrade the interval can shrink below acc; the next unit is due now.
    const a = Math.min(Math.max(0, Number(s.acc[i]) || 0), T);
    const n = Math.floor((a + seconds) / T);                                  // spawned this step
    const m = Math.max(0, Math.min(n, Math.floor((a + seconds - travel) / T))); // …and landed
    total += m * v;
    for (let k = Math.max(1, m - ARRIVED_CAP + 1); k <= m; k++) keep(k * T - a + travel, i, v);
    for (let k = m + 1; k <= n; k++) {
      const d = (seconds - (k * T - a)) * BELT_SPEED;
      riding.push({ i, v, d: Math.min(pathLength(i), Math.max(0, d)) });
    }
    s.acc[i] = Math.min(T, Math.max(0, a + seconds - n * T));
  }
  s.transit = riding;

  // Fill the cooler.
  const room = Math.max(0, coolerCapacity(s) - s.pending);
  const made = Math.min(room, total);
  s.pending += made;
  s.runEarnings += made;
  s.totalEarnings += made;
  res.made = made;
  res.lost = total - made;

  // Report the latest arrivals, with lost flags from the running total.
  events.sort((x, y) => x.t - y.t);
  const tail = events.slice(-ARRIVED_CAP);
  let before = total;
  for (const e of tail) before -= e.v;
  for (const e of tail) {
    before += e.v;
    res.arrived.push({ i: e.i, v: e.v, lost: before > room * (1 + 1e-12) + 1e-9 });
  }
  return res;
}

// Called when the game opens, comes back to the foreground, and every frame.
// Uses wall-clock time so it works no matter how long the phone was asleep.
export function catchUp(s, now = Date.now()) {
  const elapsed = Math.max(0, (now - s.lastSeen) / 1000); // ignore clock going backwards
  const wasFullAlready = s.pending >= coolerCapacity(s) - 1e-9;
  const r = tick(s, elapsed);
  s.lastSeen = now;
  return { elapsed, made: r.made, lost: r.lost, full: r.lost > 0, wasFullAlready, arrived: r.arrived };
}

// ---------- formatting ----------

const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oct', 'Non', 'Dec'];

function suffix(tier) {
  if (tier < SUFFIX.length) return SUFFIX[tier];
  // aa, ab, ac… after decillion
  const k = tier - SUFFIX.length;
  return String.fromCharCode(97 + (Math.floor(k / 26) % 26)) + String.fromCharCode(97 + (k % 26));
}

// Round to 3 significant digits, then pick precision from the *rounded* value
// so we never print "1000K" or "10.0".
function sig3(v) {
  const r = Number(v.toPrecision(3));
  return r >= 100 ? r.toFixed(0) : r >= 10 ? r.toFixed(1) : r.toFixed(2);
}

export function fmt(n) {
  if (!isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n);
  if (n < 1000) {
    if (n >= 10 || n % 1 === 0) return String(Math.floor(n));
    const r = Math.round(n * 10) / 10;
    return r >= 10 ? '10' : r.toFixed(1);
  }
  let tier = Math.floor(Math.log10(n) / 3);
  let v = n / Math.pow(1000, tier);
  if (v < 1) { v *= 1000; tier--; }          // log10 float error
  if (Number(v.toPrecision(3)) >= 1000) { v /= 1000; tier++; }
  return sig3(v) + suffix(tier);
}

export function fmtDuration(sec) {
  sec = Math.floor(sec);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${sec}s`;
}
