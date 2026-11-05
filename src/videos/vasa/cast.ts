// The Vasa cast as lit flat cards in the 3D world (same machinery as the bridge short: one canvas per distinct
// drawing, yaw-only billboards shaded by cardShade(), soft contact blobs, unlit effect cards on the NOINK layer).
// Everything here is a pure function of (shot, time, camera): stage() says who stands where, in which pose.
import * as THREE from "three";
import {
  Pen, bodyFront, bodySide, townsfolk, fxBlob, fxShadow, fxContact, fxSplash, fxRing, fxPuff,
  Outfit, Expr, FrontOpts, SideOpts, sailor, ADMIRAL, KING, JUDGE, TOURIST, CANOE_KID, KID,
  fxGust, fxPortrait, fxFlame, fxToyShip, fxGush, fxSmoke,
} from "./toon";
import {
  FPS, D0, SHOTS, V3, smooth, clamp01, W, WE, runZ, STOP, RUNS, DECK_Y, KING as KING_AT, INQUIRY, LAKE, MUSEUM, SALVAGE_T,
} from "./story";
import { LIGHTS } from "./lights";
import { NOINK } from "./ink";
import { cardShade, blobMaterial, CARD_K } from "./cardshade";
import { PORTS_X, PORT_Y, halfBeam } from "./ship";

// ---------------- canvas pool ----------------
type Entry = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; w: number; h: number };
export type Req = { key: string; w: number; h: number; k: number; draw: (p: Pen) => void; tex?: THREE.CanvasTexture };
const makeEntry = (w: number, h: number): Entry => {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { cv, tex, w, h };
};
export class Pool {
  private live = new Map<string, Entry>();
  private free: Entry[] = [];
  private reqs: Req[] = [];
  req(key: string, w: number, h: number, k: number, draw: (p: Pen) => void) {
    const r: Req = { key: `${w}x${h}|${key}`, w, h, k, draw };
    this.reqs.push(r);
    return r;
  }
  flush() {
    const want = new Map<string, Req[]>();
    for (const r of this.reqs) { const l = want.get(r.key); if (l) l.push(r); else want.set(r.key, [r]); }
    for (const [key, e] of this.live) if (!want.has(key)) { this.live.delete(key); this.free.push(e); }
    for (const [key, rs] of want) {
      let e = this.live.get(key);
      if (!e) {
        const r = rs[0], i = this.free.findIndex((x) => x.w === r.w && x.h === r.h);
        e = i >= 0 ? this.free.splice(i, 1)[0] : makeEntry(r.w, r.h);
        const g = e.cv.getContext("2d")!;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.w, e.h); g.setTransform(r.k, 0, 0, r.k, 0, 0);
        r.draw(new Pen(g));
        e.tex.needsUpdate = true;
        this.live.set(key, e);
      }
      for (const r of rs) r.tex = e.tex;
    }
    this.reqs = [];
  }
}

// ---------------- sprite meshes ----------------
const blank = (() => { const c = document.createElement("canvas"); c.width = c.height = 2; return new THREE.CanvasTexture(c); })();
export const SU = 0.00216; // metres per design unit: 1000 units = 2.16 m
export const SU_SWING = 2.3 / 1830; // swing canvas: rope of 1830 units = 2.3 m
const BODY = (() => { const g = new THREE.PlaneGeometry(600 * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
const CARD = new THREE.PlaneGeometry(1, 1);
/** world roots that hold actors (to find the scene's sun when world.ts does not pass it) */
const ROOTS = new Set<THREE.Object3D>();

/** lit flat character: cardShade() material, receives shadows (dims to the bright floor only), casts its silhouette
 *  when world.ts says so (golden). Drawn after the contact blobs (renderOrder 1). */
export class Actor {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; dmat: THREE.MeshDepthMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry = BODY) {
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.customDepthMaterial = this.dmat;
    // rim width is in output pixels: tell the card shader the render height (1920 = 1080 x 1920 frame)
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.mesh.rotation.order = "YXZ"; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
    ROOTS.add(parent);
  }
  bind() { const t = this.r?.tex; if (t) { this.mat.map = t; this.dmat.map = t; } }
}
/** unlit effect card: hard cut-out (ink drawings), soft see-through (dust, mist) or a multiply ground blob */
export class Fx {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial; blob: THREE.MeshBasicMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.soft = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.blob = blobMaterial(blank);
    this.mesh = new THREE.Mesh(CARD, this.mat);
    this.mesh.visible = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  use(soft: boolean) { this.mesh.material = soft ? this.soft : this.mat; }
  bind() {
    const t = this.r?.tex;
    if (!t) return;
    if (this.r!.key.includes("|blob|")) {
      // no mipmaps: at grazing views the mip chain averages the blob with its white surround and it fades out
      if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
      this.blob.map = t; this.mesh.material = this.blob; this.mesh.renderOrder = 0.5;
    }
    else { this.mat.map = t; this.soft.map = t; this.mesh.renderOrder = 0; }
  }
}

// ---------------- placements ----------------
export type Place = {
  key: string; draw: (p: Pen) => void; x: number; y: number; z: number;
  scale?: number; mirror?: boolean; yaw?: number; geo?: "body" | "swing"; roll?: number; size?: [number, number, number];
};
export type FxPlace = { key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number; flat?: boolean; rot?: number; soft?: boolean };
/** sun = world direction TOWARD the sun (optional: when absent the scene's shadow-casting light is used) */
export type CamInfo = { pos: THREE.Vector3; right: THREE.Vector3; sun?: THREE.Vector3 };

const hh = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const q = (v: number, n = 120) => Math.round(v * n) / n;
const vOf = (i: number) => (i * 7 + (i >> 2)) % 4;
/** head-shape seed: 7 shapes, so marching soldiers in step still share canvases */
const seedOf = (i: number) => ((i * 5 + 3) % 7) + 1;
/** drawing resolution by distance: [canvas w, h, scale from the 600 x 1000 design]; sized for the 1440 x 2560 final */
const tier = (d: number): [number, number, number] =>
  d < 3.2 ? [1800, 3000, 3.0] : d < 6.5 ? [1080, 1800, 1.8] : d < 16 ? [480, 800, 0.8] : [240, 400, 0.4];

// ---------------- light ----------------
const SUN = new THREE.Vector3(0.5, 0.75, -0.4).normalize();
const tmp = new THREE.Vector3();
let LNAME: "day" | "golden" = "day";
const sunOf = (root: THREE.Object3D) => {
  let s: THREE.DirectionalLight | null = null;
  root.traverse((o) => { if (!s && o instanceof THREE.DirectionalLight && o.castShadow) s = o; });
  return s as THREE.DirectionalLight | null;
};
/** the sun of the world that is calling: the attached root whose sun target sits on this camera's view axis */
const findSun = (cam: CamInfo, out: THREE.Vector3) => {
  if (cam.sun) return out.copy(cam.sun).normalize();
  let best: THREE.DirectionalLight | null = null, err = Infinity;
  for (const r of ROOTS) {
    if (!r.parent) continue;
    const s = sunOf(r);
    if (!s) continue;
    const d = tmp.copy(s.target.position).sub(cam.pos), e = Math.abs(d.dot(cam.right)) / (d.length() || 1);
    if (e < err) { err = e; best = s; }
  }
  return best ? out.copy(best.position).sub(best.target.position).normalize() : out;
};
/** canvas angle the sun comes FROM on an upright card facing the camera, in 45-degree steps (small texture cache) */
const light2D = (cam: CamInfo, mirror: boolean) => {
  const sx = SUN.dot(cam.right) * (mirror ? -1 : 1), sy = -SUN.y;
  return Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) * (Math.PI / 4);
};

/** front / side view and mirroring for someone at (x, z) walking along (dx, dz); fs = foreshortening of the walk */
const viewOf = (cam: CamInfo, x: number, z: number, dx: number, dz: number) => {
  const tx = cam.pos.x - x, tz = cam.pos.z - z, tl = Math.hypot(tx, tz) || 1;
  const c = (tx * dx + tz * dz) / tl;
  return { side: c < 0.57, mirror: dx * cam.right.x + dz * cam.right.z < 0, fs: Math.round(Math.sqrt(Math.max(0, 1 - c * c)) * 20) / 20 };
};

// ---------------- life: blinks and reaction timing ----------------
/** reference expression and action changes land 0-3 f before the word onset */
const LEAD = 2 / FPS;
/** eyelid 0 open .. 1 shut. Reference: gaps 0.5-2.3 s, 4-frame blink half / shut / shut / half, plus a blink across
 *  every expression swap (the shut frames hide the swap) */
const LID = [0.5, 1, 1, 0.5];

const lidAt = (t: number, i: number, swaps: number[] = []) => {
  const f = Math.round(t * FPS);
  for (const ts of swaps) { const k = f - Math.round((ts - LEAD) * FPS) + 1; if (k >= 0 && k < 4) return LID[k]; }
  let s = Math.round(-60 * hh(i, 9));
  for (let n = 0; s <= f && n < 400; n++) {
    const k = f - s;
    if (k >= 0 && k < 4) return LID[k];
    s += Math.round(15 + 54 * hh(i * 31 + n, 13)); // next blink 0.5-2.3 s later
  }
  return 0;
};
const fkey = (o: object) => JSON.stringify(o, (_k, v) => (typeof v === "number" ? q(v) : v));

type Who = { i: number; o: Outfit; okey: string };
/** one character drawing in the 600 x 1000 design space, sized by distance, lit from the scene's sun */
const person = (cam: CamInfo, who: Who, x: number, y: number, z: number, view: { side: boolean; mirror: boolean }, fo: FrontOpts, so: SideOpts, scale = 1): Place & { tierKey: string } => {
  const d = cam.pos.distanceTo(tmp.set(x, y + 1.2, z)) / scale;
  const [w, h, k] = tier(d);
  const mirror = view.side && view.mirror, light = light2D(cam, mirror), seed = seedOf(who.i);
  const f2: FrontOpts = { ...fo, light, seed }, s2: SideOpts = { ...so, light, seed };
  const key = view.side ? `S|${who.okey}|${fkey(s2)}` : `F|${who.okey}|${fkey(f2)}`;
  return {
    key, x, y, z, scale, mirror, tierKey: `${w}`,
    draw: (p) => (view.side ? bodySide(p, who.o, s2) : bodyFront(p, who.o, f2)),
    size: [w, h, k],
  };
};

/** ground shadow under a standing / sitting card (review rounds 2-4), multiply, blue-violet: a TIGHT contact pool right under
 *  the feet (~.5 on screen at the core) so nobody floats, plus by day (cards cast no real shadow) a lighter soft tail
 *  stretched AWAY from the sun, length ~1.6 m / tan(sun elevation), capped. Golden: world.ts casts real card shadows. */
const CONTACT: Record<"day" | "golden", [number, number, number]> = { day: [0.2, 0.21, 0.33], golden: [0.24, 0.2, 0.33] };
const TAIL: [number, number, number] = [0.42, 0.44, 0.62];
const toSrgb = (v: number) => { const c = clamp01(v); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
const hexOf = (c: [number, number, number], k: number) => "#" + c.map((v) => Math.round(255 * toSrgb(1 - (1 - v) * k)).toString(16).padStart(2, "0")).join("");
const blob = (out: Stage, x: number, y: number, z: number, sc = 1, k = 1) => {
  const hl = Math.hypot(SUN.x, SUN.z) || 1, ox = -SUN.x / hl, oz = -SUN.z / hl, rot = Math.atan2(-ox, -oz);
  if (LNAME === "day") {
    const el = Math.asin(Math.min(0.99, Math.max(0.1, SUN.y)));
    const len = Math.min(2.4, Math.max(0.5, 1.6 / Math.tan(el))) * sc, h = len + 0.55 * sc, c = 0.3 * h; // feet at v = .2 of the card
    const tc = hexOf(TAIL, k);
    out.fx.push({ key: `blob|shadow|${tc}`, cw: 128, ch: 256, draw: (p) => fxShadow(p, tc), x: x + ox * c, y: y + 0.018, z: z + oz * c,
      w: 0.72 * sc, h, flat: true, rot });
  }
  const cc = hexOf(CONTACT[LNAME], k);
  out.fx.push({ key: `blob|contact|${cc}`, cw: 128, ch: 128, draw: (p) => fxContact(p, cc), x: x + ox * 0.03 * sc, y: y + 0.022, z: z + oz * 0.03 * sc,
    w: 0.52 * sc, h: 0.4 * sc, flat: true, rot });
};
const SWAPS: Record<number, number[]> = {};
void SWAPS; void fxBlob; void LIGHTS;

// ---------------- the stage ----------------
export type Stage = { places: Place[]; fx: FxPlace[] };
/** ship-space -> world transform for the deck crew, plus the ship's heel (cards lean with the deck) */
export type ShipCtx = { toW: (p: V3) => THREE.Vector3; heel: number; xAxis: THREE.Vector3; ports: number[][] };
const FOLK = [0, 1, 2, 3, 4, 5].map((v) => townsfolk(v));
const SAILORS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((v) => sailor(v));
const TOUR = [0, 1, 2, 3, 4, 5, 6, 7].map((v) => TOURIST(v));
const JUDGES = [0, 1, 2].map((v) => JUDGE(v));
const fwdOf = (cam: CamInfo) => new THREE.Vector3().crossVectors(cam.right, new THREE.Vector3(0, 1, 0)).negate().normalize();
/** roll for a billboard standing on a heeled deck, seen by this camera */
const deckRoll = (cam: CamInfo, ctx: ShipCtx) => -ctx.heel * ctx.xAxis.dot(fwdOf(cam));
const live = (t: number, a: number) => t >= a - 2 / FPS;

/** the crowd on the quay, waving (z -12 .. -30), cheering from `cheer` on */
const quayCrowd = (cam: CamInfo, t: number, out: Stage, mood: (i: number) => Expr, cheer = true) => {
  for (let i = 0; i < 46; i++) {
    const x = -26 + (i % 23) * 2.4 + hh(i) * 1.4, z = -11.2 - Math.floor(i / 23) * 2.6 - hh(i, 2) * 2.2 - (i % 3) * 0.7;
    const kid = i % 7 === 3, o = kid ? KID : FOLK[i % 6], hop = kid && cheer ? Math.max(0, Math.sin(t * 7 + i)) * 0.16 : 0;
    const who: Who = { i: i + 300, o, okey: kid ? "kid" : `f${i % 6}` };
    const fo: FrontOpts = { mode: "stand", expr: mood(i), wave: cheer && i % 3 !== 2 ? q(Math.sin(t * 8 + i * 1.3), 30) : undefined, blink: lidAt(t, i + 40) };
    out.places.push(person(cam, who, x, D0 + hop, z, { side: false, mirror: false }, fo, {}, kid ? 0.72 : 1));
    blob(out, x, D0, z, kid ? 0.72 : 1);
  }
};

/** the stability test: thirty sailors in a block that runs across the deck (ship-space z = runZ(t) + spread) */
const deckCrew = (cam: CamInfo, t: number, out: Stage, ctx: ShipCtx, id: number) => {
  const roll = deckRoll(cam, ctx), [a, b, c] = RUNS(), st = STOP();
  const zc = runZ(t), dz = runZ(t + 0.05) - runZ(t - 0.05), moving = Math.abs(dz) > 0.02;
  for (let i = 0; i < 30; i++) {
    const row = i % 6, col = Math.floor(i / 6);
    const lx = 0.6 + row * 2.0 + hh(i) * 0.6, lz = zc + (col - 2) * 0.75 + (hh(i, 3) - 0.5) * 0.5;
    const lag = hh(i, 5) * 0.25, zz = runZ(t - lag) + (col - 2) * 0.75 + (hh(i, 3) - 0.5) * 0.5;
    const wp = ctx.toW([lx, DECK_Y, Math.max(-4.6, Math.min(4.6, moving ? zz : lz))]);
    const v = (i * 7) % 10, who: Who = { i, o: SAILORS[v], okey: `sa${v}` };
    const scared = t > c + 0.6, stopped = t > st - 0.1;
    const expr: Expr = stopped ? (i % 2 ? "shock" : "nervous") : scared ? "nervous" : t > b ? (i % 3 ? "grin" : "nervous") : t > a ? (i % 2 ? "grin" : "laugh") : (i % 3 ? "neutral" : "smile");
    const dirW = new THREE.Vector3(0, 0, Math.sign(dz) || 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0);
    const view = moving ? viewOf(cam, wp.x, wp.z, dirW.x, dirW.z) : { side: false, mirror: false, fs: 1 };
    const phase = q((t * 2.6 + hh(i, 6)) % 1, 60);
    const fo: FrontOpts = { mode: moving ? "march" : "stand", phase, expr, blink: lidAt(t, i), look: 0 };
    const so: SideOpts = { mode: "march", phase, expr, stomp: 1.3, stride: 1.25 * view.fs };
    const pl = person(cam, who, wp.x, wp.y, wp.z, view, fo, so);
    pl.roll = roll + (moving ? -0.12 * Math.sign(dz) * (view.mirror ? -1 : 1) : 0);
    out.places.push(pl);
    blob(out, wp.x, wp.y, wp.z, 1, 0.8);
  }
  // the admiral by the mainmast, facing aft: nervous on the runs, hand up on "stopped", deadpan on "naturally"
  const ad = ctx.toW([-2.5, DECK_Y, 0.4]);
  const tn = id === 5 ? W("naturally") : 1e9;
  const ex: Expr = live(t, tn) ? "neutral" : live(t, st) ? "shock" : t > b ? "nervous" : "stern";
  const wave = live(t, st) && !live(t, tn) ? 0 : undefined;
  const fo: FrontOpts = { mode: "stand", expr: ex, wave, blink: lidAt(t, 77), look: live(t, tn) ? 0 : 1 };
  const pl = person(cam, { i: 77, o: ADMIRAL, okey: "admiral" }, ad.x, ad.y, ad.z, { side: false, mirror: false }, fo, {});
  pl.roll = roll;
  out.places.push(pl);
  blob(out, ad.x, ad.y, ad.z);
};

/** a few sailors on deck during the voyage (waving, then shocked when she leans) */
const voyageCrew = (cam: CamInfo, t: number, out: Stage, ctx: ShipCtx) => {
  const roll = deckRoll(cam, ctx), lean = t > W("leans");
  for (let i = 0; i < 10; i++) {
    const lx = -6 + i * 2.1, lz = (i % 2 ? 1 : -1) * (2.2 + hh(i) * 1.5);
    const wp = ctx.toW([lx, DECK_Y, lz]), v = (i * 3) % 10;
    const fo: FrontOpts = { mode: "stand", expr: lean ? (i % 2 ? "shock" : "nervous") : "grin", wave: lean ? undefined : q(Math.sin(t * 8 + i), 30), blink: lidAt(t, i + 60) };
    const pl = person(cam, { i: i + 60, o: SAILORS[v], okey: `sa${v}` }, wp.x, wp.y, wp.z, { side: false, mirror: false }, fo, {});
    pl.roll = roll;
    out.places.push(pl);
  }
};

/** water pouring in at the lower ports on the low side, and the big splash as she goes */
const sinkFx = (t: number, out: Stage, ctx: ShipCtx) => {
  const tw = W("water"), td = W("down", 2);
  if (t > tw - 0.1 && t < td + 2.5) {
    // wherever a port row meets the waterline, water pours over the sill
    for (const py of PORT_Y) PORTS_X.forEach((px, i) => {
      const p = ctx.toW([px, py + 0.25, halfBeam(px, py) + 0.2]);
      if (p.y < -1.4 || p.y > 1.6) return;
      const u = q((t * 1.7 + i * 0.13) % 1, 30);
      out.fx.push({ key: `gush${u}`, cw: 400, ch: 400, draw: (pp) => fxGush(pp, u * 6), x: p.x, y: 0.5, z: p.z + 0.35, w: 1.7, h: 1.7 });
    });
  }
  const u = (t - td - 0.9) / 1.6;
  if (u >= 0 && u < 1) {
    const c = ctx.toW([0, 0, 0]);
    for (const [dx, dz, s] of [[-14, 6, 1.4], [0, 7, 1.8], [12, 6, 1.4], [-6, 5, 1.1], [7, 5, 1.2]] as const)
      out.fx.push({ key: `splash${q(u, 30)}`, cw: 800, ch: 800, draw: (p) => fxSplash(p, q(u, 30)), x: c.x + dx, y: 5.2 * s, z: dz, w: 14 * s, h: 14 * s });
  }
  // the gust: streaks sweeping over the water toward the sails
  const tg = W("gust"), ug = (t - tg + 0.3) / 1.3;
  if (ug >= 0 && ug < 1) {
    const c = ctx.toW([0, 0, 0]);
    for (const [dx, y, dz] of [[-8, 16, 12], [4, 24, 9], [-2, 10, 16]] as const)
      out.fx.push({ key: `gust${q(ug, 30)}`, cw: 900, ch: 300, draw: (p) => fxGust(p, q(ug, 30)), x: c.x + dx, y, z: dz, w: 18, h: 6, soft: false });
  }
};

/** the king on a golden field, tapping his foot, a toy ship in hand; battle smoke behind */
const king = (cam: CamInfo, t: number, out: Stage) => {
  const [x, y, z] = KING_AT, tap = Math.max(0, Math.sin(t * 9)) * 0.04, shake = Math.sin(t * 7);
  // impatient: holds the toy ship up and shakes it ("where is my ship?")
  out.places.push(person(cam, { i: 90, o: KING, okey: "king" }, x, y + tap, z, { side: false, mirror: false },
    { mode: "stand", expr: "stern", blink: lidAt(t, 90), wave: q(0.4 + 0.4 * shake, 10), headTilt: 0.04 * Math.sin(t * 3) }, {}));
  blob(out, x, y, z);
  const hx = x + (0.42 + 0.02 * shake) * cam.right.x, hz = z + (0.42 + 0.02 * shake) * cam.right.z;
  out.fx.push({ key: "toyship", cw: 400, ch: 300, draw: fxToyShip, x: hx, y: y + tap + 1.62 + 0.03 * shake, z: hz - 0.05, w: 0.6, h: 0.45, rot: 0.15 * shake });
  for (let i = 0; i < 7; i++) {
    const u = q(((t * 0.25 + i / 7) % 1), 30), sx = x + (i - 3) * 9 + 3 * Math.sin(i), sz = z + 26 + (i % 3) * 8;
    out.fx.push({ key: `smoke${u}`, cw: 400, ch: 400, draw: (p) => fxSmoke(p, u), x: sx, y: y + 2 + u * 5, z: sz, w: 9, h: 9, soft: true });
  }
};

/** the inquiry: three judges behind the bench, the admiral and two sailors before it, the portrait and its candle */
const inquiry = (cam: CamInfo, t: number, out: Stage) => {
  const [x0, y0, z0] = INQUIRY, un = live(t, W("Unluckily"));
  JUDGES.forEach((o, i) => {
    const x = x0 + (i - 1) * 1.6, z = z0 + 3.4;
    const fo: FrontOpts = { mode: "stand", expr: un ? (i === 1 ? "nervous" : "stern") : "stern", look: un ? 1 : 0, blink: lidAt(t, 110 + i) };
    out.places.push(person(cam, { i: 110 + i, o, okey: `j${i}` }, x, y0 + 0.5, z, { side: false, mirror: false }, fo, {}));
  });
  const acc: [Outfit, string, number, number][] = [[ADMIRAL, "admiral", -1.2, 0.2], [SAILORS[2], "sa2", 0.2, -0.3], [SAILORS[5], "sa5", 1.4, 0.1]];
  acc.forEach(([o, k, dx, dz], i) => {
    const fo: FrontOpts = { mode: "stand", expr: un ? "relief" : "nervous", look: un ? 1 : 0, blink: lidAt(t, 120 + i) };
    out.places.push(person(cam, { i: 120 + i, o, okey: k }, x0 + dx, y0, z0 + dz, { side: false, mirror: false }, fo, {}));
    blob(out, x0 + dx, y0, z0 + dz);
  });
  out.fx.push({ key: "portrait", cw: 600, ch: 760, draw: fxPortrait, x: x0 + 6.9, y: y0 + 2.6, z: z0 + 3.0, w: 1.5, h: 1.9 });
  const u = q(t % 1, 30);
  out.fx.push({ key: `flame${u}`, cw: 120, ch: 200, draw: (p) => fxFlame(p, u * 7), x: x0 + 6.6, y: y0 + 1.55, z: z0 + 2.4, w: 0.16, h: 0.27, soft: true });
};

/** the canoe kid (pose by word): sits, stands and wobbles, tips over, sits in the water */
export const canoePose = (t: number) => {
  const st = W("Stand"), tp = W("tips");
  const wob = t < st ? 0.02 * Math.sin(t * 2) : t < tp ? 0.12 * Math.sin((t - st) * 9) * smooth((t - st) / 0.4) : 0;
  const over = smooth((t - tp) / 0.5);
  return { roll: wob + over * 2.2, stand: t >= st, over, splash: t - tp - 0.35 };
};
const lake = (cam: CamInfo, t: number, out: Stage) => {
  const [x, , z] = LAKE, c = canoePose(t);
  if (c.over < 0.5) {
    const expr: Expr = c.stand ? "nervous" : "smile";
    const fo: FrontOpts = { mode: c.stand ? "stand" : "sit", expr, blink: lidAt(t, 140), wave: c.stand ? q(Math.sin(t * 10), 30) : undefined };
    const pl = person(cam, { i: 140, o: CANOE_KID, okey: "ckid" }, x - Math.sin(c.roll) * 0.4, c.stand ? 0.2 : 0.3, z - 0.15, { side: false, mirror: false }, fo, {}, 0.85);
    pl.roll = c.roll * 1.3;
    out.places.push(pl);
  } else {
    const bob = 0.04 * Math.sin(t * 3);
    out.places.push(person(cam, { i: 140, o: CANOE_KID, okey: "ckid" }, x + 0.9, -0.3 + bob, z - 0.4, { side: false, mirror: false }, { mode: "sit", expr: "dazed", blink: lidAt(t, 140) }, {}, 0.8));
    const u = q(((t * 0.5) % 1), 30);
    out.fx.push({ key: `ring${u}`, cw: 600, ch: 600, draw: (p) => fxRing(p, u), x: x + 0.9, y: 0.03, z: z - 0.4, w: 2.2, h: 2.2, flat: true });
  }
  if (c.splash >= 0 && c.splash < 1.1) {
    const u = q(c.splash / 1.1, 30);
    out.fx.push({ key: `splash${u}`, cw: 800, ch: 800, draw: (p) => fxSplash(p, u), x: x + 0.7, y: 1.0, z: z - 0.2, w: 3, h: 3 });
  }
};

/** 1961: workers on the pontoons cheering as she comes up */
const salvage = (cam: CamInfo, t: number, out: Stage) => {
  const up = live(t, SALVAGE_T());
  for (let i = 0; i < 10; i++) {
    const side = i < 5 ? 1 : -1, x = -14 + (i % 5) * 7 + hh(i) * 2, z = side * 10.5, y = 1.2;
    const fo: FrontOpts = { mode: "stand", expr: up ? (i % 2 ? "grin" : "laugh") : "neutral", wave: up && i % 2 ? q(Math.sin(t * 8 + i), 30) : undefined, blink: lidAt(t, i + 160) };
    out.places.push(person(cam, { i: i + 160, o: TOUR[i % 8], okey: `t${i % 8}` }, x, y, z, { side: false, mirror: false }, fo, {}));
    blob(out, x, y, z);
  }
};

/** the museum: tourists strolling around the hull, one taking a photo */
const museum = (cam: CamInfo, t: number, out: Stage) => {
  const [x0, y0, z0] = MUSEUM;
  for (let i = 0; i < 26; i++) {
    // the visitors' walkway along the near rail (z -10 .. -17), strolling slowly along the hull
    const sp = 0.25 + hh(i) * 0.35;
    const x = x0 - 32 + (i / 26) * 64 + (hh(i, 2) - 0.5) * 2 + (i % 2 ? 1 : -1) * sp * (t % 30) * 0.3, z = z0 - 10.5 - hh(i, 3) * 6.5;
    const expr: Expr = (["smile", "smile_closed", "grin", "neutral"] as Expr[])[i % 4];
    const fo: FrontOpts = { mode: "stand", expr, look: i % 3 - 1, blink: lidAt(t, i + 180), wave: i % 9 === 4 ? 0.3 : undefined };
    out.places.push(person(cam, { i: i + 180, o: TOUR[i % 8], okey: `t${i % 8}` }, x, y0, z, { side: false, mirror: false }, fo, {}, i % 6 === 5 ? 0.72 : 1));
    blob(out, x, y0, z);
  }
  // close by the low final camera: a kid gives the hull a push (nothing moves)
  const kx = x0 + 23.5, kz = z0 - 33;
  out.places.push(person(cam, { i: 199, o: KID, okey: "kid" }, kx, y0, kz, { side: false, mirror: false }, { mode: "stand", expr: live(t, W("finally")) ? "smile_closed" : "grin", blink: lidAt(t, 199), wave: 0.6 }, {}, 0.72));
  blob(out, kx, y0, kz, 0.72);
};

/** everything with a face in shot `id` at time t */
export const stage = (id: number, t: number, cam: CamInfo, ship: ShipCtx): Stage => {
  const out: Stage = { places: [], fx: [] };
  const s = SHOTS[id - 1];
  LNAME = s.light;
  findSun(cam, SUN);
  switch (id) {
    case 1: break;
    case 2: quayCrowd(cam, t, out, (i) => (["smile", "grin", "laugh", "smile_closed"] as Expr[])[i % 4]); break;
    case 3: case 4: case 5: deckCrew(cam, t, out, ship, id); break;
    case 6: king(cam, t, out); break;
    case 7: {
      const lean = t > W("leans");
      quayCrowd(cam, t, out, (i) => (lean ? (["shock", "nervous", "shock", "pained"] as Expr[]) : (["grin", "laugh", "smile", "grin"] as Expr[]))[i % 4], !lean);
      voyageCrew(cam, t, out, ship); sinkFx(t, out, ship);
      break;
    }
    case 8: inquiry(cam, t, out); break;
    case 9: lake(cam, t, out); break;
    case 11: salvage(cam, t, out); break;
    case 12: museum(cam, t, out); break;
  }
  return out;
};
export { FPS, fxPuff, fxContact, fxShadow, bodySide, clamp01, WE, NOINK, Pen };
