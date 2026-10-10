import * as THREE from './assets/vendor/three.module.min.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ==========================================================================
   Molecule geometry builders
   Molecules are described as atoms + bonds, then rendered as white
   ball-and-stick models with instanced meshes (2 draw calls per molecule).
   ========================================================================== */

class Molecule {
  constructor() {
    this.atoms = []; // { p: Vector3, r: number }
    this.bonds = new Set();
  }

  atom(p, r = 0.22) {
    const i = this.atoms.findIndex((a) => a.p.distanceTo(p) < 0.15);
    if (i !== -1) {
      this.atoms[i].r = Math.max(this.atoms[i].r, r);
      return i;
    }
    this.atoms.push({ p: p.clone(), r });
    return this.atoms.length - 1;
  }

  bond(i, j) {
    if (i !== j) this.bonds.add(i < j ? `${i}-${j}` : `${j}-${i}`);
  }

  ring(points, r) {
    const ids = points.map((p) => this.atom(p, r));
    ids.forEach((id, k) => this.bond(id, ids[(k + 1) % ids.length]));
    return ids;
  }

  // Attach a new atom to atom `from`, offset by `dir` (bond length 1)
  branch(from, dir, r = 0.22) {
    const p = this.atoms[from].p.clone().add(dir.clone().normalize());
    const id = this.atom(p, r);
    this.bond(from, id);
    return id;
  }

  center() {
    const c = new THREE.Vector3();
    this.atoms.forEach((a) => c.add(a.p));
    c.divideScalar(this.atoms.length);
    this.atoms.forEach((a) => a.p.sub(c));
    return this;
  }

  pucker(amount = 0.18) {
    this.atoms.forEach((a, i) => {
      a.p.z += Math.sin(a.p.x * 1.7 + i) * amount;
    });
    return this;
  }
}

const v = (x, y, z = 0) => new THREE.Vector3(x, y, z);

// Regular hexagon (bond length 1) centred at c, vertices at 30° + 60°k
function hexagon(c) {
  return Array.from({ length: 6 }, (_, k) => {
    const a = THREE.MathUtils.degToRad(30 + 60 * k);
    return v(c.x + Math.cos(a), c.y + Math.sin(a), c.z);
  });
}

// Regular n-gon sharing edge a–b, built on the side away from `away`
function ringOnEdge(a, b, n, away) {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const edge = b.clone().sub(a);
  const L = edge.length();
  let normal = v(-edge.y, edge.x, 0).normalize();
  if (normal.dot(away.clone().sub(mid)) > 0) normal.negate();
  const apothem = L / (2 * Math.tan(Math.PI / n));
  const R = L / (2 * Math.sin(Math.PI / n));
  const c = mid.clone().add(normal.multiplyScalar(apothem));
  const a0 = Math.atan2(a.y - c.y, a.x - c.x);
  const a1 = Math.atan2(b.y - c.y, b.x - c.x);
  let step = (2 * Math.PI) / n;
  let diff = a1 - a0;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  if (diff < 0) step = -step;
  const pts = Array.from({ length: n }, (_, k) =>
    v(c.x + R * Math.cos(a0 + step * k), c.y + R * Math.sin(a0 + step * k), a.z)
  );
  return { pts, c };
}

const OXY = 0.32;
const UP = v(0, 0, 1);

// Four fused rings — the steroid nucleus (testosterone-like)
function steroid() {
  const m = new Molecule();
  const cA = v(0, 0);
  const cB = v(Math.sqrt(3), 0);
  const cC = v(Math.sqrt(3) * 1.5, 1.5);
  const A = m.ring(hexagon(cA));
  m.ring(hexagon(cB));
  const Cpts = hexagon(cC);
  m.ring(Cpts);
  const D = ringOnEdge(Cpts[0], Cpts[5], 5, cC);
  const Dids = m.ring(D.pts);
  // C3 ketone, C10/C13 angular methyls, C17 hydroxyl
  const c3 = A[3];
  m.branch(c3, m.atoms[c3].p.clone().sub(cA), OXY);
  m.branch(A[0], UP);
  m.branch(m.atom(Cpts[0]), UP);
  const far = Dids[2];
  m.branch(far, m.atoms[far].p.clone().sub(D.c), OXY);
  return m.center().pucker(0.22);
}

// Fused 6+5 ring with methyls and carbonyls (caffeine-like)
function purine() {
  const m = new Molecule();
  const c = v(0, 0);
  const H = hexagon(c);
  const ids = m.ring(H);
  const P = ringOnEdge(H[5], H[0], 5, c);
  const pids = m.ring(P.pts);
  m.branch(ids[2], H[2].clone().sub(c), OXY);
  m.branch(ids[4], H[4].clone().sub(c), OXY);
  m.branch(ids[3], H[3].clone().sub(c));
  m.branch(ids[1], H[1].clone().sub(c));
  m.branch(pids[2], P.pts[2].clone().sub(P.c));
  return m.center().pucker(0.12);
}

// Six-membered ring with hydroxyl groups (glucose-like)
function sugar() {
  const m = new Molecule();
  const c = v(0, 0);
  const H = hexagon(c);
  const ids = m.ring(H);
  ids.forEach((id, k) => {
    if (k === 0) return;
    const out = H[k].clone().sub(c).add(v(0, 0, k % 2 ? 0.6 : -0.6));
    const o = m.branch(id, out, k % 2 ? OXY : 0.22);
    if (k === 5) m.branch(o, out.clone().add(v(0, 0.4, 0.3)), OXY);
  });
  return m.center().pucker(0.35);
}

// Zig-zag 3D backbone with side groups (peptide-like)
function chain(rand, length = 9) {
  const m = new Molecule();
  let prev = m.atom(v(0, 0, 0));
  let dir = v(1, 0, 0);
  let perp = v(0, 1, 0);
  for (let i = 1; i < length; i++) {
    const tilt = (i % 2 ? 1 : -1) * 0.95;
    const d = dir.clone().multiplyScalar(0.82).add(perp.clone().multiplyScalar(tilt * 0.6));
    d.applyAxisAngle(dir, (rand() - 0.5) * 0.9);
    const id = m.branch(prev, d, i % 3 === 0 ? OXY * 0.9 : 0.22);
    if (i % 3 === 1) {
      const side = m.branch(id, perp.clone().multiplyScalar(tilt).add(v(0, 0, rand() - 0.5)));
      if (rand() > 0.4) m.branch(side, v(rand() - 0.5, tilt, rand() - 0.5), OXY);
    }
    prev = id;
  }
  return m.center();
}

// Random tetrahedral tree (generic organic molecule)
function cluster(rand, size = 12) {
  const m = new Molecule();
  const open = [m.atom(v(0, 0, 0))];
  while (m.atoms.length < size && open.length) {
    const from = open[Math.floor(rand() * open.length)];
    const d = v(rand() - 0.5, rand() - 0.5, rand() - 0.5);
    if (d.lengthSq() < 0.01) continue;
    const p = m.atoms[from].p.clone().add(d.clone().normalize());
    if (m.atoms.some((a) => a.p.distanceTo(p) < 0.85)) continue;
    const id = m.branch(from, d, rand() > 0.8 ? OXY : 0.22);
    open.push(id);
    if (rand() > 0.6) open.splice(open.indexOf(from), 1);
  }
  return m.center();
}

function ringMolecule(rand) {
  const m = new Molecule();
  const c = v(0, 0);
  const H = hexagon(c);
  const ids = m.ring(H);
  ids.forEach((id, k) => {
    if (rand() > 0.55) {
      const b = m.branch(id, H[k].clone().sub(c), rand() > 0.6 ? OXY : 0.22);
      if (rand() > 0.5) m.branch(b, H[k].clone().sub(c).add(v(0, 0.6, rand() - 0.5)));
    }
  });
  return m.center().pucker(0.1);
}

/* ==========================================================================
   Rendering
   ========================================================================== */

const sphereGeo = new THREE.SphereGeometry(1, 22, 16);
const bondGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
const atomMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.28,
  metalness: 0.1,
  emissive: 0x2a2d33,
});
const bondMat = new THREE.MeshStandardMaterial({
  color: 0xe4e7ec,
  roughness: 0.45,
  metalness: 0.05,
  emissive: 0x1a1c20,
});

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function buildMesh(mol) {
  const group = new THREE.Group();
  const atoms = new THREE.InstancedMesh(sphereGeo, atomMat, mol.atoms.length);
  mol.atoms.forEach((a, i) => {
    _s.setScalar(a.r);
    _m.compose(a.p, _q.identity(), _s);
    atoms.setMatrixAt(i, _m);
  });
  group.add(atoms);

  const bonds = [...mol.bonds].map((k) => k.split('-').map(Number));
  const bondMesh = new THREE.InstancedMesh(bondGeo, bondMat, bonds.length);
  bonds.forEach(([i, j], n) => {
    const a = mol.atoms[i].p;
    const b = mol.atoms[j].p;
    const dir = b.clone().sub(a);
    const len = dir.length();
    _q.setFromUnitVectors(_up, dir.normalize());
    _s.set(0.065, len, 0.065);
    _m.compose(a.clone().add(b).multiplyScalar(0.5), _q, _s);
    bondMesh.setMatrixAt(n, _m);
  });
  group.add(bondMesh);
  return group;
}

// Deterministic PRNG so the layout is stable between visits
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function initScene() {
  const canvas = document.getElementById('scene');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (e) {
    canvas.remove();
    return;
  }

  renderer.setClearColor(0x050608, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050608, 0.04);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1d24, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(5, 8, 6);
  scene.add(key);
  const rim = new THREE.PointLight(0xe8f0ff, 14, 30, 1.6);
  scene.add(rim);

  const rand = mulberry32(5280);
  const isSmall = () => window.innerWidth < 760;
  const DEPTH = 110;
  const START_Z = 9;

  // Scroll → camera path
  const maxScroll = () => Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const camZFor = (p) => START_Z - p * DEPTH;
  const swayFor = (p) => Math.sin(p * Math.PI * 5) * 1.4;

  const floaters = [];
  const addFloater = (mol, opts) => {
    const mesh = buildMesh(mol);
    mesh.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    scene.add(mesh);
    const f = {
      mesh,
      base: new THREE.Vector3(),
      spin: new THREE.Vector3((rand() - 0.5) * 0.25, (rand() - 0.5) * 0.35, (rand() - 0.5) * 0.15),
      bob: rand() * Math.PI * 2,
      ...opts,
    };
    floaters.push(f);
    return f;
  };

  // Hero molecule
  const hero = addFloater(steroid(), { featured: 'hero' });
  hero.mesh.rotation.set(0.3, -0.4, 0.2);
  hero.spin.set(0.05, 0.18, 0.03);

  // One featured molecule per chapter, placed where the camera arrives
  const featuredFactories = {
    programs: () => chain(rand, 11),
    nutrition: sugar,
    supplements: purine,
    health: steroid,
    community: () => cluster(rand, 18),
  };
  const featured = Object.entries(featuredFactories).map(([id, make]) =>
    addFloater(make(), { featured: id })
  );

  // Ambient molecules scattered along the flight path
  const makers = [steroid, purine, sugar, () => chain(rand, 6 + Math.floor(rand() * 6)), () => cluster(rand, 8 + Math.floor(rand() * 8)), () => ringMolecule(rand)];
  const AMBIENT = isSmall() ? 22 : 40;
  for (let i = 0; i < AMBIENT; i++) {
    const f = addFloater(makers[i % makers.length](), {});
    const side = i % 2 ? 1 : -1;
    const z = START_Z - 14 - (i / AMBIENT) * (DEPTH + 10) - rand() * 4;
    const lane = swayFor((START_Z - z) / DEPTH);
    f.base.set(lane + side * (6.5 + rand() * 7), (rand() - 0.5) * 10, z);
    f.scale = 0.55 + rand() * 0.6;
    f.mesh.scale.setScalar(f.scale);
  }

  // Dust particles
  const DUST = isSmall() ? 700 : 1500;
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = (rand() - 0.5) * 40;
    dustPos[i * 3 + 1] = (rand() - 0.5) * 26;
    dustPos[i * 3 + 2] = START_Z + 6 - rand() * (DEPTH + 30);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.045, transparent: true, opacity: 0.55, depthWrite: false })
  );
  scene.add(dust);


  function layoutFeatured() {
    const small = isSmall();
    hero.base.set(small ? 0.6 : 4.6, small ? 3.6 : 0.2, small ? -3 : -1.5);
    hero.scale = small ? 0.75 : 1.05;
    hero.mesh.scale.setScalar(hero.scale);

    featured.forEach((f, idx) => {
      const el = document.getElementById(f.featured);
      if (!el) return;
      const mid = el.offsetTop + el.offsetHeight / 2 - window.innerHeight / 2;
      const p = Math.min(1, Math.max(0, mid / maxScroll()));
      const z = camZFor(p) - 8.5;
      // Chapter cards alternate sides; put the molecule on the open side
      const side = idx % 2 === 1 ? -1 : 1;
      const x = small ? swayFor(p) : swayFor(p) + side * 4.4;
      f.base.set(x, small ? 4.2 : 0.3, small ? z - 3 : z);
      f.scale = small ? 0.6 : 1.05;
      f.mesh.scale.setScalar(f.scale);
    });
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmall() ? 1.5 : 1.75));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 62 : 50;
    camera.updateProjectionMatrix();
    layoutFeatured();
  }

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener(
    'pointermove',
    (e) => {
      pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    },
    { passive: true }
  );

  let camP = window.scrollY / maxScroll();
  const clock = new THREE.Clock();

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const target = window.scrollY / maxScroll();
    camP += (target - camP) * (reducedMotion ? 1 : 1 - Math.exp(-dt * 4.5));

    pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-dt * 3));
    pointer.y += (pointer.ty - pointer.y) * (1 - Math.exp(-dt * 3));

    const z = camZFor(camP);
    const sway = swayFor(camP);
    camera.position.set(sway + pointer.x * 0.6, -pointer.y * 0.4 + Math.sin(camP * Math.PI * 3) * 0.5, z);
    camera.lookAt(sway * 0.6, 0, z - 10);
    camera.rotateZ(Math.sin(camP * Math.PI * 4) * 0.04);
    rim.position.set(camera.position.x - 6, 4, z - 6);

    const motion = reducedMotion ? 0 : 1;
    for (const f of floaters) {
      f.mesh.rotation.x += f.spin.x * dt * motion;
      f.mesh.rotation.y += f.spin.y * dt * motion;
      f.mesh.rotation.z += f.spin.z * dt * motion;
      f.mesh.position.set(f.base.x, f.base.y + Math.sin(t * 0.6 + f.bob) * 0.25 * motion, f.base.z);
    }
    dust.rotation.z = t * 0.01 * motion;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize);
  // Section heights settle after fonts/images load
  window.addEventListener('load', layoutFeatured);
  if (document.fonts) document.fonts.ready.then(layoutFeatured);
  requestAnimationFrame(frame);
}

/* ==========================================================================
   Page UI
   ========================================================================== */

function initReveals() {
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || reducedMotion) {
    els.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
  );
  els.forEach((el) => io.observe(el));
}

function initRail() {
  const links = new Map([...document.querySelectorAll('[data-rail]')].map((a) => [a.dataset.rail, a]));
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((a) => a.classList.remove('is-active'));
        links.get(entry.target.dataset.section)?.classList.add('is-active');
      });
    },
    { rootMargin: '-45% 0px -45% 0px' }
  );
  document.querySelectorAll('[data-section]').forEach((s) => io.observe(s));
}

function initHeader() {
  const header = document.querySelector('.site-header');
  const bar = document.querySelector('.progress-bar');
  let ticking = false;
  const update = () => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    header.classList.toggle('is-scrolled', window.scrollY > 40);
    bar.style.transform = `scaleX(${window.scrollY / max})`;
    ticking = false;
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true }
  );
  update();
}

// Before/after: the before photo covers the left of the line,
// so dragging the line left reveals more of the after photo.
function initCompare() {
  const box = document.getElementById('compare');
  if (!box) return;
  const handle = box.querySelector('.compare-handle');
  let pos = 50;
  let dragging = false;

  const set = (next) => {
    pos = Math.min(100, Math.max(0, next));
    box.style.setProperty('--pos', `${pos}%`);
    handle.setAttribute('aria-valuenow', String(Math.round(pos)));
    handle.setAttribute('aria-valuetext', `${Math.round(pos)}% before, ${Math.round(100 - pos)}% after`);
  };

  const fromEvent = (e) => {
    const rect = box.getBoundingClientRect();
    set(((e.clientX - rect.left) / rect.width) * 100);
  };

  box.addEventListener('pointerdown', (e) => {
    dragging = true;
    box.classList.add('is-dragging');
    box.setPointerCapture(e.pointerId);
    fromEvent(e);
  });
  box.addEventListener('pointermove', (e) => {
    if (dragging) fromEvent(e);
  });
  const stop = () => {
    dragging = false;
    box.classList.remove('is-dragging');
  };
  box.addEventListener('pointerup', stop);
  box.addEventListener('pointercancel', stop);

  handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 20 : 5;
    const keys = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step };
    if (e.key in keys) set(pos + keys[e.key]);
    else if (e.key === 'Home') set(0);
    else if (e.key === 'End') set(100);
    else return;
    e.preventDefault();
  });

  set(50);
}

document.getElementById('year').textContent = new Date().getFullYear();
initReveals();
initRail();
initHeader();
initCompare();
initScene();
