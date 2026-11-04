/* 3D cutaway models for the Airport Geothermal Simulator (three.js).
   Source for js/vendor/scene3d.bundle.js. Rebuild: see BUILD_3D.txt
   Features: PBR materials + environment lighting, soft shadows, procedural geology textures,
   bloom, sky/weather, animated flow, detailed terminal, aircraft, plant, wells and borefield. */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888888';
const W = 76, DZ = 34, X0 = -W / 2, Z0 = -14;           // ground block (x, z extents)
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const loaded = [];
let loopStarted = false; const clock = new THREE.Clock();

/* ---------- tiny helpers ---------- */
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function canvasTex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (rep) t.repeat.set(rep[0], rep[1]); return t;
}
function speckle(g, w, h, n, cols, rmin, rmax, r) {
  for (let i = 0; i < n; i++) { g.fillStyle = cols[(r() * cols.length) | 0]; g.beginPath(); g.ellipse(r() * w, r() * h, rmin + r() * (rmax - rmin), (rmin + r() * (rmax - rmin)) * 0.7, r() * 3, 0, 6.3); g.fill(); }
}
const TEX = {};
function geoTex(kind) {
  if (TEX[kind]) return TEX[kind];
  const r = rng(kind.length * 977 + kind.charCodeAt(0));
  TEX[kind] = canvasTex(256, 128, (g, w, h) => {
    if (kind === 'topsoil') { g.fillStyle = '#7a5a3a'; g.fillRect(0, 0, w, h); speckle(g, w, h, 900, ['#5b3f26', '#8d6a45', '#3d2a19', '#a07a50'], 0.6, 2.2, r); g.strokeStyle = 'rgba(40,26,14,.5)'; for (let i = 0; i < 26; i++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 18; y += r() * 10; g.lineTo(x, y); } g.stroke(); } }
    else if (kind === 'gravel') { g.fillStyle = '#b79c66'; g.fillRect(0, 0, w, h); speckle(g, w, h, 520, ['#d9c28f', '#8f7a52', '#e9dcb8', '#6f5f43', '#b5b0a4'], 1.2, 4.2, r); }
    else if (kind === 'aquifer') { g.fillStyle = '#4b9fd8'; g.fillRect(0, 0, w, h); speckle(g, w, h, 420, ['#79c0ee', '#2f7fb8', '#c4e5fa', '#e6d9b0'], 0.8, 3, r); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.2; for (let i = 0; i < 9; i++) { g.beginPath(); const y0 = 8 + i * 14; g.moveTo(0, y0); for (let x = 0; x <= w; x += 16) g.lineTo(x, y0 + Math.sin(x * 0.07 + i) * 3); g.stroke(); } }
    else if (kind === 'clay') { g.fillStyle = '#8f8576'; g.fillRect(0, 0, w, h); speckle(g, w, h, 300, ['#a39887', '#756b5d', '#b3a897'], 1, 3, r); g.strokeStyle = 'rgba(60,52,42,.35)'; for (let i = 0; i < 14; i++) { const y = r() * h; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (r() - 0.5) * 8); g.stroke(); } }
    else if (kind === 'bedrock') { g.fillStyle = '#6c747b'; g.fillRect(0, 0, w, h); speckle(g, w, h, 700, ['#828c94', '#555d63', '#9aa4ab', '#464d52'], 0.8, 3.4, r); g.strokeStyle = 'rgba(25,30,34,.55)'; g.lineWidth = 1.2; for (let i = 0; i < 12; i++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); } }
    else if (kind === 'grass') { g.fillStyle = '#6f9561'; g.fillRect(0, 0, w, h); speckle(g, w, h, 1400, ['#5f8753', '#82a870', '#4f7545', '#94b57f'], 0.5, 1.8, r); }
    else if (kind === 'concrete') { g.fillStyle = '#6b747b'; g.fillRect(0, 0, w, h); speckle(g, w, h, 600, ['#737c83', '#626b72', '#7d868d'], 0.5, 2, r); g.strokeStyle = 'rgba(20,26,30,.5)'; g.lineWidth = 1.4; g.strokeRect(0.5, 0.5, w - 1, h - 1); g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke(); }
  });
  return TEX[kind];
}
const LAYER = [
  { n: 'Topsoil', y0: 0, y1: -3, tex: 'topsoil', o: 0.55 },
  { n: 'Sand and gravel', y0: -3, y1: -6, tex: 'gravel', o: 0.5 },
  { n: 'Aquifer', y0: -6, y1: -11, tex: 'aquifer', o: 0.55, alt: { n: 'Clay and shale', tex: 'clay', o: 0.55 } },
  { n: 'Bedrock', y0: -11, y1: -16, tex: 'bedrock', o: 0.7 }
];

function poly(pts) {
  const lens = [0]; for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = lens[lens.length - 1], tmp = new THREE.Vector3();
  return { pts, total, at(t) {
    const d = (((t % 1) + 1) % 1) * total; let i = 1; while (i < lens.length - 1 && lens[i] < d) i++;
    const seg = lens[i] - lens[i - 1] || 1, u = (d - lens[i - 1]) / seg;
    return tmp.copy(pts[i - 1]).lerp(pts[i], u);
  } };
}
function disposeGroup(g) {
  g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); });
}
function pipe(group, pts, r, color, opts) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.7, emissive: color, emissiveIntensity: 0.12, ...(opts || {}) });
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], len = a.distanceTo(b); if (len < 1e-3) continue;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), m);
    c.position.copy(a).add(b).multiplyScalar(0.5);
    c.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
    group.add(c);
  }
  pts.forEach((p, i) => { if (i > 0 && i < pts.length - 1) { const s = new THREE.Mesh(new THREE.SphereGeometry(r * 1.02, 14, 10), m); s.position.copy(p); group.add(s); } });
}
function box(w, h, d, color, x, y, z, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.08, ...(opts || {}) }));
  m.position.set(x, y, z); return m;
}
function cyl(rt, rb, h, color, x, y, z, opts, seg) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 20), new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.15, ...(opts || {}) }));
  m.position.set(x, y, z); return m;
}
function labelDecal(text, w, h) {
  const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w); const g = c.getContext('2d');
  g.fillStyle = 'rgba(8,16,22,.55)'; const rr = c.height / 2; g.beginPath(); g.moveTo(rr, 0); g.arcTo(c.width, 0, c.width, c.height, rr); g.arcTo(c.width, c.height, 0, c.height, rr); g.arcTo(0, c.height, 0, 0, rr); g.arcTo(0, 0, c.width, 0, rr); g.fill();
  g.fillStyle = '#f2f8fb'; g.font = '600 ' + Math.round(c.height * 0.5) + 'px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, c.width / 2, c.height / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
}

function arrangement(kind) {
  if (kind === 'open') return { plant: V(-27, 0, -6), prod: V(-12, 0, 9), inj: V(14, 0, 9), field: null };
  if (kind === 'closed') return { plant: V(-27, 0, -6), prod: null, inj: null, field: { x0: -17, x1: 24, z0: 3, z1: 14 } };
  return { plant: V(-27, 0, -6), prod: V(-33, 0, 5), inj: V(-33, 0, 12), field: { x0: -22, x1: 27, z0: 3, z1: 14 } };
}

/* ---------- builders for the static world ---------- */
function buildAircraft(blue) {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.28, metalness: 0.2 });
  const livery = new THREE.MeshStandardMaterial({ color: blue, roughness: 0.3, metalness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c262e, roughness: 0.25, metalness: 0.3 });
  const prof = [[0.02, -7.6], [0.3, -7.2], [0.75, -6.0], [1.1, -4.2], [1.25, -2.4], [1.28, 0], [1.28, 3.2], [1.18, 4.6], [0.9, 5.7], [0.5, 6.5], [0.12, 6.95], [0, 7.0]].map(p => new THREE.Vector2(p[0], p[1]));
  const fus = new THREE.Mesh(new THREE.LatheGeometry(prof, 40), white); fus.rotation.x = Math.PI / 2; g.add(fus);
  const belly = new THREE.Mesh(new THREE.CylinderGeometry(1.285, 1.285, 9.2, 40, 1, true, Math.PI * 0.62, Math.PI * 0.76), livery); belly.rotation.x = Math.PI / 2; belly.position.z = -0.2; belly.rotation.z = Math.PI; g.add(belly);
  g.add(box(2.6, 0.16, 8.6, 0x20303c, 0, 0.45, -0.4)); g.add(box(1.5, 0.28, 0.8, 0x14202a, 0, 0.6, 5.5));
  const wingShape = (s) => { const sh = new THREE.Shape(); sh.moveTo(0.7, 0); sh.lineTo(8.8 * s, 3.6 * s); sh.lineTo(8.8 * s, 4.6 * s); sh.lineTo(0.7, 3.4 * s); sh.closePath(); const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.2 * s, bevelEnabled: false }); geo.rotateX(-Math.PI / 2); return geo; };
  [1, -1].forEach(sd => { const w = new THREE.Mesh(wingShape(1), white); w.scale.x = sd; w.position.set(0, -0.45, 1.6); g.add(w); const tip = box(0.1, 0.9, 0.9, blue, sd * 8.8, 0.05, -2.1, { color: blue }); tip.rotation.z = sd * 0.2; g.add(tip);
    const st = new THREE.Mesh(wingShape(0.38), white); st.scale.x = sd; st.position.set(0, 0.3, -6.1); g.add(st); });
  const fs = new THREE.Shape(); fs.moveTo(-4.4, 1.0); fs.lineTo(-7.4, 1.0); fs.lineTo(-7.7, 4.8); fs.lineTo(-6.5, 4.8); fs.closePath();
  const fgeo = new THREE.ExtrudeGeometry(fs, { depth: 0.22, bevelEnabled: false }); fgeo.rotateY(-Math.PI / 2); fgeo.translate(0.11, 0, 0); g.add(new THREE.Mesh(fgeo, livery));
  [-3.6, 3.6].forEach(x => {
    const en = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.62, 2.6, 28), new THREE.MeshStandardMaterial({ color: 0xcfd6dc, roughness: 0.25, metalness: 0.5 })); en.rotation.x = Math.PI / 2; en.position.set(x, -1.05, 2.4); g.add(en);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.09, 10, 28), livery); lip.position.set(x, -1.05, 3.72); g.add(lip);
    const inlet = cyl(0.62, 0.62, 0.05, 0x0d1419, x, -1.05, 3.68, null, 24); inlet.rotation.x = Math.PI / 2; g.add(inlet);
    g.add(box(0.2, 0.8, 1.8, 0xc3ccd3, x, -0.55, 2.2));
  });
  const wheel = (x, y, z) => { const w = cyl(0.36, 0.36, 0.28, 0x14181c, x, y, z, { roughness: 0.8, metalness: 0 }, 18); w.rotation.z = Math.PI / 2; g.add(w); };
  g.add(cyl(0.07, 0.07, 1.3, 0xaab4bb, 0, -1.4, 4.3)); wheel(-0.2, -2.0, 4.3); wheel(0.2, -2.0, 4.3);
  [-1.5, 1.5].forEach(x => { g.add(cyl(0.1, 0.1, 1.4, 0xaab4bb, x, -1.35, -0.4)); wheel(x - 0.22, -2.0, -0.4); wheel(x + 0.22, -2.0, -0.4); });
  return g;
}
function buildTerminal(S) {
  const t = new THREE.Group(); t.position.set(0, 0, -6);
  const white = 0xeef2f5;
  t.add(box(43, 0.5, 11.6, 0xc6cdd3, 0, 0.25, 0.4, { roughness: 0.7 }));
  t.add(box(40, 4.4, 0.45, white, 0, 2.7, -4.6)); t.add(box(0.45, 4.4, 9.2, white, -20, 2.7, 0)); t.add(box(0.45, 4.4, 9.2, white, 20, 2.7, 0));
  // interior glow floor + light strips
  S.interior = new THREE.MeshStandardMaterial({ color: 0xffe9c4, emissive: 0xffd9a0, emissiveIntensity: 0.7, roughness: 0.6 });
  const fl = new THREE.Mesh(new THREE.BoxGeometry(39, 0.06, 8.6), S.interior); fl.position.set(0, 0.55, 0); t.add(fl);
  for (let i = -3; i <= 3; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.05, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dc, emissiveIntensity: 2.2 })); s.position.set(i * 5.5, 4.2, 0); t.add(s); }
  // interior seating blocks and columns to give depth through the glass
  for (let i = -4; i <= 4; i++) t.add(box(2.6, 0.7, 1.0, 0x4a6275, i * 4.4, 0.9, 1.2));
  for (let i = -3; i <= 3; i++) t.add(cyl(0.22, 0.22, 4.1, 0xd5dbe0, i * 6, 2.6, -1.8));
  // curtain wall
  S.glass = new THREE.Mesh(new THREE.BoxGeometry(40, 3.9, 0.12), new THREE.MeshPhysicalMaterial({ color: 0x9fd2f2, transparent: true, opacity: 0.34, roughness: 0.04, metalness: 0.1, emissive: 0x000000, depthWrite: false, clearcoat: 1 })); S.glass.position.set(0, 2.55, 4.6); t.add(S.glass);
  for (let i = 0; i <= 20; i++) t.add(box(0.14, 3.95, 0.22, 0xd9e0e5, -20 + i * 2, 2.55, 4.6, { metalness: 0.5, roughness: 0.3 }));
  [0.6, 2.0, 3.4, 4.5].forEach(y => t.add(box(40, 0.1, 0.22, 0xd9e0e5, 0, y, 4.6, { metalness: 0.5, roughness: 0.3 })));
  // sweeping roof
  const sh = new THREE.Shape(); sh.moveTo(-5.6, 4.5); sh.quadraticCurveTo(-1.5, 7.2, 3.2, 6.1); sh.quadraticCurveTo(6.2, 5.4, 9.4, 5.6); sh.lineTo(9.4, 5.15); sh.quadraticCurveTo(6.2, 4.95, 3.2, 5.6); sh.quadraticCurveTo(-1.5, 6.7, -5.6, 4.05); sh.closePath();
  const rg = new THREE.ExtrudeGeometry(sh, { depth: 45, bevelEnabled: false, curveSegments: 24 }); rg.translate(0, 0, -22.5);
  S.roofMat = new THREE.MeshStandardMaterial({ color: 0xe9eef2, roughness: 0.35, metalness: 0.35 });
  const roof = new THREE.Mesh(rg, S.roofMat); roof.rotation.y = -Math.PI / 2; t.add(roof);
  const under = new THREE.Mesh(new THREE.PlaneGeometry(44, 14), new THREE.MeshStandardMaterial({ color: 0x35424c, roughness: 0.6 })); under.rotation.x = Math.PI / 2; under.position.set(0, 4.35, 2.2); t.add(under);
  for (let i = 0; i < 8; i++) t.add(cyl(0.14, 0.14, 4.7, 0xcfd6dc, -19.6 + i * 5.6, 2.3, 8.3, { metalness: 0.6, roughness: 0.3 }, 12));
  // jet bridges to the apron
  [-12, 0, 12].forEach(x => {
    const br = new THREE.Group(); br.position.set(x, 2.7, 4.6);
    br.add(box(1.9, 1.9, 4.3, 0xd7dde2, 0, 0, 2.2, { roughness: 0.3, metalness: 0.4 }));
    br.add(box(1.95, 0.5, 4.35, 0x2b3a46, 0, 0.1, 2.2, { roughness: 0.2, metalness: 0.2 }));
    br.add(cyl(1.15, 1.15, 1.9, 0xc9d1d7, 0, 0, 0.1, null, 20));
    const cab = cyl(1.0, 1.0, 1.8, 0xb9c3cb, 0, -0.1, 4.3, null, 20); cab.rotation.x = Math.PI / 2; br.add(cab);
    br.add(cyl(0.12, 0.12, 2.5, 0x5b6770, 0, -1.4, 3.9, null, 8)); br.add(cyl(0.3, 0.3, 0.3, 0x15191c, 0, -2.5, 3.9, null, 12)); br.children[br.children.length - 1].rotation.z = Math.PI / 2;
    t.add(br);
  });
  return t;
}
function buildTower() {
  const g = new THREE.Group(); g.position.set(31, 0, -9);
  g.add(cyl(0.9, 1.4, 14, 0xdfe5ea, 0, 7, 0, { metalness: 0.3, roughness: 0.4 }, 24));
  g.add(cyl(2.6, 1.8, 1.0, 0xcfd6dc, 0, 14.4, 0, null, 24));
  g.add(cyl(2.7, 2.7, 1.8, 0x7fc0ea, 0, 15.8, 0, { transparent: true, opacity: 0.6, roughness: 0.05, metalness: 0.2, emissive: 0x335a70, emissiveIntensity: 0.4 }, 24));
  g.add(cyl(3.2, 0.2, 1.1, 0x3a4650, 0, 17.2, 0, null, 24)); g.add(cyl(0.06, 0.06, 3, 0xb0b8be, 0, 19.2, 0, null, 6));
  const bc = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff4d4d, toneMapped: false })); bc.position.y = 20.8; g.add(bc); g.userData.beacon = bc;
  return g;
}
function buildCarTug() {
  const g = new THREE.Group();
  g.add(box(1.5, 0.8, 1.0, 0xe2b93b, 0, 0.7, 0)); g.add(box(0.8, 0.6, 0.9, 0x2b3a46, 0.35, 1.3, 0));
  for (let i = 1; i <= 3; i++) { g.add(box(1.8, 0.45, 1.2, 0x7b8791, -i * 2.2, 0.8, 0)); g.add(box(1.0, 0.7, 1.0, 0x3d6f9c, -i * 2.2, 1.3, 0)); g.add(box(0.5, 0.1, 0.1, 0x556068, -i * 2.2 + 1.1, 0.5, 0)); }
  return g;
}

function makeScene(container, kind) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  const pr = Math.min(window.devicePixelRatio || 1, 2); renderer.setPixelRatio(pr);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 's3d-canvas'; renderer.domElement.setAttribute('aria-label', '3D model of the system. Drag to rotate.'); renderer.domElement.tabIndex = 0;
  container.appendChild(renderer.domElement);
  const labelLayer = document.createElement('div'); labelLayer.className = 's3d-labels'; container.appendChild(labelLayer);
  const hud = document.createElement('div'); hud.className = 's3d-hud';
  hud.innerHTML = '<div class="s3d-status" aria-live="polite"></div><div class="s3d-tools"><button type="button" data-a="reset">Reset view</button><button type="button" data-a="rotate" aria-pressed="false">Auto-rotate</button><button type="button" data-a="labels" aria-pressed="true">Labels</button><button type="button" data-a="xray" aria-pressed="true">X-ray ground</button></div><div class="s3d-hint">Drag to rotate. Click the model, then scroll to zoom.</div>';
  container.appendChild(hud);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 700);
  const homeBase = V(60, 36, 78), home = homeBase.clone(), homeT = V(0, -2, 3), introFrom = V(105, 72, 130);
  camera.position.copy(introFrom);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(homeT); controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minDistance = 22; controls.maxDistance = 150;
  controls.maxPolarAngle = Math.PI * 0.62; controls.autoRotateSpeed = 0.7; controls.enableZoom = false;
  let introT = 0, introOn = true, userMoved = false; const stopIntro = () => { introOn = false; };
  renderer.domElement.addEventListener('pointerdown', () => { controls.enableZoom = true; userMoved = true; stopIntro(); });
  renderer.domElement.addEventListener('wheel', stopIntro, { passive: true });
  renderer.domElement.addEventListener('blur', () => { controls.enableZoom = false; });
  container.addEventListener('pointerleave', () => { controls.enableZoom = false; });

  // image-based lighting for believable metal and glass
  try { const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); } catch (e) { /* no IBL */ }
  const hemi = new THREE.HemisphereLight(0xdfeeff, 0x5b5346, 0.55); scene.add(hemi);
  const sunL = new THREE.DirectionalLight(0xffffff, 2.2); sunL.position.set(34, 52, 30); sunL.castShadow = true;
  sunL.shadow.mapSize.set(2048, 2048); Object.assign(sunL.shadow.camera, { left: -52, right: 52, top: 40, bottom: -40, near: 5, far: 160 }); sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.06; sunL.shadow.radius = 3;
  scene.add(sunL);
  const fillL = new THREE.DirectionalLight(0x9db8d6, 0.5); fillL.position.set(-34, 22, -24); scene.add(fillL);

  // post-processing: bloom on bright, emissive things only
  let composer = null, bloom = null;
  try {
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt); composer.setPixelRatio(pr);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.55, 1.0); composer.addPass(bloom);
    composer.addPass(new OutputPass());
  } catch (e) { composer = null; }

  const staticG = new THREE.Group(), dynG = new THREE.Group(); scene.add(staticG, dynG);
  const S = { sig: '', mode: 'idle', load: 0, T: 50, xray: true, labels: true, items: [], parts: [], fans: [], halo: [], plume: [], glass: null, layerMats: [], snow: null, sun: null, clouds: [], labelEls: [], ctx: null, time: 0, speed: 0.05 };

  /* ---- sky, fog, plinth ---- */
  const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { top: { value: new THREE.Color(0x4d92d0) }, bot: { value: new THREE.Color(0xcfe6f5) } },
    vertexShader: 'varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 top;uniform vec3 bot;varying vec3 vP;void main(){float h=clamp(vP.y*1.5+0.12,0.,1.);gl_FragColor=vec4(mix(bot,top,pow(h,0.75)),1.);}' });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat)); scene.fog = new THREE.Fog(0xcfe6f5, 170, 420);
  const plinthTex = canvasTex(256, 256, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(30,42,52,1)'); gr.addColorStop(0.55, 'rgba(30,42,52,.85)'); gr.addColorStop(1, 'rgba(30,42,52,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  plinthTex.wrapS = plinthTex.wrapT = THREE.ClampToEdgeWrapping;
  const plinth = new THREE.Mesh(new THREE.CircleGeometry(95, 72), new THREE.MeshBasicMaterial({ map: plinthTex, transparent: true, depthWrite: false })); plinth.rotation.x = -Math.PI / 2; plinth.position.y = -17.2; scene.add(plinth);
  const grid = new THREE.GridHelper(150, 30, 0x7aa8c8, 0x7aa8c8); grid.position.y = -17.1; grid.material.transparent = true; grid.material.opacity = 0.08; scene.add(grid);
  staticG.add(box(W + 2, 1.0, DZ + 2, 0x1b252d, 0, -16.5, Z0 + DZ / 2, { metalness: 0.6, roughness: 0.35 }));
  staticG.add(box(W + 2.1, 0.12, DZ + 2.1, 0x58c4ff, 0, -16.1, Z0 + DZ / 2, { emissive: 0x2fa8ee, emissiveIntensity: 1.6, color: 0x58c4ff }));

  /* ---- ground block with geology ---- */
  LAYER.forEach((L, i) => {
    const t = L.y0 - L.y1, mats = [];
    const tex = geoTex(L.tex); const tx = tex.clone(); tx.needsUpdate = true; tx.repeat.set(W / 22, t / 5); L.map = tx;
    if (L.alt) { const ax = geoTex(L.alt.tex).clone(); ax.needsUpdate = true; ax.repeat.set(W / 22, t / 5); L.altMap = ax; }
    for (let f = 0; f < 6; f++) { const m = new THREE.MeshStandardMaterial({ map: tx, color: 0xffffff, transparent: true, opacity: L.o, depthWrite: false, roughness: 0.92, metalness: 0 }); mats.push(m); }
    mats[2].visible = false; mats[3].visible = i === 3;      // top drawn separately
    S.layerMats.push({ mats, L, i });
    const m = new THREE.Mesh(new THREE.BoxGeometry(W, t, DZ), mats); m.position.set(0, (L.y0 + L.y1) / 2, Z0 + DZ / 2); m.renderOrder = i; m.userData.noShadow = true; staticG.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.38 })); e.position.copy(m.position); staticG.add(e);
  });
  const gt = geoTex('grass').clone(); gt.needsUpdate = true; gt.repeat.set(W / 8, DZ / 8);
  S.topMat = new THREE.MeshStandardMaterial({ map: gt, color: 0xffffff, transparent: true, opacity: 0.55, roughness: 0.95, depthWrite: true });
  const top = new THREE.Mesh(new THREE.PlaneGeometry(W, DZ), S.topMat); top.rotation.x = -Math.PI / 2; top.position.set(0, 0.01, Z0 + DZ / 2); top.receiveShadow = true; top.userData.keep = true; staticG.add(top);
  const ct = geoTex('concrete').clone(); ct.needsUpdate = true; ct.repeat.set((W - 2) / 5, 22 / 5);
  S.apron = new THREE.Mesh(new THREE.BoxGeometry(W - 2, 0.1, 22), new THREE.MeshStandardMaterial({ map: ct, transparent: true, opacity: 0.62, roughness: 0.9 })); S.apron.position.set(0, 0.06, Z0 + DZ - 11 - 0.5); staticG.add(S.apron);
  for (let i = 0; i < 9; i++) staticG.add(box(3.2, 0.05, 0.22, 0xe8c547, -32 + i * 8, 0.13, 6.5, { emissive: 0x8a6d10, emissiveIntensity: 0.3 }));
  staticG.add(box(0.2, 0.05, 6.2, 0xe8c547, 0, 0.13, 10.2, { emissive: 0x8a6d10, emissiveIntensity: 0.3 }));
  // landside road with cars and trees
  staticG.add(box(W - 3, 0.07, 3.2, 0x2d3338, 0, 0.06, -12));
  for (let i = 0; i < 12; i++) staticG.add(box(2.2, 0.05, 0.16, 0xf0f2f4, -33 + i * 6, 0.11, -12));
  [[-30, 0xc0392b], [-18, 0x2f6fb0], [-6, 0xe8e8e8], [9, 0x222a30], [22, 0xd89a2b], [34, 0x5a6b78]].forEach(([x, c], i) => { const car = new THREE.Group(); car.add(box(2.6, 0.7, 1.2, c, 0, 0.55, 0, { roughness: 0.25, metalness: 0.5 })); car.add(box(1.4, 0.55, 1.05, 0x1b2630, -0.1, 1.1, 0, { roughness: 0.1, metalness: 0.4 })); car.position.set(x, 0, i % 2 ? -11.3 : -12.7); staticG.add(car); });
  const treeT = new THREE.InstancedMesh(new THREE.ConeGeometry(1.0, 2.8, 8), new THREE.MeshStandardMaterial({ color: 0x3f7a4a, roughness: 0.9 }), 14), trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.18, 0.9, 6), new THREE.MeshStandardMaterial({ color: 0x5b4330 }), 14), tmpO = new THREE.Object3D();
  for (let i = 0; i < 14; i++) { const x = -34 + i * 5.2, z = -13.6 + (i % 3) * 0.2; tmpO.position.set(x, 2.1, z); tmpO.scale.setScalar(0.85 + (i % 4) * 0.12); tmpO.updateMatrix(); treeT.setMatrixAt(i, tmpO.matrix); tmpO.position.set(x, 0.45, z); tmpO.scale.setScalar(1); tmpO.updateMatrix(); trunk.setMatrixAt(i, tmpO.matrix); }
  staticG.add(treeT, trunk); S.trees = treeT.material;
  // light poles
  for (let i = 0; i < 7; i++) { const x = -33 + i * 11; staticG.add(cyl(0.1, 0.14, 5.5, 0x8d99a3, x, 2.75, 18.6, { metalness: 0.6 }, 8)); const head = box(1.1, 0.18, 0.5, 0xfff2cf, x, 5.55, 18.3, { emissive: 0xffe3a3, emissiveIntensity: 2.4 }); staticG.add(head); }
  // terminal, tower, aircraft, ground vehicle
  S.term = buildTerminal(S); staticG.add(S.term);
  S.tower = buildTower(); staticG.add(S.tower);
  const plane = buildAircraft(0x1d5fb4); plane.position.set(0, 2.38, 13.4); plane.rotation.y = Math.PI; staticG.add(plane); S.plane = plane;
  S.tug = buildCarTug(); S.tug.position.set(0, 0, 4.2); staticG.add(S.tug);

  // weather
  const sunC = document.createElement('canvas'); sunC.width = sunC.height = 128; const sg = sunC.getContext('2d'); const gr = sg.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.3, 'rgba(255,218,130,.8)'); gr.addColorStop(1, 'rgba(255,190,80,0)'); sg.fillStyle = gr; sg.fillRect(0, 0, 128, 128);
  S.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(sunC), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); S.sun.position.set(60, 60, -90); scene.add(S.sun);
  const cc = document.createElement('canvas'); cc.width = 256; cc.height = 128; const cg = cc.getContext('2d'); const rc = rng(7);
  for (let i = 0; i < 26; i++) { const x = 40 + rc() * 176, y = 56 + (rc() - 0.5) * 24, r = 14 + rc() * 22, q = cg.createRadialGradient(x, y, 0, x, y, r); q.addColorStop(0, 'rgba(255,255,255,.55)'); q.addColorStop(1, 'rgba(255,255,255,0)'); cg.fillStyle = q; cg.beginPath(); cg.arc(x, y, r, 0, 6.3); cg.fill(); }
  const cloudTex = new THREE.CanvasTexture(cc); cloudTex.colorSpace = THREE.SRGBColorSpace;
  for (let i = 0; i < 7; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.85, fog: false })); sp.scale.set(70 + (i % 3) * 22, 35 + (i % 3) * 11, 1); sp.position.set(-120 + i * 38, 62 + (i % 3) * 9, -70 - (i % 2) * 40); sp.userData.dx = 0.7 + (i % 3) * 0.3; scene.add(sp); S.clouds.push(sp); }
  const N = 650, spA = new Float32Array(N * 3); for (let i = 0; i < N; i++) { spA[i * 3] = (Math.random() - 0.5) * W; spA[i * 3 + 1] = Math.random() * 28; spA[i * 3 + 2] = Z0 + Math.random() * DZ; }
  const sgeo = new THREE.BufferGeometry(); sgeo.setAttribute('position', new THREE.BufferAttribute(spA, 3));
  S.snow = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.36, transparent: true, opacity: 0.9, depthWrite: false })); scene.add(S.snow);

  /* ---- dynamic: plant, wells, borefield, particles ---- */
  function addGroup(count, radius) {
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(radius, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.userData.noShadow = true; dynG.add(mesh);
    const g = { mesh, items: [], count }; S.parts.push(g); return g;
  }
  function addParticles(g, path, n, colorFn, speedMul) { for (let i = 0; i < n && g.items.length < g.count; i++) g.items.push({ path, ph: i / n, colorFn, speedMul: speedMul || 1 }); }
  const glowMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });

  function build(ctx) {
    S.items = []; S.parts = []; S.fans = []; S.halo = []; S.plume = [];
    while (dynG.children.length) { const c = dynG.children[0]; dynG.remove(c); disposeGroup(c); }
    labelLayer.innerHTML = ''; S.labelEls = [];
    const A = arrangement(kind), p = ctx.p, res = ctx.res, cOpen = cssv('--open'), cClosed = cssv('--closed');
    const sysOpen = kind === 'open' ? res.open.subs[0] : kind === 'hybrid' ? res.hybrid.subs[0] : null;
    const sysClosed = kind === 'closed' ? res.closed.subs[0] : kind === 'hybrid' ? res.hybrid.subs[1] : null;
    const hasAq = !!sysOpen;
    S.layerMats.forEach(({ mats, L }) => { const useAlt = L.alt && !hasAq; mats.forEach(m => { m.map = useAlt ? L.altMap : L.map; m.opacity = useAlt ? L.alt.o : L.o; m.userData.base = m.opacity; m.needsUpdate = true; }); if (L.tex === 'aquifer') S.aqTex = hasAq ? L.map : null; });
    // strata name plates on the cut face
    [['Topsoil', -1.5], ['Sand and gravel', -4.5], [hasAq ? 'Aquifer (groundwater)' : 'Clay and shale', -8.5], ['Bedrock', -13.5]].forEach(([tx, y]) => { const d = labelDecal(tx, 9.5, 1.55); d.position.set(X0 + 6.2, y, Z0 + DZ + 0.06); dynG.add(d); });
    // plant house
    const plant = new THREE.Group(); plant.position.copy(A.plant); dynG.add(plant);
    plant.add(box(10, 3.6, 5.8, 0xaab6bf, 0, 1.8, 0, { metalness: 0.35, roughness: 0.4 })); plant.add(box(10.3, 0.35, 6.1, 0x2f3a43, 0, 3.75, 0, { metalness: 0.5, roughness: 0.4 }));
    for (let i = 0; i < 9; i++) plant.add(box(0.32, 2.6, 0.12, 0x6c7a85, -4 + i * 1, 1.9, 2.95));
    plant.add(box(2.6, 2.4, 0.2, 0x39464f, 2.9, 1.3, 2.95));
    S.beacon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), new THREE.MeshBasicMaterial({ color: 0x66ff99, toneMapped: false })); S.beacon.position.set(-4.2, 4.3, 2.4); plant.add(S.beacon);
    [-2.4, 2.4].forEach(x => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.16, 10, 36), new THREE.MeshStandardMaterial({ color: 0x1f2a32, metalness: 0.6, roughness: 0.3 })); ring.rotation.x = Math.PI / 2; ring.position.set(x, 4.0, 0); plant.add(ring);
      const well = cyl(1.62, 1.62, 0.2, 0x0e1418, x, 3.9, 0, null, 32); plant.add(well);
      const fan = new THREE.Group(); fan.position.set(x, 4.1, 0); fan.add(cyl(0.32, 0.32, 0.28, 0x7d8a94, 0, 0, 0, { metalness: 0.7 }, 16));
      for (let b = 0; b < 5; b++) { const bl = box(1.45, 0.06, 0.42, 0xc7d0d7, 0.75, 0.05, 0, { metalness: 0.5 }); const hub = new THREE.Group(); hub.rotation.y = b * Math.PI * 2 / 5; bl.rotation.y = 0.35; hub.add(bl); fan.add(hub); }
      plant.add(fan); S.fans.push(fan);
    });
    plant.add(cyl(0.4, 0.5, 2.8, 0x8995a0, 4.2, 5.0, -1.8, { metalness: 0.5 }, 14));
    [-1.6, 1.6].forEach(z => { const tank = cyl(0.8, 0.8, 4.2, 0xc5ced5, -1.2, 0.9, -4.4 + (z > 0 ? 1.7 : 0), { metalness: 0.5, roughness: 0.3 }, 20); tank.rotation.z = Math.PI / 2; plant.add(tank); });
    pipe(dynG, [V(A.plant.x + 5.2, 1.3, A.plant.z), V(-18, 1.3, -6)], 0.24, 0xc4ccd2);
    const gDel = addGroup(70, 0.34);
    addParticles(gDel, poly([V(A.plant.x + 5.2, 1.3, A.plant.z), V(-18, 1.3, -6), V(18, 1.3, -6)]), 24, () => S.modeColor, 1.4);
    S.addLabel = (id, anchor, fn) => { const el = document.createElement('div'); el.className = 's3d-label'; labelLayer.appendChild(el); S.labelEls.push({ el, anchor, fn, id }); };
    S.addLabel('term', V(0, 8.2, -6), () => 'Airport terminal');
    S.addLabel('plant', V(A.plant.x, 8.4, A.plant.z), c => 'Heat pump plant' + (c.copNow ? ', COP ' + c.copNow : ''));
    const yT = -1.4;
    if (sysOpen && sysOpen.active) {
      const pr = A.prod, ij = A.inj, pz = A.plant.z + 1.6, iz = A.plant.z - 1.6, wellDepth = -10.6;
      [pr, ij].forEach(w => {
        dynG.add(cyl(0.55, 0.55, 10.6, 0xaebfcb, w.x, -5.0, w.z, { metalness: 0.7, roughness: 0.25 }, 18));
        const scr = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 4.4, 18, 7, true), new THREE.MeshStandardMaterial({ color: 0xe7f2fb, wireframe: true, emissive: 0x9ad2ff, emissiveIntensity: 0.8 })); scr.position.set(w.x, -8.7, w.z); dynG.add(scr);
        const house = new THREE.Group(); house.position.set(w.x, 0, w.z); house.add(box(2.2, 1.5, 2.2, 0xe9eef1, 0, 0.75, 0, { roughness: 0.4 }));
        const rf = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.9, 4), new THREE.MeshStandardMaterial({ color: 0x3a4a56, roughness: 0.5, metalness: 0.3 })); rf.rotation.y = Math.PI / 4; rf.position.y = 1.95; house.add(rf); house.add(box(0.5, 0.8, 0.08, 0x2a353e, 0, 0.5, 1.12)); dynG.add(house);
        for (let k = 0; k < 4; k++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.05, 8, 24), new THREE.MeshStandardMaterial({ color: 0xcdd6dc, metalness: 0.7, roughness: 0.3 })); ring.rotation.x = Math.PI / 2; ring.position.set(w.x, -2.5 - k * 2, w.z); dynG.add(ring); }
      });
      const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 2.0, 16), new THREE.MeshStandardMaterial({ color: cOpen, emissive: cOpen, emissiveIntensity: 1.1, metalness: 0.4, roughness: 0.3 })); pump.position.set(pr.x, -6.4, pr.z); dynG.add(pump);
      const prodPts = [V(pr.x, wellDepth + 1.8, pr.z), V(pr.x, yT, pr.z), V(pr.x, yT, pz), V(A.plant.x, yT, pz), V(A.plant.x, 1.0, pz)];
      const injPts = [V(A.plant.x + 1, 1.0, iz), V(A.plant.x + 1, yT, iz), V(ij.x, yT, iz), V(ij.x, yT, ij.z), V(ij.x, wellDepth + 1.8, ij.z)];
      pipe(dynG, prodPts, 0.32, cOpen); pipe(dynG, injPts, 0.32, cOpen);
      const gW = addGroup(130, 0.34);
      addParticles(gW, poly(prodPts), 20, () => S.gwColor, 1); addParticles(gW, poly(injPts), 20, () => S.retColor, 1);
      const pg = new THREE.Group(); pg.position.set(ij.x, -8.5, ij.z); [1, 0.72, 0.45].forEach((s, i) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), glowMat(0xffffff, 0.1 + i * 0.04)); m.scale.setScalar(s); pg.add(m); S.plume.push(m.material); }); S.plumeG = pg; dynG.add(pg);
      if (kind === 'open') S.addLabel('prod', V(pr.x, 6.2, pr.z), c => 'Production well, ' + Math.round(c.p.gwTemp) + '°F water');
      if (kind === 'open') S.addLabel('inj', V(ij.x, 8.6, ij.z), c => 'Injection well, returns at ' + Math.round(c.retF) + '°F');
      S.addLabel('aq', V((pr.x + ij.x) / 2, -9.8, pr.z + 4), () => (kind === 'hybrid' ? 'Well pair: ' : '') + nfm(sysOpen.designFlow) + ' gpm, ' + sysOpen.wellCount + ' wells');
    }
    if (sysClosed && sysClosed.active) {
      const F = A.field, Nn = sysClosed.bores, dn = Math.min(Nn, 120), fw = F.x1 - F.x0, fd = F.z1 - F.z0;
      let cols = Math.max(1, Math.round(Math.sqrt(dn * fw / fd))), rows = Math.ceil(dn / cols); cols = Math.ceil(dn / rows);
      const sx = Math.min(3, fw / cols), sz = Math.min(2.6, fd / rows), bx0 = F.x0 + (fw - sx * (cols - 1)) / 2, bz0 = F.z0 + (fd - sz * (rows - 1)) / 2;
      const depth = 6 + Math.min(1, Math.max(0, (sysClosed.depth - 200) / 600)) * 8.5, midY = -1.2 - depth / 2;
      const tm = new THREE.MeshStandardMaterial({ color: cClosed, emissive: cClosed, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.3 });
      const tubes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.2, depth, 10), tm, dn);
      const grout = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.62, 0.62, depth, 12), new THREE.MeshStandardMaterial({ color: 0xe8edf0, transparent: true, opacity: 0.16, depthWrite: false, roughness: 0.3 }), dn);
      const caps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.46, 0.46, 0.2, 14), new THREE.MeshStandardMaterial({ color: 0x2d3943, metalness: 0.6, roughness: 0.35 }), dn);
      const tos = new THREE.Object3D(), spots = [];
      for (let i = 0; i < dn; i++) { const c = i % cols, r = Math.floor(i / cols), x = bx0 + c * sx, z = bz0 + r * sz; tos.position.set(x, midY, z); tos.updateMatrix(); tubes.setMatrixAt(i, tos.matrix); grout.setMatrixAt(i, tos.matrix); tos.position.set(x, 0.14, z); tos.updateMatrix(); caps.setMatrixAt(i, tos.matrix); spots.push([x, z]); }
      grout.userData.noShadow = true; tubes.userData.noShadow = true; dynG.add(tubes, grout, caps);
      for (let r = 0; r < rows; r++) pipe(dynG, [V(bx0, -1.0, bz0 + r * sz), V(bx0 + (cols - 1) * sx, -1.0, bz0 + r * sz)], 0.14, cClosed);
      const manX = bx0 - 1.6;
      pipe(dynG, [V(manX, -1.0, bz0), V(manX, -1.0, bz0 + (rows - 1) * sz)], 0.28, cClosed);
      for (let r = 0; r < rows; r++) pipe(dynG, [V(manX, -1.0, bz0 + r * sz), V(bx0, -1.0, bz0 + r * sz)], 0.14, cClosed);
      const tz1 = A.plant.z + 1.5, tz2 = A.plant.z - 1.5;
      pipe(dynG, [V(A.plant.x - 1, 1.0, tz1), V(A.plant.x - 1, -1.0, tz1), V(manX, -1.0, tz1), V(manX, -1.0, bz0)], 0.32, cClosed);
      pipe(dynG, [V(A.plant.x + 1, 1.0, tz2), V(A.plant.x + 1, -1.8, tz2), V(manX - 0.7, -1.8, tz2), V(manX - 0.7, -1.8, bz0 + (rows - 1) * sz)], 0.32, cClosed);
      const gT = addGroup(320, 0.26), step = Math.max(1, Math.floor(dn / 24));
      for (let i = 0; i < dn; i += step) { const [x, z] = spots[i], d = [V(x - 0.3, -1.0, z), V(x - 0.3, -1.2 - depth, z), V(x + 0.3, -1.2 - depth, z), V(x + 0.3, -1.0, z)]; addParticles(gT, poly(d), 6, t => (t < 0.5 ? S.downColor : S.upColor), 0.7); }
      const hg = new THREE.Group(); hg.position.set((F.x0 + F.x1) / 2, -1 - (depth + 2.5) / 2 + 0.3, (F.z0 + F.z1) / 2);
      [[1, 0.07], [0.82, 0.07], [0.62, 0.08]].forEach(([s, o]) => { const m = new THREE.Mesh(new THREE.BoxGeometry((fw + 5) * s, (depth + 3.5) * s, (fd + 5) * s), glowMat(0xffffff, o)); hg.add(m); S.halo.push(m.material); }); dynG.add(hg);
      S.addLabel('field', V((F.x0 + F.x1) / 2, 3.6, F.z1 + 1), () => nfm(sysClosed.bores) + ' boreholes, ' + nfm(sysClosed.depth) + ' ft deep' + (dn < sysClosed.bores ? ' (' + dn + ' drawn)' : ''));
      S.addLabel('ground', V(F.x1 + 3, -6, (F.z0 + F.z1) / 2), c => 'Ground ' + Math.round(sysClosed.Tge) + '°F, loop ' + Math.round(c.loopF) + '°F');
    }
    dynG.traverse(o => { if (o.isMesh && !o.userData.noShadow && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
    S.sig = ctx.sig;
  }
  staticG.traverse(o => { if (o.isMesh && !o.userData.noShadow && !(o.material && o.material.transparent && !o.userData.keep)) { o.castShadow = o !== top; o.receiveShadow = true; } });
  const nfm = v => Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });

  const C = (h) => new THREE.Color(h);
  function update(ctx) {
    S.ctx = ctx;
    const sysOpen = kind === 'open' ? ctx.res.open.subs[0] : kind === 'hybrid' ? ctx.res.hybrid.subs[0] : null;
    const sysClosed = kind === 'closed' ? ctx.res.closed.subs[0] : kind === 'hybrid' ? ctx.res.hybrid.subs[1] : null;
    const sig = [kind, sysOpen && sysOpen.active ? Math.round(sysOpen.designFlow / 20) + ':' + sysOpen.wellCount : '-', sysClosed && sysClosed.active ? sysClosed.bores + ':' + sysClosed.depth : '-', ctx.p.hybrid.openShare, ctx.theme].join('|');
    ctx.sig = sig;
    if (sig !== S.sig) build(ctx);
    S.mode = ctx.snap.mode; S.T = ctx.T;
    const sn = ctx.snap[kind], load = Math.min(1, (ctx.snap.heat + ctx.snap.cool) / Math.max(1, ctx.res.loads[ctx.snap.mode === 'heating' ? 'heatPeak' : 'coolPeak']));
    S.load = S.mode === 'idle' ? 0 : load;
    const hot = C(cssv('--hot')), cold = C(cssv('--cold')), mild = C(0xcfe0ee), water = C(cssv('--open')).lerp(C(0xffffff), 0.35);
    S.modeColor = S.mode === 'heating' ? hot : S.mode === 'cooling' ? cold : mild;
    S.gwColor = water;
    S.retColor = S.mode === 'heating' ? cold : S.mode === 'cooling' ? hot : water;
    S.downColor = S.mode === 'heating' ? cold : S.mode === 'cooling' ? hot : mild;
    S.upColor = S.mode === 'heating' ? cold.clone().lerp(mild, 0.55) : S.mode === 'cooling' ? hot.clone().lerp(mild, 0.55) : mild;
    S.speed = S.mode === 'idle' ? 0.02 : 0.05 + 0.16 * Math.sqrt(S.load);
    const c = ctx; c.copNow = sn ? (S.mode === 'heating' ? sn.copH : S.mode === 'cooling' ? sn.copC : 0) : 0; c.copNow = c.copNow ? c.copNow.toFixed(1) : '';
    c.retF = S.mode === 'heating' ? ctx.p.gwTemp - ctx.p.open.dT : S.mode === 'cooling' ? ctx.p.gwTemp + ctx.p.open.dT : ctx.p.gwTemp;
    c.loopF = sn && sn.loopT != null ? sn.loopT : (sysClosed ? sysClosed.Tge : 0);
    S.halo.forEach((m, i) => { m.color.copy(S.mode === 'heating' ? cold : S.mode === 'cooling' ? hot : mild); m.opacity = (S.mode === 'idle' ? 0.025 : 0.05 + 0.16 * Math.sqrt(S.load)) * (1 + i * 0.35); });
    if (S.plumeG) { S.plume.forEach((m, i) => { m.color.copy(S.retColor); m.opacity = (S.mode === 'idle' ? 0.04 : 0.1 + 0.18 * Math.sqrt(S.load)) * (1 + i * 0.3); }); const sc = 2.6 + 3.2 * Math.sqrt(S.load); S.plumeG.scale.set(sc, sc * 0.6, sc); }
    S.glass.material.emissive.copy(S.mode === 'idle' ? C(0x000000) : S.modeColor); S.glass.material.emissiveIntensity = S.mode === 'idle' ? 0 : 0.12 + 0.3 * S.load;
    S.interior.emissive.copy(C(0xffd9a0)).lerp(S.mode === 'idle' ? C(0xffd9a0) : S.modeColor, S.mode === 'idle' ? 0 : 0.35 + 0.25 * S.load);
    if (S.beacon) S.beacon.material.color.set(S.mode === 'idle' ? 0x9fb3c0 : S.mode === 'heating' ? 0xff8a4d : 0x4dc8ff);
    // weather and light
    const snowy = S.T <= 34, sunny = S.T >= 62, hotDay = S.T >= 85;
    S.snow.visible = snowy;
    S.sun.visible = sunny; S.sun.material.opacity = Math.min(1, (S.T - 60) / 30 + 0.4); S.sun.scale.setScalar(70 + Math.max(0, S.T - 60) * 1.2);
    S.clouds.forEach(sp => { sp.material.opacity = snowy ? 0.95 : sunny ? 0.55 : 0.8; sp.material.color.set(snowy ? 0xc7d0d9 : 0xffffff); });
    skyMat.uniforms.top.value.set(snowy ? 0x7e93a8 : hotDay ? 0x2f7fd6 : sunny ? 0x3f8fe0 : 0x5b9bd5); skyMat.uniforms.bot.value.set(snowy ? 0xdbe3ea : hotDay ? 0xf4e2bd : sunny ? 0xcfe6f5 : 0xd6e8f4);
    scene.fog.color.copy(skyMat.uniforms.bot.value);
    sunL.color.set(snowy ? 0xdce8f5 : hotDay ? 0xffeccc : 0xffffff); sunL.intensity = snowy ? 1.4 : hotDay ? 2.6 : 2.2; hemi.intensity = snowy ? 0.8 : 0.55;
    S.topMat.color.set(snowy ? 0xf2f6fa : hotDay ? 0xd9c58a : 0xffffff);
    S.roofMat.color.set(snowy ? 0xffffff : 0xe9eef2); S.trees.color.set(snowy ? 0xdfe9e4 : 0xffffff);
    container.dataset.season = ctx.season; container.dataset.weather = snowy ? 'snow' : sunny ? 'sun' : 'mild';
    setXray(S.xray);
    const status = hud.querySelector('.s3d-status');
    status.innerHTML = '<b>' + (S.mode === 'heating' ? 'Heating' : S.mode === 'cooling' ? 'Cooling' : 'Idle') + '</b> ' + Math.round(S.T) + '°F outdoors' + (S.mode === 'idle' ? '' : ', ' + (S.mode === 'heating' ? (ctx.snap.heat / 3412.14 / 1000).toFixed(2) : (ctx.snap.cool / 3412.14 / 1000).toFixed(2)) + ' MW');
    status.dataset.mode = S.mode;
    S.labelEls.forEach(l => { l.el.textContent = l.fn(c); l.el.hidden = !S.labels; });
  }

  function setXray(on) {
    S.xray = on;
    S.layerMats.forEach(({ mats, L }) => mats.forEach(m => { const base = m.userData.base || L.o; m.opacity = on ? base : Math.min(0.98, base + 0.45); }));
    S.topMat.opacity = on ? 0.42 : 0.98; S.apron.material.opacity = on ? 0.55 : 0.97;
  }

  const dummy = new THREE.Object3D(), col = new THREE.Color();
  function frame(dt) {
    S.time += dt;
    if (introOn) { introT = Math.min(1, introT + dt / 2.2); const e = 1 - Math.pow(1 - introT, 3); camera.position.lerpVectors(introFrom, home, e); if (introT >= 1) introOn = false; }
    controls.update();
    S.parts.forEach(g => {
      g.items.forEach((it, i) => {
        const t = it.ph + S.time * S.speed * it.speedMul, p = it.path.at(t);
        dummy.position.copy(p); dummy.scale.setScalar(S.mode === 'idle' && it.speedMul > 1 ? 0.0001 : 1); dummy.updateMatrix(); g.mesh.setMatrixAt(i, dummy.matrix);
        col.copy(it.colorFn(((t % 1) + 1) % 1)).multiplyScalar(1.7); g.mesh.setColorAt(i, col);
      });
      for (let i = g.items.length; i < g.count; i++) { dummy.position.set(0, -999, 0); dummy.updateMatrix(); g.mesh.setMatrixAt(i, dummy.matrix); }
      g.mesh.count = g.count; g.mesh.instanceMatrix.needsUpdate = true; if (g.mesh.instanceColor) g.mesh.instanceColor.needsUpdate = true;
    });
    S.fans.forEach(f => { f.rotation.y += dt * (S.mode === 'idle' ? 0.4 : 3 + 9 * S.load); });
    if (S.aqTex) S.aqTex.offset.x += dt * 0.015;
    S.clouds.forEach(sp => { sp.position.x += dt * sp.userData.dx; if (sp.position.x > 150) sp.position.x = -150; });
    if (S.tug) { const a = S.time * 0.16; S.tug.position.x = Math.sin(a) * 30; S.tug.rotation.y = Math.cos(a) > 0 ? Math.PI : 0; }
    if (S.tower) S.tower.userData.beacon.material.color.setScalar(0.5 + 0.5 * (Math.sin(S.time * 3) > 0 ? 1 : 0)).multiply(C(0xff3a3a)).multiplyScalar(2);
    if (S.snow.visible) { const a = S.snow.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) - dt * (2 + (i % 5) * 0.5); if (y < 0) y = 28; a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(S.time + i) * dt * 0.4); } a.needsUpdate = true; }
    if (S.labels) {
      const r = container.getBoundingClientRect(), w = r.width, h = r.height;
      S.labelEls.forEach(l => { const v = l.anchor.clone().project(camera); const vis = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05; l.el.style.opacity = vis ? 1 : 0; l.el.style.transform = 'translate(' + ((v.x * 0.5 + 0.5) * w).toFixed(1) + 'px,' + ((-v.y * 0.5 + 0.5) * h).toFixed(1) + 'px) translate(-50%,-100%)'; });
    }
    if (composer) composer.render(dt); else renderer.render(scene, camera);
  }
  function resize() {
    const w = container.clientWidth, h = container.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    if (composer) { composer.setSize(w, h); bloom.setSize(w, h); }
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const k = Math.min(1.6, Math.max(1, 1.42 / (w / h))); home.copy(homeT).addScaledVector(homeBase.clone().sub(homeT), k); if (!introOn && !userMoved) camera.position.copy(home);
  }
  new ResizeObserver(resize).observe(container); resize();
  hud.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const a = b.dataset.a;
    if (a === 'reset') { stopIntro(); camera.position.copy(home); controls.target.copy(homeT); controls.autoRotate = false; hud.querySelector('[data-a=rotate]').setAttribute('aria-pressed', 'false'); }
    if (a === 'rotate') { stopIntro(); controls.autoRotate = !controls.autoRotate; b.setAttribute('aria-pressed', controls.autoRotate); }
    if (a === 'labels') { S.labels = !S.labels; b.setAttribute('aria-pressed', S.labels); S.labelEls.forEach(l => { l.el.hidden = !S.labels; }); }
    if (a === 'xray') { setXray(!S.xray); b.setAttribute('aria-pressed', S.xray); }
  });
  const api = { update, frame, resize, container, kind, isVisible: () => container.offsetParent !== null && container.clientWidth > 0, snapshot: () => renderer.domElement.toDataURL('image/png'), controls, camera, skipIntro: () => { introOn = false; camera.position.copy(home); } };
  loaded.push(api);
  if (!loopStarted) { loopStarted = true; const tick = () => { const dt = Math.min(0.05, clock.getDelta()); loaded.forEach(s => { if (s.isVisible()) s.frame(dt); }); requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
  return api;
}

window.Scene3D = { create: makeScene, THREE };
