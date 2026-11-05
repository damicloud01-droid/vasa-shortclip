// The Vasa (our cartoon of her): a lofted hull with the famous narrow top (tumblehome), two rows of gun ports with
// hinged lids and bronze cannons, a tall carved stern castle in blue / red / gold, three masts with yards and sails
// that fill on the gust, a handful of shrouds and stays, Swedish flags and the golden lion figurehead.
// Ship space: x along the keel (stern -22 .. bow +23.5, bowsprit to +36), y up from the waterline, z across.
// update(pose, t) moves / heels her; the hull is one smooth mesh so the world ink draws a clean silhouette.
import * as THREE from "three";
import { lam, V } from "./build";
import { ctex, planksHD, rep } from "./paint";
import { twoTone } from "./shade";
import { Pen, INK } from "./toon";
import { NOINK } from "./ink";
import { ShipPose, DECK_Y, smooth, clamp01 } from "./story";

export const XS = -22, XB = 23.5, BEAM = 5.85;
export const PORTS_X = Array.from({ length: 12 }, (_, i) => -12.4 + i * 2.38);
export const PORT_Y = [1.75, 3.95];
const PORT = 0.86;

/** bulwark top along the length */
export const topY = (x: number) => {
  if (x < -10) return 8.9 + 6.1 * smooth((-10 - x) / 11.5);
  if (x > 16) return 7.5 + 0.9 * smooth((x - 16) / 7.5);
  return 6.3 + 1.2 * smooth((x - 13.5) / 2.5) + 2.6 * smooth((-8 - x) / 2.0);
};
/** keel line (rises at the stem) */
const botY = (x: number) => (x > 17 ? -4.6 + 5.2 * ((x - 17) / 6.5) ** 2 : -4.6);
/** half beam at (x, y): pointed bow, broad stern, round bilge, tumblehome above the waterline */
export const halfBeam = (x: number, y: number) => {
  const u = (x - XS) / (XB - XS);
  const fl = u < 0.06 ? 0.74 + 0.26 * smooth(u / 0.06) : u > 0.58 ? Math.sqrt(Math.max(0, 1 - ((u - 0.58) / 0.42) ** 2)) : 1;
  const b = botY(x), t = topY(x);
  let fy: number;
  if (y < 0.4) { const s = clamp01((y - b) / (0.4 - b)); fy = 0.12 + 0.88 * Math.sin((s * Math.PI) / 2) ** 0.55; }
  else fy = 1 - 0.2 * ((y - 0.4) / (t - 0.4)) ** 1.4;
  return BEAM * fl * fy;
};

// ---------------- paint ----------------
const WOOD = "#8a5a33", WOOD_D = "#5b3920", RED = "#a8372c", BLUE = "#2c4a8a", GOLD = "#e8b84a", GOLD_D = "#a7782a";
const V0 = -5, V1 = 16; // texture vertical range (m)
const yv = (y: number, H: number) => H * (1 - (y - V0) / (V1 - V0));
/** hull sides: tarred bottom, oak planks with dark wales, two rows of gun ports, red-and-gold upper works */
const hullTex = () => ctex("vasaHull", 2048, 1024, (g, r) => {
  const W = 2048, H = 1024, xpx = (x: number) => ((x - XS) / (XB - XS)) * W;
  g.fillStyle = WOOD; g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 9) { // planks
    g.fillStyle = `rgba(${60 + r() * 30},${35 + r() * 15},${15},${0.08 + r() * 0.08})`; g.fillRect(0, y, W, 9);
    g.fillStyle = "rgba(40,22,10,.35)"; g.fillRect(0, y + 8, W, 1);
    for (let x = r() * 160; x < W; x += 120 + r() * 140) g.fillRect(x, y, 1.5, 9);
  }
  g.fillStyle = "#3d2a1e"; g.fillRect(0, yv(-0.05, H), W, H); // below the waterline: tarred
  g.fillStyle = "rgba(255,255,255,.05)"; g.fillRect(0, yv(-0.05, H), W, 4);
  // red upper works with gold carving (above the upper ports)
  const ry = yv(5.2, H);
  g.fillStyle = RED; g.fillRect(0, 0, W, ry);
  for (let i = 0; i < 70; i++) { // gold scroll work
    const x = r() * W, y = r() * ry;
    g.strokeStyle = GOLD; g.lineWidth = 3 + r() * 2;
    g.beginPath(); g.arc(x, y, 6 + r() * 10, r() * 6, r() * 6 + 3.5); g.stroke();
  }
  // wales (thick dark bands) and gold rails
  for (const y of [0.6, 2.95, 5.15]) { g.fillStyle = WOOD_D; g.fillRect(0, yv(y + 0.18, H), W, (0.36 / (V1 - V0)) * H); }
  for (const y of [5.3, 8.6, 11.6]) { g.fillStyle = GOLD; g.fillRect(0, yv(y + 0.06, H), W, 5); g.fillStyle = GOLD_D; g.fillRect(0, yv(y + 0.06, H) + 5, W, 2); }
  // gun ports: dark openings with a gold frame (lids are 3D)
  const ph = (PORT / (V1 - V0)) * H, pw = (PORT / (XB - XS)) * W;
  for (const py of PORT_Y) for (const px of PORTS_X) {
    const cx = xpx(px), cy = yv(py, H);
    g.fillStyle = GOLD_D; g.fillRect(cx - pw / 2 - 4, cy - ph / 2 - 4, pw + 8, ph + 8);
    g.fillStyle = "#1a1210"; g.fillRect(cx - pw / 2, cy - ph / 2, pw, ph);
  }
  // little carved figures along the upper works
  for (let x = 40; x < W - 300; x += 64) {
    const y = yv(7.2 + (x % 128 ? 0 : 1.5), H);
    if (y < 4) continue;
    g.fillStyle = GOLD; g.beginPath(); g.ellipse(x, y, 9, 15, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x, y - 22, 8, 0, Math.PI * 2); g.fill();
    g.strokeStyle = GOLD_D; g.lineWidth = 2; g.stroke();
  }
});
/** stern: blue field, tiers of gold statues, two rows of windows, the Vasa sheaf in a crowned shield */
const sternTex = () => ctex("vasaStern", 1024, 1024, (g, r) => {
  const W = 1024, H = 1024;
  g.fillStyle = BLUE; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? GOLD : GOLD_D; g.fillRect(0, 120 + i * 150, W, 10); }
  // windows
  for (const [y, n] of [[560, 5], [700, 4]] as const) for (let i = 0; i < n; i++) {
    const x = W / 2 + (i - (n - 1) / 2) * 150;
    g.fillStyle = GOLD; g.fillRect(x - 46, y - 52, 92, 104);
    g.fillStyle = "#1c2440"; g.fillRect(x - 34, y - 40, 68, 80);
    g.fillStyle = "#e8d48a"; g.fillRect(x - 2, y - 40, 4, 80); g.fillRect(x - 34, y - 2, 68, 4);
  }
  // gold statues (stylised: head + robe + arms), tiers
  for (const [y, n, s] of [[860, 9, 1], [430, 7, 1.1], [250, 5, 1.2]] as const) for (let i = 0; i < n; i++) {
    const x = W / 2 + (i - (n - 1) / 2) * (W / (n + 0.5));
    if (y === 430 && Math.abs(x - W / 2) < 150) continue;
    g.fillStyle = GOLD; g.strokeStyle = "#7a5418"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x - 22 * s, y + 55 * s); g.lineTo(x - 14 * s, y - 10 * s); g.lineTo(x + 14 * s, y - 10 * s); g.lineTo(x + 22 * s, y + 55 * s); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.arc(x, y - 26 * s, 15 * s, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(x - 14 * s, y); g.lineTo(x - 30 * s, y - 30 * s + r() * 20); g.moveTo(x + 14 * s, y); g.lineTo(x + 30 * s, y - 30 * s + r() * 20); g.stroke();
  }
  // crowned shield with the wheat sheaf (vasa)
  const cx = W / 2, cy = 400;
  g.fillStyle = GOLD; g.strokeStyle = "#7a5418"; g.lineWidth = 6;
  g.beginPath(); g.moveTo(cx - 110, cy - 90); g.lineTo(cx + 110, cy - 90); g.lineTo(cx + 110, cy + 30); g.quadraticCurveTo(cx, cy + 150, cx - 110, cy + 30); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = BLUE; g.beginPath(); g.moveTo(cx - 85, cy - 68); g.lineTo(cx + 85, cy - 68); g.lineTo(cx + 85, cy + 22); g.quadraticCurveTo(cx, cy + 118, cx - 85, cy + 22); g.closePath(); g.fill();
  g.strokeStyle = GOLD; g.lineWidth = 7;
  for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(cx, cy + 60); g.lineTo(cx + i * 16, cy - 50); g.stroke(); g.beginPath(); g.ellipse(cx + i * 16, cy - 50, 7, 14, i * 0.15, 0, Math.PI * 2); g.fillStyle = GOLD; g.fill(); }
  g.fillStyle = GOLD; g.fillRect(cx - 40, cy + 8, 80, 14);
  g.beginPath(); g.moveTo(cx - 80, cy - 100); g.lineTo(cx - 80, cy - 150); g.lineTo(cx - 40, cy - 120); g.lineTo(cx, cy - 165); g.lineTo(cx + 40, cy - 120); g.lineTo(cx + 80, cy - 150); g.lineTo(cx + 80, cy - 100); g.closePath();
  g.fill(); g.strokeStyle = "#7a5418"; g.lineWidth = 5; g.stroke();
});
const sailTex = () => ctex("vasaSail", 512, 512, (g, r) => {
  g.fillStyle = "#efe4c8"; g.fillRect(0, 0, 512, 512);
  for (let x = 0; x < 512; x += 64) { g.fillStyle = `rgba(150,120,80,${0.12 + r() * 0.08})`; g.fillRect(x, 0, 3, 512); }
  g.fillStyle = "rgba(150,120,80,.25)"; g.fillRect(0, 0, 512, 10); g.fillRect(0, 502, 512, 10);
});
/** Swedish flag: blue with a yellow Nordic cross, swallow-tailed (the transparent notch is cut by alphaTest) */
export const flagSE = (tail = true) => ctex("flagSE" + tail, 512, 320, (g) => {
  g.fillStyle = "#1f5aa6"; g.fillRect(0, 0, 512, 320);
  g.fillStyle = "#f4c430"; g.fillRect(150, 0, 56, 320); g.fillRect(0, 132, 512, 56);
  if (tail) { g.globalCompositeOperation = "destination-out"; g.beginPath(); g.moveTo(512, 40); g.lineTo(380, 160); g.lineTo(512, 280); g.closePath(); g.fill(); g.globalCompositeOperation = "source-over"; }
});
/** the leaping golden lion figurehead (side view facing +x = canvas right), 1000 x 640 */
export const lionDraw = (p: Pen) => {
  const G = "#f0bf4c", GD = "#c58f2a", M = "#d9962e";
  p.ol = 10;
  p.poly([[180, 330], [120, 300], [60, 250], [40, 180], [80, 200], [110, 250], [190, 280]], G); // tail
  p.poly([[220, 260], [520, 230], [640, 260], [650, 380], [520, 420], [250, 400], [200, 330]], G); // body
  for (const [x, y, dx] of [[250, 390, -60], [330, 400, -30]] as const) p.poly([[x, y], [x + dx, y + 150], [x + dx + 50, y + 160], [x + 40, y + 10]], GD); // hind legs
  for (const [x, y, k] of [[600, 330, 0], [560, 360, 1]] as const) p.poly([[x, y], [x + 180 - 30 * k, y + 70 + 40 * k], [x + 200 - 30 * k, y + 110 + 40 * k], [x + 150 - 30 * k, y + 120 + 40 * k], [x - 20, y + 60]], k ? GD : G); // fore legs, reaching
  const mane: [number, number][] = [];
  for (let i = 0; i < 22; i++) { const a = (i / 22) * Math.PI * 2, rr = i % 2 ? 150 : 185; mane.push([700 + rr * Math.cos(a), 220 + rr * 0.95 * Math.sin(a)]); }
  p.poly(mane, M);
  p.ell(735, 225, 112, 105, G); // face
  p.ell(805, 260, 52, 40, "#f6d27a"); // muzzle
  p.dot(842, 238, 16, INK); // nose
  p.poly([[790, 300], [860, 290], [830, 330]], "#8c2a24", 8); // open mouth
  p.ell(750, 185, 18, 22, "#ffffff", 7); p.dot(758, 188, 9, INK); // eye
  p.stroke([[720, 158], [775, 165]], 9); // brow
  p.ell(640, 140, 30, 30, G); // ear
  p.ol = 12;
};

// ---------------- geometry ----------------
const NU = 64, NV = 26;
const xAt = (i: number) => XS + ((XB - XS) * i) / (NU - 1);
/** one side of the hull (s = +1 port toward +z, -1 starboard), smooth normals, uv = (length, height) for hullTex */
const hullSide = (s: number) => {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i < NU; i++) {
    const x = xAt(i), b = botY(x), t = topY(x);
    for (let j = 0; j < NV; j++) {
      const y = b + ((t - b) * j) / (NV - 1);
      pos.push(x, y, s * halfBeam(x, y));
      uv.push((x - XS) / (XB - XS), (y - V0) / (V1 - V0));
    }
  }
  for (let i = 0; i < NU - 1; i++) for (let j = 0; j < NV - 1; j++) {
    const a = i * NV + j, b = (i + 1) * NV + j, c = b + 1, d = a + 1;
    if (s > 0) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
};
/** flat deck between the hull sides at height y over x0..x1 */
const deckGeo = (x0: number, x1: number, y: number) => {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [], n = 24;
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n, w = Math.max(0.05, halfBeam(x, y) - 0.12);
    pos.push(x, y, -w, x, y, w); uv.push(x / 4, -w / 4, x / 4, w / 4);
  }
  for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(Array((n + 1) * 2).fill([0, 1, 0]).flat(), 3));
  g.setIndex(idx);
  return g;
};
/** vertical cross wall at x between y0 and y1 (fills the hull section), facing +x (dir 1) or -x */
const bulkhead = (x: number, y0: number, y1: number, dir: number) => {
  const pts: THREE.Vector2[] = [], n = 10;
  for (let j = 0; j <= n; j++) { const y = y0 + ((y1 - y0) * j) / n; pts.push(new THREE.Vector2(-halfBeam(x, y), y)); }
  for (let j = n; j >= 0; j--) { const y = y0 + ((y1 - y0) * j) / n; pts.push(new THREE.Vector2(halfBeam(x, y), y)); }
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts));
  // shape is in the xy plane facing +z: map (sx, sy) -> (x, sy, -sx * dir) so it faces dir along x
  const p = g.attributes.position as THREE.BufferAttribute, uvA = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const sx = p.getX(i), sy = p.getY(i);
    p.setXYZ(i, x, sy, -sx * dir);
    uvA.setXY(i, 0.5 + sx / (2 * BEAM * 1.02), (sy - y0) / (y1 - y0));
  }
  g.computeVertexNormals();
  return g;
};
const rod = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1 = r0, seg = 8) => {
  const d = new THREE.Vector3().subVectors(b, a), g = new THREE.CylinderGeometry(r1, r0, d.length(), seg, 1);
  g.translate(0, d.length() / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
};

type MastDef = { x: number; top: number; yards: [number, number][] };
// yards: [height above the waterline, half length]
export const MASTS: MastDef[] = [
  { x: 15.5, top: 41, yards: [[18.5, 9.5], [31, 6.2]] },
  { x: 1.5, top: 50, yards: [[21.5, 11.5], [36.5, 7.6]] },
  { x: -14.5, top: 33, yards: [[17.5, 6.5], [26.5, 4.4]] },
];
type Sail = { mesh: THREE.Mesh; base: Float32Array; furl: THREE.Mesh };

export class Ship {
  root = new THREE.Group();
  body = new THREE.Group(); // heel / pitch pivot at the waterline amidships
  private rig = new THREE.Group();
  private stumps = new THREE.Group();
  private lids: THREE.InstancedMesh; private guns: THREE.InstancedMesh;
  private sails: Sail[] = [];
  private flags: { m: THREE.Mesh; len: number }[] = [];
  private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler();

  constructor() {
    const B = this.body;
    this.root.add(B);
    B.add(this.rig, this.stumps);
    const hullM = twoTone(new THREE.MeshLambertMaterial({ map: hullTex(), side: THREE.DoubleSide }));
    for (const s of [1, -1]) { const m = new THREE.Mesh(hullSide(s), hullM); m.castShadow = true; m.receiveShadow = true; B.add(m); }
    // decks
    const deckM = lam("planksHD", () => ({ map: planksHD() }));
    const wallM = lam("vasaWall", () => ({ color: "#9a6a3e" }));
    const decks: [number, number, number][] = [[-10, 16, DECK_Y], [XS + 0.2, -10, DECK_Y + 2.6], [16, 22.6, DECK_Y + 1.6]];
    for (const [x0, x1, y] of decks) { const m = new THREE.Mesh(deckGeo(x0, x1, y), deckM); m.receiveShadow = true; m.castShadow = true; B.add(m); }
    for (const [x, y0, y1, d] of [[-10, DECK_Y, DECK_Y + 2.6, 1], [16, DECK_Y, DECK_Y + 1.6, -1]] as const) {
      const m = new THREE.Mesh(bulkhead(x, y0, y1, d), wallM); m.castShadow = true; m.receiveShadow = true; B.add(m);
    }
    // a dark hatch and the capstan on the main deck
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.3, 2.4), lam("vasaHatch", () => ({ color: "#4a3020" }))); hatch.position.set(7, DECK_Y + 0.15, 0); B.add(hatch);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 1.1, 14), wallM); cap.position.set(-5.5, DECK_Y + 0.55, 0); cap.castShadow = true; B.add(cap);
    // stern: transom with the carved stern texture, crowned top, quarter galleries
    const sternM = twoTone(new THREE.MeshLambertMaterial({ map: sternTex() }));
    const tr = bulkhead(XS + 0.02, 3.6, topY(XS) - 0.02, -1); tr.translate(0, 0, 0);
    { const uvA = tr.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uvA.count; i++) uvA.setX(i, 1 - uvA.getX(i)); }
    const trm = new THREE.Mesh(tr, sternM); trm.castShadow = true; B.add(trm);
    const goldM = twoTone(new THREE.MeshPhongMaterial({ color: GOLD, specular: "#ffe6a0", shininess: 40 }), 0.4);
    for (const s of [1, -1]) {
      const gal = new THREE.Mesh(new THREE.BoxGeometry(3.6, 4.6, 1.0), sternM);
      gal.position.set(-19.4, 10.6, s * (halfBeam(-19.4, 10.6) + 0.35)); gal.castShadow = true; B.add(gal);
      const dome = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.6, 8), goldM); dome.position.set(-19.4, 13.7, gal.position.z); B.add(dome);
    }
    for (const z of [-3.2, 0, 3.2]) { const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.2, 1.1, 8), goldM); lan.position.set(-21.6, topY(XS) + 0.9, z); B.add(lan); }
    // rails along the bulwark top (gold)
    for (const s of [1, -1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < NU; i += 2) { const x = xAt(i), y = topY(x); pts.push(V(x, y + 0.05, s * halfBeam(x, y))); }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.11, 6), goldM); B.add(tube);
    }
    // gun-port lids (outer face oak with a gold lion mask dot, inner face red) and the bronze cannons
    const lidG = new THREE.BoxGeometry(PORT + 0.12, PORT + 0.12, 0.09); lidG.translate(0, -(PORT + 0.12) / 2, 0);
    const lidOut = lam("lidOut", () => ({ map: ctex("lidOut", 64, 64, (g) => { g.fillStyle = WOOD; g.fillRect(0, 0, 64, 64); g.fillStyle = GOLD; g.beginPath(); g.arc(32, 32, 14, 0, 7); g.fill(); g.fillStyle = "#7a5418"; g.fillRect(26, 28, 3, 3); g.fillRect(35, 28, 3, 3); }) }));
    const lidIn = lam("lidIn", () => ({ color: RED }));
    const n = PORTS_X.length * PORT_Y.length * 2;
    this.lids = new THREE.InstancedMesh(lidG, [wallM, wallM, wallM, wallM, lidOut, lidIn], n);
    this.lids.castShadow = true; this.lids.frustumCulled = false; B.add(this.lids);
    const gunG = new THREE.CylinderGeometry(0.15, 0.2, 2.6, 10); gunG.rotateX(Math.PI / 2);
    const bronze = twoTone(new THREE.MeshPhongMaterial({ color: "#9c7038", specular: "#e0c080", shininess: 50 }), 0.3);
    this.guns = new THREE.InstancedMesh(gunG, bronze, n); this.guns.frustumCulled = false; B.add(this.guns);
    // figurehead + bowsprit + beak
    const lion = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 3.6), new THREE.MeshLambertMaterial({ map: ctex("lion", 1000, 640, (g) => lionDraw(new Pen(g))), alphaTest: 0.5, side: THREE.DoubleSide, emissive: new THREE.Color("#3a2a08") }));
    lion.position.set(26.4, 7.0, 0); lion.rotation.z = 0.22; lion.castShadow = true; lion.layers.set(NOINK); B.add(lion);
    const woodM = lam("vasaSpar", () => ({ color: "#7a5230" }));
    const beak = new THREE.Mesh(rod(V(21.5, 4.2, 0), V(25.6, 5.6, 0), 0.5, 0.3), wallM); beak.castShadow = true; B.add(beak);
    const sprit = new THREE.Mesh(rod(V(20, 7.6, 0), V(36, 13.5, 0), 0.42, 0.18), woodM); sprit.castShadow = true; this.rig.add(sprit);
    // masts, tops, yards, sails, furled sails, shrouds and stays
    const ropeM = lam("rope", () => ({ color: "#3a2a1c" }));
    const sailM = twoTone(new THREE.MeshLambertMaterial({ map: sailTex(), side: THREE.DoubleSide }));
    const furlM = lam("furl", () => ({ color: "#e6d8b6" }));
    for (const m of MASTS) {
      const base = V(m.x, DECK_Y - 1, 0);
      this.rig.add(Object.assign(new THREE.Mesh(rod(base, V(m.x, m.top, 0), 0.55, 0.16, 12), woodM), { castShadow: true }));
      const topH = m.yards[0][0] + 3.4;
      const plat = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.2, 1.0, 14), wallM); plat.position.set(m.x, topH, 0); plat.castShadow = true; this.rig.add(plat);
      const stump = new THREE.Mesh(rod(base, V(m.x, DECK_Y + 4.5 - (m.x < 0 ? 1.5 : 0), 0), 0.55, 0.5, 12), woodM); stump.castShadow = true; this.stumps.add(stump);
      m.yards.forEach(([y, hl], k) => {
        const yard = new THREE.Mesh(rod(V(m.x + 0.6, y, -hl), V(m.x + 0.6, y, hl), 0.2, 0.2, 8), woodM); yard.castShadow = true; this.rig.add(yard);
        // sail hangs from this yard down to the next yard / the deck
        const bottom = k === 0 ? Math.max(DECK_Y + 3.2, topY(m.x) + 2) : m.yards[0][0] + 0.6, top = y - 0.2;
        const lowHl = k === 0 ? hl * 0.98 : m.yards[0][1] * 0.95;
        const sg = new THREE.PlaneGeometry(1, 1, 8, 8);
        const p = sg.attributes.position as THREE.BufferAttribute, base0 = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) {
          const u = p.getX(i) + 0.5, v = p.getY(i) + 0.5, hw = lowHl + (hl * 0.96 - lowHl) * v;
          base0.set([m.x + 0.75, bottom + (top - bottom) * v, (u * 2 - 1) * hw], i * 3);
        }
        p.array.set(base0); p.needsUpdate = true;
        const sm = new THREE.Mesh(sg, sailM); sm.castShadow = true; sm.receiveShadow = true; sm.frustumCulled = false; this.rig.add(sm);
        const furl = new THREE.Mesh(rod(V(m.x + 0.75, y - 0.45, -hl * 0.92), V(m.x + 0.75, y - 0.45, hl * 0.92), 0.38, 0.38, 10), furlM); furl.castShadow = true; this.rig.add(furl);
        this.sails.push({ mesh: sm, base: base0, furl });
      });
      // shrouds: from the bulwark either side up to the top
      for (const s of [1, -1]) for (let i = 0; i < 4; i++) {
        const x = m.x - 2.2 + i * 1.1, y = topY(x);
        this.rig.add(new THREE.Mesh(rod(V(x, y, s * halfBeam(x, y)), V(m.x, topH - 0.3, s * 1.2), 0.05, 0.05, 4), ropeM));
      }
      // flag at the masthead
      this.flag(V(m.x, m.top, 0), m.x > 0 && m.x < 5 ? 7 : 4.5, 0.9);
    }
    // stays (fore and aft)
    for (const [a, b] of [[V(15.5, 41, 0), V(35, 13, 0)], [V(1.5, 50, 0), V(15.5, 22, 0)], [V(-14.5, 33, 0), V(1.5, 20, 0)], [V(15.5, 30, 0), V(30, 11, 0)]] as const)
      this.rig.add(new THREE.Mesh(rod(a, b, 0.06, 0.06, 4), ropeM));
    // the big ensign at the stern
    const staff = new THREE.Mesh(rod(V(-22.2, topY(XS), 0), V(-24, topY(XS) + 6.5, 0), 0.12, 0.08), woodM); this.rig.add(staff);
    this.flag(V(-24, topY(XS) + 6.4, 0), 4.2, 2.6, true);
    B.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh && !mm.receiveShadow) mm.receiveShadow = true; });
  }

  private flag(at: THREE.Vector3, len: number, h: number, ensign = false) {
    const g = new THREE.PlaneGeometry(len, h, 14, 1); g.translate(-len / 2, -h / 2, 0);
    const m = new THREE.Mesh(g, lam("flagSE" + ensign, () => ({ map: flagSE(true), side: THREE.DoubleSide, alphaTest: 0.5 })));
    m.position.copy(at); m.castShadow = true; m.frustumCulled = false;
    (ensign ? this.body : this.rig).add(m);
    this.flags.push({ m, len });
  }

  update(p: ShipPose, t: number) {
    this.root.position.set(...p.pos);
    this.root.rotation.set(0, p.yaw, 0);
    this.body.rotation.set(p.heel, 0, p.pitch, "XYZ");
    this.rig.visible = p.masts; this.stumps.visible = !p.masts;
    // gun ports: lids swing up and out, cannons run out
    const open = clamp01(p.ports), ang = open * 1.25;
    let k = 0;
    for (const py of PORT_Y) for (const px of PORTS_X) for (const s of [1, -1]) {
      const hb = halfBeam(px, py + PORT / 2);
      this.e.set(-ang, s > 0 ? 0 : Math.PI, 0, "YXZ");
      this.m4.compose(V(px, py + (PORT + 0.12) / 2, s * (hb + 0.05)), this.q.setFromEuler(this.e), V(1, 1, 1));
      this.lids.setMatrixAt(k, this.m4);
      const out = s * (halfBeam(px, py) - 1.0 + 1.1 * smooth((open - 0.3) / 0.7));
      this.m4.compose(V(px, py - 0.05, out), this.q.identity(), V(1, 1, 1));
      this.guns.setMatrixAt(k, this.m4);
      k++;
    }
    this.lids.instanceMatrix.needsUpdate = true; this.guns.instanceMatrix.needsUpdate = true;
    // sails: set or furled; billow pushes the middle forward (+x) with a slow breathing
    for (const sl of this.sails) {
      sl.mesh.visible = p.sails > 0.5; sl.furl.visible = p.sails <= 0.5;
      if (!sl.mesh.visible) continue;
      const pa = sl.mesh.geometry.attributes.position as THREE.BufferAttribute, arr = pa.array as Float32Array;
      const depth = (0.8 + 2.6 * p.billow) * (1 + 0.04 * Math.sin(t * 1.7));
      for (let i = 0; i < pa.count; i++) {
        const u = (i % 9) / 8, v = Math.floor(i / 9) / 8;
        arr[i * 3] = sl.base[i * 3] + depth * Math.sin(Math.PI * u) * (0.35 + 0.65 * Math.sin(Math.PI * (0.15 + 0.85 * (1 - v))));
        arr[i * 3 + 1] = sl.base[i * 3 + 1]; arr[i * 3 + 2] = sl.base[i * 3 + 2];
      }
      pa.needsUpdate = true; sl.mesh.geometry.computeVertexNormals();
    }
    // flags stream aft (-x), rippling
    for (const f of this.flags) {
      const pa = f.m.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pa.count; i++) {
        const u = (i % 15) / 14, x = -u * f.len;
        pa.setX(i, x); pa.setZ(i, 0.18 * f.len * u * Math.sin(t * 6 - u * 6 + f.len));
      }
      pa.needsUpdate = true;
    }
    this.root.updateMatrixWorld(true);
  }

  /** ship-space point -> world (after update) */
  toWorld(p: [number, number, number], out = new THREE.Vector3()) { return out.set(...p).applyMatrix4(this.body.matrixWorld); }
}
export { rep };
