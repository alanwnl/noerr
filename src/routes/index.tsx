import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Pause, Play } from "lucide-react";
import { MOMENTS } from "@/moments";
import { EDITS } from "@/edits";
import { Guide } from "@/guide";

type Side = "before" | "after";
type Word = { t: number; text: string; err: boolean };
type TrackData = {
  src: string;
  duration: number;
  peaks: readonly number[];
  words: readonly Word[];
  cut?: readonly [number, number];
};
type Clip = { before: TrackData; after: TrackData };

type Decision = "cut" | "keep";
type Tab = "preview" | "pipeline";
type Sort = "time" | "duration";

function blankDecisions(): Decision[] {
  return EDITS.map(() => "cut");
}

function readDecisions(): Decision[] {
  try {
    const raw = localStorage.getItem("noerr-labels");
    if (!raw) return blankDecisions();
    const parsed = JSON.parse(raw) as { labels?: { decision?: string }[] };
    if (!parsed.labels || parsed.labels.length !== EDITS.length) return blankDecisions();
    return parsed.labels.map((row) => (row.decision === "keep" ? "keep" : "cut"));
  } catch {
    return blankDecisions();
  }
}

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const audio = useRef<HTMLAudioElement>(null);
  const [tab, setTab] = useState<Tab>("preview");
  const [clip, setClip] = useState<Clip>(MOMENTS[0]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState<number | null>(0);
  const [side, setSide] = useState<Side | null>(null);
  const [progress, setProgress] = useState(0);
  const [notes, setNotes] = useState("");
  const [decisions, setDecisions] = useState<Decision[]>(blankDecisions);
  const [sort, setSort] = useState<Sort>("time");
  const request = useRef(0);
  const chain = useRef(false);
  const playWhenReady = useRef(false);
  const clipRef = useRef(clip);
  clipRef.current = clip;

  const booted = useRef(false);

  useEffect(() => {
    setDecisions(readDecisions());
  }, []);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void load(0);
  }, []);

  useEffect(() => {
    if (tab !== "pipeline" || notes) return;
    void fetch("/pipeline.md")
      .then((response) => response.text())
      .then(setNotes);
  }, [tab, notes]);

  async function load(index: number) {
    const ticket = request.current + 1;
    request.current = ticket;
    chain.current = false;
    audio.current?.pause();
    setSide(null);
    setProgress(0);
    setSelected(index);
    setLoading(index);
    try {
      const response = await fetch(`/previews/${index}.json`);
      if (!response.ok) throw new Error(String(response.status));
      const next = (await response.json()) as Clip;
      if (request.current !== ticket) return;
      setClip(next);
      const el = audio.current;
      if (el) {
        chain.current = false;
        el.src = next.before.src;
        el.load();
      }
    } catch {
      if (request.current === ticket) setSelected(index);
    } finally {
      if (request.current === ticket) setLoading(null);
    }
  }

  function mark(decision: Decision) {
    setDecisions((current) => {
      const next = current.slice();
      next[selected] = decision;
      return next;
    });
  }

  function saveLabels() {
    const body = JSON.stringify(
      {
        episode: "lungad-841",
        task: "cantonese-err-review",
        note: "cut = true positive, remove the err. keep = false positive, leave the audio in.",
        labels: EDITS.map((edit, index) => ({
          time: startCode(edit.span),
          span: edit.span,
          seconds: spanSeconds(edit.span),
          text: edit.text,
          decision: decisions[index] ?? "cut",
        })),
      },
      null,
      2,
    );
    localStorage.setItem("noerr-labels", body);
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/api/labels";
    form.target = "noerr-download";
    const field = document.createElement("input");
    field.type = "hidden";
    field.name = "body";
    field.value = body;
    form.append(field);
    if (!document.querySelector("iframe[name=noerr-download]")) {
      const frame = document.createElement("iframe");
      frame.name = "noerr-download";
      frame.hidden = true;
      document.body.append(frame);
    }
    document.body.append(form);
    form.submit();
    form.remove();
  }

  function start(next: Side, followWithAfter: boolean) {
    const el = audio.current;
    const track = clipRef.current[next];
    if (!el || !track.src) return;
    chain.current = followWithAfter && next === "before";
    el.src = track.src;
    el.currentTime = 0;
    setProgress(0);
    setSide(next);
    void el.play();
  }

  function play(next: Side) {
    const el = audio.current;
    if (!el) return;
    if (side === next && !el.paused) {
      chain.current = false;
      el.pause();
      setSide(null);
      return;
    }
    start(next, false);
  }

  function playPair() {
    const el = audio.current;
    if (el && !el.paused) {
      chain.current = false;
      playWhenReady.current = false;
      el.pause();
      setSide(null);
      return;
    }
    if (loading) {
      playWhenReady.current = true;
      return;
    }
    start("before", true);
  }

  const order = useMemo(() => {
    const indexes = EDITS.map((_, index) => index);
    if (sort === "time") return indexes;
    return indexes.sort(
      (a, b) => spanSeconds(EDITS[b].span) - spanSeconds(EDITS[a].span) || a - b,
    );
  }, [sort]);

  useEffect(() => {
    if (loading || !playWhenReady.current) return;
    playWhenReady.current = false;
    start("before", true);
  }, [loading, clip]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (tab !== "preview") return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, a")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const place = Math.max(0, order.indexOf(selected));
        const next =
          event.key === "ArrowDown"
            ? order[Math.min(place + 1, order.length - 1)]
            : order[Math.max(place - 1, 0)];
        if (next !== selected) void load(next);
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        mark(event.key === "ArrowRight" ? "cut" : "keep");
        return;
      }
      if (event.key === " ") {
        event.preventDefault();
        playPair();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, selected, side, clip, decisions, loading, order]);

  useEffect(() => {
    if (tab !== "preview") return;
    document
      .querySelector<HTMLElement>("[data-edit-selected='true']")
      ?.scrollIntoView({ block: "nearest" });
  }, [selected, tab]);

  return (
    <main className="min-h-dvh px-6 py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <div className="flex gap-6">
          <TabButton
            label="Preview"
            pressed={tab === "preview"}
            onClick={() => setTab("preview")}
          />
          <TabButton
            label="Pipeline"
            pressed={tab === "pipeline"}
            onClick={() => {
              audio.current?.pause();
              setSide(null);
              setTab("pipeline");
            }}
          />
        </div>
        {tab === "preview" ? (
          <>
            <Track
              label="Before"
              data={clip.before}
              active={side === "before"}
              progress={side === "before" ? progress : 0}
              onClick={() => play("before")}
            />
            <Track
              label="After"
              data={clip.after}
              active={side === "after"}
              progress={side === "after" ? progress : 0}
              onClick={() => play("after")}
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={playPair}
                aria-label={side ? "暫停" : "播放"}
                className="inline-flex size-11 items-center justify-center rounded-full bg-fg text-bg"
              >
                {side ? <Pause className="size-4" fill="currentColor" /> : <Play className="size-4" fill="currentColor" />}
              </button>
              <DecisionButton
                label="← 留低"
                pressed={decisions[selected] === "keep"}
                onClick={() => mark("keep")}
              />
              <DecisionButton
                label="剪走 →"
                pressed={decisions[selected] !== "keep"}
                onClick={() => mark("cut")}
              />
              <span className="text-sm text-muted tabular-nums">
                {startCode(EDITS[selected].span)} · ↑↓ 時間 · Space 前後
              </span>
              <button
                type="button"
                onClick={saveLabels}
                className="inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-sm text-fg"
              >
                下載 JSON
              </button>
            </div>
            <p className="text-sm leading-6 text-muted">
              機器當每一刀都係剪走。聽完如果太短或者唔係口頭禪，就標留低。下載嘅檔有時間同決定，留俾下一輪模型。
            </p>
            <div className="flex gap-3">
              <DecisionButton
                label="時間"
                pressed={sort === "time"}
                onClick={() => setSort("time")}
              />
              <DecisionButton
                label="時長"
                pressed={sort === "duration"}
                onClick={() => setSort("duration")}
              />
            </div>
            <ol className="max-h-64 overflow-y-auto">
              {order.map((index) => {
                const edit = EDITS[index];
                return (
                <li key={edit.span}>
                  <button
                    type="button"
                    onClick={() => void load(index)}
                    aria-pressed={selected === index}
                    data-edit-selected={selected === index ? "true" : "false"}
                    className={
                      loading === index
                        ? "flex min-h-11 w-full flex-wrap items-baseline gap-x-4 py-2 text-left text-sm text-accent tabular-nums"
                        : selected === index
                          ? "flex min-h-11 w-full flex-wrap items-baseline gap-x-4 py-2 text-left text-sm text-fg tabular-nums"
                          : "flex min-h-11 w-full flex-wrap items-baseline gap-x-4 py-2 text-left text-sm text-muted tabular-nums"
                    }
                  >
                    <span className="shrink-0">{startCode(edit.span)}</span>
                    <span className="shrink-0">{errDuration(edit.span)}</span>
                    <span className={decisions[index] === "keep" ? "shrink-0 text-accent" : "shrink-0"}>
                      {decisions[index] === "keep" ? "留低" : "剪走"}
                    </span>
                    <span>{edit.text}</span>
                  </button>
                </li>
                );
              })}
            </ol>
          </>
        ) : (
          <>
            <Guide source={notes} />
            <div className="flex flex-wrap gap-3 pt-2">
              <a
                href="/audio_to_timecode.py"
                download="audio_to_timecode.py"
                className="inline-flex min-h-11 items-center rounded-full bg-fg px-4 text-sm text-bg"
              >
                下載 Python
              </a>
              <a
                href="/pipeline.md"
                download="pipeline.md"
                className="inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-sm text-fg"
              >
                下載說明
              </a>
            </div>
          </>
        )}
      </div>
      <audio
        ref={audio}
        preload="none"
        onTimeUpdate={(event) => {
          const el = event.currentTarget;
          const duration = el.duration || clip[side ?? "before"].duration;
          setProgress(duration ? el.currentTime / duration : 0);
        }}
        onEnded={() => {
          if (chain.current) {
            chain.current = false;
            start("after", false);
            return;
          }
          setSide(null);
          setProgress(0);
        }}
      />
    </main>
  );
}

function TabButton({
  label,
  pressed,
  onClick,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={
        pressed
          ? "inline-flex min-h-11 items-center rounded-full bg-fg px-4 text-sm text-bg"
          : "inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-sm text-muted"
      }
    >
      {label}
    </button>
  );
}

function DecisionButton({
  label,
  pressed,
  onClick,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={
        pressed
          ? "inline-flex min-h-11 items-center rounded-full bg-fg px-4 text-sm text-bg"
          : "inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-sm text-muted"
      }
    >
      {label}
    </button>
  );
}

function stampSeconds(stamp: string) {
  const [h, m, rest] = stamp.split(":");
  const [s, ms] = rest.split(",");
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}

function startCode(span: string) {
  const [start] = span.split(" --> ");
  return start.slice(0, 8);
}

function spanSeconds(span: string) {
  const [start, end] = span.split(" --> ");
  return Number((stampSeconds(end) - stampSeconds(start)).toFixed(2));
}

function errDuration(span: string) {
  return `${spanSeconds(span).toFixed(2)}s`;
}

function placeWords(
  words: ReadonlyArray<{ t: number; text: string; err: boolean }>,
  duration: number,
) {
  const merged: { t: number; text: string; err: boolean }[] = [];
  for (const word of words) {
    const prev = merged[merged.length - 1];
    const latin = /^[A-Za-z0-9]+$/.test(word.text);
    const prevLatin = prev ? /^[A-Za-z0-9]+$/.test(prev.text) : false;
    if (prev && prevLatin && latin && word.t - prev.t < 0.45) {
      prev.text += word.text;
      continue;
    }
    merged.push({ ...word });
  }
  const busy = [0, 0, 0];
  const pxPerSec = 280 / duration;
  return merged.map((word) => {
    const widthSec = (textPx(word.text) + 10) / pxPerSec;
    let lane = 0;
    for (let i = 1; i < busy.length; i += 1) {
      if (busy[i] < busy[lane]) lane = i;
    }
    if (busy[lane] > word.t) {
      for (let i = 0; i < busy.length; i += 1) {
        if (busy[i] <= word.t) {
          lane = i;
          break;
        }
      }
    }
    busy[lane] = word.t + widthSec;
    return { ...word, lane };
  });
}

function textPx(text: string) {
  let width = 0;
  for (const char of text) width += char.charCodeAt(0) > 255 ? 12 : 7;
  return width;
}

function Track({
  label,
  data,
  active,
  progress,
  onClick,
}: {
  label: string;
  data: TrackData;
  active: boolean;
  progress: number;
  onClick: () => void;
}) {
  const cut = "cut" in data ? data.cut : null;
  return (
    <button type="button" onClick={onClick} className="w-full text-left">
      <div className={active ? "mb-2 text-sm text-fg" : "mb-2 text-sm text-muted"}>
        {label}
      </div>
      <div className="relative">
        {cut ? (
          <div
            className="absolute inset-y-0 bg-accent/15"
            style={{
              left: `${(cut[0] / data.duration) * 100}%`,
              width: `${((cut[1] - cut[0]) / data.duration) * 100}%`,
            }}
          />
        ) : null}
        <div className="relative h-16 overflow-hidden">
          {placeWords(data.words, data.duration).map((word) => (
            <span
              key={`${word.t}-${word.text}`}
              className={
                word.err
                  ? "absolute whitespace-nowrap text-xs text-accent"
                  : "absolute whitespace-nowrap text-xs text-fg"
              }
              style={{
                left: `${(word.t / data.duration) * 100}%`,
                top: `${word.lane * 1.25}rem`,
              }}
            >
              {word.text}
            </span>
          ))}
        </div>
        <div className="flex h-12 items-center gap-px">
          {data.peaks.map((peak, index) => {
            const at = ((index + 0.5) / data.peaks.length) * data.duration;
            const inCut = cut ? at >= cut[0] && at < cut[1] : false;
            return (
              <span
                key={index}
                className={
                  inCut
                    ? "min-w-0 flex-1 rounded-sm bg-accent"
                    : active
                      ? "min-w-0 flex-1 rounded-sm bg-fg"
                      : "min-w-0 flex-1 rounded-sm bg-muted"
                }
                style={{ height: `${Math.max(8, peak * 100)}%` }}
              />
            );
          })}
        </div>
        {active ? (
          <div
            className="absolute inset-y-0 w-px bg-fg"
            style={{ left: `${Math.min(progress, 1) * 100}%` }}
          />
        ) : null}
      </div>
    </button>
  );
}
