#!/usr/bin/env python3
"""Slice one err cut from the 16 kHz episode and print preview JSON."""

import base64
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import sherpa_onnx

WAV = Path("/workspace/data/asr/lungad-841-16k.wav")
MODEL = Path("/workspace/data/asr/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17")
FFMPEG = "/usr/local/bin/ffmpeg"
ERR = {"诶", "呃", "誒"}
PAD_BEFORE = 1.6
PAD_AFTER = 3.2
SR = 16000


def mp3(samples: np.ndarray) -> str:
    proc = subprocess.run(
        [
            FFMPEG, "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1",
            "-i", "pipe:0", "-c:a", "libmp3lame", "-q:a", "5", "-f", "mp3", "pipe:1",
        ],
        input=np.ascontiguousarray(samples, dtype=np.float32).tobytes(),
        capture_output=True,
        check=True,
    )
    return base64.b64encode(proc.stdout).decode("ascii")


def peaks(samples: np.ndarray, n: int = 120) -> list[float]:
    if len(samples) == 0:
        return [0.0] * n
    hop = max(1, len(samples) / n)
    vals = []
    for i in range(n):
        sl = samples[int(i * hop) : int((i + 1) * hop)]
        vals.append(float(np.max(np.abs(sl))) if len(sl) else 0.0)
    top = max(vals) or 1.0
    return [round(v / top, 3) for v in vals]


def words(tokens: list[tuple[float, str]]) -> list[dict]:
    out = []
    buf: list[tuple[float, str]] = []

    def flush() -> None:
        if not buf:
            return
        out.append({
            "t": round(buf[0][0], 3),
            "text": "".join(w for _, w in buf),
            "err": any(w in ERR for _, w in buf),
        })
        buf.clear()

    for t, w in tokens:
        if w in "，。、！？,.!? ":
            flush()
            continue
        err = w in ERR
        latin = any(ch.isascii() and ch.isalnum() for ch in w)
        if err or latin:
            flush()
            out.append({"t": round(t, 3), "text": w, "err": err})
            continue
        if buf and (t - buf[-1][0] > 0.4 or len(buf) >= 4):
            flush()
        buf.append((t, w))
    flush()
    return out


def seconds(stamp: str) -> float:
    h, m, rest = stamp.split(":")
    s, ms = rest.split(",")
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000


def recognizer():
    return sherpa_onnx.OfflineRecognizer.from_sense_voice(
        model=str(MODEL / "model.int8.onnx"),
        tokens=str(MODEL / "tokens.txt"),
        num_threads=2,
        language="yue",
        use_itn=True,
    )


def slice_clip(rec, pcm: np.ndarray, total: float, c0: float, c1: float) -> dict:
    start = max(0.0, c0 - PAD_BEFORE)
    end = min(total, c1 + PAD_AFTER)
    i_start = int(start * SR)
    i_end = int(end * SR)
    audio = np.ascontiguousarray(pcm[i_start:i_end], dtype=np.float32)
    rel0 = c0 - start
    rel1 = min(c1 - start, len(audio) / SR)
    i0 = int(rel0 * SR)
    i1 = int(rel1 * SR)
    after = np.concatenate([audio[:i0], audio[i1:]])

    stream = rec.create_stream()
    stream.accept_waveform(SR, audio)
    rec.decode_stream(stream)
    tokens = [
        (float(ts), tok.strip())
        for tok, ts in zip(stream.result.tokens, stream.result.timestamps)
        if tok.strip()
    ]
    gap = rel1 - rel0
    kept = []
    for t, w in tokens:
        if (w in ERR and rel0 - 0.55 <= t < rel1) or rel0 <= t < rel1:
            continue
        if t >= rel1:
            t -= gap
        kept.append((t, w))

    return {
        "before": {
            "src": "data:audio/mpeg;base64," + mp3(audio),
            "duration": round(len(audio) / SR, 3),
            "peaks": peaks(audio),
            "words": words(tokens),
            "cut": [round(rel0, 3), round(rel1, 3)],
        },
        "after": {
            "src": "data:audio/mpeg;base64," + mp3(after),
            "duration": round(len(after) / SR, 3),
            "peaks": peaks(after),
            "words": words(kept),
        },
    }


def main() -> None:
    import soundfile as sf

    pcm, rate = sf.read(str(WAV), dtype="float32")
    if pcm.ndim > 1:
        pcm = pcm.mean(axis=1)
    if rate != SR:
        raise SystemExit(f"expected {SR} Hz, got {rate}")
    total = len(pcm) / SR
    rec = recognizer()

    if len(sys.argv) > 1 and sys.argv[1] == "--all":
        spans = json.loads(Path(sys.argv[2]).read_text())
        out_dir = Path(sys.argv[3])
        out_dir.mkdir(parents=True, exist_ok=True)
        for index, span in enumerate(spans):
            left, right = span.split(" --> ")
            body = slice_clip(rec, pcm, total, seconds(left), seconds(right))
            (out_dir / f"{index}.json").write_text(json.dumps(body, ensure_ascii=False))
            print(index, flush=True)
        return

    c0 = float(sys.argv[1])
    c1 = float(sys.argv[2])
    json.dump(slice_clip(rec, pcm, total, c0, c1), sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
