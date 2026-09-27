// Low-poly, flat-shaded models built from primitives so every creature and
// prop shares one art style. Each builder returns a THREE.Group, facing +X,
// roughly 1 unit long. Animated parts are stored in group.userData.
import * as THREE from '../vendor/three.module.min.js';

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({
      color, flatShading: true, roughness: 0.75, metalness: 0, ...opts,
    }));
  }
  return matCache.get(key);
}

function mesh(geo, material, { cast = true, receive = false } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// ---------- creatures ----------

// Generic fish: a low-poly body with a tail on a pivot so it can wag.
function fish({ body, belly, fin, len = 1, depth = 0.45, width = 0.28, snout = 0.5, extras }) {
  const g = new THREE.Group();

  const bodyGeo = new THREE.SphereGeometry(0.5, 7, 5);
  bodyGeo.scale(len, depth, width);
  const b = mesh(bodyGeo, mat(body));
  g.add(b);

  // Belly: a slightly smaller, lower, lighter shell.
  const bellyGeo = new THREE.SphereGeometry(0.5, 7, 4, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45);
  bellyGeo.scale(len * 0.96, depth * 1.02, width * 1.04);
  g.add(mesh(bellyGeo, mat(belly)));

  // Snout cone to make the head read.
  const snoutGeo = new THREE.ConeGeometry(depth * 0.36, len * 0.28 * snout + 0.05, 5);
  snoutGeo.rotateZ(-Math.PI / 2);
  const sn = mesh(snoutGeo, mat(body));
  sn.position.x = len * 0.5;
  sn.scale.set(1, 1, width / depth);
  g.add(sn);

  // Eyes
  for (const z of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.05, 5, 4), mat('#1a1a1a'));
    eye.position.set(len * 0.33, depth * 0.12, z * width * 0.42);
    g.add(eye);
  }

  // Tail on a pivot
  const tail = new THREE.Group();
  tail.position.x = -len * 0.46;
  const tailGeo = new THREE.ConeGeometry(depth * 0.55, len * 0.38, 4);
  tailGeo.rotateZ(Math.PI / 2);
  tailGeo.scale(1, 1, 0.15);
  const t = mesh(tailGeo, mat(fin));
  t.position.x = -len * 0.17;
  tail.add(t);
  g.add(tail);

  // Dorsal fin
  const dorsalGeo = new THREE.ConeGeometry(len * 0.14, depth * 0.45, 3);
  dorsalGeo.scale(1.4, 1, 0.25);
  const d = mesh(dorsalGeo, mat(fin));
  d.position.set(-len * 0.02, depth * 0.55, 0);
  d.rotation.z = 0.35;
  g.add(d);

  if (extras) extras(g, { len, depth, width });
  tail.name = 'tail';
  g.userData.swim = 'fish';
  return g;
}

function shrimp() {
  const g = new THREE.Group();
  const shell = mat('#ff8a65');
  const pale = mat('#ffccbc');
  // Curved, segmented body: shrinking spheres along an arc.
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    const a = t * Math.PI * 0.75;
    const r = 0.17 - t * 0.09;
    const s = mesh(new THREE.SphereGeometry(r, 6, 4), i % 2 ? pale : shell);
    s.position.set(0.3 - Math.sin(a) * 0.38, 0.05 + (1 - Math.cos(a)) * 0.2 - 0.12, 0);
    s.scale.set(1.2, 1, 0.9);
    g.add(s);
  }
  // Fan tail
  const tailGeo = new THREE.ConeGeometry(0.1, 0.18, 4);
  tailGeo.scale(1, 1, 0.3);
  const tail = mesh(tailGeo, shell);
  tail.position.set(0.05, -0.02, 0);
  tail.rotation.z = Math.PI * 0.8;
  g.add(tail);
  // Head spike
  const rostrum = mesh(new THREE.ConeGeometry(0.035, 0.22, 4), shell);
  rostrum.rotation.z = -Math.PI / 2 - 0.3;
  rostrum.position.set(0.48, 0.06, 0);
  g.add(rostrum);
  // Eyes
  for (const z of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.035, 5, 4), mat('#1a1a1a'));
    eye.position.set(0.4, 0.11, z * 0.09);
    g.add(eye);
  }
  // Long antennae
  const ant = mat('#e64a19');
  for (const z of [-1, 1]) {
    const a = mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.7, 3), ant, { cast: false });
    a.rotation.z = -1.2;
    a.rotation.x = z * 0.35;
    a.position.set(0.72, 0.2, z * 0.08);
    g.add(a);
  }
  // Legs
  for (let i = 0; i < 4; i++) {
    const leg = mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.14, 3), ant, { cast: false });
    leg.position.set(0.3 - i * 0.07, -0.1, 0);
    g.add(leg);
  }
  g.scale.setScalar(0.9);
  g.userData.swim = 'shrimp';
  return g;
}

function crayfish() {
  const g = new THREE.Group();
  const shell = mat('#c62828');
  const dark = mat('#8e1b1b');
  const body = mesh(new THREE.SphereGeometry(0.2, 6, 4), shell);
  body.scale.set(1.4, 0.8, 0.9);
  body.position.x = 0.18;
  g.add(body);
  for (let i = 0; i < 4; i++) {
    const s = mesh(new THREE.SphereGeometry(0.14 - i * 0.02, 6, 4), i % 2 ? dark : shell);
    s.scale.set(1, 0.7, 1.1);
    s.position.set(-0.08 - i * 0.14, -0.02, 0);
    g.add(s);
  }
  const fan = new THREE.ConeGeometry(0.14, 0.14, 4);
  fan.scale(1, 1, 0.35);
  const tail = mesh(fan, shell);
  tail.rotation.z = Math.PI / 2;
  tail.position.set(-0.66, -0.02, 0);
  g.add(tail);
  // Claws
  for (const z of [-1, 1]) {
    const arm = mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.3, 4), dark);
    arm.rotation.z = -Math.PI / 2;
    arm.rotation.y = z * 0.5;
    arm.position.set(0.48, 0, z * 0.12);
    g.add(arm);
    const claw = mesh(new THREE.SphereGeometry(0.1, 5, 4), shell);
    claw.scale.set(1.6, 0.6, 0.9);
    claw.position.set(0.66, 0, z * 0.22);
    g.add(claw);
  }
  for (const z of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.03, 5, 4), mat('#1a1a1a'));
    eye.position.set(0.44, 0.1, z * 0.07);
    g.add(eye);
  }
  g.userData.swim = 'crawl';
  return g;
}

const BUILDERS = {
  shrimp,
  crayfish,
  tilapia: () => fish({ body: '#78909c', belly: '#cfd8dc', fin: '#546e7a', len: 0.95, depth: 0.55, snout: 0.35 }),
  catfish: () => fish({
    body: '#6d4c41', belly: '#bcaaa4', fin: '#4e342e', len: 1.1, depth: 0.36, width: 0.34, snout: 0.2,
    extras(g, { len }) {
      for (const z of [-1, 1]) for (const y of [0, -0.08]) {
        const w = mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.35, 3), mat('#3e2723'), { cast: false });
        w.rotation.z = -Math.PI / 2 - 0.4 - y * 3;
        w.rotation.x = z * 0.7;
        w.position.set(len * 0.62, y, z * 0.1);
        g.add(w);
      }
    },
  }),
  trout: () => fish({
    body: '#7c8f4e', belly: '#e8eed8', fin: '#5d6b3a', len: 1.05, depth: 0.38,
    extras(g, { len, depth }) {
      const stripe = new THREE.SphereGeometry(0.5, 7, 3, 0, Math.PI * 2, Math.PI * 0.44, Math.PI * 0.12);
      stripe.scale(len * 1.01, depth * 1.03, 0.29);
      g.add(mesh(stripe, mat('#ec7f9a'), { cast: false }));
    },
  }),
  salmon: () => fish({ body: '#90a4ae', belly: '#fbe9e7', fin: '#607d8b', len: 1.15, depth: 0.4, snout: 0.6,
    extras(g, { len, depth }) {
      const back = new THREE.SphereGeometry(0.5, 7, 2, 0, Math.PI * 2, 0, Math.PI * 0.2);
      back.scale(len * 1.01, depth * 1.04, 0.29);
      g.add(mesh(back, mat('#455a64'), { cast: false }));
    },
  }),
  sturgeon: () => fish({
    body: '#5f6b73', belly: '#d7dde0', fin: '#3f484e', len: 1.6, depth: 0.3, width: 0.3, snout: 1.6,
    extras(g, { len, depth }) {
      for (let i = 0; i < 6; i++) {
        const sc = mesh(new THREE.ConeGeometry(0.04, 0.08, 4), mat('#c9cfd3'), { cast: false });
        sc.position.set(len * 0.3 - i * len * 0.12, depth * 0.5, 0);
        g.add(sc);
      }
    },
  }),
  tuna: () => fish({
    body: '#1f3b73', belly: '#cfd8e3', fin: '#15294f', len: 1.5, depth: 0.55, width: 0.4, snout: 0.5,
    extras(g, { len, depth }) {
      for (let i = 0; i < 5; i++) {
        for (const y of [1, -1]) {
          const f = mesh(new THREE.ConeGeometry(0.03, 0.07, 3), mat('#ffca28'), { cast: false });
          f.position.set(-len * 0.12 - i * 0.07, y * depth * (0.33 - i * 0.03), 0);
          if (y < 0) f.rotation.z = Math.PI;
          g.add(f);
        }
      }
    },
  }),
};

// One template per species; tanks get clones that share geometry + materials.
const templates = new Map();
export function creature(id) {
  if (!templates.has(id)) templates.set(id, BUILDERS[id]());
  const c = templates.get(id).clone();
  c.userData = { ...c.userData, tail: c.getObjectByName('tail') };
  return c;
}

// ---------- props ----------

// Round aquaculture tank with water and a rim. `color` tints the tank wall.
export function tank(color) {
  const g = new THREE.Group();
  const wall = mesh(new THREE.CylinderGeometry(1.5, 1.55, 0.9, 14, 1, true), mat(color, { side: THREE.DoubleSide }), { receive: true });
  wall.position.y = 0.45;
  g.add(wall);
  const rim = mesh(new THREE.TorusGeometry(1.5, 0.08, 4, 14), mat('#eceff1'));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.9;
  g.add(rim);
  const floor = mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.05, 14), mat('#4fb3d9'), { receive: true, cast: false });
  floor.position.y = 0.03;
  g.add(floor);
  const water = mesh(new THREE.CylinderGeometry(1.46, 1.46, 0.02, 14),
    mat('#4fc3f7', { transparent: true, opacity: 0.3, roughness: 0.15, depthWrite: false }), { cast: false });
  water.position.y = 0.72;
  g.add(water);
  // Aerator post, for a bit of farm detail.
  const post = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 5), mat('#90a4ae'));
  post.position.set(1.15, 0.55, -1.0);
  g.add(post);
  g.userData.water = water;
  return g;
}

export function lockedPlot() {
  const g = new THREE.Group();
  const pad = mesh(new THREE.CylinderGeometry(1.55, 1.6, 0.12, 14), mat('#c8b28a'), { receive: true });
  pad.position.y = 0.06;
  g.add(pad);
  // Little fence posts around the edge.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const p = mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), mat('#a1887f'));
    p.position.set(Math.cos(a) * 1.6, 0.25, Math.sin(a) * 1.6);
    g.add(p);
  }
  const sign = mesh(new THREE.BoxGeometry(0.8, 0.5, 0.06), mat('#ffb300'));
  sign.position.set(0, 0.7, 0);
  g.add(sign);
  const stick = mesh(new THREE.BoxGeometry(0.06, 0.6, 0.06), mat('#8d6e63'));
  stick.position.set(0, 0.3, 0);
  g.add(stick);
  return g;
}

// Straight conveyor along +Z of length `len`, with orange rails.
// opts.railTrimEnd shortens both rails at the +Z end (a feeder stops at the
// main belt's outer rail). opts.gaps lists local Z centres where the -X rail
// is left open (width opts.gapWidth) so a feeder can join the belt there.
export function conveyor(len, width = 1.6, { railTrimEnd = 0, gaps = [], gapWidth = 0.7 } = {}) {
  const g = new THREE.Group();
  const belt = mesh(new THREE.BoxGeometry(width, 0.12, len), mat('#4a4f57'), { receive: true });
  belt.position.y = 0.3;
  g.add(belt);
  const railMat = mat('#f57c00');
  const railSeg = (x, z0, z1) => {
    if (z1 - z0 < 0.01) return;
    const rail = mesh(new THREE.BoxGeometry(0.14, 0.26, z1 - z0), railMat);
    rail.position.set(x * (width / 2 + 0.07), 0.36, (z0 + z1) / 2);
    g.add(rail);
  };
  const zEnd = len / 2 - railTrimEnd;
  railSeg(1, -len / 2, zEnd);
  // -X rail, split around the feeder gaps.
  let z = -len / 2;
  for (const gz of [...gaps].sort((a, b) => a - b)) {
    const a = gz - gapWidth / 2, b = gz + gapWidth / 2;
    if (b < z || a > zEnd) continue;
    railSeg(-1, z, Math.min(a, zEnd));
    z = Math.max(z, b);
  }
  railSeg(-1, z, zEnd);
  for (let z = -len / 2 + 0.5; z < len / 2; z += 2.5) {
    for (const x of [-1, 1]) {
      const leg = mesh(new THREE.BoxGeometry(0.12, 0.3, 0.12), mat('#37474f'));
      leg.position.set(x * (width / 2 - 0.1), 0.12, z);
      g.add(leg);
    }
  }
  // Moving slats: a strip texture scrolled in the render loop.
  const c = document.createElement('canvas');
  c.width = 8; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#4a4f57'; x.fillRect(0, 0, 8, 64);
  x.fillStyle = '#3a3e45'; x.fillRect(0, 0, 8, 6);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, len / 0.8);
  tex.magFilter = THREE.NearestFilter;
  const top = mesh(new THREE.PlaneGeometry(width, len), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), { cast: false, receive: true });
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.365;
  g.add(top);
  g.userData.tex = tex;
  return g;
}

// Insulated cooler box that catches everything at the end of the line.
export function cooler() {
  const g = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(2.6, 1.3, 2.0), mat('#eceff1'), { receive: true });
  body.position.y = 0.65;
  g.add(body);
  const band = mesh(new THREE.BoxGeometry(2.64, 0.25, 2.04), mat('#1e88e5'));
  band.position.y = 0.45;
  g.add(band);
  const lid = new THREE.Group();
  lid.position.set(0, 1.3, -1.0);
  const lidMesh = mesh(new THREE.BoxGeometry(2.7, 0.2, 2.1), mat('#1e88e5'));
  lidMesh.position.set(0, 0.1, 1.05);
  lid.add(lidMesh);
  lid.rotation.x = -1.1;
  g.add(lid);
  // Ice + catch inside, scaled with how full the cooler is.
  const fill = mesh(new THREE.BoxGeometry(2.3, 1, 1.7), mat('#e1f5fe', { roughness: 0.3 }), { cast: false });
  fill.position.y = 0.2;
  g.add(fill);
  for (const x of [-1, 1]) {
    const h = mesh(new THREE.BoxGeometry(0.15, 0.12, 0.6), mat('#90a4ae'));
    h.position.set(x * 1.36, 0.95, 0);
    g.add(h);
  }
  g.userData.fill = fill;
  g.userData.lid = lid;
  return g;
}

// ---------- products on the belt ----------
// Each species' creature template is baked into one merged, vertex-coloured
// BufferGeometry so a single InstancedMesh can draw every unit of that species.

// Merge every mesh under `root` (in root space) into one non-indexed geometry
// with position, normal and a per-vertex colour taken from the part's material.
export function mergeColored(root) {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const parts = [];
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, o.matrixWorld));
    if (!geo.attributes.normal) geo.computeVertexNormals();
    parts.push({ geo, color: o.material.color });
    n += geo.attributes.position.count;
  });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let off = 0;
  for (const { geo, color } of parts) {
    const c = geo.attributes.position.count;
    pos.set(geo.attributes.position.array, off * 3);
    nor.set(geo.attributes.normal.array, off * 3);
    for (let k = 0; k < c; k++) {
      col[(off + k) * 3] = color.r; col[(off + k) * 3 + 1] = color.g; col[(off + k) * 3 + 2] = color.b;
    }
    off += c;
    geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

// Length (along +X, the direction of travel) of each species' belt unit.
const PRODUCT_LEN = {
  shrimp: 0.95, crayfish: 0.95, tilapia: 0.95, catfish: 1.05,
  trout: 1.05, salmon: 1.1, sturgeon: 1.25, tuna: 1.2,
};

// One belt unit's geometry: head at +X, centred on X/Z, resting on y = 0.
// Fish lie on their side like a fresh catch; shrimp and crayfish sit upright.
export function productGeometry(id) {
  if (!templates.has(id)) templates.set(id, BUILDERS[id]());
  const tpl = templates.get(id);
  const geo = mergeColored(tpl);
  if (tpl.userData.swim === 'fish') geo.rotateX(Math.PI / 2);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  geo.scale(...Array(3).fill((PRODUCT_LEN[id] || 1) / (bb.max.x - bb.min.x)));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

let productMat = null;
export function productMaterial() {
  if (!productMat) productMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.75 });
  return productMat;
}

export function tree(scale = 1) {
  const g = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.8, 5), mat('#795548'));
  trunk.position.y = 0.4;
  g.add(trunk);
  const top = mesh(new THREE.ConeGeometry(0.7, 1.6, 6), mat('#43a047'));
  top.position.y = 1.5;
  g.add(top);
  const top2 = mesh(new THREE.ConeGeometry(0.55, 1.1, 6), mat('#4caf50'));
  top2.position.y = 2.1;
  g.add(top2);
  g.scale.setScalar(scale);
  return g;
}

export function rock(scale = 1) {
  const m = mesh(new THREE.DodecahedronGeometry(0.4, 0), mat('#9e9e9e'));
  m.scale.set(scale, scale * 0.6, scale * 0.9);
  m.rotation.y = Math.random() * Math.PI;
  return m;
}

export function reeds() {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const r = mesh(new THREE.ConeGeometry(0.05, 0.9 + Math.random() * 0.5, 3), mat('#689f38'), { cast: false });
    r.position.set((Math.random() - 0.5) * 0.5, 0.45, (Math.random() - 0.5) * 0.5);
    r.rotation.z = (Math.random() - 0.5) * 0.3;
    g.add(r);
  }
  return g;
}
