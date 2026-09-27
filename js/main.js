import * as E from './economy.js';
import { Farm } from './scene.js';

const SAVE_KEY = 'shrimpfarm.save.v1';
const $ = (id) => document.getElementById(id);

// ---------- save / load ----------

const BACKUP_KEY = SAVE_KEY + '.bak';
let loadProblem = null;

function readKey(key) {
  let raw = null;
  try { raw = localStorage.getItem(key); } catch { return { raw: null, state: null }; }
  if (!raw) return { raw, state: null };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.tanks)) return { raw, state: E.sanitize(parsed) };
  } catch (e) {
    console.warn('Could not load save', e);
  }
  return { raw, state: null };
}

// Load the save; if it's damaged, fall back to the backup, and never silently
// throw the damaged data away.
function load() {
  const main = readKey(SAVE_KEY);
  if (main.state) return main.state;
  if (main.raw) {
    try { localStorage.setItem(`${SAVE_KEY}.corrupt-${Date.now()}`, main.raw); } catch {}
    const bak = readKey(BACKUP_KEY);
    if (bak.state) {
      loadProblem = 'Your save was damaged, so the farm was restored from a backup a few minutes older.';
      return bak.state;
    }
    loadProblem = 'Your save was damaged and no backup was found, so a new farm was started. The damaged data was kept in case it can be recovered.';
  }
  return E.newState();
}

let lastBackup = 0;
function save() {
  try {
    const json = JSON.stringify(state);
    localStorage.setItem(SAVE_KEY, json);
    // Keep an older copy around in case the main save gets damaged.
    if (Date.now() - lastBackup > 5 * 60 * 1000) {
      localStorage.setItem(BACKUP_KEY, json);
      lastBackup = Date.now();
    }
  } catch (e) {
    console.warn('Could not save', e);
  }
}

const state = load();
// Ask the browser not to evict our save when storage is tight.
navigator.storage?.persist?.().catch(() => {});

// ---------- scene ----------

const farm = new Farm($('scene'));
window.addEventListener('resize', () => farm.resize());

// ---------- tank cards ----------

const cards = E.SPECIES.map((sp, i) => {
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = `
    <div class="name"><span>${sp.name}</span><span class="lv"></span></div>
    <button class="up"><span class="cost"></span><small class="what"></small></button>
    <div class="ms"><i></i></div>
    <div class="earn"></div>`;
  $('cards').appendChild(el);
  const btn = el.querySelector('.up');
  btn.addEventListener('click', () => {
    const ok = state.tanks[i] ? E.buyUpgrade(state, i) : E.unlockTank(state, i);
    if (ok) { renderCards(true); save(); }
  });
  return {
    el, btn,
    lv: el.querySelector('.lv'),
    ms: el.querySelector('.ms'),
    msBar: el.querySelector('.ms i'),
    cost: el.querySelector('.cost'),
    what: el.querySelector('.what'),
    earn: el.querySelector('.earn'),
  };
});

let lastCardText = 0;
function renderCards(force) {
  const now = performance.now();
  const refreshText = force || now - lastCardText > 150;
  if (refreshText) lastCardText = now;
  const top = $('topbar').getBoundingClientRect().bottom;
  const bottom = $('bottombar').getBoundingClientRect().top;

  E.SPECIES.forEach((sp, i) => {
    const c = cards[i];
    const lv = state.tanks[i];
    const visible = lv > 0 || i === 0 || state.tanks[i - 1] > 0;
    const pos = farm.tankScreen(i);
    const half = (c.el.offsetHeight || 110) / 2;
    const onScreen = visible && !pos.behind && pos.y - half > top + 4 && pos.y + half < bottom - 4;
    c.el.style.display = onScreen ? '' : 'none';
    if (!onScreen) return;
    c.el.style.top = `${pos.y}px`;
    if (!refreshText) return;

    if (lv > 0) {
      c.el.classList.remove('locked');
      c.btn.classList.remove('unlock');
      const n = E.buyCount(state, i);
      const cost = E.upgradeCost(state, i, n);
      c.lv.textContent = `Lv ${lv}`;
      c.cost.textContent = '$' + E.fmt(cost);
      c.btn.disabled = cost > state.cash;
      const next = E.nextMilestone(lv);
      const prev = [0, ...E.MILESTONES].filter((m) => m <= lv).pop();
      c.ms.style.display = '';
      c.msBar.style.width = next ? `${((lv - prev) / (next - prev)) * 100}%` : '100%';
      c.earn.textContent = `$${E.fmt(E.unitValue(state, i))} each\u2009·\u2009$${E.fmt(E.tankRate(state, i))}/s`;
      c.ms.title = next ? `×2 income at Lv ${next}` : '';
      c.what.textContent = next ? `+${n} Lv · ×2 at ${next}` : `+${n} Lv`;
    } else {
      c.el.classList.add('locked');
      c.btn.classList.add('unlock');
      c.lv.textContent = '🔒';
      c.ms.style.display = 'none';
      const cost = E.unlockCost(i);
      c.cost.textContent = '$' + E.fmt(cost);
      c.what.textContent = 'Build tank';
      c.btn.disabled = cost > state.cash;
      c.earn.textContent = `+$${E.fmt(sp.rate * E.globalMultiplier(state))}/s`;
    }
  });
}

// ---------- floating text ----------

const FLOAT_MS = 1400;
function floater(text, x, y, cls = '') {
  const el = document.createElement('div');
  el.className = 'floater ' + cls;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  $('floaters').appendChild(el);
  setTimeout(() => el.remove(), FLOAT_MS);
}

// Money only counts when a unit lands in the cooler, so that's where the
// "+$" shows up. Arrivals are grouped into one label every BATCH_MS so a busy
// belt reads as a steady ticker instead of a pile of overlapping numbers.
const BATCH_MS = 700;
const FULL_EVERY = 2000;
let batch = 0;
let batchStart = 0;
let batchSide = 1;
let lastFullFloater = -1e9;
function arrivalFloatersFor(arrived) {
  const now = performance.now();
  for (const a of arrived || []) {
    if (a.lost) {
      if (now - lastFullFloater < FULL_EVERY) continue;
      lastFullFloater = now;
      showAtCooler('Cooler full', 0, 'lost');
    } else {
      if (!batch) batchStart = now;
      batch += a.v;
    }
  }
  if (batch && now - batchStart >= BATCH_MS) {
    batchSide = -batchSide;
    showAtCooler('+$' + E.fmt(batch), batchSide * 28);
    batch = 0;
  }
}
function showAtCooler(text, dx, cls = '') {
  const p = farm.coolerScreen();
  if (p.behind || p.y < $('topbar').getBoundingClientRect().bottom
    || p.y > $('bottombar').getBoundingClientRect().top) return;
  floater(text, p.x + dx, p.y - (cls ? 24 : 10), cls);
}

// ---------- HUD ----------

function renderHud() {
  $('cash').textContent = E.fmt(state.cash);
  $('rate').textContent = '$' + E.fmt(E.totalRate(state));
  $('pearls').querySelector('span').textContent = E.fmt(state.pearls);
  $('pearls').hidden = state.pearls <= 0;
  $('hint').hidden = state.totalEarnings > 40 || state.cash >= 10;
  $('pending').textContent = E.fmt(state.pending);
  const cap = E.coolerCapacity(state);
  const frac = Math.min(1, state.pending / cap);
  $('fillbar').style.width = `${frac * 100}%`;
  const full = frac >= 0.999;
  $('collect').classList.toggle('full', full);
  if (full) {
    $('collect-lbl').textContent = 'COOLER FULL';
    $('collect-sub').textContent = 'collect to keep packing';
  } else {
    const rate = E.totalRate(state);
    const left = rate > 0 ? (cap - state.pending) / rate : 0;
    $('collect-lbl').textContent = 'COLLECT';
    $('collect-sub').textContent = `full in ${E.fmtDuration(left)}`;
  }
  $('btn-expand').classList.toggle('ready', E.pearlsForRun(state) > 0);
  const labReady = Object.keys(E.RESEARCH).some(
    (k) => state.research[k] < E.RESEARCH[k].max && E.researchCost(state, k) <= state.cash);
  $('btn-lab').classList.toggle('ready', labReady);
  $('buymode').textContent = state.buyMode === 'max' ? 'Buy MAX' : `Buy ×${state.buyMode}`;
}

$('collect').addEventListener('click', () => {
  const amt = E.collect(state);
  if (amt > 0) {
    const p = farm.coolerScreen();
    floater('+$' + E.fmt(amt), p.x, p.y, 'tap');
    save();
  }
  renderCards(true);
});

$('buymode').addEventListener('click', () => {
  state.buyMode = state.buyMode === 1 ? 10 : state.buyMode === 10 ? 'max' : 1;
  renderCards(true);
  renderHud();
  save();
});

// ---------- sheets (lab / expand / farm menu / welcome back) ----------

let sheetRender = null;
function openSheet(render) {
  sheetRender = render;
  $('sheet-body').innerHTML = render();
  $('sheet').hidden = false;
  $('sheet-backdrop').hidden = false;
}
function refreshSheet() {
  if (sheetRender && !$('sheet').hidden) $('sheet-body').innerHTML = sheetRender();
}
function closeSheet() {
  sheetRender = null;
  $('sheet').hidden = true;
  $('sheet-backdrop').hidden = true;
}
$('sheet-backdrop').addEventListener('click', closeSheet);

// Actions inside sheets use data-act attributes.
$('sheet').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const [act, arg] = b.dataset.act.split(':');
  if (act === 'close') return closeSheet();
  if (act === 'research') {
    if (E.buyResearch(state, arg)) save();
  } else if (act === 'prestige') {
    if (!confirm(`Sell this farm for ${E.fmt(E.pearlsForRun(state))} pearls? Tanks and cash reset; research is kept.`)) return;
    const got = E.prestige(state);
    if (got) {
      save();
      closeSheet();
      farm.focusZ = 0;
      openSheet(() => `
        <h2>New farm! 🏗️</h2>
        <p>You sold the old farm and earned <b>${E.fmt(got)} pearls</b>.
        You now have ${E.fmt(state.pearls)} pearls, boosting every tank by +${E.fmt(state.pearls * E.PEARL_BONUS * 100)}%.</p>
        <button class="btn wide" data-act="close">Start farming</button>`);
      return;
    }
  } else if (act === 'export') {
    const ta = $('sheet').querySelector('textarea');
    ta.value = btoa(JSON.stringify(state));
    ta.select();
    return;
  } else if (act === 'import') {
    const ta = $('sheet').querySelector('textarea');
    try {
      const parsed = JSON.parse(atob(ta.value.trim()));
      if (!parsed || !Array.isArray(parsed.tanks)) throw new Error('not a save');
      const s = E.sanitize(parsed);
      const summary = (x) => `${x.tanks.filter(Boolean).length} tanks, $${E.fmt(x.cash)} cash, $${E.fmt(E.totalRate(x))}/s`;
      if (!confirm(`Replace your farm (${summary(state)})\nwith the imported farm (${summary(s)})?`)) return;
      try { localStorage.setItem(SAVE_KEY + '.before-import', JSON.stringify(state)); } catch {}
      Object.keys(state).forEach((k) => delete state[k]);
      Object.assign(state, s);
      state.lastSeen = Date.now();
      save();
      closeSheet();
      renderCards(true);
    } catch {
      alert("That save code didn't work.");
    }
    return;
  } else if (act === 'wipe') {
    if (confirm('Delete your farm and start over? This cannot be undone.')) {
      localStorage.removeItem(SAVE_KEY);
      Object.keys(state).forEach((k) => delete state[k]);
      Object.assign(state, E.newState());
      save();
      closeSheet();
      location.reload();
    }
    return;
  }
  refreshSheet();
  renderCards(true);
});

function labSheet() {
  const rows = Object.entries(E.RESEARCH).map(([k, r]) => {
    const lv = state.research[k];
    const maxed = lv >= r.max;
    const cost = E.researchCost(state, k);
    let now = '';
    if (k === 'feed') now = `Now ×${Math.pow(1.2, lv).toFixed(2)}`;
    if (k === 'cold') now = `Now ${E.coolerHours(state)}h`;
    if (k === 'hatch') now = `Now −${Math.round((1 - Math.pow(0.95, lv)) * 100)}%`;
    return `<div class="row">
      <div class="info"><b>${r.name} <small>Lv ${lv}</small></b><span>${r.desc} ${now}</span></div>
      <button class="btn" data-act="research:${k}" ${maxed || cost > state.cash ? 'disabled' : ''}>
        ${maxed ? 'MAX' : '$' + E.fmt(cost)}</button>
    </div>`;
  }).join('');
  return `<h2>🧪 Research Lab</h2><p>Permanent upgrades. They carry over when you expand.</p>${rows}`;
}

function expandSheet() {
  const gain = E.pearlsForRun(state);
  const need = E.PRESTIGE_MIN;
  const pct = Math.min(100, (state.runEarnings / need) * 100);
  return `<h2>🏗️ Expand the Farm</h2>
    <p>Sell this farm and buy a bigger one. Tanks and cash reset; research is kept.
    You earn <b>pearls</b> — each one permanently adds +${E.PEARL_BONUS * 100}% income.</p>
    <table class="stats">
      <tr><td>Earned on this farm</td><td>$${E.fmt(state.runEarnings)}</td></tr>
      <tr><td>Pearls you have</td><td>🦪 ${E.fmt(state.pearls)}</td></tr>
      <tr><td>Pearls if you expand now</td><td>🦪 +${E.fmt(gain)}</td></tr>
    </table>
    ${gain
      ? `<button class="btn wide orange" data-act="prestige">Expand for +${E.fmt(gain)} 🦪</button>`
      : `<p>Earn $${E.fmt(need)} on this farm to unlock expanding (${pct.toFixed(1)}%).</p>`}
    <p style="font-size:12px">Pearls earned grow with the cube root of what this farm made: 8× the earnings for 2× the pearls.</p>`;
}

function menuSheet() {
  const days = (Date.now() - state.created) / 86400000;
  return `<h2>⚙️ Farm</h2>
    <table class="stats">
      <tr><td>Income</td><td>$${E.fmt(E.totalRate(state))}/s</td></tr>
      <tr><td>Cooler holds</td><td>${E.coolerHours(state)}h · $${E.fmt(E.coolerCapacity(state))}</td></tr>
      <tr><td>Earned all-time</td><td>$${E.fmt(state.totalEarnings)}</td></tr>
      <tr><td>Farming for</td><td>${days.toFixed(1)} days</td></tr>
    </table>
    <p><b>How it works:</b> each tank sends its catch down the conveyor one at a time,
    and it's worth money once it lands in the cooler. Tanks keep producing while the game
    is closed: when you come back, the game works out everything that reached the cooler
    while you were gone — up to its limit. Collect it, upgrade, and research Cold Storage
    in the lab to stay away longer.</p>
    <p><b>Backup save</b> (copy this somewhere to move your farm between devices):</p>
    <textarea spellcheck="false" placeholder="Tap Export, or paste a code and tap Import"></textarea>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="btn ghost" data-act="export">Export</button>
      <button class="btn ghost" data-act="import">Import</button>
      <span style="flex:1"></span>
      <button class="btn red" data-act="wipe">Reset</button>
    </div>`;
}

$('btn-lab').addEventListener('click', () => openSheet(labSheet));
$('btn-expand').addEventListener('click', () => openSheet(expandSheet));
$('btn-menu').addEventListener('click', () => openSheet(menuSheet));

// Called from every path that notices time passed (open, tab visible, first
// frame after a sleep) — whichever sees the gap first shows the summary.
function welcomeBack(res) {
  if (res.elapsed < 60) return;
  if (!$('sheet').hidden) {
    // Don't wipe out a sheet the player is using (e.g. mid-import).
    const p = farm.coolerScreen();
    floater(`+$${E.fmt(res.made)} delivered while away`, window.innerWidth / 2, p.y, 'tap');
    return;
  }
  const cap = E.coolerCapacity(state);
  openSheet(() => `
    <h2>Welcome back 🦐</h2>
    <p>You were away for <b>${E.fmtDuration(res.elapsed)}</b>. The conveyor delivered this catch to the cooler:</p>
    <div class="big">+$${E.fmt(res.made)}</div>
    ${res.wasFullAlready
      ? `<p>⚠️ The cooler was already full when you left, so nothing more could be packed.
         Collect before you go, and research <b>Cold Storage</b> to hold more.</p>`
      : res.full
      ? `<p>⚠️ The cooler filled up (it holds ${E.coolerHours(state)}h of catch), so some was lost.
         Research <b>Cold Storage</b> to hold more.</p>`
      : `<p>Cooler is ${Math.round((state.pending / cap) * 100)}% full.</p>`}
    <button class="btn wide orange" data-act="close" id="wb-collect">Collect $${E.fmt(state.pending)}</button>`);
  $('wb-collect').addEventListener('click', () => $('collect').click());
}

// ---------- touch: drag to scroll, tap tanks ----------

const canvas = $('scene');
const FEED_COOLDOWN = 2000;
const fedAt = [];
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = { y: e.clientY, x: e.clientX, startY: e.clientY, t: performance.now(), moved: 0, vel: 0 };
  farm.dragging = true;
  farm.focusVel = 0;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dy = e.clientY - drag.y;
  const now = performance.now();
  const dz = -dy * farm.unitsPerPixel();
  farm.focusZ += dz;
  const dtm = Math.max(1, now - drag.t) / 1000;
  drag.vel = drag.vel * 0.6 + (dz / dtm) * 0.4;
  drag.moved += Math.abs(dy) + Math.abs(e.clientX - drag.x);
  drag.y = e.clientY; drag.x = e.clientX; drag.t = now;
});
canvas.addEventListener('pointerup', (e) => {
  if (!drag) return;
  farm.dragging = false;
  if (drag.moved < 10) {
    const hit = farm.pick(e.clientX, e.clientY);
    if (hit?.kind === 'cooler') $('collect').click();
    else if (hit?.kind === 'tank' && state.tanks[hit.i] && performance.now() - (fedAt[hit.i] || -1e9) > FEED_COOLDOWN) {
      // Hand-feed: an extra unit goes on the belt, once per cooldown. Its money
      // shows up at the cooler when it lands.
      fedAt[hit.i] = performance.now();
      if (E.handFeed(state, hit.i) > 0) {
        floater(`+1 ${E.SPECIES[hit.i].unit}`, e.clientX, e.clientY - 20, 'feed');
      }
    }
  } else if (performance.now() - drag.t < 80) {
    farm.focusVel = drag.vel;
  }
  drag = null;
});
canvas.addEventListener('pointercancel', () => { drag = null; farm.dragging = false; });

// ---------- time: live ticks + offline catch-up ----------

// On open: work out what the conveyor delivered while we were away.
welcomeBack(E.catchUp(state));
if (loadProblem) {
  openSheet(() => `<h2>Save problem</h2><p>${loadProblem}</p>
    <button class="btn wide" data-act="close">OK</button>`);
}
save();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    E.catchUp(state);
    save();
  } else {
    welcomeBack(E.catchUp(state));
    renderCards(true);
  }
});
window.addEventListener('pagehide', () => { E.catchUp(state); save(); });

let prev = performance.now();
let saveT = 0;
function frame(t) {
  const dt = Math.min(0.1, (t - prev) / 1000);
  prev = t;
  // Wall-clock based, so a throttled/background tab still earns correctly.
  const res = E.catchUp(state);
  welcomeBack(res);
  farm.sync(state);
  farm.update(dt, t / 1000, state, state.pending / E.coolerCapacity(state), res.arrived);
  renderCards(false);
  renderHud();
  if (res.elapsed < 60) arrivalFloatersFor(res.arrived);
  saveT += dt;
  if (saveT > 5) { saveT = 0; save(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Offline support + home-screen install.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
