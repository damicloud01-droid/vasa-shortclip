# Picture timeline mirrored (read-only) from src/videos/vasa/story.ts so every sound lands on its frame: the same
# word anchors (words.json), the same shot cuts, the same ship physics constants.
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FPS = 30
LEAD = 2

_data = json.load(open(os.path.join(ROOT, "src", "videos", "vasa", "words.json"), encoding="utf-8"))
WORDS = _data["words"]
PLACEHOLDER = bool(_data.get("placeholder"))
_norm = lambda s: re.sub(r"[^a-z0-9']", "", s.lower())


def W(word, n=1):
    k, c = _norm(word), 0
    for w in WORDS:
        if _norm(w["word"]) == k:
            c += 1
            if c == n:
                return float(w["start"])
    raise KeyError(f"{word} #{n} not in words.json")


def WE(word, n=1):
    k, c = _norm(word), 0
    for w in WORDS:
        if _norm(w["word"]) == k:
            c += 1
            if c == n:
                return float(w["end"])
    raise KeyError(f"{word} #{n} not in words.json")


def FW(word, n=1):
    return max(0, round(W(word, n) * FPS) - LEAD)


TOTAL = round((WORDS[-1]["end"] + 0.5) * FPS)
DUR = TOTAL / FPS


def _cuts():
    return [0, FW("Stockholm"), FW("But"), FW("ship"), FW("third"), FW("king"), FW("makes"), FW("Luckily"), FW("see"),
            FW("Vasa", 2), FW("Three"), FW("Today"), TOTAL]


CUTS = _cuts()
SETS = ["harbour", "harbour", "harbour", "harbour", "harbour", "king", "harbour", "inquiry", "lake", "cutaway", "harbour", "museum"]
SHOTS = {i + 1: (CUTS[i] / FPS, CUTS[i + 1] / FPS, SETS[i]) for i in range(12)}
FLASH = CUTS[1] / FPS


def shot_t(i):
    return SHOTS[i][0], SHOTS[i][1]


def speech_spans(merge=0.3):
    sp = []
    for w in WORDS:
        s, e = float(w["start"]), float(w["end"])
        if sp and s - sp[-1][1] < merge:
            sp[-1][1] = max(sp[-1][1], e)
        else:
            sp.append([s, e])
    return sp
