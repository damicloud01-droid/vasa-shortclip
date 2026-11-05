# Original score for "The Ship That Couldn't Sit Still", composed and synthesized here (D major, 120 bpm, a
# pompous little naval march). Every section is anchored to a narration word (timeline.W), so it follows the voice:
# hook fanfare -> sad tuba on "sank" | Stockholm march | wobbling test music, a rising "whoop" per run, dead stop on
# "stopped" | deadpan ta-DAA after "anyway" | royal fanfare | the launch tutti, cut dead on "gust", suspense pad,
# sad tuba as she goes down | (near silence) solemn inquiry pad | music-box canoe waltz | plucky explainer |
# salvage rise -> grand march reprise ending on the last word.
import numpy as np
from dsp import SR, ns, rng, pan, place, dbg, make_ir, convolve_st, integrated, hp
import instruments as I
import timeline as T

W, WE = T.W, T.WE
N = ns(T.DUR)
Q = 0.5
F = I.m2f

# theme: (bar, beat, quarters, midi)
THEME = [
    (1, 0, 1, 74), (1, 1, .5, 78), (1, 1.5, .5, 76), (1, 2, 1, 74), (1, 3, 1, 69),
    (2, 0, 1, 71), (2, 1, .5, 74), (2, 1.5, .5, 76), (2, 2, 2, 78),
    (3, 0, 1, 79), (3, 1, .5, 78), (3, 1.5, .5, 76), (3, 2, 1, 74), (3, 3, 1, 71),
    (4, 0, 1.5, 69), (4, 1.5, .5, 71), (4, 2, 2, 69),
    (5, 0, 1, 74), (5, 1, .5, 78), (5, 1.5, .5, 81), (5, 2, 1, 81), (5, 3, 1, 78),
    (6, 0, .5, 79), (6, .5, .5, 78), (6, 1, .5, 76), (6, 1.5, .5, 74), (6, 2, 2, 76),
    (7, 0, 1, 78), (7, 1, .5, 74), (7, 1.5, .5, 71), (7, 2, 1, 79), (7, 3, 1, 76),
    (8, 0, 3, 74),
]
CHB = {1: ["D"] * 4, 2: ["G", "G", "D", "D"], 3: ["G", "G", "Em", "Em"], 4: ["A", "A", "A7", "A7"],
       5: ["D"] * 4, 6: ["G", "G", "A", "A"], 7: ["D", "D", "G", "A7"], 8: ["D"] * 4}
CH = {
    "D": dict(oom=(38, 45), pah=[57, 62, 66]), "G": dict(oom=(43, 38), pah=[55, 59, 62]), "Em": dict(oom=(40, 47), pah=[55, 59, 64]),
    "A": dict(oom=(45, 40), pah=[57, 61, 64]), "A7": dict(oom=(45, 40), pah=[55, 61, 64]), "Dm": dict(oom=(38, 45), pah=[57, 62, 65]),
    "Bb": dict(oom=(34, 41), pah=[58, 62, 65]),
}


def theme(t1, bars, transpose=0, rit=0.0):
    out = []
    b0 = min(bars)
    for (b, beat, d, m) in THEME:
        if b not in bars:
            continue
        x = (b - b0) * 4 + beat
        out.append((t1 + x * Q + rit * x * x * 0.01, d * Q, m + transpose))
    return out


class Band:
    def __init__(self):
        self.tr, self.send = {}, {}

    def add(self, name, x, t, p=0.0, g=1.0, send=0.15):
        if name not in self.tr:
            self.tr[name] = np.zeros((2, N))
            self.send[name] = send
        if 0 <= t < T.DUR:
            place(self.tr[name], pan(x, p) if np.ndim(x) == 1 else x, t, g)


R = rng(1628)
_r = lambda: rng(int(R.integers(1 << 30)))


def oompah(b, t_bar, chords, vel=0.6, pah_vel=0.4):
    for beat in range(4):
        c = CH[chords[beat]]
        t = t_bar + beat * Q
        b.add("tuba", I.brass(F(c["oom"][beat % 2]), 0.3, vel * (1.0 if beat in (0, 2) else 0.88), _r(), "tuba"), t, -0.1)
        for k, m in enumerate(c["pah"]):
            b.add("pah", I.brass(F(m), 0.15, pah_vel, _r(), "horn", scoop=-12), t + Q / 2 + 0.004 * k, 0.3 - 0.12 * k)


def snare_bar(b, t_bar, vel, pat=(1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 2, 0, 1, 1)):
    for s, v in enumerate(pat):
        if v:
            b.add("snare", I.snare(vel * (0.5 if v == 1 else 0.9) * R.uniform(0.93, 1.05), _r()), t_bar + s * Q / 4, 0.05)


def chord(b, name, t, notes, dur, vel, kind="horn", fall=0.0, p=0.0):
    for k, m in enumerate(notes):
        b.add(name, I.brass(F(m), dur, vel, _r(), kind, scoop=-15, fall=fall), t + 0.006 * k, p + 0.25 * (k - len(notes) / 2) / max(1, len(notes)))


def mel(b, name, notes, vel, fn="fife", p=0.0):
    for (t, d, m) in notes:
        if fn == "fife":
            x = I.fife(F(m), d * 0.9, vel * R.uniform(0.94, 1.04), _r())
        elif fn == "glock":
            x = I.glock(F(m), vel * R.uniform(0.92, 1.05), _r())
        elif fn == "musicbox":
            x = I.musicbox(F(m), vel * R.uniform(0.92, 1.05), _r())
        elif fn == "vibes":
            x = I.vibes(F(m), vel, _r(), dur=max(1.2, d + 0.8), damp=d + 0.35)
        else:
            x = I.pluck(F(m), vel, _r())
        b.add(name, x, t, p)


def sad_tuba(b, t, notes=(45, 44, 43, 42), step=0.42, last=1.4):
    for i, m in enumerate(notes):
        d = last if i == len(notes) - 1 else step * 0.9
        b.add("tuba", I.brass(F(m), d, 0.85, _r(), "tuba", scoop=-25, fall=-7 if i == len(notes) - 1 else 0.0), t + i * step, 0.0)


def build():
    b = Band()
    # ---------------- hook: fanfare stabs, then the sad tuba on "sank", cymbal + timpani at the flash
    chord(b, "stab", 0.06, [62, 66, 69, 74], 0.55, 0.75)
    chord(b, "stab", W("mightiest"), [67, 71, 74, 79], 0.45, 0.8)
    chord(b, "stab", W("warship"), [69, 73, 76, 81], 0.7, 0.85)
    for t, v in I.snare_roll(W("warship") + 0.4, W("sank") - 0.05, 0.25, 0.7, _r()):
        b.add("snare", I.snare(v, _r(), dur=0.14, buzz=True), t, 0.05)
    sad_tuba(b, W("sank"), (50, 49, 48, 47), 0.3, 0.9)
    b.add("cymbal", I.cymbal(0.7, _r()), T.FLASH, 0.0)
    b.add("timpani", I.timpani(F(38), 0.9, _r()), T.FLASH, 0.0)
    # ---------------- Stockholm march: 4 bars of the theme (bars 1-4), band + glock, until "But"
    t0 = T.FLASH + 0.05
    nb = max(2, min(4, int((W("But") - t0) / (4 * Q))))
    for k in range(nb):
        oompah(b, t0 + k * 4 * Q, CHB[k + 1], 0.55, 0.35)
        snare_bar(b, t0 + k * 4 * Q, 0.45)
    th = theme(t0, range(1, nb + 1))
    mel(b, "fife", th, 0.7); mel(b, "glock", th, 0.45, "glock", 0.3)
    chord(b, "stab", W("cannons") - 0.02, [62, 66, 69], 0.25, 0.6)
    b.add("cymbal", I.cymbal(0.35, _r(), dur=1.4), W("golden"), -0.3)
    # ---------------- the test: plucked ostinato that wobbles, a rising whoop on every run, dead stop on "stopped"
    ta, ts = W("But") + 0.1, W("stopped")
    t = ta
    k = 0
    while t < ts - 0.05:
        m = [50, 57, 50, 57, 52, 57, 50, 45][k % 8]
        b.add("pluck", I.pluck(F(m), 0.7, _r()), t, -0.2)
        if k % 2 == 0:
            b.add("brush", I.brush(0.45, _r()), t, 0.1)
        t += Q / 2 * (1 - 0.15 * min(1, (t - ta) / (ts - ta)))  # pushes ahead as the rolls grow
        k += 1
    for i, w in enumerate(["ran", "back", "third"]):
        tw = W(w)
        for j in range(5):
            b.add("fife", I.fife(F(69 + 2 * j + 2 * i), 0.09, 0.55 + 0.1 * i, _r()), tw + j * 0.07, 0.2)
        b.add("tuba", I.brass(F(38 - 2 * i), 0.7, 0.8, _r(), "tuba", scoop=-80, fall=-5), tw + 0.45, 0.0)
    b.add("cymbal", I.cymbal(0.8, _r(), dur=0.25), ts, 0.0)                                     # choked: dead stop
    b.add("timpani", I.timpani(F(38), 0.8, _r(), dur=0.6), ts, 0.0)
    # ---------------- deadpan ta-DAA after "anyway"
    ta2 = WE("anyway") + 0.08
    chord(b, "stab", ta2, [57, 61, 64, 67], 0.16, 0.7)
    chord(b, "stab", ta2 + 0.2, [62, 66, 69, 74], 0.7, 0.85)
    # ---------------- the king: royal fanfare calls + timpani, impatient snare taps in time with his foot
    tk, tm = W("king") - 0.1, W("makes")
    for (dt, ms) in [(0.0, [62, 66, 69]), (0.5, [62, 66, 69]), (0.75, [66, 69, 74]), (1.25, [69, 73, 76]), (2.4, [67, 71, 74]), (2.9, [69, 73, 76]), (3.4, [62, 66, 69, 74])]:
        chord(b, "stab", tk + dt, ms, 0.3 if dt < 3.4 else 0.9, 0.7, "horn")
    for i in range(int((tm - tk) / 0.7)):
        b.add("timpani", I.timpani(F(38 if i % 2 else 45), 0.5, _r(), dur=0.9), tk + i * 0.7, 0.0)
        b.add("snare", I.snare(0.35, _r()), tk + i * 0.7 + 0.35, 0.1)
    # ---------------- launch: full theme reprise (bars 5-8) until the gust, cut dead; suspense; sad tuba
    tg = W("gust")
    t0 = tm + 0.02
    nb = max(1, min(4, int((tg - t0) / (4 * Q)) + 1))
    for k in range(nb):
        oompah(b, t0 + k * 4 * Q, CHB[k + 5], 0.7, 0.45)
        snare_bar(b, t0 + k * 4 * Q, 0.6, (3, 0, 1, 1, 2, 0, 1, 0, 3, 0, 1, 1, 2, 0, 1, 0))
    th = [n for n in theme(t0, range(5, 5 + nb)) if n[0] < tg - 0.08]
    mel(b, "fife", th, 0.8); mel(b, "glock", th, 0.5, "glock", 0.3)
    b.add("cymbal", I.cymbal(0.6, _r()), t0, 0.2)
    for k in b.tr:  # nothing of the band rings past the gust
        i = ns(tg - 0.04)
        b.tr[k][:, i:] = 0.0
    td = W("down", 2)
    b.add("pad", I.pad([F(50), F(53), F(56)], td - tg + 0.6, 0.45, _r(), att=0.4, rel=0.5, trem=lambda tt: 0.72 + 0.28 * np.sin(2 * np.pi * 7.0 * tt)), tg + 0.05, 0.0)
    sad_tuba(b, td + 0.15)
    # ---------------- inquiry: solemn low pad, a timpani on "blame", a little glock "ding" on "Unluckily"
    tl, tsee = W("Luckily") - 0.2, W("see")
    b.add("pad", I.pad([F(38), F(45), F(50), F(53)], W("Unluckily") - tl + 0.4, 0.4, _r(), att=0.8, rel=0.6), tl, 0.0)
    b.add("timpani", I.timpani(F(38), 0.6, _r()), W("blame"), 0.0)
    b.add("glock", I.glock(F(86), 0.45, _r()), W("Unluckily"), 0.2)
    b.add("pad", I.pad([F(38), F(44), F(50), F(53)], tsee - W("Unluckily") - 0.2, 0.35, _r(), att=0.5, rel=0.5), W("Unluckily") + 0.1, 0.0)
    # ---------------- canoe: music-box waltz (3/4, D), wobbles on "Stand", stops on "tips"
    tst, ttp = W("Stand"), W("tips")
    waltz = [74, 78, 81, 79, 78, 76, 74, 76, 78, 74, 71, 73, 74, 69, 74, 78, 81, 83, 81, 78, 76]
    t = tsee
    i = 0
    while t < ttp:
        wob = 0 if t < tst else (1 if i % 2 else -1)
        b.add("musicbox", I.musicbox(F(waltz[i % len(waltz)] + wob), 0.6, _r()), t, 0.15)
        if i % 3 == 0:
            b.add("musicbox", I.musicbox(F([50, 55, 57][(i // 3) % 3]), 0.4, _r()), t, -0.2)
        t += 0.4 if t < tst else 0.3
        i += 1
    # ---------------- explainer: plucked staccato + glock, a descending plink on "stones"
    tv, t3 = W("Vasa", 2), W("Three")
    t = tv
    i = 0
    while t < t3 - 0.1:
        b.add("pluck", I.pluck(F([50, 54, 57, 54][i % 4] + (5 if t > W("decks") and t < W("stones") else 0)), 0.65, _r()), t, -0.2)
        t += Q / 2
        i += 1
    for j, m in enumerate([86, 83, 79, 74]):
        b.add("glock", I.glock(F(m), 0.5, _r()), W("stones") + j * 0.12, 0.25)
    # ---------------- 1961 rise -> grand reprise, last chord on the last word
    tp, tt_ = W("pulled"), W("Today")
    for t, v in I.snare_roll(t3, tp, 0.2, 0.75, _r()):
        b.add("snare", I.snare(v, _r(), dur=0.14, buzz=True), t, 0.05)
    for j, m in enumerate([62, 64, 66, 67, 69]):
        chord(b, "stab", t3 + j * (tp - t3) / 5, [m, m + 4], 0.3, 0.45 + 0.08 * j)
    chord(b, "stab", tp, [62, 66, 69, 74], 0.9, 0.9)
    b.add("cymbal", I.cymbal(0.7, _r()), tp, 0.0)
    tend = WE("still")
    nb = max(1, int((W("still") - tt_) / (4 * Q)))
    for k in range(min(nb, 4)):
        oompah(b, tt_ + k * 4 * Q, CHB[k + 5], 0.6, 0.4)
    th = [n for n in theme(tt_, range(5, 9)) if n[0] < W("still") - 0.1]
    mel(b, "fife", th, 0.75); mel(b, "glock", th, 0.45, "glock", 0.3)
    chord(b, "stab", W("still") - 0.02, [50, 57, 62, 66, 69, 74], max(0.6, T.DUR - W("still") - 0.1), 0.8)
    b.add("timpani", I.timpani(F(38), 0.9, _r()), W("still") - 0.02, 0.0)
    b.add("cymbal", I.cymbal(0.5, _r()), W("still") - 0.02, 0.0)
    end = np.ones(N)
    a = ns(max(0.0, T.DUR - 0.6))
    end[a:] = np.linspace(1, 0, N - a) ** 1.5
    for k in b.tr:
        b.tr[k] *= end[None, :]
    _ = tend
    return b


TARGET = {"fife": -2.0, "glock": -6.0, "tuba": -2.0, "pah": -7.0, "snare": -6.0, "cymbal": -11.0, "stab": -2.0, "timpani": -5.0,
          "pad": -5.0, "vibes": -3.0, "musicbox": -2.0, "pluck": -3.0, "brush": -12.0}


def render(b, ref=-20.0):
    hall = make_ir(1.4, 7, pre=0.018, hf=1.4)
    dry, wet = np.zeros((2, N)), np.zeros((2, N))
    for k, x in b.tr.items():
        if not np.any(x):
            continue
        L = integrated(x)
        x = x * dbg(ref + TARGET.get(k, -6) - L)
        b.tr[k] = x
        dry += x
        wet += b.send[k] * x
    return hp(dry + 0.7 * convolve_st(wet.mean(0), hall), 30, 2)
