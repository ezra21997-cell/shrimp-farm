// The 3D farm: tanks stacked along a main conveyor that feeds a cooler.
import * as THREE from '../vendor/three.module.min.js';
import * as M from './models.js';
import { SPECIES, SPACING, BELT_SPEED, FEED_LEN, MAIN_TO_COOLER, pathLength } from './economy.js';

export { SPACING };
const TANK_X = -2.6;
const BELT_X = 1.5;
const BELT_W = 1.6;
const FEEDER_W = 0.7;
const COOLER_Z = 5.2;
const FEED_X0 = TANK_X + 1.5;          // where units leave the tank
const BELT_Y = 0.365;                   // top of the main belt and feeders (flush)
const CORNER_R = 0.45;                  // units round the feeder -> belt corner on this radius
const DIP_LEN = 0.8;                    // last stretch of path where units drop into the cooler
const UNIT_CAP = 60;                    // instanced units per species
const TANK_COLORS = ['#80cbc4', '#ffab91', '#9fa8da', '#a5d6a7', '#fff59d', '#f48fb1', '#b0bec5', '#81d4fa'];

export function tankZ(i) { return -i * SPACING; }

// The economy's path lengths must match the layout drawn here.
if (Math.abs(BELT_X - FEED_X0 - FEED_LEN) > 1e-9) console.error('scene: FEED_LEN does not match the feeder layout');
if (Math.abs(tankZ(0) + MAIN_TO_COOLER - (COOLER_Z - 0.6)) > 1e-9) console.error('scene: MAIN_TO_COOLER does not match the cooler position');

// Stable pseudo-random in [0, 1) from an integer.
function hash(n) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Farm {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#bfe7f7');
    this.scene.fog = new THREE.Fog('#bfe7f7', 60, 110);

    this.camera = new THREE.PerspectiveCamera(32, 1, 1, 200);
    this.focusZ = 0;
    this.focusVel = 0;

    const hemi = new THREE.HemisphereLight('#ffffff', '#7cb342', 1.4);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
    sun.position.set(-8, 20, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 60;
    sun.shadow.bias = -0.0008;
    this.sun = sun;
    this.scene.add(sun, sun.target);

    this.buildWorld();
    this.slots = SPECIES.map((sp, i) => this.buildSlot(i));
    this.buildProducts();
    this.raycaster = new THREE.Raycaster();
    this.resize();
  }

  buildWorld() {
    const topZ = tankZ(SPECIES.length - 1) - 6;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 140), M.mat('#8bc34a'));
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -30;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Concrete pad under the farm.
    const padLen = COOLER_Z - topZ + 2;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(10, 0.1, padLen), M.mat('#cfd8dc'));
    pad.position.set(-0.3, 0.05, (COOLER_Z + topZ) / 2);
    pad.receiveShadow = true;
    this.scene.add(pad);

    // Wooden dock and the sea at the bottom, where the catch ships out.
    const dock = new THREE.Mesh(new THREE.BoxGeometry(12, 0.3, 5), M.mat('#a1795a'));
    dock.position.set(0, 0.1, COOLER_Z + 1.5);
    dock.receiveShadow = true;
    this.scene.add(dock);
    for (let x = -5.5; x <= 5.5; x += 1) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 5), M.mat('#8d6446'));
      plank.position.set(x, 0.26, COOLER_Z + 1.5);
      this.scene.add(plank);
    }
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), M.mat('#29a3d6', { roughness: 0.25 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, 0.02, COOLER_Z + 22);
    sea.receiveShadow = true;
    this.scene.add(sea);
    this.sea = sea;

    // Main conveyor
    const beltStart = topZ + 3;
    const beltLen = COOLER_Z - 0.8 - beltStart;
    const beltMid = beltStart + beltLen / 2;
    // Open the tank-side rail wherever a feeder joins the belt.
    this.belt = M.conveyor(beltLen, BELT_W, { gaps: SPECIES.map((_, i) => tankZ(i) - beltMid), gapWidth: FEEDER_W });
    this.belt.position.set(BELT_X, 0, beltMid);
    this.scene.add(this.belt);

    this.cooler = M.cooler();
    this.cooler.position.set(BELT_X, 0.25, COOLER_Z);
    this.cooler.userData.kind = 'cooler';
    this.scene.add(this.cooler);

    // Scenery, deterministic so it doesn't shuffle each launch.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let z = COOLER_Z - 2; z > topZ - 10; z -= 2.2) {
      for (const side of [-1, 1]) {
        if (rnd() < 0.35) continue;
        const x = side < 0 ? -6.5 - rnd() * 6 : 5.8 + rnd() * 6;
        const obj = rnd() < 0.7 ? M.tree(0.8 + rnd() * 0.6) : M.rock(0.7 + rnd());
        obj.position.set(x, 0, z + rnd());
        this.scene.add(obj);
      }
    }
    for (let x = -18; x < 18; x += 3 + rnd() * 3) {
      const r = M.reeds();
      r.position.set(x, 0, COOLER_Z + 4.4);
      this.scene.add(r);
    }
  }

  buildSlot(i) {
    const z = tankZ(i);
    const slot = { i, group: new THREE.Group(), level: -1, creatures: [] };
    slot.group.position.set(TANK_X, 0.1, z);
    this.scene.add(slot.group);

    slot.tank = M.tank(TANK_COLORS[i]);
    slot.plot = M.lockedPlot();
    // Feeder runs from the tank rim to the main belt's edge; its rails stop at
    // the main belt's outer rail, which is open here (see buildWorld).
    const feedEnd = BELT_X - BELT_W / 2;
    const feedLen = feedEnd - FEED_X0;
    slot.feeder = M.conveyor(feedLen, FEEDER_W, { railTrimEnd: 0.14 });
    slot.feeder.rotation.y = Math.PI / 2; // local +Z -> world +X
    slot.feeder.position.set(FEED_X0 + feedLen / 2, 0, z);
    // Plugs the main belt's rail gap while this tank is locked.
    slot.railPlug = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.26, FEEDER_W + 0.02), M.mat('#f57c00'));
    slot.railPlug.position.set(BELT_X - BELT_W / 2 - 0.07, 0.36, z);
    slot.railPlug.castShadow = true;
    slot.group.add(slot.tank, slot.plot);
    this.scene.add(slot.feeder, slot.railPlug);
    slot.tank.userData.slot = i;
    slot.plot.userData.slot = i;
    return slot;
  }

  // Sync visuals with game state (cheap; called every frame).
  sync(state) {
    for (const slot of this.slots) {
      const lv = state.tanks[slot.i];
      if (lv === slot.level) continue;
      const wasLocked = slot.level <= 0;
      slot.level = lv;
      const unlocked = lv > 0;
      const nextToUnlock = !unlocked && (slot.i === 0 || state.tanks[slot.i - 1] > 0);
      slot.tank.visible = unlocked;
      slot.feeder.visible = unlocked;
      slot.railPlug.visible = !unlocked;
      if (!unlocked) while (slot.creatures.length) slot.tank.remove(slot.creatures.pop());
      slot.plot.visible = !unlocked && nextToUnlock;
      if (unlocked) {
        const want = Math.min(8, 2 + Math.floor(lv / 10));
        while (slot.creatures.length < want) this.addCreature(slot);
        while (slot.creatures.length > want) slot.tank.remove(slot.creatures.pop());
        if (wasLocked) this.pop(slot.group);
      }
    }
    // Hide plots beyond the next unlock even when levels didn't change.
    for (const slot of this.slots) {
      if (slot.level > 0) continue;
      slot.plot.visible = slot.i === 0 || state.tanks[slot.i - 1] > 0;
    }
  }

  addCreature(slot) {
    const c = M.creature(SPECIES[slot.i].id);
    const big = ['sturgeon', 'tuna'].includes(SPECIES[slot.i].id);
    c.scale.multiplyScalar(big ? 0.6 : 0.8);
    c.userData.r = 0.45 + Math.random() * 0.6;
    c.userData.a = Math.random() * Math.PI * 2;
    c.userData.speed = (0.5 + Math.random() * 0.5) * (Math.random() < 0.5 ? 1 : -1);
    c.userData.y = 0.3 + Math.random() * 0.25;
    c.userData.phase = Math.random() * 10;
    slot.tank.add(c);
    slot.creatures.push(c);
  }

  pop(obj) {
    obj.userData.popT = 0;
  }

  // One InstancedMesh per species for the units riding the conveyor.
  buildProducts() {
    const material = M.productMaterial();
    this.products = SPECIES.map((sp) => {
      const im = new THREE.InstancedMesh(M.productGeometry(sp.id), material, UNIT_CAP);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.count = 0;
      im.frustumCulled = false; // instances span the whole belt
      im.castShadow = true;
      this.scene.add(im);
      return im;
    });
    // Per tank: distances seen last frame (front first) and the serial number of
    // the front unit, so each unit keeps its own jitter while riding.
    this.unitPrev = SPECIES.map(() => []);
    this.unitSerial = SPECIES.map(() => 0);
    this.unitBuckets = SPECIES.map(() => []);
    this._obj = new THREE.Object3D();
    this._tan = new THREE.Vector3();
  }

  // World position (and tangent, if given) of a unit from tank i that has
  // travelled d along its path: +X along the feeder, a rounded corner onto the
  // main belt, +Z down the belt, then a dip into the cooler. `lat` shifts the
  // unit sideways without breaking continuity through the corner.
  unitPos(i, d, out = new THREE.Vector3(), tangent = null, lat = 0) {
    const z0 = tankZ(i);
    const a = FEED_LEN - CORNER_R, b = FEED_LEN + CORNER_R;
    let px, pz, tx, tz;
    if (d <= a) {
      px = FEED_X0 + d; pz = z0; tx = 1; tz = 0;
    } else if (d < b) {
      const phi = ((d - a) / (b - a)) * Math.PI / 2;
      px = BELT_X - CORNER_R + CORNER_R * Math.sin(phi);
      pz = z0 + CORNER_R - CORNER_R * Math.cos(phi);
      tx = Math.cos(phi); tz = Math.sin(phi);
    } else {
      px = BELT_X; pz = z0 + (d - FEED_LEN); tx = 0; tz = 1;
    }
    // Sideways offset along the normal (-tz, tx): +Z on the feeder, -X on the belt.
    px += -tz * lat;
    pz += tx * lat;
    let y = BELT_Y;
    const L = pathLength(i);
    const dip = (d - (L - DIP_LEN)) / DIP_LEN;
    if (dip > 0) y -= 0.6 * dip * dip;
    out.set(px, y, pz);
    if (tangent) tangent.set(tx, 0, tz);
    return out;
  }

  // Fill the instanced meshes from state.transit.
  updateUnits(transit) {
    const buckets = this.unitBuckets;
    for (const b of buckets) b.length = 0;
    if (Array.isArray(transit)) {
      for (const u of transit) if (buckets[u.i] && Number.isFinite(u.d)) buckets[u.i].push(u.d);
    }
    const o = this._obj, tan = this._tan;
    for (let i = 0; i < buckets.length; i++) {
      const ds = buckets[i];
      ds.sort((x, y) => y - x); // front of the line first
      // Units never overtake, so anything from last frame that was ahead of the
      // current front unit has landed; shift serials by that many.
      const prev = this.unitPrev[i];
      const front = ds.length ? ds[0] : -Infinity;
      let landed = 0;
      while (landed < prev.length && prev[landed] > front + 1e-6) landed++;
      this.unitSerial[i] += landed;
      this.unitPrev[i] = ds.slice();

      const im = this.products[i];
      const n = Math.min(ds.length, UNIT_CAP);
      const L = pathLength(i);
      for (let k = 0; k < n; k++) {
        const d = Math.min(ds[k], L);
        const key = i * 100003 + this.unitSerial[i] + k;
        // Narrow feeder, wider main belt: ramp the sideways jitter in after the corner.
        const amp = 0.06 + 0.26 * smooth(FEED_LEN, FEED_LEN + 1.2, d);
        const lat = (hash(key) * 2 - 1) * amp;
        this.unitPos(i, d, o.position, tan, lat);
        o.rotation.set(0, Math.atan2(-tan.z, tan.x) + (hash(key + 0.5) * 2 - 1) * 0.3, 0);
        o.updateMatrix();
        im.setMatrixAt(k, o.matrix);
      }
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
    }
  }

  update(dt, time, state, coolerFrac, arrived) {
    // Camera pan with a little momentum.
    if (!this.dragging) {
      this.focusZ += this.focusVel * dt;
      this.focusVel *= Math.pow(0.02, dt);
    }
    this.clampFocus(state);
    this.placeCamera();

    // Belts
    // Slats are 0.8 world units apart. Texture +V points along local -Z (the top
    // plane is rotated -90deg about X), and units travel along local +Z on both
    // the main belt and the (rotated) feeders, so the offset grows with time.
    const off = ((time * BELT_SPEED) / 0.8) % 1;
    this.belt.userData.tex.offset.y = off;
    for (const s of this.slots) if (s.feeder.visible) s.feeder.userData.tex.offset.y = off;

    // Creatures + water shimmer
    for (const slot of this.slots) {
      if (!slot.tank.visible) continue;
      slot.tank.userData.water.position.y = 0.72 + Math.sin(time * 1.3 + slot.i) * 0.015;
      for (const c of slot.creatures) {
        const u = c.userData;
        u.a += u.speed * dt * (u.swim === 'crawl' ? 0.35 : 0.8);
        const r = u.r;
        c.position.set(Math.cos(u.a) * r, u.swim === 'crawl' ? 0.12 : u.y + Math.sin(time * 1.5 + u.phase) * 0.05, Math.sin(u.a) * r);
        // Velocity is sign(speed) * (-sin a, 0, cos a). rotation.y = h turns the
        // model's +X head to (cos h, 0, -sin h), so h = -a - sign(speed) * PI/2.
        c.rotation.y = -u.a - Math.sign(u.speed) * Math.PI / 2;
        if (u.tail) u.tail.rotation.y = Math.sin(time * 8 + u.phase) * 0.45;
        if (u.swim === 'shrimp') c.rotation.z = Math.sin(time * 5 + u.phase) * 0.12;
      }
      if (slot.group.userData.popT !== undefined) {
        const p = (slot.group.userData.popT += dt * 2.5);
        const s = p >= 1 ? 1 : 1 + Math.sin(p * Math.PI) * 0.2;
        slot.group.scale.setScalar(s);
        if (p >= 1) delete slot.group.userData.popT;
      }
    }

    // Units on the conveyor, and a bump for each one landing in the cooler.
    this.updateUnits(state && state.transit);
    if (arrived && arrived.length) this.coolerBump = 0.15;

    // Cooler fill and a little bump when catch lands.
    const fill = this.cooler.userData.fill;
    const f = Math.max(0.02, Math.min(1, coolerFrac));
    fill.scale.y = f;
    fill.position.y = 0.1 + f * 0.5;
    fill.material = M.mat(coolerFrac >= 0.999 ? '#ffcdd2' : '#e1f5fe', { roughness: 0.3 });
    this.coolerBump = Math.max(0, (this.coolerBump || 0) - dt);
    this.cooler.scale.set(1 + this.coolerBump * 0.15, 1 - this.coolerBump * 0.15, 1 + this.coolerBump * 0.15);

    this.renderer.render(this.scene, this.camera);
  }

  maxFocus() { return COOLER_Z - 5.2; }
  minFocus(state) {
    let top = 0;
    for (let i = 0; i < SPECIES.length; i++) if (state.tanks[i] > 0 || i === 0 || state.tanks[i - 1] > 0) top = i;
    return tankZ(top) + 4;
  }
  clampFocus(state) {
    const lo = Math.min(this.minFocus(state), this.maxFocus());
    const hi = this.maxFocus();
    if (this.focusZ < lo) { this.focusZ = lo; this.focusVel = 0; }
    if (this.focusZ > hi) { this.focusZ = hi; this.focusVel = 0; }
  }

  placeCamera() {
    const aspect = this.camera.aspect;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const halfW = 6.3; // world units that must fit across the screen
    const dist = Math.max(22, halfW / (tanHalf * aspect));
    const pitch = THREE.MathUtils.degToRad(52);
    const cx = 0.9;
    this.camera.position.set(cx, Math.sin(pitch) * dist, this.focusZ + Math.cos(pitch) * dist);
    this.camera.lookAt(cx, 0, this.focusZ);
    this.sun.position.set(-8, 20, this.focusZ + 10);
    this.sun.target.position.set(0, 0, this.focusZ);
  }

  // Screen-space pixels of a world point.
  project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: (v.x * 0.5 + 0.5) * r.width, y: (-v.y * 0.5 + 0.5) * r.height, behind: v.z > 1 };
  }
  tankScreen(i) { return this.project(TANK_X, 1.2, tankZ(i)); }
  coolerScreen() { return this.project(BELT_X, 1.8, COOLER_Z); }

  // What got tapped? Returns {kind:'tank', i} | {kind:'cooler'} | null
  pick(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const p = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(p, this.camera);
    const targets = [this.cooler, ...this.slots.map((s) => s.group)];
    const hit = this.raycaster.intersectObjects(targets, true)[0];
    if (!hit) return null;
    let o = hit.object;
    while (o) {
      if (o.userData.kind === 'cooler') return { kind: 'cooler' };
      if (o.userData.slot !== undefined) return { kind: 'tank', i: o.userData.slot };
      o = o.parent;
    }
    return null;
  }

  // Worlds units per screen pixel at the ground plane, for drag panning.
  unitsPerPixel() {
    const a = this.project(0, 0, this.focusZ);
    const b = this.project(0, 0, this.focusZ + 1);
    return 1 / Math.max(1, b.y - a.y);
  }

  resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
