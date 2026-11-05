# Final mix of "The Ship That Couldn't Sit Still": voice (gain only) + original score (ducked under speech, ~10 LU
# under the voice: the "+3 dB music" standard) + SFX stem (events -6 dB under their natural level). Master to -15 LUFS
# integrated with a 4x-oversampled look-ahead limiter (<= -1.2 dBTP), exactly DUR seconds, 48 kHz stereo 24-bit.
# Without voice/voice.wav it renders a music + SFX preview against an assumed voice level.
# usage: python3 audio/mix.py   -> audio/out/mix.wav, stem_*.wav, cues.md
import os
import subprocess
import sys
import time
import numpy as np
from scipy import ndimage, signal
from dsp import SR, ns, st, dbg, read_wav, write_wav, integrated, true_peak, lra, momentary
import timeline as T

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
N = ns(T.DUR)
TARGET_LUFS, CEIL_DBTP = -15.0, -1.2
MUSIC_UNDER_VOICE = -10.0
DUCK_DB = -3.0
ASSUMED_VOICE = -16.0


def log(*a):
    print(f"[{time.strftime('%H:%M:%S')}]", *a, flush=True)


def load_voice():
    p = os.path.join(T.ROOT, "voice", "voice.wav")
    if not os.path.exists(p):
        return None
    tmp = os.path.join(OUT, "_voice48k.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", p, "-ac", "1", "-ar", str(SR), "-sample_fmt", "s16", tmp], check=True)
    x, sr = read_wav(tmp)
    v = x[0] if x.shape[0] == 1 else x.mean(0)
    out = np.zeros(N)
    out[: min(N, len(v))] = v[:N]
    return st(out)


def duck_curve(depth=DUCK_DB, pre=0.08, post=0.12, att=0.07, rel=0.45):
    ctrl = 1000
    nc = int(T.DUR * ctrl) + 2
    va = np.zeros(nc)
    for s, e in T.speech_spans():
        va[max(0, int((s - pre) * ctrl)): int((e + post) * ctrl)] = 1.0
    ka, kr = 1 - np.exp(-1 / (att * ctrl)), 1 - np.exp(-1 / (rel * ctrl))
    env, e = np.zeros(nc), 0.0
    for i in range(nc):
        e += (va[i] - e) * (ka if va[i] > e else kr)
        env[i] = e
    return dbg(np.interp(np.arange(N) / SR, np.arange(nc) / ctrl, depth * env))


def limiter(x, ceil_db=CEIL_DBTP, look=0.003, rel=0.08):
    ceil = dbg(ceil_db)
    up = signal.resample_poly(x, 4, 1, axis=-1)
    pk = np.abs(up).max(0).reshape(-1, 4).max(1)[: x.shape[1]]
    need = np.minimum(1.0, ceil / np.maximum(pk, 1e-9))
    w = max(1, ns(look))
    g = ndimage.minimum_filter1d(need, 2 * w + 1, mode="nearest")
    a = np.exp(-1 / (rel * SR))
    sm = signal.lfilter([1 - a], [1, -a], g)
    g = np.minimum(g, np.maximum(sm, g))
    g = ndimage.uniform_filter1d(g, w, mode="nearest")
    return x * g[None, :], 1 - g


def main():
    os.makedirs(OUT, exist_ok=True)
    import music
    import sfx
    voice = load_voice()
    v_ref = integrated(voice) if voice is not None else ASSUMED_VOICE
    log(f"voice: {'none (preview)' if voice is None else f'{v_ref:.1f} LUFS'}; placeholder timings: {T.PLACEHOLDER}")
    log("music")
    m = music.render(music.build())
    m = m * duck_curve()[None, :]
    m = m * dbg(v_ref + MUSIC_UNDER_VOICE - integrated(m))
    log("sfx")
    s, C = sfx.render(v_ref)
    v = voice if voice is not None else np.zeros((2, N))
    mix = v + m + s
    g = TARGET_LUFS - integrated(mix)
    mix, v, m, s = (x * dbg(g) for x in (mix, v, m, s))
    mix, gr = limiter(mix)
    end = ns(T.DUR - 0.05)
    mix[:, end:] *= np.linspace(1, 0, N - end)[None, :]
    write_wav(os.path.join(OUT, "mix.wav"), mix)
    for name, x in (("voice", v), ("music", m), ("sfx", s)):
        write_wav(os.path.join(OUT, f"stem_{name}.wav"), x)
    rep = [f"# The Ship That Couldn't Sit Still - soundtrack cue sheet", "",
           f"- length {T.DUR:.3f} s, 48 kHz stereo 24-bit; voice: {'voice/voice.wav' if voice is not None else 'NONE (music + SFX preview)'}"
           + (" - PLACEHOLDER word timings" if T.PLACEHOLDER else ""),
           f"- master: integrated {integrated(mix):.1f} LUFS, true peak {true_peak(mix):.1f} dBTP, LRA {lra(mix):.1f} LU, limiter max GR {20 * np.log10(1 / max(1e-9, 1 - gr.max())):.2f} dB",
           f"- stems: voice {integrated(v) if voice is not None else float('nan'):.1f}, music {integrated(m):.1f}, sfx {integrated(s):.1f} LUFS", "",
           "| t (s) | cue | what | level vs voice (LU) |", "|---|---|---|---|"]
    for c in sorted(C, key=lambda c: c.t):
        rep.append(f"| {c.t:.2f} | {c.name} | {c.desc} | {c.measured:+.1f} ({c.kind}) |")
    open(os.path.join(OUT, "cues.md"), "w").write("\n".join(rep) + "\n")
    log("\n".join(rep[2:5]))


if __name__ == "__main__":
    main()
