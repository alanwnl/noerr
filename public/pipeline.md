# NoErr

呢個網站只係亂gad 第841集嘅預覽。呢度唔可以上傳音檔。要剪自己嘅節目，下載 Python 同埋呢份說明，喺自己部機跑。

Python 係成條流程。呢份 Markdown 俾人睇，亦俾 AI agent 跟住做。唔使再練模型，唔使起伺服器。

## 目標

輸入一條音檔。輸出時間碼，同埋一條剪走廣東話「誒」嘅 mp3。

## 要先裝

- ffmpeg，要識 `libmp3lame`
- Python 套件：`sherpa-onnx`、`numpy`、`soundfile`

模型唔使自己搵。腳本見唔到權重，就會下載 `sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17`，放喺 `/tmp/asr/`。

## 點跑

剪走「誒」，同時出時間碼：

```bash
python3 audio_to_timecode.py episode.mp3 --cut-err
```

只係要時間碼，唔剪音：

```bash
python3 audio_to_timecode.py episode.mp3
```

輸出寫喺音檔隔離。

- `episode.srt` 字幕
- `episode.timecode.txt` 時間碼
- `episode.err.txt` 每一刀嘅時間同長度
- `episode.noerr.mp3` 剪完嘅音，要加 `--cut-err` 先有

## 佢點做

1. ffmpeg 轉一條 16 kHz 單聲道，只俾辨聲用。原檔唔會改。
2. SenseVoice，語言 `yue`，每 20 秒一段。每粒字嘅時間加返段開頭，變成成集時間。
3. 寫字幕同時間碼。一句過長，或者中間靜音超過 0.55 秒，就換行。
4. 模型把口頭禪寫成「诶」。亦認「呃」同「誒」。每一粒由個字開始，切到下一粒字。兩刀重疊就合併。短過 0.04 秒唔剪。
5. 原檔只解一次，保持 48 kHz 立體聲。每刀兩邊淡 12 毫秒，再編成 mp3。

## 第841集試過

來源係一條 1 小時 50 分 45 秒嘅節目。辨聲用咗 325 秒，大約快過播放 20 倍。模型寫出 156 個「诶」，合併成 147 刀，剪走 96.5 秒。出嚟係 1 小時 49 分 08 秒。

## 唔好期望

- 模型冇寫出嚟嘅「呃」會留低。
- 有啲「诶」係聽錯，唔係口頭禪，一樣會剪。
- 「嗯」「啊」「唔」「即係」「其實」唔剪。
- 冇分講者。字係簡體，人名同分台名會錯。

## 限制

而家係一次過。機器辨一次、自己剪一次，冇人睇過。短嘅「诶」最易係 false positive：聽錯，或者太短，其實應該留低。呢一頁唔會將標籤送去練模型。

## 下一步

理想係一個循環，唔係一次過。

1. ASR 出時間同字。
2. 機器自己剪一版。
3. 人喺時間線跳去每一刀，聽完標「剪走」或者「留低」。
4. 匯出 JSON。每行有時間、長度、字，同埋決定。`cut` 係真陽性，要剪。`keep` 係 false positive，要留。
5. 下一輪先將呢份標籤喂返俾模型。

Preview 只係示範第 3 同第 4 步。標完可以下載 `lungad-841.labels.json`。個檔唔會自動去練模型。

## For an agent

Run this on the user's machine. Do not retrain. Do not deploy a server.

1. Save `audio_to_timecode.py` next to the audio file.
2. Install ffmpeg with libmp3lame, and Python packages `sherpa-onnx`, `numpy`, `soundfile`.
3. Run `python3 audio_to_timecode.py episode.mp3 --cut-err`.
4. Language is `yue`. The model downloads itself into `/tmp/asr/` if `model.int8.onnx` is missing. The file is `sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17`.
5. A cut is any token in {诶, 呃, 誒}, from that token to the next token. Overlaps merge. Spans under 0.04 seconds are dropped. Edges fade 12 ms. The original file is decoded once at 48 kHz stereo.
6. Read `episode.err.txt` for each cut's clock time and duration. The cleaned audio is `episode.noerr.mp3`.
7. Human review is a separate file, `lungad-841.labels.json`. Each item has `time`, `span`, `seconds`, `text`, and `decision`. `cut` means true positive, remove it. `keep` means false positive, leave that audio in. Do not treat every automatic cut as correct. Feed these labels back on a later training pass. This demo only collects the file. It does not train.

