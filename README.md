# NoErr

亂gad 第841集嘅一次試驗：用廣東話語音辨識搵出口頭禪「誒」，再剪走。

呢個 repo **唔係一個完整、可以成舊 clone 出嚟就播到嘅 project**。音檔故意冇放上嚟。

## 邊度先係用得嘅

真正可以喺自己部機跑完一條片嘅，只有 [`public/audio_to_timecode.py`](public/audio_to_timecode.py)。

佢做四件事：

1. 用 ffmpeg 轉一條 16 kHz 單聲道，只俾辨聲。原檔唔改。
2. 用 SenseVoice（語言 `yue`）每 20 秒辨一段，每粒字對返成集時間。
3. 寫字幕同時間碼。
4. 加 `--cut-err` 先會剪。模型寫成「诶」「呃」或「誒」嘅字，由嗰粒字剪到下一粒。重疊合併，短過 0.04 秒唔剪，刀口淡 12 毫秒，出一條 48 kHz 立體聲 mp3。

`src/` 係第841集嘅預覽網站：前後波形、時間清單、標「剪走」定「留低」、下載 JSON。147 段試聽同埋全集音訊都冇入 repo，所以呢個網站 clone 落嚟唔會有聲。

## 點樣跑條 pipeline

要先有：

- ffmpeg，要識 `libmp3lame`
- Python 3
- `pip install sherpa-onnx numpy soundfile`

模型唔使自己帶。腳本見唔到權重，會自己下載 `sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17`，放喺 `/tmp/asr/`。個檔大約 228MB。

```bash
python3 public/audio_to_timecode.py episode.mp3 --cut-err
```

只係要時間碼，唔剪音：

```bash
python3 public/audio_to_timecode.py episode.mp3
```

輸出寫喺音檔隔離：

| 檔 | 內容 |
|---|---|
| `episode.srt` | 字幕 |
| `episode.timecode.txt` | 時間碼 |
| `episode.err.txt` | 每一刀嘅時間同長度 |
| `episode.noerr.mp3` | 剪完嘅音，要加 `--cut-err` 先有 |

第841集試過：1 小時 50 分 45 秒，辨聲大約 325 秒，156 個「诶」合併成 147 刀，剪走 96.5 秒。

## 網站點解唔可以就咁跑

`npm install` 之後 `npm run dev` 可以開到個殼，但 `/clips/*.mp3` 同 `/previews/*.json` 唔喺 repo，撳時間清單唔會有聲。呢啲檔係生成出嚟嘅試聽，唔係程式。

網站亦唔係上傳服務。唔可以喺頁面交一條 mp3 等佢剪完再下載。要剪自己嘅節目，用上面嗰句 Python。

人聽完之後嘅標籤（邊刀要剪、邊刀係聽錯要留）可以喺預覽頁下載成 JSON。呢份檔只係收集決定，唔會自動練模型。

## 唔好期望

- 模型冇寫出嚟嘅「呃」會留低。
- 有啲「诶」係聽錯，一樣會被剪。
- 「嗯」「啊」「唔」「即係」「其實」唔剪。
- 冇分講者。字可能係簡體，人名會錯。

再詳細嘅步驟同限制喺 [`public/pipeline.md`](public/pipeline.md)。
