# Every sound effect and ambience bed of the Vasa short as a cue list anchored to the narration words (timeline.W),
# rendered into one stereo SFX stem. Standard mix: each EVENT has a "naive" level (LU relative to the voice, measured
# as the event's max momentary loudness) and is placed SFX_DB = -6 dB under it; ambience BEDS (integrated loudness)
# are not reduced.
import numpy as np
from dsp import (SR, ns, tt, rng, dbg, lp, hp, bp, pan, st, place, fades, widen, make_ir, convolve_st, momentary_max,
                 integrated, colored, smooth_noise, modal, phase)
import sfx_gen as G
import timeline as T

W, WE = T.W, T.WE
N = ns(T.DUR)
SFX_DB = -6.0


class Cue:
    def __init__(self, t, name, desc, gen, naive, kind="event", p=0.0, send=0.12):
        self.t, self.name, self.desc, self.gen, self.naive, self.kind, self.p, self.send = t, name, desc, gen, naive, kind, p, send
        self.applied = naive + (SFX_DB if kind == "event" else 0.0)
        self.measured = None


# ---------------------------------------------------------------- small synths
def gulls(dur, r, n=4):
    out = np.zeros((2, ns(dur)))
    for k in range(n):
        tm = r.uniform(0, max(0.1, dur - 0.8))
        for j in range(int(r.integers(2, 4))):
            d = r.uniform(0.18, 0.3)
            t = tt(d)
            f = r.uniform(1300, 1700) * (1 + 0.35 * np.sin(np.pi * t / d)) * (1 - 0.2 * t / d)
            y = np.sin(phase(f)) + 0.4 * np.sin(2 * phase(f)) + 0.15 * np.sin(3 * phase(f))
            y *= np.sin(np.pi * t / d) ** 0.6 * 0.3
            place(out, pan(bp(y, 700, 6000, 1), r.uniform(-0.9, 0.9)), tm + j * r.uniform(0.25, 0.35))
    return out


def harbour_bed(dur, r, lap=1.0):
    n = ns(dur)
    x = G.breeze(dur, r, 0.8, 0.12, 800)
    for ch in range(2):
        x[ch] += bp(colored(n, r, 0.8), 160, 1600, 1) * 0.35 * lap * (0.6 + 0.4 * smooth_noise(n, r, 0.4))
    x += pan(G.flag_flutter(dur, r) * 0.18, 0.4)
    x += gulls(dur, r, max(1, int(dur / 4))) * 0.5
    x += G.water_bed(dur, r, 0.25 * lap, 0.4) * 0.35
    return fades(x, 0.4, 0.5)


def creak(r, dur=0.9, lo=70, hi=140, g=1.0):
    return G.creak(dur, r, lo, hi, G.TIMBER, [(0, 0), (0.3, 1), (0.7, 0.8), (1, 0)], rough=0.14, noise=0.05, scale=r.uniform(0.9, 1.1)) * g


def run_feet(dur, r, people=30):
    out = np.zeros((2, ns(dur)))
    for p in range(people):
        tm, rate = r.uniform(0, 0.15), r.uniform(5.0, 6.5)
        while tm < dur - 0.2:
            place(out, pan(G.boot(r, r.uniform(0.4, 0.8)) * r.uniform(0.25, 0.6), r.uniform(-0.8, 0.8)), tm)
            tm += 1 / rate * r.uniform(0.9, 1.1)
    return fades(out, 0.05, 0.15)


def clunk(r):
    return modal(0.35, [(r.uniform(140, 200), 1.0, 0.05), (r.uniform(380, 520), 0.6, 0.03), (r.uniform(900, 1300), 0.3, 0.015)], r)


def lids(r, k=24, span=1.2):
    out = np.zeros((2, ns(span + 0.6)))
    for i in range(k):
        c, k2 = clunk(r), 0.5 * G.creak(0.25, r, 160, 260, G.WOOD, [(0, 0), (0.5, 1), (1, 0)], rough=0.1, noise=0.03)
        x = np.zeros(max(len(c), len(k2))); x[:len(c)] += c; x[:len(k2)] += k2
        place(out, pan(x * r.uniform(0.4, 1.0), -0.8 + 1.6 * i / k), i * span / k + r.uniform(0, 0.03))
    return out


def cheer(dur, r, people=24):
    n = ns(dur)
    t = np.arange(n) / SR
    out = np.zeros((2, n))
    for v in range(people):
        kid = v % 6 == 5
        base = r.uniform(270, 340) if kid else (r.uniform(105, 160) if v % 2 else r.uniform(180, 250))
        h = G.hurrah(r, base * r.uniform(0.97, 1.05), 1.3 if kid else (1.0 if v % 2 else 1.15), kid)
        place(out, pan(lp(h, 4000, 1) * r.uniform(0.35, 1.0), r.uniform(-0.9, 0.9)), r.uniform(0.1, max(0.2, dur - 1.0)))
    out += G.applause(dur, r, 30, np.interp(t, [0, 0.4, dur * 0.5, dur], [0, 1, 0.8, 0])) * 0.8
    return fades(out, 0.05, 0.4)


def whoas(r, k=10, dur=0.8):
    out = np.zeros((2, ns(dur)))
    for v in range(k):
        place(out, pan(G.whoa(r, dur=r.uniform(0.35, 0.55)) * r.uniform(0.4, 1.0), r.uniform(-0.8, 0.8)), r.uniform(0.0, 0.2))
    return out


def boom(r, dist=1.0):
    d = 1.6
    t = tt(d)
    y = np.sin(phase(48 * (1 + 0.6 * np.exp(-t / 0.05)))) * np.exp(-t / 0.35) * 1.5 + lp(r.standard_normal(len(t)), 600) * np.exp(-t / 0.25)
    return lp(y, 1800 / dist, 2)


def gavel(r):
    return modal(0.5, [(r.uniform(320, 380), 1.0, 0.06), (r.uniform(800, 950), 0.7, 0.03), (2100, 0.3, 0.012)], r) + hp(r.standard_normal(ns(0.5)), 2500) * np.exp(-tt(0.5) / 0.004) * 0.3


def winch(dur, r):
    n = ns(dur)
    t = np.arange(n) / SR
    f = 55 + 8 * np.sin(2 * np.pi * 0.3 * t)
    y = sum(np.sin(k * phase(f)) / k for k in range(1, 12))
    y += 0.3 * bp(r.standard_normal(n), 1500, 4000, 1) * (0.5 + 0.5 * np.sin(2 * np.pi * 9 * t)) ** 4
    return fades(lp(y, 2200) * 0.4, 0.3, 0.4)


def murmur(dur, r, voices=10):
    out = np.zeros((2, ns(dur)))
    for v in range(voices):
        y = G.babble(dur, r, r.uniform(100, 240), r.uniform(0.95, 1.2), r.uniform(3.6, 4.8), r.uniform(0.5, 0.75), fmax=3400)
        out += pan(lp(y, r.uniform(2200, 3600), 1) * r.uniform(0.3, 1.0), r.uniform(-0.85, 0.85))
    return fades(out, 0.3, 0.6)


def taps(dur, r, rate=9 / (2 * np.pi)):
    out = np.zeros((2, ns(dur)))
    tm = 0.0
    while tm < dur:
        place(out, pan(G.boot(r, 0.35) * 0.5, 0.1), tm)
        tm += 1 / rate
    return out


# ---------------------------------------------------------------- the cue list
def cues():
    C = []
    R = rng(1628)
    rr = lambda: rng(int(R.integers(1 << 30)))
    add = lambda *a, **k: C.append(Cue(*a, **k))
    S = T.SHOTS

    def bed(a, b, name, desc, fn, lvl):
        d = b - a
        add(a, name, desc, lambda: (fn(d, rr()), 0.0), lvl, "bed", send=0.0)

    # ---- beds
    bed(0.0, S[5][1], "amb_harbour", "harbour air: breeze, lapping water, gulls, flags (shots 1-5)", harbour_bed, -27)
    bed(S[6][0], S[6][1], "amb_camp", "golden field: breeze, distant camp murmur (shot 6)", lambda d, r: fades(G.breeze(d, r, 0.6, 0.1, 650) + murmur(d, r, 6) * 0.15, 0.3, 0.3), -30)
    bed(S[7][0], S[7][1] + 0.3, "amb_voyage", "harbour air, livelier water (shot 7)", lambda d, r: harbour_bed(d, r, 1.4), -26)
    bed(S[8][0], S[8][1], "amb_hall", "panelled hall: room tone, a cough-free hush (shot 8)", lambda d, r: fades(st(lp(colored(ns(d), r, 1.5), 400) * 0.2), 0.3, 0.3), -40)
    bed(S[9][0], S[9][1], "amb_lake", "golden lake: soft lapping, a blackbird, crickets (shot 9)",
        lambda d, r: fades(G.breeze(d, r, 0.5, 0.1, 600) + pan(G.bird_chirps(d, r, 0.3, "blackbird") * 0.06, -0.5) + G.water_bed(d, r, 0.2, 0.3) * 0.3, 0.3, 0.3), -30)
    bed(S[10][0], S[10][1], "amb_tank", "the diagram tank: muffled water, slow creak", lambda d, r: fades(st(lp(colored(ns(d), r, 1.2), 500) * 0.3), 0.3, 0.3), -36)
    bed(S[11][0], S[11][1], "amb_salvage", "1961: water streaming off the hull, crane winches", lambda d, r: fades(G.water_bed(d, r, 1.0, 1.0) * 0.7 + st(winch(d, r)), 0.4, 0.3), -24)
    bed(S[12][0], T.DUR, "amb_museum", "museum hall: visitors murmuring, footsteps", lambda d, r: murmur(d, r, 12), -32)

    # ---- hook
    add(W("sank"), "hook_creak", "the ship groans as she tips (flash-forward)", lambda: (creak(rr(), 1.4, 55, 110), 0.0), -14)
    add(T.FLASH - 0.33, "flash", "whoosh into the white flash", lambda: (G.whoosh(0.75, rr(), 0.33, 500, 4200, 0.9, 0.09, 0.4), 0.0), -12)
    # ---- setting
    add(W("cannons") - 0.2, "lids", "24 gun-port lids swing open, cannons run out", lambda: (lids(rr()), 0.0), -14)
    add(W("whole"), "crowd", "the city cheers and waves", lambda: (cheer(min(3.5, W("But") - W("whole")), rr()), 0.0), -12)
    # ---- the test
    for i, w in enumerate(["ran", "back", "third"]):
        add(W(w), f"run{i}", "thirty pairs of boots across the deck", lambda i=i: (run_feet(1.0, rr()), 0.0), -14 + i)
        add(W(w) + 0.5, f"roll{i}", "the hull creaks as she rolls", lambda i=i: (creak(rr(), 1.0 + 0.3 * i, 60, 120, 1.0), 0.0), -15 + 2 * i)
    add(W("stopped"), "skid", "boots skid to a stop", lambda: (run_feet(0.35, rr(), 30) * np.linspace(1, 0.2, ns(0.35)), 0.0), -14)
    add(W("stopped") + 0.05, "gasp", "the crew gasps", lambda: (whoas(rr(), 8), 0.0), -16)
    # ---- the king
    add(S[6][0] + 0.2, "taps", "the king taps his foot", lambda: (taps(S[6][1] - S[6][0] - 0.4, rr()), 0.0), -22)
    for k in range(3):
        add(S[6][0] + 0.6 + k * 1.3, f"cannon{k}", "distant cannon fire behind the camp", lambda k=k: (boom(rr(), 2.0 + k), 0.0), -18)
    # ---- the voyage
    add(W("makes"), "launch_cheer", "the crowd cheers her off", lambda: (cheer(min(2.4, W("gust") - W("makes")), rr()), 0.0), -12)
    add(W("gust") - 0.3, "gust", "a gust of wind fills the sails", lambda: (G.whoosh(1.6, rr(), 0.5, 250, 1800, 1.0, 0.6, 0.3) + G.breeze(1.6, rr(), 2.0, 0.6, 1200), 0.0), -10)
    add(W("leans"), "lean_creak", "her timbers groan as she heels", lambda: (creak(rr(), 1.6, 45, 95), 0.0), -12)
    add(W("leans") + 0.1, "crowd_whoa", "the crowd: whoa", lambda: (whoas(rr(), 14), 0.0), -15)
    add(W("water"), "inrush", "water pours in through the gun ports", lambda: (G.water_bed(2.2, rr(), 1.6, 2.5), 0.0), -11)
    add(W("down", 2) + 0.9, "sink", "she goes under: big splash, bubbles", lambda: (G.splash_big(rr()), 0.0), -9)
    # ---- inquiry
    add(W("blame"), "gavel", "a judge's gavel", lambda: (gavel(rr()), 0.0), -14)
    # ---- canoe
    add(W("Stand"), "kid_whoa", "the kid wobbles: whoa", lambda: (G.whoa(rr(), base=300, dur=0.6), 0.0), -16)
    add(W("tips") + 0.35, "canoe_splash", "over she goes, splash", lambda: (G.splash_big(rr()) * 0.6, 0.0), -12)
    # ---- explainer
    add(W("decks"), "cut_creak", "the section rocks: creak", lambda: (creak(rr(), 1.2, 70, 130), 0.0), -18)
    add(W("stones"), "stones", "a few ballast stones clack", lambda: (clunk(rr()), 0.0), -18)
    # ---- 1961 + museum
    add(W("pulled"), "rise", "the hull breaks the surface: water sheets off", lambda: (G.water_bed(2.5, rr(), 2.0, 2.0), 0.0), -12)
    add(W("pulled") + 0.3, "salvage_cheer", "the salvage crew cheers", lambda: (cheer(2.0, rr(), 10), 0.0), -15)
    return C


def render(v_ref):
    C = cues()
    out = np.zeros((2, N))
    send = np.zeros(N)
    for c in C:
        x, anchor = c.gen()
        x = np.asarray(x, float)
        x = pan(x, c.p) if x.ndim == 1 else x
        tgt = v_ref + c.applied
        cur = momentary_max(x) if c.kind == "event" else integrated(x)
        if np.isfinite(cur):
            x = x * dbg(tgt - cur)
        c.measured = (momentary_max(x) if c.kind == "event" else integrated(x)) - v_ref
        t0 = c.t - anchor
        place(out, x, t0)
        if c.send > 0:
            G._place_mono(send, c.send * x.mean(0), t0)
    room = make_ir(1.0, 77, pre=0.01, hf=1.6)
    out += 0.5 * convolve_st(send, room)
    out = hp(out, 25, 2)
    end = ns(T.DUR - 0.12)
    out[:, end:] *= np.linspace(1, 0, N - end)[None, :] ** 2
    return out, C
