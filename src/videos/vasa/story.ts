// "The Ship That Couldn't Sit Still": the timeline. Every shot, camera key, reaction and effect is anchored to a
// word of the narration (words.json, from the voice recording), so a new recording re-times the whole film by
// replacing that one file. Camera grammar (from the bridge short / motion report): hard cuts on big reframes,
// smootherstep glides of 18-40 f, every hold creeps in, flip-sign impact kicks over 7 f, 4-5 deg rolls on emphasis.
import WORDS from "./words.json";

export const FPS = 30;
export type V3 = [number, number, number];
export const D0 = 1.8; // quay / land top above the water (m)
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 4;
export const easeIn = (u: number) => clamp01(u) ** 2;

// ---------------- words ----------------
type Word = { word: string; start: number; end: number };
const LIST: Word[] = (WORDS as unknown as { words: Word[] }).words;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9']/g, "");
/** start time (s) of the n-th occurrence (1-based) of a word; throws on a typo so a bad anchor never fails silently */
export const W = (word: string, n = 1): number => {
  const k = norm(word);
  let c = 0;
  for (const w of LIST) if (norm(w.word) === k && ++c === n) return w.start;
  throw new Error(`story: word "${word}" #${n} not in words.json`);
};
export const WE = (word: string, n = 1): number => {
  const k = norm(word);
  let c = 0;
  for (const w of LIST) if (norm(w.word) === k && ++c === n) return w.end;
  throw new Error(`story: word "${word}" #${n} not in words.json`);
};
/** reactions land 0-3 frames before their word */
export const LEAD = 2;
/** frame of a word (with the reaction lead) */
export const FW = (word: string, n = 1) => Math.max(0, Math.round(W(word, n) * FPS) - LEAD);
export const TOTAL = Math.round((LIST[LIST.length - 1].end + 0.5) * FPS);

// ---------------- ship physics (t = film time in s) ----------------
// The voyage: she leaves the quay on "makes", a gust on "gust", leans on "leans", water at the ports on "water",
// capsizes and sinks on "down". The stability test: three runs across the deck, each roll bigger, stopped on "stopped".
export type ShipPose = { pos: V3; yaw: number; heel: number; pitch: number; ports: number; sails: number; billow: number; masts: boolean; wake: number };
const T_SAIL = () => W("makes");
const T_GUST = () => W("gust");
const T_LEAN = () => W("leans");
const T_WATER = () => W("water");
const T_DOWN = () => W("down", 2);
const QUAY: V3 = [0, 0, 0];
/** voyage: x position along the harbour (she sails toward +x, about 2.4 m/s on screen) */
const voyX = (t: number) => QUAY[0] + Math.max(0, t - T_SAIL()) * 2.4;
export const voyage = (t: number): ShipPose => {
  const g = smooth((t - T_GUST()) / 0.6), l = smooth((t - T_LEAN() + 0.2) / 1.2), w = smooth((t - T_WATER()) / 1.5);
  const d = clamp01((t - T_DOWN() + 0.1) / 2.6);
  // a first lean on the gust, she half rights herself, then the second gust takes her over
  const first = 0.16 * g * (1 - 0.5 * smooth((t - T_GUST() - 0.7) / 0.8));
  const heel = first + 0.32 * l + 0.14 * w + 0.75 * easeIn(d);
  const sink = -13 * easeIn(d) - 1.2 * w;
  return { pos: [voyX(t), sink, QUAY[2]], yaw: 0, heel, pitch: 0.12 * easeIn(d), ports: 1, sails: 1, billow: 0.4 + 0.6 * g, masts: true, wake: t > T_SAIL() ? 1 : 0 };
};
/** the stability test at the quay: sailors at z = runZ(t) across the deck; the heel follows their weight with a lag */
export const RUNS = () => [W("ran"), W("back"), W("third")];
export const STOP = () => W("stopped");
export const runZ = (t: number) => {
  const [a, b, c] = RUNS(), st = STOP();
  if (t < a) return -3.6;
  if (t < b) return -3.6 + 7.2 * smooth((t - a) / 1.0);
  if (t < c) return 3.6 - 7.2 * smooth((t - b) / 1.0);
  return -3.6 + 4.2 * smooth((t - c) / 0.8) - (t > st ? 0.4 * smooth((t - st) / 0.3) : 0); // skids to a stop on "stopped"
};
export const testPose = (t: number): ShipPose => {
  const [a, b, c] = RUNS();
  // driven, damped roll: each run tips her further toward the side the crowd ran to
  const kick = (t0: number, amp: number) => (t < t0 ? 0 : amp * Math.sin(Math.min(Math.PI / 2, (t - t0) * 1.6)) * Math.exp(-Math.max(0, t - t0 - 1) * 0.35));
  const heel = kick(a, 0.09) - kick(b, 0.16) + kick(c, 0.24) + 0.02 * Math.sin(t * 1.3);
  return { pos: [QUAY[0], 0, QUAY[2]], yaw: 0, heel, pitch: 0, ports: 0, sails: 0, billow: 0, masts: true, wake: 0 };
};
const moored = (t: number, ports = 0): ShipPose => ({ pos: [...QUAY], yaw: 0, heel: 0.012 * Math.sin(t * 0.9), pitch: 0.004 * Math.sin(t * 0.7), ports, sails: 0, billow: 0, masts: true, wake: 0 });

// ---------------- shots ----------------
export type Light = "day" | "golden";
export type SetId = "harbour" | "king" | "inquiry" | "lake" | "cutaway" | "museum";
export type ShotDef = { id: number; a: number; b: number; light: Light; set: SetId; sunAz?: number; sunEl?: number };
const s = (id: number, a: number, b: number, light: Light, set: SetId, extra: Partial<ShotDef> = {}): ShotDef => ({ id, a, b, light, set, ...extra });
const cuts = () => [0, FW("Stockholm"), FW("But"), FW("ship", 1), FW("third"), FW("king"), FW("makes"), FW("Luckily"), FW("see"), FW("Vasa", 2), FW("Three"), FW("Today"), TOTAL];
export const SHOTS: ShotDef[] = (() => {
  const c = cuts();
  return [
    s(1, c[0], c[1], "day", "harbour"),     // hook
    s(2, c[1], c[2], "day", "harbour"),     // setting: town, cannons, statues, lion, crowd
    s(3, c[2], c[3], "day", "harbour"),     // the test, first run (on deck)
    s(4, c[3], c[4], "day", "harbour"),     // rolled / ran back / rolled further
    s(5, c[4], c[5], "day", "harbour"),     // third run, admiral, "launched it anyway"
    s(6, c[5], c[6], "golden", "king"),     // the king at war
    s(7, c[6], c[7], "day", "harbour"),     // voyage, gust, sinking
    s(8, c[7], c[8], "day", "inquiry"),     // inquiry + portrait
    s(9, c[8], c[9], "golden", "lake"),     // canoe analogy
    s(10, c[9], c[10], "day", "cutaway"),   // why: cannons up high, stones down low
    s(11, c[10], c[11], "day", "harbour"),  // salvage 1961
    s(12, c[11], c[12], "day", "museum"),   // museum, finally still
  ];
})();
/** crossfades (frames) at place / time changes; a white flash after the hook */
export const XFADE: Record<number, number> = { 3: 8, 6: 8, 7: 8, 8: 8, 9: 8, 10: 6, 11: 8, 12: 8 };
export const FLASH_AT = SHOTS[1].a;
export const shotAt = (f: number) => SHOTS.find((x) => f >= x.a && f < x.b) ?? SHOTS[SHOTS.length - 1];
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const x of SHOTS) {
    const n = XFADE[x.id];
    if (n && f >= x.a - n / 2 && f < x.a + n / 2) return [{ id: x.id - 1, alpha: 1 }, { id: x.id, alpha: (f - (x.a - n / 2) + 1) / (n + 1) }];
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};

/** where the ship is, per shot. Each crossfade layer is its own world, so one ship model serves every set. */
export const MUSEUM: V3 = [900, D0, 0];
export const SALVAGE_T = () => W("pulled");
export const shipPose = (id: number, t: number): ShipPose => {
  switch (id) {
    case 1: { // hook: a flash-forward of the voyage, from sailing proud to tipping on "sank"
      const k = t < W("sank") ? 0 : smooth((t - W("sank")) / 1.4);
      return { ...voyage(T_SAIL() + 6), heel: 0.02 + 0.55 * k, pos: [voyX(T_SAIL() + 6) + 2.4 * t, -1.0 * k, 0], billow: 0.6 };
    }
    case 2: return moored(t, smooth((t - W("cannons") + 0.6) / 0.8));
    case 3: case 4: case 5: return testPose(t);
    case 7: return voyage(t);
    case 11: { // raised in 1961: the hull alone (no masts), rising out of the water between two pontoons
      const u = smooth((t - SALVAGE_T() + 1.2) / 2.2);
      return { pos: [0, -6.5 + 6.2 * u, 0], yaw: 0, heel: 0.05 * (1 - u), pitch: 0.03 * (1 - u), ports: 0, sails: 0, billow: 0, masts: false, wake: 0 };
    }
    case 12: return { pos: [MUSEUM[0], D0 + 4.75, MUSEUM[2]], yaw: 0, heel: 0, pitch: 0, ports: 0, sails: 0, billow: 0, masts: true, wake: 0 };
    default: return { pos: [0, -60, 0], yaw: 0, heel: 0, pitch: 0, ports: 0, sails: 0, billow: 0, masts: false, wake: 0 };
  }
};

// ---------------- camera ----------------
export type Cam = { pos: V3; look: V3; fov: number; roll: number; onShip?: boolean };
type Shot = Partial<Cam> & { pos: V3; look: V3 };
type Key = { f: number; dur?: number; cut?: boolean; s: (f: number) => Shot };
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };
const mixCam = (a: Cam, b: Cam, k: number): Cam => ({
  pos: a.pos.map((v, i) => v + (b.pos[i] - v) * k) as V3, look: a.look.map((v, i) => v + (b.look[i] - v) * k) as V3,
  fov: a.fov + (b.fov - a.fov) * k, roll: a.roll + (b.roll - a.roll) * k, onShip: k < 0.5 ? a.onShip : b.onShip,
});
const full = (c: Shot): Cam => ({ fov: 40, roll: 0, ...c });
const run = (keys: Key[], f: number) => {
  let cur = full(keys[0].s(f));
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.f) break;
    cur = k.cut ? full(k.s(f)) : mixCam(cur, full(k.s(f)), glide((f - k.f) / (k.dur ?? 24)));
  }
  return cur;
};
const T = (f: number) => f / FPS;
/** push-in factor since f0: ~rate per frame; `punch` raises it for the first n frames (8 f soft edges) */
const pushK = (f: number, f0: number, rate: number, punch = 0, n = 35) => {
  const x = Math.max(0, f - f0);
  let sum = rate * x;
  if (punch > rate) for (let i = 0; i < Math.min(x, n); i++) sum += (punch - rate) * Math.max(0, Math.min(1, (i + 0.5) / 8, (n - i - 0.5) / 8));
  return Math.exp(-sum);
};
const dolly = (pos: V3, look: V3, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos: [look[0] + (pos[0] - look[0]) * k, look[1] + (pos[1] - look[1]) * k, look[2] + (pos[2] - look[2]) * k], look, ...rest });
const zoom = (pos: V3, look: V3, fov: number, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos, look, fov: (360 / Math.PI) * Math.atan(Math.tan((fov * Math.PI) / 360) * k), ...rest });
const rolled = (sh: (f: number) => Shot, roll: number) => (f: number): Shot => ({ ...sh(f), roll });
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** follow the ship along x during the voyage */
const sx = (id: number, f: number) => shipPose(id, T(f)).pos[0];

// set origins (world.ts builds each set around these)
export const KING: V3 = [-900, D0, 0];
export const INQUIRY: V3 = [0, D0, 900];
export const LAKE: V3 = [0, 0, -1100];
export const CUTAWAY: V3 = [600, 0, -600];
// the ship model: bow toward +x, stern castle at x ~ -21, main deck at y ~ 5.2, hull beam 11.7 m (z +-5.85)
export const DECK_Y = 5.2;
export const LION: V3 = [26.5, 5.6, 0];
export const STERN: V3 = [-23, 11, 0];

const CAMS = (): Record<number, Key[]> => {
  const k = (w: string, n = 1) => FW(w, n);
  return {
    1: [
      // hook: low on the water under the bow, the golden lion above, pushing in
      { f: 0, s: (f) => { const x = sx(1, f); return dolly([x + 44, 1.6, 21], [x + 19, 10, 0], pushK(f, 0, 0.003), { fov: 44, roll: -0.03 }); } },
      // "sank": cut wide, broadside, she tips (flash-forward)
      { f: k("sank"), cut: true, s: (f) => { const x = sx(1, f); return dolly([x + 6, 6, 62], [x + 2, 9, 0], pushK(f, k("sank"), 0.0025, 0.006, 30), { fov: 44 }); } },
      { f: k("harbour") - 6, dur: 20, s: (f) => { const x = sx(1, f); return dolly([x + 6, 6, 62], [x + 2, 8, 0], pushK(f, k("sank"), 0.0035), { fov: 44, roll: 0.07 }); } },
    ],
    2: [
      // "Stockholm": the harbour from above the water, the town on the quay behind the moored ship
      { f: k("Stockholm"), s: (f) => zoom([62, 26, 70], [-6, 6, -40], 46, pushK(f, k("Stockholm"), 0.0018)) },
      // "sixty-four bronze cannons": the gun ports open, close on the hull side
      { f: k("sixtyfour"), cut: true, s: (f) => dolly([6, 3.2, 17], [2, 3.4, 5.8], pushK(f, k("sixtyfour"), 0.003, 0.006, 30), { fov: 40, roll: 0.03 }) },
      // "hundreds of painted statues": glide up the carved stern
      { f: k("hundreds"), cut: true, s: (f) => dolly([-36, 9, 16], STERN, pushK(f, k("hundreds"), 0.0025), { fov: 40 }) },
      { f: k("statues") - 10, dur: 26, s: (f) => dolly([-34, 14, 10], add(STERN, [0, 3, 0]), pushK(f, k("statues"), 0.0025), { fov: 38, roll: -0.04 }) },
      // "a golden lion on the front": the figurehead
      { f: k("golden"), cut: true, s: (f) => dolly([33, 6.6, 7], LION, pushK(f, k("golden"), 0.003, 0.007, 30), { fov: 36 }) },
      // "The whole city came down to wave": the crowd on the quay, the ship behind them
      { f: k("whole"), cut: true, s: (f) => dolly([10, D0 + 1.7, -30], [4, D0 + 1.6, -17], pushK(f, k("whole"), 0.0025), { fov: 42 }) },
    ],
    3: [
      // "But weeks earlier, there'd been a test": on deck (camera rides the ship), the admiral and his sailors
      { f: k("But"), s: (f) => dolly([-8.6, DECK_Y + 1.9, 1.6], [2, DECK_Y + 1.3, 0], pushK(f, k("But"), 0.002), { fov: 46, onShip: true }) },
      // "Thirty sailors ran from one side of the deck to the other": high on the stern, looking forward, the crowd runs across
      { f: k("Thirty"), cut: true, s: (f) => dolly([-19, 17.2, 3.0], [1.5, DECK_Y + 0.6, -0.4], pushK(f, k("Thirty"), 0.002), { fov: 48, onShip: true }) },
    ],
    4: [
      // "The ship rolled": outside, bow-on from the water, the whole ship tips
      { f: k("ship", 1), s: (f) => dolly([50, 4.5, 34], [-2, 9, 0], pushK(f, k("ship", 1), 0.002), { fov: 44 }) },
      // "They ran back": back on deck
      { f: k("back"), cut: true, s: (f) => dolly([-19, 17.2, 3.0], [1.5, DECK_Y + 0.6, -0.4], pushK(f, k("back"), 0.0025), { fov: 46, onShip: true }) },
      // "It rolled further": outside again, closer, with a roll
      { f: k("rolled", 2) - 6, cut: true, s: (f) => dolly([36, 3.2, 30], [-2, 10, 0], pushK(f, k("rolled", 2), 0.003, 0.006, 30), { fov: 44, roll: 0.06 }) },
    ],
    5: [
      // "On the third run": the deck, the crowd running again
      { f: k("third"), s: (f) => dolly([-19, 17.2, 3.0], [1.5, DECK_Y + 0.6, -0.4], pushK(f, k("third"), 0.003), { fov: 46, onShip: true }) },
      // "the admiral stopped them": close on the admiral, hand up
      { f: k("admiral"), cut: true, s: (f) => dolly([-6.2, DECK_Y + 1.75, -0.6], [-2.5, DECK_Y + 1.7, 0.4], pushK(f, k("admiral"), 0.003, 0.007, 25), { fov: 38, onShip: true, roll: -0.04 }) },
      // "So, naturally, they launched it anyway": the admiral, deadpan, square to camera
      { f: k("naturally") - 4, cut: true, s: (f) => dolly([-5.6, DECK_Y + 1.7, 0.4], [-2.5, DECK_Y + 1.65, 0.4], pushK(f, k("naturally"), 0.002, 0.006, 30), { fov: 36, onShip: true }) },
    ],
    6: [
      // "The king was busy fighting a war in Poland": golden field, smoke, the king tapping his foot
      { f: k("king") - 4, s: (f) => dolly(add(KING, [0, 1.7, -9]), add(KING, [0, 1.3, 0]), pushK(f, k("king"), 0.0025), { fov: 42 }) },
      { f: k("wanted") - 6, dur: 22, s: (f) => dolly(add(KING, [0.6, 1.8, -5.2]), add(KING, [0, 1.8, 0]), pushK(f, k("wanted"), 0.003), { fov: 38, roll: 0.05 }) },
    ],
    7: [
      // "She makes it thirteen hundred metres": high, ahead of her, sailing out past the crowds
      { f: k("makes"), s: (f) => { const x = sx(7, f); return dolly([x + 45, 28, 55], [x + 2, 6, 0], pushK(f, k("makes"), 0.002), { fov: 46 }); } },
      // "Then, a gust of wind": broadside, sails fill
      { f: k("gust") - 8, cut: true, s: (f) => { const x = sx(7, f); return dolly([x + 52, 9, 34], [x - 2, 16, 0], pushK(f, k("gust"), 0.0025), { fov: 50 }); } },
      // "She leans": lower, roll with her
      { f: k("leans"), dur: 26, s: (f) => { const x = sx(7, f); return dolly([x + 50, 5, 26], [x - 2, 12, 0], pushK(f, k("leans"), 0.003), { fov: 48, roll: 0.06 }); } },
      // "water rushes in through the cannon holes": close on the lower gun ports at the waterline
      { f: k("water"), cut: true, s: (f) => { const x = sx(7, f); return dolly([x + 10, 1.3, 14], [x + 1, 0.6, 5.2], pushK(f, k("water"), 0.003, 0.006, 30), { fov: 44, roll: 0.05 }); } },
      // "and down she goes": wide, the masts go under
      { f: k("down", 2) - 4, cut: true, s: (f) => { const x = sx(7, f); return dolly([x + 58, 10, 36], [x - 2, 8, 0], pushK(f, k("down", 2), 0.0025), { fov: 48 }); } },
    ],
    8: [
      // "Luckily, there was an inquiry to find out who was to blame": the hall, judges at the bench, the accused
      { f: k("Luckily"), s: (f) => dolly(add(INQUIRY, [0, 2.4, -9]), add(INQUIRY, [0, 1.6, 2]), pushK(f, k("Luckily"), 0.0022), { fov: 46 }) },
      { f: k("blame") - 8, dur: 24, s: (f) => dolly(add(INQUIRY, [1, 1.9, -5.5]), add(INQUIRY, [0, 2.0, 3.2]), pushK(f, k("blame"), 0.0025), { fov: 40 }) },
      // "Unluckily, the man who designed her": pan to his portrait, the candle in front
      { f: k("Unluckily") - 6, dur: 26, s: (f) => dolly(add(INQUIRY, [3.4, 2.6, 0.4]), add(INQUIRY, [6.9, 2.7, 3.2]), pushK(f, k("Unluckily"), 0.003, 0.006, 30), { fov: 38, roll: -0.04 }) },
    ],
    9: [
      // "You see, a ship is like a canoe. Sit down, and it's steady": golden lake, a kid in a canoe
      { f: k("see"), s: (f) => dolly(add(LAKE, [0.5, 1.1, -7]), add(LAKE, [0, 0.8, 0]), pushK(f, k("see"), 0.0022), { fov: 42 }) },
      // "Stand up, and one wave tips you over": a little wider, with a roll
      { f: k("Stand") - 6, dur: 22, s: (f) => dolly(add(LAKE, [1, 1.4, -8]), add(LAKE, [0, 1.2, 0]), pushK(f, k("Stand"), 0.0025), { fov: 44, roll: -0.05 }) },
    ],
    10: [
      // "The Vasa was standing up": the cut-through ship, rocking
      { f: k("Vasa", 2), s: (f) => dolly(add(CUTAWAY, [0, 6.5, -24]), add(CUTAWAY, [0, 5.5, 0]), pushK(f, k("Vasa", 2), 0.0022), { fov: 44 }) },
      // "two decks of heavy cannons up high"
      { f: k("decks") - 8, dur: 24, s: (f) => dolly(add(CUTAWAY, [0, 8.5, -13]), add(CUTAWAY, [0, 7.4, 0]), pushK(f, k("decks"), 0.003), { fov: 40 }) },
      // "and not nearly enough stones in the bottom"
      { f: k("stones") - 8, dur: 24, s: (f) => dolly(add(CUTAWAY, [0, 1.6, -11]), add(CUTAWAY, [0, 1.0, 0]), pushK(f, k("stones"), 0.003, 0.006, 30), { fov: 40, roll: 0.04 }) },
    ],
    11: [
      // "Three hundred and thirty-three years later, they pulled her up": the bare hull rises between pontoons
      { f: k("Three"), s: (f) => dolly([30, 5, 48], [0, 3, 0], pushK(f, k("Three"), 0.002), { fov: 44 }) },
    ],
    12: [
      // "Today she's the most visited museum in Scandinavia": the hall, tourists, the ship
      { f: k("Today"), s: (f) => dolly(add(MUSEUM, [26, 3.5, -34]), add(MUSEUM, [0, 9, 0]), pushK(f, k("Today"), 0.002), { fov: 46 }) },
      // "and she's finally sitting perfectly still": low, by a tourist, slow creep to the end
      { f: k("finally") - 8, cut: true, s: (f) => dolly(add(MUSEUM, [8, 2.2, -20]), add(MUSEUM, [0, 7, 0]), pushK(f, k("finally"), 0.0018), { fov: 42 }) },
    ],
  };
};
let CAMS_: Record<number, Key[]> | null = null;
const cams = () => (CAMS_ ??= CAMS());

// impact kicks: image offset flips sign every frame, decays over 7 f
const KICKS = (): [number, number][] => [[W("stopped"), 0.6], [W("down", 2) + 1.2, 1.2], [W("tips") + 0.4, 0.6], [W("Stand") + 0.1, 0.3]];
let KICKS_: [number, number][] | null = null;
export const kickAt = (t: number) => {
  let a = 0;
  for (const [t0, g] of (KICKS_ ??= KICKS())) {
    const n = Math.floor((t - t0) * FPS + 1e-6);
    if (n >= 0 && n < 7) a += g * (n % 2 ? -1 : 1) * (1 - n / 7) ** 1.5;
  }
  return a;
};
export const camAt = (id: number, f: number): Cam => {
  const c = run(cams()[id], f), a = kickAt(T(f));
  if (!a) return c;
  const d: V3 = [c.look[0] - c.pos[0], c.look[1] - c.pos[1], c.look[2] - c.pos[2]];
  const L = Math.hypot(...d), h = Math.hypot(d[0], d[2]) || 1;
  const m = (3 / 640) * Math.tan((c.fov * Math.PI) / 360) * L * a;
  return { ...c, look: [c.look[0] - (d[2] / h) * m, c.look[1] + 0.6 * m, c.look[2] + (d[0] / h) * m], roll: c.roll + a * 0.004 };
};

// ---------------- lens ----------------
/** cInf = blur-disc radius (px at 1080x1920) at infinity; 0 = sharp. Wides and establishing shots stay sharp. */
export type Dof = { f: number; dur?: number; cInf: number; focus?: (f: number) => V3 };
let DOF_: Dof[] | null = null;
const DOFS = (): Dof[] => [
  { f: 0, cInf: 12 }, // hook: the lion sharp, harbour soft
  { f: FW("sank"), cInf: 0 },
  { f: FW("Stockholm"), cInf: 0 }, // establishing
  { f: FW("sixtyfour"), cInf: 13 }, // gun ports
  { f: FW("hundreds"), cInf: 7 },
  { f: FW("golden"), cInf: 14 }, // lion CU
  { f: FW("whole"), cInf: 11 }, // crowd MS
  { f: FW("But"), cInf: 8 },
  { f: FW("Thirty"), cInf: 0 }, // running across the deck: readable
  { f: FW("admiral"), cInf: 13 }, // admiral CU
  { f: FW("king") - 4, cInf: 10 },
  { f: FW("makes"), cInf: 0 }, // voyage wides
  { f: FW("water"), cInf: 12 },
  { f: FW("down", 2) - 4, cInf: 0 },
  { f: FW("Luckily"), cInf: 7 },
  { f: FW("Unluckily") - 6, dur: 26, cInf: 13 },
  { f: FW("see"), cInf: 6 }, // golden lake
  { f: FW("Vasa", 2), cInf: 0 }, // cutaway: diagram, sharp
  { f: FW("Three"), cInf: 0 },
  { f: FW("finally") - 8, cInf: 8 },
];
export const dofAt = (f: number) => {
  const DOF = (DOF_ ??= DOFS());
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};
