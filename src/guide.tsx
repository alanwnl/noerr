type Block =
  | { kind: "h1" | "h2"; text: string }
  | { kind: "p"; text: string }
  | { kind: "code"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

function parse(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      blocks.push({ kind: "code", text: code.join("\n") });
      index += 1;
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push({ kind: "h2", text: line.slice(3) });
      index += 1;
      continue;
    }
    if (line.startsWith("# ")) {
      blocks.push({ kind: "h1", text: line.slice(2) });
      index += 1;
      continue;
    }
    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (index < lines.length && lines[index].startsWith("- ")) {
        items.push(lines[index].slice(2));
        index += 1;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }
    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\. /.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\. /, ""));
        index += 1;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    const text: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() !== "" &&
      !lines[index].startsWith("#") &&
      !lines[index].startsWith("```") &&
      !lines[index].startsWith("- ") &&
      !/^\d+\. /.test(lines[index])
    ) {
      text.push(lines[index]);
      index += 1;
    }
    blocks.push({ kind: "p", text: text.join(" ") });
  }
  return blocks;
}

function Inline({ text }: { text: string }) {
  const parts = text.split("`");
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <code key={index} className="text-fg">
            {part}
          </code>
        ) : (
          <UrlText key={index} text={part} />
        ),
      )}
    </>
  );
}

function UrlText({ text }: { text: string }) {
  const bits = text.split(/(https?:\/\/[^\s)]+)/);
  return (
    <>
      {bits.map((bit, index) =>
        bit.startsWith("http") ? (
          <a
            key={index}
            href={bit}
            className="text-fg underline"
            target="_blank"
            rel="noreferrer"
          >
            {bit}
          </a>
        ) : (
          <span key={index}>{bit}</span>
        ),
      )}
    </>
  );
}

export function Guide({ source }: { source: string }) {
  return (
    <article className="flex flex-col gap-4">
      {parse(source).map((block, index) => {
        if (block.kind === "h1") {
          return (
            <h1 key={index} className="text-lg text-fg">
              {block.text}
            </h1>
          );
        }
        if (block.kind === "h2") {
          return (
            <h2 key={index} className="pt-2 text-sm text-fg">
              {block.text}
            </h2>
          );
        }
        if (block.kind === "code") {
          return (
            <pre
              key={index}
              className="max-w-full overflow-x-auto rounded-md bg-surface px-4 py-3 text-sm leading-6 text-fg"
            >
              {block.text}
            </pre>
          );
        }
        if (block.kind === "ul" || block.kind === "ol") {
          const Tag = block.kind === "ul" ? "ul" : "ol";
          return (
            <Tag
              key={index}
              className={
                block.kind === "ul"
                  ? "list-disc space-y-2 pl-5 text-sm leading-6 text-muted"
                  : "list-decimal space-y-2 pl-5 text-sm leading-6 text-muted"
              }
            >
              {block.items.map((item) => (
                <li key={item}>
                  <Inline text={item} />
                </li>
              ))}
            </Tag>
          );
        }
        return (
          <p key={index} className="text-sm leading-6 text-muted">
            <Inline text={block.text} />
          </p>
        );
      })}
    </article>
  );
}
