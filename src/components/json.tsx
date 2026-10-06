import { useState } from "react";
import clsx from "clsx";
import { Check, ChevronRight, Copy } from "lucide-react";
import { Collapse } from "../lib/motion";

/** Strings that are themselves JSON (`"[\"a\",\"b\"]"`) get unpacked and shown as structure. */
function unpack(v: unknown): { value: unknown; parsed: boolean } {
  if (typeof v !== "string") return { value: v, parsed: false };
  const t = v.trim();
  if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
    try {
      return { value: JSON.parse(t), parsed: true };
    } catch {
      /* not JSON after all */
    }
  }
  return { value: v, parsed: false };
}

const isContainer = (v: unknown): v is Record<string, unknown> | unknown[] => typeof v === "object" && v !== null;

export function JsonView({ value, className, copy = true }: { value: unknown; className?: string; copy?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={clsx("group/json relative font-mono text-[12px] leading-[1.7]", className)}>
      {copy && (
        <button
          onClick={() => {
            navigator.clipboard.writeText(JSON.stringify(value, null, 2));
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="absolute top-0 right-0 z-10 grid size-6 cursor-pointer place-items-center rounded text-faint opacity-0 transition-opacity duration-150 group-hover/json:opacity-100 hover:bg-hover hover:text-fg"
          title="Copy JSON"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </button>
      )}
      {isContainer(value) ? <Entries value={value} depth={0} /> : <Leaf value={value} />}
    </div>
  );
}

function Entries({ value, depth }: { value: Record<string, unknown> | unknown[]; depth: number }) {
  const rows = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value);
  if (!rows.length) return <span className="text-faint">{Array.isArray(value) ? "[]" : "{}"}</span>;
  return (
    <div className={clsx(depth > 0 && "ml-[7px] border-l border-line pl-3")}>
      {rows.map(([k, v]) => (
        <Row key={k} k={k} raw={v} depth={depth} index={Array.isArray(value)} />
      ))}
    </div>
  );
}

function Row({ k, raw, depth, index }: { k: string; raw: unknown; depth: number; index: boolean }) {
  const { value, parsed } = unpack(raw);
  const container = isContainer(value);
  const size = container ? (Array.isArray(value) ? value.length : Object.keys(value).length) : 0;
  const [open, setOpen] = useState(depth < 2 && size <= 30);
  const key = <span className={index ? "text-faint" : "text-muted"}>{k}</span>;

  if (!container) {
    const multiline = typeof value === "string" && value.includes("\n");
    return multiline ? (
      <div>
        {key}
        <pre className="my-1 max-h-72 overflow-auto rounded border border-line bg-sunken px-2.5 py-1.5 text-[11.5px] whitespace-pre text-fg">{String(value).replace(/^\n+/, "")}</pre>
      </div>
    ) : (
      <div className="flex gap-2">
        <span className="shrink-0">{key}</span>
        <span className="min-w-0 break-all"><Leaf value={value} /></span>
      </div>
    );
  }
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="-ml-4 flex cursor-pointer items-center gap-1 hover:text-fg">
        <ChevronRight className={clsx("size-3 text-faint transition-transform duration-200 ease-drawer", open && "rotate-90")} />
        {key}
        <span className="text-faint">{Array.isArray(value) ? `[${size}]` : `{${size}}`}</span>
        {parsed && <span className="rounded bg-hover px-1 text-[10px] text-faint">parsed</span>}
      </button>
      <Collapse open={open}><Entries value={value} depth={depth + 1} /></Collapse>
    </div>
  );
}

function Leaf({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-faint">null</span>;
  if (typeof value === "boolean" || typeof value === "number") return <span className="text-num">{String(value)}</span>;
  if (typeof value === "string") {
    if (/^https?:\/\//.test(value))
      return <a href={value} target="_blank" rel="noreferrer" className="text-str underline decoration-str/30 underline-offset-2 hover:decoration-str">{value}</a>;
    return <span className="text-str">{value}</span>;
  }
  return <span>{JSON.stringify(value)}</span>;
}
