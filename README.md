# Vasa short clip

**The Ship That Couldn't Sit Still**: a ~60 s vertical cartoon short (1080x1920, 30 fps, final 1440x2560) about the
Vasa warship (Stockholm, 1628). It's made with the cartoon-3d-short skill: flat 2D characters in a painted 3D world,
rendered with three.js inside Remotion. The sound is synthesized in Python.

| Path | What |
|---|---|
| `script/SCRIPT.md` | The facts with sources, the approved script and the shot plan |
| `voice/` | `voice.wav` (your recording) and `words.json` (word timings; placeholder until the recording exists) |
| `src/videos/vasa/` | The film: `story.ts` (shots, cameras, lens, all anchored to words), `ship.ts` (the Vasa), `world.ts` (sets), `cast.ts` (characters), plus the look modules copied from the bridge template |
| `audio/` | `music.py` (original score), `sfx.py` (effects cue list), `mix.py` (final mix), `timeline.py` (word anchors) |
| `scripts/` | `bridge-stills.mjs` (test stills), `align.py` (word timings from the recording), `short_qa.py`, `sbs_sheet.py` |

## Steps
1. **Record the voice**: one steady tone, about 3.7 words/s, reading `script/SCRIPT.md` exactly. Save it as `voice/voice.wav`.
2. **Get word timings**: `pip install pocketsphinx scipy numpy`, then `python3 scripts/align.py`.
   This writes `voice/words.json` and `src/videos/vasa/words.json`. Listen and hand-fix any word that is off.
   Every shot, camera move, reaction and sound re-times itself from this file.
3. **Check stills**:
   ```bash
   COMP=VasaShort REMOTION_TMP=/big/drive/remotion-tmp node scripts/bridge-stills.mjs out/vasa/x_ 200,700,1150 0.5
   ```
4. **Sound**: `cd audio && python3 mix.py` writes `audio/out/mix.wav`, the stems and `cues.md`.
5. **Final render** (on a PC with a GPU; it takes about 10 minutes there):
   ```bash
   npx remotion render src/index.ts VasaShort out/vasa/video.mp4 --codec h264 --crf 16 --scale 1.3333
   ffmpeg -i out/vasa/video.mp4 -i audio/out/mix.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 256k -shortest out/vasa/final.mp4
   ```
   On Linux without a GPU, add `--gl=swangle` (very slow). On Windows/Mac with Chrome, `--gl=angle`.

Rules kept from the skill: no captions, English only, one steady voice tone, jokes are real facts, mix music +3 dB / SFX -6 dB, voice unchanged.
