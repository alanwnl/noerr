# NoErr

本儲存庫記錄亂gad 第841集的一次試驗：以粵語語音辨識找出口頭禪「誒」，並將其剪除。

這不是一個可以完整複製後直接播放的專案。音訊檔並未上傳。

程式庫：https://github.com/alanwnl/noerr

## 可執行的部分

能夠在本機處理整段音訊的，只有 [`public/audio_to_timecode.py`](public/audio_to_timecode.py)。

該程式執行四項工作：

1. 以 ffmpeg 轉為 16 kHz 單聲道，僅供辨識。原始檔案不會被修改。
2. 以 SenseVoice（語言 `yue`）每 20 秒辨識一段，並將每個字的時間對應回全集時軸。
3. 輸出字幕與時間碼。
4. 加入 `--cut-err` 後才會剪輯。模型寫成「诶」、「呃」或「誒」的字，由該字剪至下一個字。重疊部分合併；短於 0.04 秒者不剪。切口淡化 12 毫秒，輸出 48 kHz 立體聲 mp3。

`src/` 是第841集的預覽網站。前後試聽在 `public/previews/`，所以這個頁面可以播放。全集原檔與剪完的長片並未納入本儲存庫。

## 執行方式

需要：

- 支援 `libmp3lame` 的 ffmpeg
- Python 3
- `pip install sherpa-onnx numpy soundfile`

無需自行準備模型。若找不到權重，程式會下載 `sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17`，存放於 `/tmp/asr/`。檔案約 228MB。

```bash
python3 public/audio_to_timecode.py episode.mp3 --cut-err
```

只需要時間碼、不剪音訊：

```bash
python3 public/audio_to_timecode.py episode.mp3
```

輸出與音訊檔位於同一目錄：

| 檔案 | 內容 |
|---|---|
| `episode.srt` | 字幕 |
| `episode.timecode.txt` | 時間碼 |
| `episode.err.txt` | 每一段剪輯的時間與長度 |
| `episode.noerr.mp3` | 剪輯後的音訊，須加上 `--cut-err` |

第841集的結果：片長 1 小時 50 分 45 秒，辨識約 325 秒。模型標出 156 個「诶」，合併為 147 段，共剪除 96.5 秒。

## 網站為何不能直接執行

執行 `npm install` 後，`npm run dev` 可以開啟介面。試聽片段已放在 `public/previews/`。全集原檔不在本儲存庫內。

此網站亦非上傳服務，不能在頁面提交 mp3 並下載剪輯結果。若要處理自己的節目，請使用上述 Python 指令。

人工覆核後的標記（哪些應剪、哪些屬於誤判而應保留）可在預覽頁下載為 JSON。該檔只收集決定，不會自動訓練模型。

## 限制

- 模型未標出的「呃」會保留。
- 部分「诶」屬於誤聽，仍會被剪除。
- 「嗯」、「啊」、「唔」、「即係」、「其實」不會剪。
- 不區分講者。文字可能為簡體，人名可能有誤。

詳細步驟與限制見 [`public/pipeline.md`](public/pipeline.md)。
