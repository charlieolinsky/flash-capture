import { Fragment } from "react";

interface Props {
  text: string;
  className?: string;
}

type Block =
  | { kind: "text"; value: string }
  | { kind: "code"; lang: string; value: string };

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const fence = /```([^\n`]*)\n?([\s\S]*?)```/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(source)) !== null) {
    if (match.index > last) {
      blocks.push({ kind: "text", value: source.slice(last, match.index) });
    }
    blocks.push({
      kind: "code",
      lang: match[1].trim(),
      value: match[2].replace(/\n$/, ""),
    });
    last = match.index + match[0].length;
  }
  if (last < source.length) {
    blocks.push({ kind: "text", value: source.slice(last) });
  }
  return blocks.length ? blocks : [{ kind: "text", value: source }];
}

function InlineText({ value }: { value: string }) {
  const parts = value.split(/(`[^`\n]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("`") && part.endsWith("`") && part.length >= 3) {
          return (
            <code key={i} className="md-inline">
              {part.slice(1, -1)}
            </code>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

export default function MarkdownBody({ text, className }: Props) {
  const blocks = parseBlocks(text);
  return (
    <div className={className ? `md-body ${className}` : "md-body"}>
      {blocks.map((block, i) =>
        block.kind === "code" ? (
          <pre key={i} className="md-code">
            {block.lang ? <span className="md-code-lang">{block.lang}</span> : null}
            <code>{block.value}</code>
          </pre>
        ) : (
          <InlineText key={i} value={block.value} />
        ),
      )}
    </div>
  );
}
