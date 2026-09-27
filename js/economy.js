// Pure game math. No DOM, no three.js — so it can be unit-tested in Node.

// Each species is one tank on the farm. Costs grow exponentially per level
// (cost = upgradeBase * growth^(level-1)), income grows linearly per level and
// doubles at milestone levels. Each tier unlocks for far more than the last.
export const SPECIES = [
  { id: 'shrimp',   name: 'Shrimp',       unlock: 0,      rate: 1,      upgradeBase: 10,     growth: 1.16 },
  { id: 'crayfish', name: 'Crayfish',     unlock: 1500,   rate: 8,      upgradeBase: 600,    growth: 1.165 },
  { id: 'tilapia',  name: 'Tilapia',      unlock: 1e5,    rate: 60,     upgradeBase: 4e4,    growth: 1.17 },
  { id: 'catfish',  name: 'Catfish',      unlock: 7e6,    rate: 450,    upgradeBase: 2.8e6,  growth: 1.175 },
  { id: 'trout',    name: 'Rainbow Trout',unlock: 5e8,    rate: 3.4e3,  upgradeBase: 2e8,    growth: 1.18 },
  { id: 'salmon',   name: 'Salmon',       unlock: 4e10,   rate: 2.6e4,  upgradeBase: 1.6e10, growth: 1.185 },
  { id: 'sturgeon', name: 'Sturgeon',     unlock: 3.5e12, rate: 2e5,    upgradeBase: 1.4e12, growth: 1.19 },
  { id: 'tuna',     name: 'Bluefin Tuna', unlock: 3e14,   rate: 1.5e6,  upgradeBase: 1.2e14, growth: 1.195 },
];

export const MILESTONES = [10, 25, 50, 100, 150, 200, 300, 400, 500];

// Research: global upgrades bought in the lab. All exponential.
export const RESEARCH = {
  feed:  { name: 'Premium Feed',   desc: 'All tanks earn ×1.2 per level.',             base: 5000, growth: 12, max: Infinity },
  cold:  { name: 'Cold Storage',   desc: 'Cooler holds +2 hours of catch per level.',    base: 2000, growth: 10, max: 11 },
  hatch: { name: 'Hatchery Deals', desc: 'Tank upgrades cost 5% less per level.',        base: 25000, growth: 14, max: 10 },
};

export const BASE_COOLER_HOURS = 2;
export const PEARL_BONUS = 0.1;          // +10% income per pearl
export const PRESTIGE_MIN = 1e10;         // run earnings needed before expanding

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
  return Math.floor(Math.sqrt(s.runEarnings / PRESTIGE_MIN));
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
  Object.assign(s, fresh);
  return gained;
}

// Advance the farm by `seconds`. Everything the tanks produce goes into the
// cooler, which stops accepting catch once full. Used identically for live
// play (small steps) and for offline catch-up (one big step), so both paths
// always agree. Returns how much was actually packed.
export function advance(s, seconds) {
  if (!(seconds > 0)) return 0;
  const room = Math.max(0, coolerCapacity(s) - s.pending);
  const made = Math.min(room, totalRate(s) * seconds);
  s.pending += made;
  s.runEarnings += made;
  s.totalEarnings += made;
  return made;
}

// Called when the game opens or comes back to the foreground.
// Uses wall-clock time so it works no matter how long the phone was asleep.
export function catchUp(s, now = Date.now()) {
  const elapsed = Math.max(0, (now - s.lastSeen) / 1000); // ignore clock going backwards
  const before = s.pending;
  const made = advance(s, elapsed);
  s.lastSeen = now;
  return {
    elapsed,
    made,
    full: s.pending >= coolerCapacity(s) - 1e-9 && made < totalRate(s) * elapsed,
    wasFullAlready: before >= coolerCapacity(s) - 1e-9,
  };
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
