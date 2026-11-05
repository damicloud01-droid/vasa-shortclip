// The whole film as one three.js scene per layer: sky, sun, clouds, the harbour (water, quay, Stockholm, far shore,
// boats), the Vasa (ship.ts), and the side sets far apart in the same world: the king's camp, the inquiry hall, the
// lake, the cut-through ship "aquarium", the salvage pontoons and the museum hall. update(id, f, camera) poses
// everything for shot `id` at frame f (a pure function of id + f), then stages the cast from cast.ts.
import * as THREE from "three";
import { Batch, boxGeo, V, lam, house, prop, quad, Kit } from "./build";
import { ctex, rep, stoneHD, cobbleHD, grassHD, cloudHD, waterNear, waterFar, planksHD, beamHD } from "./paint";
import { Pen } from "./toon";
import { LIGHTS, LOOK, LightPreset } from "./lights";
import { TONE, CHAR, LFB, twoTone, untone } from "./shade";
import { NOINK } from "./ink";
import { Pool, Actor, Fx, stage, canoePose, ShipCtx } from "./cast";
import { Ship, halfBeam, flagSE } from "./ship";
import { FPS, D0, SHOTS, ShotDef, camAt, shipPose, KING, INQUIRY, LAKE, CUTAWAY, MUSEUM, W, smooth, V3 } from "./story";

export const loadKit = () => Promise.resolve({} as Kit);

const discTex = () => ctex("sunDisc", 128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 58, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
const haloTex = () => ctex("sunHalo", 256, 256, (g) => {
  const im = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const u = Math.hypot(x - 127.5, y - 127.5) / 128;
    const a = (0.55 * Math.exp(-((u / 0.25) ** 2)) + 0.35 * Math.exp(-((u / 0.6) ** 2))) * (1 - Math.min(1, Math.max(0, (u - 0.8) / 0.2)));
    const i = (y * 256 + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = Math.round(255 * Math.min(1, a));
  }
  g.putImageData(im, 0, 0);
});
/** per-shot sun (camera-relative az / el) where the preset would light the subject badly */
const SUN_SHOT: Record<number, { az?: number; el?: number }> = { 1: { az: 140, el: 40 }, 2: { az: 130 }, 4: { az: 140, el: 42 }, 6: { az: 30, el: 9 }, 7: { az: 150, el: 38 }, 9: { az: -25, el: 8 }, 11: { az: 140, el: 40 }, 12: { az: 110, el: 55 } };

/** horizontal quad facing up at height y over x0..x1, z0..z1 (z0 < z1), uv tiled by u, v */
function quadUp(x0: number, x1: number, z0: number, z1: number, u: number, v: number, y = D0) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z1, x1, y, z0, x0, y, z0], 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(Array(6).fill([0, 1, 0]).flat(), 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, u, 0, u, v, 0, 0, u, v, 0, v], 2));
  return g;
}
const disc = (r0: number, r1: number, y: number, tile: number) => {
  const g = new THREE.RingGeometry(r0, r1, 64, 1); g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
  const p = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / tile, p.getZ(i) / tile);
  return g;
};
const panelTex = () => ctex("panel", 512, 512, (g, r) => {
  g.fillStyle = "#8a5a36"; g.fillRect(0, 0, 512, 512);
  for (let x = 0; x < 512; x += 128) for (let y = 0; y < 512; y += 170) {
    g.fillStyle = `rgba(${100 + r() * 30},${62 + r() * 15},${34},1)`; g.fillRect(x + 12, y + 12, 104, 146);
    g.strokeStyle = "#4a2e1a"; g.lineWidth = 4; g.strokeRect(x + 12, y + 12, 104, 146);
  }
  g.fillStyle = "#4a2e1a"; g.fillRect(0, 500, 512, 12);
});
const hallTex = () => ctex("hall", 512, 512, (g, r) => {
  g.fillStyle = "#5a5560"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.04})`; g.fillRect(r() * 512, r() * 512, 3 + r() * 20, 2); }
  g.fillStyle = "#47434d"; for (let x = 0; x < 512; x += 128) g.fillRect(x, 0, 10, 512);
});
const tentTex = (c: string) => ctex("tent" + c, 256, 256, (g) => {
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? c : "#f2ead8"; g.fillRect(i * 32, 0, 32, 256); }
});
/** canoe hull: a small double-ended boat along local z, length L, beam B */
const canoeGeo = (L: number, B: number, H: number) => {
  const pos: number[] = [], idx: number[] = [], n = 24, m = 8;
  for (let i = 0; i <= n; i++) {
    const u = i / n, z = (u - 0.5) * L, w = B * 0.5 * Math.sin(Math.PI * u) ** 0.7, sheer = H * (1 + 0.6 * (2 * u - 1) ** 4);
    for (let j = 0; j <= m; j++) {
      const a = Math.PI * (j / m); // from one gunwale under the keel to the other
      pos.push(-Math.cos(a) * w, sheer - Math.sin(a) * H * Math.sin(Math.PI * u) ** 0.4 - (1 - Math.sin(Math.PI * u) ** 0.4) * 0.0, z);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const a = i * (m + 1) + j, b = a + m + 1; idx.push(a, b, b + 1, a, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
};

export class World {
  root = new THREE.Group();
  ship = new Ship();
  private pool = new Pool();
  private actors: Actor[] = [];
  private fxs: Fx[] = [];
  private hemi: THREE.HemisphereLight; private sun: THREE.DirectionalLight;
  private sky: THREE.Mesh; private skyMat: THREE.ShaderMaterial;
  private fog = new THREE.Fog("#bccbec", 25, 420);
  private WU: Record<string, THREE.IUniform>;
  private sunDisc: THREE.Sprite; private sunHalo: THREE.Sprite;
  private sunCache = new Map<number, THREE.Vector3>();
  private cloudMaps: Record<"day" | "golden", THREE.Texture[]>;
  private clouds: THREE.Mesh[] = [];
  private salvage = new THREE.Group();
  private canoe = new THREE.Group();
  private section = new THREE.Group();
  private flags: THREE.Mesh[] = [];
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4(); private v = new THREE.Vector3(); private sph = new THREE.Sphere();

  constructor(_kit: Kit) {
    const R = this.root, kit = _kit;
    // ---- sky + light (as the bridge short) ----
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() },
        c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() }, e: { value: new THREE.Vector4() } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 c0, c1, c2, c3, c4; uniform vec4 e; varying vec3 vP;
        void main(){ float el = asin(clamp(normalize(vP).y, -1.0, 1.0));
          vec3 c = mix(c0, c1, smoothstep(0.0, e.x, el));
          c = mix(c, c2, smoothstep(e.x, e.y, el));
          c = mix(c, c3, smoothstep(e.y, e.z, el));
          c = mix(c, c4, smoothstep(e.z, e.w, el));
          gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 48, 24), this.skyMat);
    this.sky.renderOrder = -1; this.sky.frustumCulled = false; this.sky.layers.set(NOINK);
    R.add(this.sky);
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex(), color: new THREE.Color(6.0, 4.4, 2.4), fog: false, depthWrite: false }));
    this.sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: new THREE.Color(1, 1, 1), fog: false, depthWrite: false, depthTest: true, transparent: true, blending: THREE.AdditiveBlending }));
    this.sunDisc.renderOrder = -0.5; this.sunHalo.renderOrder = 5;
    for (const m of [this.sunDisc, this.sunHalo]) { m.frustumCulled = false; m.layers.set(NOINK); R.add(m); }
    this.hemi = new THREE.HemisphereLight("#cfe6ff", "#6c5c8c", 1.1);
    this.sun = new THREE.DirectionalLight("#fff0d6", 2.6);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(4096, 4096);
    R.add(this.hemi, this.sun, this.sun.target);
    this.cloudMaps = { day: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.day.cloud)), golden: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.golden.cloud)) };
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.cloudMaps.day[i % 4], color: new THREE.Color(1.1, 1.1, 1.1), transparent: true, depthWrite: false, fog: false }));
      m.layers.set(NOINK); this.clouds.push(m); R.add(m);
    }

    // ---- materials ----
    const grass = lam("grassHD", () => ({ map: grassHD() }));
    const cobble = lam("cobbleHD", () => ({ map: cobbleHD() }));
    const quayStone = lam("quayHD", () => ({ map: stoneHD("quayHD", ["#c9bcaa", "#bfb19f", "#d1c5b4", "#b8aa97"], "#958776") }));
    const cope = lam("copeHD", () => ({ map: stoneHD("copeHD", ["#e6dccd", "#ddd3c3", "#ece4d6", "#d6cbba"], "#aea293") }));
    const planks = lam("planksHD", () => ({ map: planksHD() }));
    const timber = lam("beamHD", () => ({ map: beamHD() }));
    const sand = lam("sand", () => ({ color: "#e2c992" }));
    const dark = lam("darkWood", () => ({ color: "#5a3a22" }));

    // ---- water: one shader for every set (hole left for the cut-through aquarium) ----
    const wNear = waterNear(), wFar = waterFar();
    for (const t of [wNear, wFar]) { t.colorSpace = THREE.NoColorSpace; t.anisotropy = 16; t.needsUpdate = true; }
    this.WU = {
      wNearC: { value: new THREE.Color() }, wMidC: { value: new THREE.Color() }, wFarC: { value: new THREE.Color() },
      wCrest: { value: new THREE.Color() }, wTrough: { value: new THREE.Color() }, wGlint: { value: new THREE.Color() },
      wShade: { value: new THREE.Vector3(0.5, 0.56, 0.72) }, wNearTex: { value: wNear }, wFarTex: { value: wFar }, wTime: { value: 0 },
    };
    const waterM = new THREE.MeshLambertMaterial({ color: 0xffffff });
    waterM.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.WU);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWP;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", WATER_DECL).replace("#include <map_fragment>", WATER_COL)
        .replace("#include <lights_fragment_begin>", "float sunVis = 1.0;\n" + LFB)
        .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\n  reflectedLight.directDiffuse = diffuseColor.rgb * mix(wShade, vec3(1.0), sunVis);\n  reflectedLight.indirectDiffuse = vec3(0.0);");
    };
    waterM.customProgramCacheKey = () => "vasaWater1";
    this.waterM = waterM;
    const [cx, , cz] = CUTAWAY, HX = 60, HZ = 60;
    const wq: [number, number, number, number][] = [[-1500, cx - HX, -1500, 1500], [cx + HX, 1500, -1500, 1500], [cx - HX, cx + HX, -1500, cz - HZ], [cx - HX, cx + HX, cz + HZ, 1500]];
    for (const [x0, x1, z0, z1] of wq) { const m = new THREE.Mesh(quadUp(x0, x1, z0, z1, 1, 1, 0), waterM); m.receiveShadow = true; R.add(m); }

    const b = new Batch();
    // ---- harbour: the quay (north side), the town, the far shore ----
    b.add(quadUp(-500, 600, -400, -9.2, 275, 97.7), grass);
    b.add(quadUp(-500, 600, -40, -9.2, 275, 7.7, D0 + 0.012), cobble);
    b.add(quad(V(-500, -3, -9.2), V(600, -3, -9.2), V(600, D0, -9.2), V(-500, D0, -9.2), 275, 1.2), quayStone);
    b.add(boxGeo(V(-500, D0 - 0.05, -9.9), V(600, D0 + 0.08, -9.1), 2), cope);
    for (let x = -60; x <= 120; x += 6) { // bollards and mooring posts
      const bo = new THREE.CylinderGeometry(0.22, 0.3, 0.7, 10); b.add(bo, dark, new THREE.Matrix4().makeTranslation(x, D0 + 0.35, -9.7));
      const pile = new THREE.CylinderGeometry(0.25, 0.25, 5, 8); b.add(pile, timber, new THREE.Matrix4().makeTranslation(x + 3, -0.5, -8.7));
    }
    // a wooden gangway pier at the ship's mooring
    b.add(boxGeo(V(-4, D0 - 0.3, -9.2), V(4, D0, -6.4), 1), planks);
    let si = 0;
    for (const [z, y, h0] of [[-46, D0, 8], [-62, D0 + 2, 10], [-80, D0 + 5, 11]] as const)
      for (let x = -90; x < 170; si++) {
        const w = 7 + (si * 37 % 5), h = h0 + (si * 13 % 4) * 0.9;
        house(b, x + w / 2, z, 0, w, 8, h, si, y);
        x += w + 0.6 + (si % 4 === 0 ? 3 : 0);
      }
    // church on the rise (tower + spire), a few trees between the rows
    b.add(boxGeo(V(30, D0 + 5, -104), V(38, D0 + 36, -96), 4), quayStone);
    const spire = new THREE.ConeGeometry(5.2, 18, 4); spire.rotateY(Math.PI / 4);
    b.add(spire, lam("spire", () => ({ color: "#4f8a7a" })), new THREE.Matrix4().makeTranslation(34, D0 + 45, -100));
    for (let x = -120; x < 200; x += 17) prop(b, kit, ["tree_oak", "tree_fat", "tree_cone"][Math.abs(x) % 3], x + 4, D0 + 6, -92 - (x % 3) * 4, 9, x);
    // far shore across the harbour (south), Skeppsholmen-ish: green hills, a row of houses, trees
    b.add(quadUp(-600, 700, 240, 900, 325, 165, D0), grass);
    b.add(quad(V(700, -3, 240), V(-600, -3, 240), V(-600, D0, 240), V(700, D0, 240), 325, 1.2), quayStone);
    for (let x = -200, k = 0; x < 300; k++) { const w = 8 + (k % 3) * 2; house(b, x, 252, Math.PI, w, 8, 9 + (k % 4), k + 3); x += w + 4 + (k % 5); }
    for (let x = -260; x < 360; x += 21) prop(b, kit, ["tree_oak", "tree_cone", "tree_fat"][Math.abs(x) % 3], x, D0, 268 + (x % 7), 11, x * 3);
    const hill = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    for (const [x, z, sx, sy] of [[-300, 420, 160, 40], [120, 480, 220, 55], [420, 380, 150, 35], [-420, -260, 160, 50], [260, -300, 200, 60]] as const)
      b.add(hill, lam("hill", () => ({ color: "#6aa24e" })), new THREE.Matrix4().compose(V(x, D0 - 2, z), new THREE.Quaternion(), V(sx, sy, sx * 0.5)));

    // ---- the king's camp (golden): field, striped tents, a flag ----
    const [kx, ky, kz] = KING;
    b.add(disc(0, 260, ky, 4), grass, new THREE.Matrix4().makeTranslation(kx, 0, kz));
    b.add(new THREE.CylinderGeometry(260, 262, ky + 3, 48, 1, true), quayStone, new THREE.Matrix4().makeTranslation(kx, ky / 2 - 1.5, kz));
    for (const [dx, dz, s, c] of [[-9, 18, 4.2, "#c0353a"], [8, 22, 5, "#1f5aa6"], [-20, 34, 4.6, "#c0353a"], [20, 40, 4.2, "#1f5aa6"], [0, 46, 6, "#c0353a"]] as const) {
      const tent = new THREE.ConeGeometry(s, s * 1.3, 10, 1, true);
      b.add(tent, lam("tent" + c, () => ({ map: tentTex(c), side: THREE.DoubleSide })), new THREE.Matrix4().makeTranslation(kx + dx, ky + s * 0.65, kz + dz));
    }
    for (let i = 0; i < 14; i++) prop(b, kit, "tree_oak", kx - 70 + i * 11, ky, kz + 70 + (i % 3) * 6, 10, i * 7);
    for (let i = 0; i < 9; i++) b.add(boxGeo(V(kx - 6 + i * 1.6, ky, kz + 4), V(kx - 5.85 + i * 1.6, ky + 1.1, kz + 4.15)), timber); // fence posts
    b.add(boxGeo(V(kx - 6.2, ky + 0.75, kz + 4.02), V(kx + 7.4, ky + 0.9, kz + 4.12)), timber);
    { // flag pole + Swedish flag by the king
      b.add(new THREE.CylinderGeometry(0.06, 0.08, 6.5, 8), timber, new THREE.Matrix4().makeTranslation(kx - 7, ky + 3.25, kz + 14));
      const f = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5, 12, 1).translate(1.2, -0.75, 0), lam("flagSEk", () => ({ map: flagSE(true), side: THREE.DoubleSide, alphaTest: 0.5 })));
      f.position.set(kx - 7, ky + 6.4, kz + 14); f.castShadow = true; this.flags.push(f); R.add(f);
    }

    // ---- the inquiry hall: panelled room, raised bench, windows, a little table with the candle ----
    const [ix, iy, iz] = INQUIRY;
    b.add(quadUp(ix - 200, ix + 200, iz - 200, iz + 200, 100, 100, iy), grass);
    b.add(quadUp(ix - 8, ix + 8, iz - 10, iz + 5, 4, 3.75, iy + 0.01), planks);
    const panel = lam("panel", () => ({ map: rep(panelTex(), 4, 1.5), side: THREE.DoubleSide }));
    const walls = new Batch();
    walls.add(quad(V(ix - 8, iy, iz + 5), V(ix + 8, iy, iz + 5), V(ix + 8, iy + 6.5, iz + 5), V(ix - 8, iy + 6.5, iz + 5)).scale(1, 1, 1), panel);
    walls.add(quad(V(ix + 8, iy, iz + 5), V(ix + 8, iy, iz - 10), V(ix + 8, iy + 6.5, iz - 10), V(ix + 8, iy + 6.5, iz + 5)), panel);
    walls.add(quad(V(ix - 8, iy, iz - 10), V(ix - 8, iy, iz + 5), V(ix - 8, iy + 6.5, iz + 5), V(ix - 8, iy + 6.5, iz - 10)), panel);
    walls.add(quad(V(ix - 8, iy + 6.5, iz + 5), V(ix + 8, iy + 6.5, iz + 5), V(ix + 8, iy + 6.5, iz - 10), V(ix - 8, iy + 6.5, iz - 10)), lam("ceilWood", () => ({ color: "#5a3a22", side: THREE.DoubleSide })));
    walls.build(R, false);
    b.add(boxGeo(V(ix - 3.4, iy, iz + 2.2), V(ix + 3.4, iy + 0.5, iz + 4.8), 1), planks); // dais
    b.add(boxGeo(V(ix - 3.0, iy + 0.5, iz + 2.3), V(ix + 3.0, iy + 1.45, iz + 2.9)), lam("bench", () => ({ color: "#7a2e2a" })));
    b.add(boxGeo(V(ix - 3.1, iy + 1.45, iz + 2.25), V(ix + 3.1, iy + 1.55, iz + 2.95)), lam("benchTop", () => ({ color: "#2f5a3a" })));
    b.add(boxGeo(V(ix + 6.2, iy, iz + 2.1), V(ix + 7.0, iy + 1.2, iz + 2.8)), dark); // candle table
    b.add(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), lam("wax", () => ({ color: "#f4ecd8" })), new THREE.Matrix4().makeTranslation(ix + 6.6, iy + 1.35, iz + 2.4));
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.5, 1.2) });
    for (const x of [-5, 5]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.6), glow); w.position.set(ix + x, iy + 3.4, iz + 4.98); w.rotation.y = Math.PI; w.layers.set(NOINK); R.add(w); }
    { // crowned Swedish arms over the bench
      const arms = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshLambertMaterial({ map: flagSE(false) }));
      arms.position.set(ix, iy + 4.6, iz + 4.97); arms.rotation.y = Math.PI; R.add(arms);
    }

    // ---- the lake (golden): a shore ring with reeds and trees, a little jetty ----
    const [lx, , lz] = LAKE;
    b.add(disc(36, 300, 0.35, 4), grass, new THREE.Matrix4().makeTranslation(lx, 0, lz));
    b.add(disc(32, 36, 0.2, 2), sand, new THREE.Matrix4().makeTranslation(lx, 0, lz));
    for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2 + 0.2; prop(b, kit, ["tree_oak", "tree_cone", "tree_fat", "tree_default"][i % 4], lx + Math.cos(a) * (44 + (i % 3) * 7), 0.35, lz + Math.sin(a) * (44 + (i % 3) * 7), 9 + (i % 4) * 2, i * 11); }
    b.add(boxGeo(V(lx - 22, 0.3, lz + 30), V(lx - 19, 0.55, lz + 37), 1), planks);
    const canoeM = lam("canoe", () => ({ color: "#c8632f" }));
    const cm = new THREE.Mesh(canoeGeo(4.6, 0.95, 0.38), twoTone(new THREE.MeshLambertMaterial({ color: "#c8632f", side: THREE.DoubleSide }))); void canoeM;
    cm.castShadow = true; cm.receiveShadow = true; this.canoe.add(cm); R.add(this.canoe);

    // ---- the cut-through ship in its aquarium (day diagram) ----
    this.buildSection();
    R.add(this.section);

    // ---- 1961: pontoons and crane barges at the harbour wreck site ----
    const pont = lam("pontoon", () => ({ color: "#4a5560" }));
    const crane = lam("crane", () => ({ color: "#e0a52a" }));
    for (const s of [1, -1]) {
      this.salvage.add(new THREE.Mesh(boxGeo(V(-20, -0.8, s * 9.2 - 1.8), V(20, 1.2, s * 9.2 + 1.8), 2, true), pont));
      for (const x of [-12, 0, 12]) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 12, 8), crane);
        arm.position.set(x, 6, s * 7.6); arm.rotation.x = s * 0.45; this.salvage.add(arm);
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 10, 5), dark);
        cable.position.set(x, 6.5, s * 5.2); this.salvage.add(cable);
      }
    }
    this.salvage.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    R.add(this.salvage);

    // ---- the museum hall: floor, walls, dark ceiling, the cradle, a rail ----
    const [mx, my, mz] = MUSEUM;
    b.add(quadUp(mx - 400, mx + 400, mz - 400, mz + 400, 200, 200, my), lam("museumFloor", () => ({ color: "#6a6470" })));
    b.add(quad(V(mx - 400, -3, mz - 400), V(mx + 400, -3, mz - 400), V(mx + 400, my, mz - 400), V(mx - 400, my, mz - 400)), quayStone);
    const hall = new Batch(), hm = lam("hallWall", () => ({ map: rep(hallTex(), 8, 3), side: THREE.DoubleSide }));
    const H = 44;
    hall.add(quad(V(mx - 55, my, mz + 40), V(mx + 55, my, mz + 40), V(mx + 55, my + H, mz + 40), V(mx - 55, my + H, mz + 40)), hm);
    hall.add(quad(V(mx + 55, my, mz + 40), V(mx + 55, my, mz - 60), V(mx + 55, my + H, mz - 60), V(mx + 55, my + H, mz + 40)), hm);
    hall.add(quad(V(mx - 55, my, mz - 60), V(mx - 55, my, mz + 40), V(mx - 55, my + H, mz + 40), V(mx - 55, my + H, mz - 60)), hm);
    hall.add(quad(V(mx - 55, my, mz - 60), V(mx + 55, my, mz - 60), V(mx + 55, my + H, mz - 60), V(mx - 55, my + H, mz - 60)).scale(1, 1, 1), hm);
    hall.add(quad(V(mx - 55, my + H, mz + 40), V(mx + 55, my + H, mz + 40), V(mx + 55, my + H, mz - 60), V(mx - 55, my + H, mz - 60)), lam("hallCeil", () => ({ color: "#2e2a34", side: THREE.DoubleSide })));
    hall.build(R, false);
    for (const x of [-16, -6, 4, 14]) b.add(boxGeo(V(mx + x - 1.2, my, mz - 2.5), V(mx + x + 1.2, my + 0.9, mz + 2.5)), dark); // cradle
    for (let x = -30; x <= 30; x += 3) for (const z of [-9, 9]) b.add(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), lam("rail", () => ({ color: "#c9c4cc" })), new THREE.Matrix4().makeTranslation(mx + x, my + 0.5, mz + z));
    for (const z of [-9, 9]) b.add(boxGeo(V(mx - 30, my + 0.95, mz + z - 0.04), V(mx + 30, my + 1.03, mz + z + 0.04)), lam("rail", () => ({ color: "#c9c4cc" })));
    for (const x of [-40, -20, 0, 20, 40]) { const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.9, 1.4) })); lamp.position.set(mx + x, my + H - 1, mz - 15); lamp.layers.set(NOINK); R.add(lamp); }

    b.build(R);
    // small rowing boats in the harbour
    const boatM = twoTone(new THREE.MeshLambertMaterial({ color: "#a8724a", side: THREE.DoubleSide }));
    for (const [x, z, yaw] of [[28, -5, 0.3], [-30, 9, -0.6], [55, 20, 1.2], [-55, -4, 0.1]] as const) {
      const bt = new THREE.Mesh(canoeGeo(5, 1.6, 0.6), boatM); bt.position.set(x, 0.12, z); bt.rotation.y = yaw + Math.PI / 2; bt.castShadow = true; R.add(bt);
    }
    R.add(this.ship.root);
  }

  /** the midship section: an extruded hull shell, two gun decks with cannons run out, a little pile of ballast stones,
   *  floating in a glass-fronted water tank so the part under the waterline shows */
  private buildSection() {
    const S = this.section, x = 2, y0 = -4.6, y1 = 6.3, n = 24, th = 0.4, depth = 4;
    const pts: THREE.Vector2[] = [];
    for (let j = n; j >= 0; j--) { const y = y0 + ((y1 - y0) * j) / n; pts.push(new THREE.Vector2(-halfBeam(x, y), y)); }
    for (let j = 0; j <= n; j++) { const y = y0 + ((y1 - y0) * j) / n; pts.push(new THREE.Vector2(halfBeam(x, y), y)); }
    const inner: THREE.Vector2[] = [];
    for (let j = n; j >= 0; j--) { const y = y0 + th + ((y1 - y0 - th) * j) / n; inner.push(new THREE.Vector2(Math.max(0.05, halfBeam(x, y) - th), y)); }
    for (let j = 0; j <= n; j++) { const y = y0 + th + ((y1 - y0 - th) * j) / n; inner.push(new THREE.Vector2(-Math.max(0.05, halfBeam(x, y) - th), y)); }
    const shell = new THREE.Shape([...pts, ...inner]);
    const sg = new THREE.ExtrudeGeometry(shell, { depth, bevelEnabled: false }); sg.translate(0, 0, -depth / 2);
    const hullM = twoTone(new THREE.MeshLambertMaterial({ color: "#8a5a33" }));
    const back = new THREE.ShapeGeometry(new THREE.Shape(inner.map((p) => p.clone()))); back.translate(0, 0, depth / 2 - 0.05);
    const inside = lam("sectionIn", () => ({ color: "#6a4428" }));
    const add = (g: THREE.BufferGeometry, m: THREE.Material) => { const mm = new THREE.Mesh(g, m); mm.castShadow = true; mm.receiveShadow = true; S.add(mm); return mm; };
    add(sg, hullM); add(back, inside);
    const deckM = lam("planksHD", () => ({ map: planksHD() }));
    for (const dy of [1.15, 3.35, 5.2]) { const w = halfBeam(x, dy) - th; add(boxGeo(V(-w, dy - 0.18, -depth / 2), V(w, dy, depth / 2)), deckM); }
    const bronze = twoTone(new THREE.MeshPhongMaterial({ color: "#9c7038", specular: "#e0c080", shininess: 50 }), 0.3);
    const carriage = lam("carriage", () => ({ color: "#7a3a2a" }));
    for (const dy of [1.15, 3.35]) for (const s of [-1, 1]) {
      const w = halfBeam(x, dy + 0.6);
      const gun = new THREE.CylinderGeometry(0.2, 0.28, 2.9, 12); gun.rotateZ(Math.PI / 2); gun.translate(s * (w - 0.9), dy + 0.62, -0.4);
      add(gun, bronze);
      add(boxGeo(V(s * (w - 0.9) - 0.7, dy, -0.85), V(s * (w - 0.9) + 0.7, dy + 0.45, 0.05)), carriage);
    }
    const stone = lam("ballast", () => ({ color: "#9a948c" }));
    for (const [sx, sy, r] of [[-0.4, -4.05, 0.32], [0.15, -4.1, 0.28], [0.55, -4.0, 0.3], [-0.05, -3.75, 0.26], [0.35, -3.72, 0.22]] as const)
      add(new THREE.IcosahedronGeometry(r, 1).translate(sx, sy, -1.2), stone);
    // water tank: glass front just in front of the cut face, opaque deep back and floor, a water top behind the face
    const tank = new THREE.Group();
    const front = new THREE.Mesh(new THREE.PlaneGeometry(120, 14).translate(0, -7, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color("#2a8fd0"), transparent: true, opacity: 0.42, depthWrite: false }));
    front.position.z = -depth / 2 - 0.06; front.renderOrder = 3; front.layers.set(NOINK); tank.add(front);
    const deep = new THREE.MeshBasicMaterial({ color: new THREE.Color("#17507e") });
    const bk = new THREE.Mesh(new THREE.PlaneGeometry(120, 14).translate(0, -7, 0), deep); bk.position.z = 50; bk.rotation.y = Math.PI; tank.add(bk);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(120, 52), lam("seabed", () => ({ color: "#c9b27a" }))); fl.rotation.x = -Math.PI / 2; fl.position.set(0, -14, 24); fl.receiveShadow = true; tank.add(fl);
    tank.position.set(...CUTAWAY);
    this.root.add(tank);
    this.sectionTop = new THREE.Mesh(quadUp(-60, 60, -depth / 2 - 0.06, 60, 1, 1, 0), this.waterM);
    this.sectionTop.position.set(CUTAWAY[0], 0, CUTAWAY[2]);
    this.root.add(this.sectionTop);
  }
  private sectionTop!: THREE.Mesh;
  private waterM!: THREE.Material;

  /** camera-relative sun, frozen per shot */
  private shotSun(id: number, s: ShotDef, L: LightPreset) {
    let v = this.sunCache.get(id);
    if (v) return v;
    let fx = 0, fz = 0;
    for (let f = s.a; f < s.b; f += 3) {
      const c = camAt(id, f), x = c.look[0] - c.pos[0], z = c.look[2] - c.pos[2], n = Math.hypot(x, z) || 1;
      fx += x / n; fz += z / n;
    }
    const n = Math.hypot(fx, fz) || 1; fx /= n; fz /= n;
    const az = THREE.MathUtils.degToRad(s.sunAz ?? SUN_SHOT[id]?.az ?? L.az), el = THREE.MathUtils.degToRad(s.sunEl ?? SUN_SHOT[id]?.el ?? L.el);
    const hx = fx * Math.cos(az) - fz * Math.sin(az), hz = fz * Math.cos(az) + fx * Math.sin(az);
    v = new THREE.Vector3(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)).normalize();
    this.sunCache.set(id, v);
    return v;
  }
  private actor(i: number) { while (this.actors.length <= i) this.actors.push(new Actor(this.root)); return this.actors[i]; }
  private fx(i: number) { while (this.fxs.length <= i) this.fxs.push(new Fx(this.root)); return this.fxs[i]; }

  update(id: number, f: number, cam: THREE.PerspectiveCamera, scene: THREE.Scene) {
    const t = f / FPS, s = SHOTS[id - 1], L = LIGHTS[s.light], K = LOOK[s.light];
    // ---- the ship first (the deck cameras ride on her) ----
    const pose = shipPose(id, t);
    this.ship.update(pose, t);
    this.salvage.visible = id === 11;
    // ---- camera ----
    const c = camAt(id, f);
    if (c.onShip) {
      const p = this.ship.toWorld(c.pos), l = this.ship.toWorld(c.look);
      const up = V(0, 1, 0).applyQuaternion(this.ship.body.getWorldQuaternion(new THREE.Quaternion()));
      cam.position.copy(p); cam.up.copy(up); cam.lookAt(l); cam.rotateZ(c.roll);
    } else {
      cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ(c.roll);
    }
    cam.fov = c.fov; cam.near = 0.2; cam.far = 1500; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const focus = c.onShip ? this.ship.toWorld(c.look) : V(...c.look), dist = cam.position.distanceTo(focus);
    cam.layers.enable(NOINK);
    // ---- light rig ----
    const sunDir = this.shotSun(id, s, L);
    this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI;
    let Rr = THREE.MathUtils.clamp(dist * 1.15 + 7, 12, 110);
    if (s.light === "golden") Rr = Math.max(Rr, 30);
    if (id === 2 || id === 7 || id === 1 || id === 11 || id === 12) Rr = Math.max(Rr, 60); // the whole ship + crowd
    this.sun.position.copy(focus).addScaledVector(sunDir, 260); this.sun.target.position.copy(focus);
    const sc = this.sun.shadow.camera;
    sc.left = -Rr; sc.right = Rr; sc.top = Rr; sc.bottom = -Rr; sc.near = 20; sc.far = 560; sc.updateProjectionMatrix();
    this.sun.shadow.bias = L.bias; this.sun.shadow.normalBias = L.normalBias * (Rr / 12);
    TONE.uLitCol.value.set(...L.lit); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
    TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term; TONE.uBounce.value.set(...K.bounce); TONE.uSat.value = K.sat;
    CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad;
    CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
    // ---- sky, fog, sun, clouds ----
    const su = this.skyMat.uniforms;
    K.sky.c.forEach((h, i) => untone(h, su["c" + i].value));
    const e = K.sky.e.map((deg) => THREE.MathUtils.degToRad(deg));
    su.e.value.set(e[1], e[2], e[3], e[4]);
    this.sky.position.copy(cam.position);
    untone(L.fog, this.fog.color);
    const indoor = s.set === "inquiry" || s.set === "museum";
    this.fog.near = indoor ? 200 : L.fogNear; this.fog.far = indoor ? 900 : L.fogFar;
    scene.fog = this.fog; scene.background = null;
    const showSun = s.light === "golden";
    this.sunDisc.visible = this.sunHalo.visible = showSun;
    if (showSun) {
      this.sunDisc.position.copy(cam.position).addScaledVector(sunDir, 900);
      this.sunDisc.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(1.7)));
      this.sunHalo.position.copy(this.sunDisc.position); this.sunHalo.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(24)));
      (this.sunHalo.material as THREE.SpriteMaterial).color.set(L.sunDisc).multiplyScalar(1.3);
    }
    for (let i = 0; i < this.clouds.length; i++) {
      const m = this.clouds[i], mat = m.material as THREE.MeshBasicMaterial;
      const a = (i / this.clouds.length) * Math.PI * 2 + 0.3, d = 640 + (i % 3) * 60, w = 140 + (i % 4) * 34;
      m.position.set(cam.position.x + Math.cos(a) * d, 130 + (i % 4) * 40, cam.position.z + Math.sin(a) * d); m.scale.set(w, w / 2, 1);
      m.lookAt(cam.position.x, m.position.y, cam.position.z);
      mat.map = this.cloudMaps[s.light][i % 4];
    }
    const W_ = this.WU, wc = K.water;
    untone(wc.near, W_.wNearC.value); untone(wc.mid, W_.wMidC.value); untone(wc.far, W_.wFarC.value);
    untone(wc.crest, W_.wCrest.value); untone(wc.trough, W_.wTrough.value); untone(wc.glint, W_.wGlint.value);
    W_.wShade.value.set(...wc.shade); W_.wTime.value = t;
    // ---- props that move ----
    for (const fl of this.flags) {
      const p = fl.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) { const u = (i % 13) / 12; p.setZ(i, 0.25 * u * Math.sin(t * 5 - u * 5)); }
      p.needsUpdate = true;
    }
    const cp = canoePose(id === 9 ? t : 0);
    this.canoe.position.set(LAKE[0], 0.12 - 0.25 * cp.over + 0.02 * Math.sin(t * 2), LAKE[2]);
    this.canoe.rotation.set(0, 0.45, 0); this.canoe.rotateZ(cp.roll);
    this.section.position.set(...CUTAWAY);
    this.section.rotation.set(0, 0, 0.1 * Math.sin(t * 1.4) + 0.06 * Math.sin(t * 0.6));
    // ---- cast + effects ----
    const right = V(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 0);
    const ctx: ShipCtx = {
      toW: (p: V3) => this.ship.toWorld(p), heel: pose.heel, xAxis: V(Math.cos(pose.yaw), 0, -Math.sin(pose.yaw)), ports: [],
    };
    const st = stage(id, t, { pos: cam.position, right, sun: sunDir }, ctx);
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const tint = s.light === "golden" ? "#ffcf9e" : "#ffffff";
    let ai = 0;
    const used: Actor[] = [];
    for (const p of st.places) {
      const sc2 = p.scale ?? 1;
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y + 1.1 * sc2, p.z), 3.5))) continue;
      const a = this.actor(ai++);
      const [w, h, k] = p.size ?? [300, 500, 0.5];
      a.r = this.pool.req(p.key, w, h, k, p.draw);
      a.mesh.visible = true;
      a.mesh.position.set(p.x, p.y, p.z);
      a.mesh.rotation.set(0, p.yaw ?? Math.atan2(cam.position.x - p.x, cam.position.z - p.z), p.roll ?? 0);
      a.mesh.scale.set(p.mirror ? -sc2 : sc2, sc2, sc2);
      if (a.mat.emissiveMap) a.mat.emissive.set(tint);
      a.mesh.castShadow = L.actorShadow;
      used.push(a);
    }
    for (let i = ai; i < this.actors.length; i++) this.actors[i].mesh.visible = false;
    let fi = 0;
    const fused: Fx[] = [];
    for (const p of st.fx) {
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y, p.z), Math.max(p.w, p.h)))) continue;
      const e2 = this.fx(fi++);
      e2.r = this.pool.req(p.key, p.cw, p.ch, 1, p.draw);
      e2.use(!!p.soft);
      e2.mesh.visible = true;
      e2.mesh.position.set(p.x, p.y, p.z);
      if (p.flat) e2.mesh.rotation.set(-Math.PI / 2, 0, p.rot ?? 0);
      else { e2.mesh.quaternion.copy(cam.quaternion); e2.mesh.rotateZ(p.rot ?? 0); }
      e2.mesh.scale.set(p.w, p.h, 1);
      fused.push(e2);
    }
    for (let i = fi; i < this.fxs.length; i++) this.fxs[i].mesh.visible = false;
    this.pool.flush();
    for (const a of used) a.bind();
    for (const e2 of fused) e2.bind();
    void W; void smooth;
    return focus;
  }
}

const WATER_DECL = `#include <common>
varying vec3 vWP;
uniform vec3 wNearC, wMidC, wFarC, wCrest, wTrough, wGlint, wShade;
uniform sampler2D wNearTex, wFarTex;
uniform float wTime;`;
const WATER_COL = `
  vec3 wV = vWP - cameraPosition;
  float wd = length(wV);
  float wDep = asin(clamp(-wV.y / wd, 0.0, 1.0));
  float wf = 1.0 - smoothstep(0.0, 0.42, wDep);
  vec3 wc = mix(mix(wNearC, wMidC, smoothstep(0.0, 0.55, wf)), wFarC, smoothstep(0.55, 1.0, wf));
  vec2 wp = vWP.xz + vec2(0.18 * wTime, 0.05 * wTime);
  vec4 mk = mix(texture2D(wNearTex, wp / 8.0), texture2D(wFarTex, wp / 40.0 + 0.37), smoothstep(25.0, 90.0, wd));
  wc = mix(wc, wTrough, mk.g * 0.6);
  wc = mix(wc, wCrest, mk.r * 0.7);
  wc = mix(wc, wGlint, mk.b * (0.3 + 0.5 * wf));
  diffuseColor.rgb = wc;`;
void Pen;
