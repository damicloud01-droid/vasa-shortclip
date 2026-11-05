"""Word timings for the narration: force-align voice/voice.wav to the approved script (offline, pocketsphinx).

usage: python3 scripts/align.py [voice/voice.wav] [script/SCRIPT.md]
writes voice/words.json and src/videos/vasa/words.json ({"words": [{word, start, end}, ...]}).

The words in the output are the script's own words (punctuation stripped, hyphens kept), so story.ts anchors such as
W("sixtyfour") keep working. Numbers are aligned on how they are spoken ("1628" = "sixteen twenty eight").
After aligning, check the timings by ear (skill rule: hand-fix them) and re-run the stills.
"""
import json
import os
import re
import subprocess
import sys
import tempfile

import numpy as np
from scipy.io import wavfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SPOKEN = {"1628": ["sixteen", "twenty", "eight"]}


def script_lines(md_path):
    rows = []
    for line in open(md_path, encoding="utf-8"):
        m = re.match(r"\|\s*\d+\s*\|[^|]*\|([^|]+)\|", line)
        if m:
            rows.append(m.group(1).strip())
    if not rows:
        raise SystemExit(f"no script table rows found in {md_path}")
    return rows


def tokens(lines):
    out = []
    for line in lines:
        for w in line.split():
            disp = re.sub(r"[^\w'\-]", "", w)
            if not disp:
                continue
            key = disp.lower()
            spoken = SPOKEN.get(key) or [p for p in re.split(r"-", key.replace("'", "'")) if p]
            out.append((disp, spoken))
    return out


def to_16k_mono(src):
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", tmp], check=True)
    return tmp


def align(wav16, words):
    from pocketsphinx import Decoder
    d = Decoder(samprate=16000, bestpath=False)
    d.set_align_text(" ".join(words))
    sr, pcm = wavfile.read(wav16)
    d.start_utt()
    d.process_raw(pcm.tobytes(), full_utt=True)
    d.end_utt()
    segs = [(s.text, s.start / 100.0, (s.end + 1) / 100.0) for s in d.seg() if s.text not in ("<s>", "</s>", "<sil>", "[NOISE]")]
    return segs


def main():
    wav = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "voice", "voice.wav")
    md = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "script", "SCRIPT.md")
    toks = tokens(script_lines(md))
    spoken = [s for _, sp in toks for s in sp]
    wav16 = to_16k_mono(wav)
    segs = align(wav16, spoken)
    got = [re.sub(r"\(\d+\)$", "", w).lower() for w, _, _ in segs]
    if got != spoken:
        # report the first mismatch; usually an out-of-dictionary word or a re-recorded line
        for i, (a, b) in enumerate(zip(got, spoken)):
            if a != b:
                raise SystemExit(f"alignment drifted at spoken word {i}: got {a!r}, expected {b!r} (check the recording matches the script)")
        raise SystemExit(f"aligned {len(got)} of {len(spoken)} words; the recording seems to stop early")
    out, k = [], 0
    for disp, sp in toks:
        part = segs[k:k + len(sp)]
        k += len(sp)
        out.append({"word": disp, "start": round(part[0][1], 3), "end": round(part[-1][2], 3)})
    sr, pcm = wavfile.read(wav16)
    data = {"source": os.path.basename(wav), "duration": round(len(pcm) / sr, 3), "words": out}
    for p in (os.path.join(ROOT, "voice", "words.json"), os.path.join(ROOT, "src", "videos", "vasa", "words.json")):
        with open(p, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=0)
    gaps = [b["start"] - a["end"] for a, b in zip(out, out[1:])]
    print(f"{len(out)} words, {out[0]['start']:.2f}-{out[-1]['end']:.2f} s, {len(out) / (out[-1]['end'] - out[0]['start']):.2f} words/s, "
          f"longest gap {max(gaps):.2f} s")


if __name__ == "__main__":
    main()
