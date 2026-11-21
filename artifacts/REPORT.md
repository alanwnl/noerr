# Cantonese ASR timecode and err-cut report

Episode: 亂gad 第841集. Pipeline script: [audio_to_timecode.py](audio_to_timecode.py).

## What it does

One script takes an audio file and produces a timecoded transcript. With `--cut-err` it also cuts the Cantonese hesitation the model writes as「诶」and writes an mp3.

```
audio
  │  ffmpeg → 16 kHz mono (ASR only)
  ▼
SenseVoice int8, language=yue, 20 s chunks
  │  token time + chunk offset = wall clock
  ├─ group cues  →  .srt  +  .timecode.txt
  └─ 诶 / 呃 / 誒 spans
        │  merge overlaps
        ▼
     original audio, one decode pass, 12 ms fade
        →  .noerr.mp3  +  .err.txt
```

## How to run

```bash
python3 audio_to_timecode.py episode.webm
python3 audio_to_timecode.py episode.webm --cut-err
python3 audio_to_timecode.py episode.mp3 --language yue --model /path/to/model
```

Outputs are written next to the input file.

Requires `ffmpeg` (with `libmp3lame`), `sherpa-onnx`, `numpy`, `soundfile`. If `model.int8.onnx` and `tokens.txt` are missing, the script downloads:

`sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17`  
from the sherpa-onnx `asr-models` release.

Default model directory: `/tmp/asr/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17`.

## Model

| | |
|---|---|
| Engine | sherpa-onnx `OfflineRecognizer.from_sense_voice` |
| Weights | `model.int8.onnx` (about 229 MB) |
| Language | `yue` |
| ITN | on |
| Threads | 2 |
| Device | CPU only |

SenseVoice is run on 20-second pieces because a 110-minute buffer does not fit this machine and the model is not trained on hour-long inputs. Each token timestamp is local to the chunk, then the chunk start is added. A 30-second check before the full run showed timestamps moving from 0.06 s to 29.94 s, so the clock is real.

## This episode

Source: Google Drive file `1oi7CzZokPm7yxtIeGJsRdfcz7tPt8J29`, saved as `lungad-841.webm`. Drive named it `.mp3`. The bytes are Matroska/WebM, Opus, 48 kHz stereo, 128 kb/s.

| | Source | After err cut |
|---|---|---|
| File | [audio/lungad-841.webm](audio/lungad-841.webm) | [audio/lungad-841.noerr.mp3](audio/lungad-841.noerr.mp3) |
| Size | 102 MB | 141 MB |
| Duration | 1:50:45.04 | 1:49:08.59 |
| Rate | 48 kHz stereo | 48 kHz stereo, 180 kb/s mp3 |

ASR clock used for cuts: 6645.0 s. Decode took 325.2 s, real-time factor 0.049 (about 20× faster than playback).

| Output | Count |
|---|---|
| Cues in the srt / timecode text | 1,866 |
| Err tokens (`诶`) | 156 |
| Cuts after merging neighbours | 147 |
| Audio removed | 96.5 s |
| Kept pieces | 148 |

Text files, still beside the script:

| File | What it is |
|---|---|
| [lungad-841.srt](lungad-841.srt) | Subtitle cues |
| [lungad-841.timecode.txt](lungad-841.timecode.txt) | `[hh:mm:ss]` lines |
| [lungad-841.err.txt](lungad-841.err.txt) | Each cut, clock and seconds |

Cue breaks: gap over 0.55 s, line longer than 42 characters, or `。！？!?`.

## How an err is cut

The spoken err in this episode is not written as「呃」. SenseVoice writes it as「诶」.「呃」count on the full transcript was 0.「誒」is accepted too, but it did not appear.

A cut starts at the err token and ends at the next token. Two errs in a row become one span. Spans shorter than 0.04 s are dropped. Edges get a 12 ms fade so the join does not click. The source is decoded once to 48 kHz stereo and encoded with LAME `-q:a 2`. The 16 kHz wav is only for the recognizer.

Checked cuts:

| Clock | Span | What it is |
|---|---|---|
| 00:00:20 | 20.00–20.54 |「诶」before「喺 telegram」 |
| 00:08:44 | 524.68–526.24 | two「诶」then「油門」 |

Duration check: 1:50:45.04 minus 96.5 s is 1:49:08.5. The mp3 measures 1:49:08.59.

## What it does not do

- It does not catch every spoken err. Short「呃」that the model never emits stay in the audio.
- Some「诶」are mishearings, not hesitations. Those are cut anyway.
-「嗯」「啊」「唔」are not treated as err. They are often real words.「嗯」appeared 35 times and was left in.
- No speaker labels. A phrase can split on a 20-second boundary (`open` / `pilot`).
- Text is simplified Chinese, not written Cantonese. Names are unreliable: 亂gad came out as「乱击」, Spotify as `sportify`, Patreon broken up.
- English is glued to the next word (`youtubesubscribe`).
- This is not a diarizer and not a full filler-word editor.「即係」「其實」are not removed.

## Files

```
artifacts/
  audio_to_timecode.py    pipeline
  REPORT.md               this report
  lungad-841.srt
  lungad-841.timecode.txt
  lungad-841.err.txt
  audio/
    lungad-841.webm       original
    lungad-841.noerr.mp3  err removed
```

The same script is also at `public/audio_to_timecode.py`.
