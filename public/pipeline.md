# NoErr

本網站只是亂gad 第841集的預覽。此處不能上傳音訊。若要剪輯自己的節目，請下載 Python 與本說明，在自己的電腦上執行。

程式與本說明：https://github.com/alanwnl/noerr

Python 是完整流程。這份 Markdown 供人閱讀，也供 AI agent 遵循。不需要重新訓練模型，也不需要架設伺服器。

## 目標

輸入一個音訊檔。輸出時間碼，以及一條已剪除粵語「誒」的 mp3。

## 安裝

- ffmpeg，須支援 `libmp3lame`
- Python 套件：`sherpa-onnx`、`numpy`、`soundfile`

無需自行尋找模型。若腳本找不到權重，會下載 `sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17`，存放於 `/tmp/asr/`。

## 執行

剪除「誒」，並同時輸出時間碼：

```bash
python3 audio_to_timecode.py episode.mp3 --cut-err
```

只需要時間碼、不剪音訊：

```bash
python3 audio_to_timecode.py episode.mp3
```

輸出與音訊檔位於同一目錄。

- `episode.srt`：字幕
- `episode.timecode.txt`：時間碼
- `episode.err.txt`：每一段剪輯的時間與長度
- `episode.noerr.mp3`：剪輯後的音訊，須加上 `--cut-err`

## 處理步驟

1. ffmpeg 轉為 16 kHz 單聲道，僅供辨識。原始檔案不會被修改。
2. SenseVoice，語言 `yue`，每 20 秒一段。每個字的時間加上該段起點，對應回全集時軸。
3. 寫出字幕與時間碼。一句過長，或中間靜音超過 0.55 秒，即換行。
4. 模型將口頭禪寫成「诶」，亦辨識「呃」與「誒」。每一段由該字開始，切至下一個字。重疊則合併。短於 0.04 秒者不剪。
5. 原始檔只解碼一次，保持 48 kHz 立體聲。每段兩端淡化 12 毫秒，再編成 mp3。

## 第841集的結果

來源為一條 1 小時 50 分 45 秒的節目。辨識耗時 325 秒，約為播放速度的 20 倍。模型標出 156 個「诶」，合併為 147 段，共剪除 96.5 秒。輸出為 1 小時 49 分 08 秒。

## 不要預期

- 模型未標出的「呃」會保留。
- 部分「诶」屬於誤聽，並非口頭禪，仍會被剪除。
- 「嗯」、「啊」、「唔」、「即係」、「其實」不會剪。
- 不區分講者。文字為簡體，人名與節目名稱可能有誤。

## 限制

目前是單次處理。機器辨識一次、自行剪輯一次，未經人工覆核。較短的「诶」最容易是 false positive：誤聽，或過短，其實應該保留。本頁不會把標記送去訓練模型。

## 下一步

理想是一個循環，而不是單次處理。

1. ASR 輸出時間與文字。
2. 機器自行剪出一版。
3. 人在時間線跳至每一段，聽完後標記「剪走」或「留低」。
4. 匯出 JSON。每筆包含時間、長度、文字與決定。`cut` 是真陽性，應剪除。`keep` 是 false positive，應保留。
5. 下一輪才把這份標記交回模型。

Preview 只示範第 3 與第 4 步。標記完成後可下載 `lungad-841.labels.json`。該檔不會自動用於訓練模型。

## For an agent

Run this on the user's machine. Do not retrain. Do not deploy a server.

1. Save `audio_to_timecode.py` next to the audio file. The source is https://github.com/alanwnl/noerr.
2. Install ffmpeg with libmp3lame, and Python packages `sherpa-onnx`, `numpy`, `soundfile`.
3. Run `python3 audio_to_timecode.py episode.mp3 --cut-err`.
4. Language is `yue`. The model downloads itself into `/tmp/asr/` if `model.int8.onnx` is missing. The file is `sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17`.
5. A cut is any token in {诶, 呃, 誒}, from that token to the next token. Overlaps merge. Spans under 0.04 seconds are dropped. Edges fade 12 ms. The original file is decoded once at 48 kHz stereo.
6. Read `episode.err.txt` for each cut's clock time and duration. The cleaned audio is `episode.noerr.mp3`.
7. Human review is a separate file, `lungad-841.labels.json`. Each item has `time`, `span`, `seconds`, `text`, and `decision`. `cut` means true positive, remove it. `keep` means false positive, leave that audio in. Do not treat every automatic cut as correct. Feed these labels back on a later training pass. This demo only collects the file. It does not train.
