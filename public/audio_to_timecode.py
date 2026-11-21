#!/usr/bin/env python3
"""Complete pipeline: audio file -> timecode -> optional err cut.

1. Download SenseVoice int8 if model.int8.onnx is missing.
2. ffmpeg: any audio -> 16 kHz mono wav (decode only, not saved).
3. SenseVoice, language yue, 20 s chunks. Token times are offset
   back onto the original clock.
4. Group tokens into cues. Write <name>.srt and <name>.timecode.txt.
5. With --cut-err: each 诶/呃/誒 token is a cut from its start to the
   next token. Merge overlaps, 12 ms edge fade, one-pass encode to
   <name>.noerr.mp3. The cut list is <name>.err.txt.

  python3 audio_to_timecode.py episode.webm
  python3 audio_to_timecode.py episode.webm --cut-err
"""

import argparse
import shutil
import subprocess
import tarfile
import tempfile
import time
import urllib.request
from pathlib import Path

import numpy as np
import sherpa_onnx
import soundfile as sf

CHUNK_S = 20.0
GAP_S = 0.55
MAX_CHARS = 42
ERR_TOKENS = {"诶", "呃", "誒"}
MODEL_NAME = "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17"
MODEL_URL = (
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/"
    f"{MODEL_NAME}.tar.bz2"
)
DEFAULT_MODEL = Path("/tmp/asr") / MODEL_NAME


def ffmpeg_bin() -> str:
    found = shutil.which("ffmpeg")
    if found:
        return found
    fallback = "/usr/local/bin/ffmpeg"
    if Path(fallback).is_file():
        return fallback
    raise SystemExit("ffmpeg not found")


def hms(seconds: float) -> str:
    ms = int(round(max(0.0, seconds) * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def hms_plain(seconds: float) -> str:
    ms = int(round(max(0.0, seconds) * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, _ = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}"


def ensure_model(model_dir: Path) -> Path:
    model = model_dir / "model.int8.onnx"
    tokens = model_dir / "tokens.txt"
    if model.is_file() and tokens.is_file():
        return model_dir
    model_dir.parent.mkdir(parents=True, exist_ok=True)
    archive = model_dir.parent / f"{MODEL_NAME}.tar.bz2"
    print(f"downloading {MODEL_URL}", flush=True)
    urllib.request.urlretrieve(MODEL_URL, archive)
    with tarfile.open(archive, "r:bz2") as tar:
        tar.extractall(model_dir.parent)
    archive.unlink(missing_ok=True)
    if not model.is_file():
        raise SystemExit(f"model missing after extract: {model}")
    return model_dir


def to_16k(src: Path, dst: Path) -> None:
    subprocess.run(
        [
            ffmpeg_bin(),
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(src),
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            str(dst),
        ],
        check=True,
    )


def group(pairs):
    cues = []
    buf = []

    def flush():
        if not buf:
            return
        text = "".join(tok for _, tok in buf).strip()
        if text:
            cues.append((buf[0][0], buf[-1][0], text))
        buf.clear()

    prev = None
    for t, tok in pairs:
        tok = tok.strip()
        if not tok:
            continue
        if buf and prev is not None:
            length = sum(len(x) for _, x in buf)
            if t - prev > GAP_S or length >= MAX_CHARS or buf[-1][1] in "。！？!?":
                flush()
        buf.append((t, tok))
        prev = t
    flush()
    return cues


def err_spans(pairs, chunk_end):
    """Wall-clock span of each err token, ending at the next token."""
    clean = [(t, tok.strip()) for t, tok in pairs if tok.strip()]
    spans = []
    for i, (t, tok) in enumerate(clean):
        if tok not in ERR_TOKENS:
            continue
        end = clean[i + 1][0] if i + 1 < len(clean) else min(chunk_end, t + 0.45)
        if end - t >= 0.04:
            spans.append((t, end))
    return spans


def merge_spans(spans):
    merged = []
    for a, b in sorted(spans):
        if merged and a <= merged[-1][1] + 0.03:
            merged[-1] = (merged[-1][0], max(merged[-1][1], b))
        else:
            merged.append((a, b))
    return merged


def keep_ranges(duration, cuts):
    keep = []
    cursor = 0.0
    for a, b in cuts:
        a = min(max(0.0, a), duration)
        b = min(max(a, b), duration)
        if a > cursor + 0.02:
            keep.append((cursor, a))
        cursor = max(cursor, b)
    if duration - cursor > 0.02:
        keep.append((cursor, duration))
    return keep


def write_mp3(src: Path, keeps, dst: Path, sample_rate: int = 48000, channels: int = 2) -> None:
    """One-pass cut. Decode the source once, drop err spans, encode mp3."""
    fade_n = int(0.012 * sample_rate)
    width = 2 * channels
    block = sample_rate * width
    ranges = [(int(a * sample_rate), int(b * sample_rate)) for a, b in keeps]
    ff = ffmpeg_bin()
    decoder = subprocess.Popen(
        [
            ff, "-v", "error", "-i", str(src),
            "-f", "s16le", "-acodec", "pcm_s16le",
            "-ar", str(sample_rate), "-ac", str(channels), "pipe:1",
        ],
        stdout=subprocess.PIPE,
    )
    encoder = subprocess.Popen(
        [
            ff, "-y", "-v", "error",
            "-f", "s16le", "-ar", str(sample_rate), "-ac", str(channels),
            "-i", "pipe:0", "-c:a", "libmp3lame", "-q:a", "2", str(dst),
        ],
        stdin=subprocess.PIPE,
    )

    def emit(samples, fade_in, fade_out):
        if len(samples) == 0:
            return
        audio = samples.astype(np.float32)
        n = min(fade_n, len(audio) // 2)
        if n > 0 and fade_in:
            audio[:n] *= np.linspace(0.0, 1.0, n, dtype=np.float32)[:, None]
        if n > 0 and fade_out:
            audio[-n:] *= np.linspace(1.0, 0.0, n, dtype=np.float32)[:, None]
        encoder.stdin.write(np.clip(audio, -32768, 32767).astype(np.int16).tobytes())

    pos = 0
    ri = 0
    leftover = b""
    while True:
        chunk = decoder.stdout.read(block)
        if not chunk:
            break
        raw = leftover + chunk
        n = len(raw) // width
        leftover = raw[n * width :]
        if n == 0:
            continue
        audio = np.frombuffer(raw[: n * width], dtype=np.int16).reshape(n, channels)
        block_end = pos + n
        while ri < len(ranges) and ranges[ri][1] <= pos:
            ri += 1
        j = ri
        while j < len(ranges) and ranges[j][0] < block_end:
            a, b = ranges[j]
            lo = max(a, pos) - pos
            hi = min(b, block_end) - pos
            if hi > lo:
                emit(audio[lo:hi], fade_in=(pos + lo == a), fade_out=(pos + hi == b))
            j += 1
        pos = block_end

    encoder.stdin.close()
    if decoder.wait() != 0 or encoder.wait() != 0:
        raise SystemExit("ffmpeg cut failed")


def transcribe(wav: Path, model_dir: Path, language: str):
    rec = sherpa_onnx.OfflineRecognizer.from_sense_voice(
        model=str(model_dir / "model.int8.onnx"),
        tokens=str(model_dir / "tokens.txt"),
        num_threads=2,
        language=language,
        use_itn=True,
    )
    info = sf.info(str(wav))
    total = info.frames / info.samplerate
    cues = []
    errs = []
    t0 = time.time()
    with sf.SoundFile(str(wav)) as f:
        n = 0
        while True:
            start = f.tell() / f.samplerate
            audio = f.read(int(CHUNK_S * f.samplerate), dtype="float32")
            if len(audio) == 0:
                break
            chunk_end = start + len(audio) / f.samplerate
            if audio.ndim > 1:
                audio = audio.mean(axis=1)
            stream = rec.create_stream()
            stream.accept_waveform(f.samplerate, np.ascontiguousarray(audio))
            rec.decode_stream(stream)
            result = stream.result
            pairs = [
                (start + float(ts), tok)
                for tok, ts in zip(result.tokens, result.timestamps)
            ]
            cues.extend(group(pairs))
            errs.extend(err_spans(pairs, chunk_end))
            n += 1
            if n % 15 == 0:
                done = chunk_end
                print(
                    f"  {done:7.1f}/{total:.0f}s  cues={len(cues)}  "
                    f"err={len(errs)}  rtf={(time.time() - t0) / done:.3f}",
                    flush=True,
                )
    print(
        f"done {len(cues)} cues, {len(errs)} err in {time.time() - t0:.1f}s",
        flush=True,
    )
    return cues, errs


def write_outputs(cues, srt_path: Path, txt_path: Path) -> None:
    srt = []
    txt = []
    for i, (a, b, text) in enumerate(cues, 1):
        srt.append(f"{i}\n{hms(a)} --> {hms(max(b, a + 0.3))}\n{text}\n")
        txt.append(f"[{hms_plain(a)}] {text}")
    srt_path.write_text("\n".join(srt) + "\n", encoding="utf-8")
    txt_path.write_text("\n".join(txt) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audio", type=Path)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--language", default="yue")
    parser.add_argument(
        "--cut-err",
        action="store_true",
        help="Cut 诶/呃/誒 using token times and write a mp3",
    )
    args = parser.parse_args()
    if not args.audio.is_file():
        raise SystemExit(f"not a file: {args.audio}")

    model_dir = ensure_model(args.model)
    stem = args.audio.with_suffix("")
    srt_path = stem.with_name(stem.name + ".srt")
    txt_path = stem.with_name(stem.name + ".timecode.txt")
    err_path = stem.with_name(stem.name + ".err.txt")
    mp3_path = stem.with_name(stem.name + ".noerr.mp3")

    with tempfile.TemporaryDirectory(prefix="asr-") as tmp:
        wav = Path(tmp) / "audio.wav"
        print(f"convert {args.audio}", flush=True)
        to_16k(args.audio, wav)
        cues, errs = transcribe(wav, model_dir, args.language)
        duration = sf.info(str(wav)).frames / 16000

    write_outputs(cues, srt_path, txt_path)
    print(f"srt  {srt_path}")
    print(f"txt  {txt_path}")
    if not args.cut_err:
        return

    cuts = merge_spans(errs)
    keeps = keep_ranges(duration, cuts)
    removed = sum(b - a for a, b in cuts)
    err_path.write_text(
        "\n".join(f"{hms_plain(a)}  {a:.2f}-{b:.2f}" for a, b in cuts) + "\n",
        encoding="utf-8",
    )
    print(f"cut {len(cuts)} err  removed {removed:.1f}s  keep {len(keeps)}", flush=True)
    write_mp3(args.audio, keeps, mp3_path)
    print(f"mp3  {mp3_path}")


if __name__ == "__main__":
    main()
