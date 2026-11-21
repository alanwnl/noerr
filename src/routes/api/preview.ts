import { spawn } from "node:child_process";
import { createFileRoute } from "@tanstack/react-router";
import * as OpenCC from "opencc-js";
import { EDITS } from "@/edits";

const toHk = OpenCC.Converter({ from: "cn", to: "hk" });
const cache = new Map<number, string>();

function seconds(stamp: string) {
  const [h, m, rest] = stamp.split(":");
  const [s, ms] = rest.split(",");
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}

function runCut(start: number, end: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "python3",
      ["/workspace/scripts/preview_cut.py", String(start), String(end)],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    let err = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk) => {
      err += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(err || `preview failed (${code})`));
      else resolve(out);
    });
  });
}

export const Route = createFileRoute("/api/preview")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const index = Number(new URL(request.url).searchParams.get("i"));
        if (!Number.isInteger(index) || index < 0 || index >= EDITS.length) {
          return Response.json({ error: "bad index" }, { status: 400 });
        }
        try {
          let raw = cache.get(index);
          if (!raw) {
            const [a, b] = EDITS[index].span.split(" --> ");
            raw = await runCut(seconds(a), seconds(b));
            cache.set(index, raw);
          }
          const body = JSON.parse(raw) as {
            before: { words: { text: string }[] };
            after: { words: { text: string }[] };
          };
          for (const side of [body.before, body.after]) {
            for (const word of side.words) word.text = toHk(word.text);
          }
          return Response.json(body, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          const message = error instanceof Error ? error.message : "preview failed";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
