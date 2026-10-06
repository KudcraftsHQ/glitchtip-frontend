import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import { format } from "date-fns";
import type { Breadcrumb, Frame, Schemas } from "../lib/api";
import { Badge, LevelDot } from "./ui";
import { JsonView } from "./json";
import { Collapse } from "../lib/motion";
import { normalizeFrame, type RawFrame } from "../lib/issue";

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {aside && <div className="ml-auto flex items-center gap-2 text-[12px] text-muted">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- exception

type ExceptionValue = {
  type?: string;
  value?: string;
  module?: string;
  mechanism?: { type?: string; handled?: boolean };
  stacktrace?: { frames?: Frame[] } | null;
};

export function ExceptionBlock({ data }: { data: Record<string, unknown> }) {
  const values = ((data.values as ExceptionValue[] | undefined) ?? []).slice().reverse();
  const [fullTrace, setFullTrace] = useState(false);
  return (
    <Section
      title="Exception"
      aside={
        <label className="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={fullTrace} onChange={(e) => setFullTrace(e.target.checked)} className="size-3 accent-fg" />
          Full stack trace
        </label>
      }
    >
      <div className="space-y-5">
        {values.map((v, i) => (
          <div key={i}>
            {i > 0 && <div className="mb-3 text-[11.5px] text-faint">During handling of the above, this was raised by:</div>}
            <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-[13px] font-semibold">{v.type}</span>
              {v.mechanism?.handled === false && <Badge tone="accent">unhandled</Badge>}
              {v.mechanism?.type && <Badge>{v.mechanism.type}</Badge>}
            </div>
            {v.value && <pre className="mb-3 font-mono text-[12.5px] break-words whitespace-pre-wrap text-muted">{v.value}</pre>}
            {v.stacktrace?.frames?.length ? <StackTrace frames={v.stacktrace.frames} full={fullTrace} /> : null}
          </div>
        ))}
      </div>
    </Section>
  );
}

function StackTrace({ frames, full }: { frames: Frame[]; full: boolean }) {
  const ordered = frames.map((f) => normalizeFrame(f as RawFrame)).reverse(); // most recent call first
  const anyInApp = ordered.some((f) => f.in_app);
  const isApp = (f: Frame) => !anyInApp || !!f.in_app;
  const firstApp = ordered.findIndex(isApp);
  const [open, setOpen] = useState<Set<number>>(() => new Set(firstApp >= 0 ? [firstApp] : []));
  const [shownGroups, setShownGroups] = useState<Set<number>>(new Set());

  // Collapse runs of library frames into one expandable row.
  const groups: { start: number; frames: Frame[]; app: boolean }[] = [];
  ordered.forEach((f, i) => {
    const app = full || isApp(f);
    const last = groups[groups.length - 1];
    if (last && !last.app && !app) last.frames.push(f);
    else groups.push({ start: i, frames: [f], app });
  });

  const toggle = (i: number) => {
    const next = new Set(open);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setOpen(next);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-panel">
      {groups.map((g) => {
        const rows = g.frames.map((f, k) => (
          <FrameRow key={g.start + k} frame={f} app={isApp(f)} open={open.has(g.start + k)} onToggle={() => toggle(g.start + k)} />
        ));
        if (g.app) return rows;
        const shown = shownGroups.has(g.start);
        return (
          <div key={g.start} className="border-b border-line last:border-b-0">
            <button
              onClick={() => {
                const next = new Set(shownGroups);
                if (shown) next.delete(g.start);
                else next.add(g.start);
                setShownGroups(next);
              }}
              className="flex h-7 w-full cursor-pointer items-center gap-2 bg-sunken px-3 text-[11.5px] text-faint transition-colors duration-100 hover:text-fg"
            >
              <ChevronRight className={clsx("size-3 transition-transform duration-200 ease-drawer", shown && "rotate-90")} />
              {shown ? "Hide" : ""} {g.frames.length} library {g.frames.length === 1 ? "frame" : "frames"}
            </button>
            <Collapse open={shown}>
              <div className="border-t border-line [&>*:last-child]:border-b-0">{rows}</div>
            </Collapse>
          </div>
        );
      })}
    </div>
  );
}

function FrameRow({ frame, app, open, onToggle }: { frame: Frame; app: boolean; open: boolean; onToggle: () => void }) {
  const file = frame.filename || frame.abs_path || frame.module || "<unknown>";
  const hasContext = !!frame.context_line || !!(frame.vars && Object.keys(frame.vars).length);
  return (
    <div className="border-b border-line last:border-b-0">
      <button
        onClick={hasContext ? onToggle : undefined}
        className={clsx(
          "flex min-h-9 w-full flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-1.5 text-left font-mono text-[12px] transition-colors duration-100 md:min-h-8 md:flex-nowrap",
          hasContext && "cursor-pointer hover:bg-hover",
          !app && "text-muted",
        )}
      >
        <span className="w-3 shrink-0 text-faint">
          {hasContext && <ChevronRight className={clsx("size-3 transition-transform duration-200 ease-drawer", open && "rotate-90")} />}
        </span>
        <span className={clsx("min-w-0 break-all md:truncate", app && "font-medium")}>{file}</span>
        {frame.function && (
          <>
            <span className="shrink-0 text-faint">in</span>
            <span className={clsx("truncate", app ? "text-fg" : "text-muted")}>{frame.function}</span>
          </>
        )}
        {frame.lineno != null && (
          <span className="shrink-0 text-faint">
            :{frame.lineno}
            {frame.colno != null && `:${frame.colno}`}
          </span>
        )}
        {app && <span className="ml-auto shrink-0"><Badge>app</Badge></span>}
      </button>
      {hasContext && <Collapse open={open}><FrameContext frame={frame} /></Collapse>}
    </div>
  );
}

function FrameContext({ frame }: { frame: Frame }) {
  const pre = frame.pre_context ?? [];
  const post = frame.post_context ?? [];
  const line = frame.lineno ?? 0;
  const lines = [
    ...pre.map((t, i) => ({ n: line - pre.length + i, t, hit: false })),
    ...(frame.context_line != null ? [{ n: line, t: frame.context_line, hit: true }] : []),
    ...post.map((t, i) => ({ n: line + 1 + i, t, hit: false })),
  ];
  const vars = frame.vars ? Object.entries(frame.vars) : [];
  return (
    <div className="border-t border-line bg-sunken">
      {lines.length > 0 && (
        <pre className="overflow-x-auto py-1.5 font-mono text-[12px] leading-[1.65]">
          {lines.map((l) => (
            <div key={l.n} className={clsx("flex", l.hit && "bg-error/12")}>
              <span className={clsx("w-14 shrink-0 pr-3 text-right select-none", l.hit ? "text-error" : "text-faint")}>{l.n}</span>
              <span className={clsx("pr-4", !l.hit && "text-muted")}>{l.t ?? ""}</span>
            </div>
          ))}
        </pre>
      )}
      {vars.length > 0 && (
        <div className="border-t border-line px-3 py-2">
          <div className="mb-1 text-[11px] text-faint">Locals</div>
          <JsonView value={frame.vars} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- message

export function MessageBlock({ data }: { data: Record<string, unknown> }) {
  const text = String(data.formatted ?? data.message ?? "");
  if (!text) return null;
  return (
    <Section title="Message">
      <pre className="rounded-lg border border-line bg-panel p-3 font-mono text-[12.5px] break-words whitespace-pre-wrap">{text}</pre>
    </Section>
  );
}

// ---------------------------------------------------------------- breadcrumbs

export function Breadcrumbs({ values }: { values: Breadcrumb[] }) {
  const [all, setAll] = useState(false);
  const LIMIT = 12;
  const shown = all ? values : values.slice(-LIMIT);
  if (!values.length) return null;
  return (
    <Section title="Breadcrumbs" aside={<span>{values.length}</span>}>
      <div className="overflow-hidden rounded-lg border border-line bg-panel">
        {!all && values.length > LIMIT && (
          <button onClick={() => setAll(true)} className="flex h-7 w-full cursor-pointer items-center border-b border-line bg-sunken px-3 text-[11.5px] text-faint hover:text-fg">
            Show {values.length - LIMIT} earlier
          </button>
        )}
        {shown.map((b, i) => (
          <Crumb key={i} b={b} />
        ))}
      </div>
    </Section>
  );
}

function Crumb({ b }: { b: Breadcrumb }) {
  const [open, setOpen] = useState(false);
  const data = b.data && Object.keys(b.data).length ? b.data : null;
  return (
    <div className="border-b border-line text-[12px] last:border-b-0 last:bg-error/6">
      <button
        onClick={data ? () => setOpen(!open) : undefined}
        className={clsx("flex w-full items-start gap-3 px-3 py-1.5 text-left transition-colors duration-100", data && "cursor-pointer hover:bg-hover")}
      >
        <span className="hidden w-[86px] shrink-0 pt-px font-mono text-[11px] text-faint tabular-nums sm:block">
          {b.timestamp ? format(new Date(b.timestamp), "HH:mm:ss.SSS") : ""}
        </span>
        <LevelDot level={b.level ?? "info"} className="mt-[5px]" />
        <span className="w-[72px] shrink-0 truncate text-muted sm:w-[110px]">{b.category || b.type}</span>
        <span className={clsx("min-w-0 flex-1 font-mono text-[11.5px] break-words", !open && "line-clamp-2")}>{crumbText(b)}</span>
        {data && <span className="mt-0.5 shrink-0 text-faint"><ChevronRight className={clsx("size-3 transition-transform duration-200 ease-drawer", open && "rotate-90")} /></span>}
      </button>
      {data && (
        <Collapse open={open}>
          <div className="border-t border-line bg-sunken px-3 py-2 sm:pl-[121px]">
            <JsonView value={data} />
          </div>
        </Collapse>
      )}
    </div>
  );
}

function crumbText(b: Breadcrumb) {
  const d = (b.data ?? {}) as Record<string, unknown>;
  if (b.message) return b.message;
  if (Array.isArray(d.arguments)) {
    return d.arguments
      .map((a) => (typeof a === "string" ? a : a && typeof a === "object" && "name" in a ? `${(a as { name: string }).name}: ${(a as { message?: string }).message ?? ""}` : JSON.stringify(a)))
      .join(" ");
  }
  if (d.url) return [d.method, d.url, d.status_code].filter((x) => x != null).join(" ");
  if (d.from || d.to) return `${d.from ?? ""} → ${d.to ?? ""}`;
  const keys = Object.keys(d);
  return keys.length ? JSON.stringify(d) : "";
}

// ---------------------------------------------------------------- request

export function RequestBlock({ data }: { data: Schemas["Request"] }) {
  const headers = (data.headers ?? []).filter((h): h is [string, string] => !!h[0]);
  const query = (data.query ?? []).filter((h): h is [string, string] => !!h[0]);
  const body = data.data;
  return (
    <Section title="Request">
      <div className="mb-3 flex items-start gap-2 font-mono text-[12.5px]">
        {data.method && <span className="font-semibold">{data.method}</span>}
        <span className="break-all text-muted">{data.url}</span>
      </div>
      <div className="space-y-3 rounded-lg border border-line bg-panel px-3 py-2.5">
        {query.length > 0 && <Sub title="Query"><KeyValues rows={query} mono /></Sub>}
        {body != null && body !== "" && (
          <Sub title="Body">
            <JsonView value={body} />
          </Sub>
        )}
        {headers.length > 0 && <Sub title="Headers"><KeyValues rows={headers} mono /></Sub>}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- contexts

export function Contexts({ contexts }: { contexts: Record<string, Record<string, unknown>> }) {
  const cards = Object.entries(contexts).filter(([, v]) => v && typeof v === "object");
  if (!cards.length) return null;
  return (
    <section>
      <h3 className="mb-2.5 text-[11px] font-medium tracking-wide text-faint uppercase">Contexts</h3>
      <div className="space-y-4">
        {cards.map(([name, ctx]) => (
          <div key={name}>
            <div className="mb-1.5 text-[12px] font-medium capitalize">{name.replace(/_/g, " ")}</div>
            <KeyValues rows={Object.entries(ctx).filter(([k]) => k !== "type")} />
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- shared

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] text-faint">{title}</div>
      {children}
    </div>
  );
}

function KeyValues({ rows, mono }: { rows: [string, unknown][]; mono?: boolean }) {
  return (
    <dl className="grid grid-cols-[minmax(80px,max-content)_1fr] gap-x-4 gap-y-1 text-[12px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="truncate text-muted">{k}</dt>
          <dd className={clsx("min-w-0 break-all", mono && "font-mono text-[11.5px]")}>
            {typeof v === "string" ? v : JSON.stringify(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------- additional data

export function AdditionalData({ data }: { data: Record<string, unknown> }) {
  if (!Object.keys(data).length) return null;
  return (
    <Section title="Additional data">
      <div className="rounded-lg border border-line bg-panel px-3 py-2.5">
        <JsonView value={data} />
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- user

type EventUser = { id?: string | number; email?: string; username?: string; name?: string; ip_address?: string; geo?: Record<string, string> };

export function UserCard({ user }: { user: unknown }) {
  const u = (user && typeof user === "object" ? user : {}) as EventUser;
  const name = u.name || u.email || u.username || (u.id != null ? String(u.id) : null);
  const geo = u.geo ? [u.geo.city, u.geo.region, u.geo.country_code].filter(Boolean).join(", ") : "";
  const secondary = [
    u.email && u.email !== name ? u.email : null,
    u.username && u.username !== name && u.username !== u.email ? `@${u.username}` : null,
    u.id != null && String(u.id) !== name ? `id ${u.id}` : null,
    u.ip_address,
    geo,
  ].filter(Boolean);
  return (
    <div className="mt-4 flex items-center gap-3 rounded-lg border border-line bg-panel px-3 py-2.5">
      <span
        className={clsx(
          "grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold",
          name ? "bg-fg text-bg" : "border border-dashed border-line-strong text-faint",
        )}
      >
        {name ? name[0].toUpperCase() : "?"}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium">{name ?? "Anonymous"}</div>
        <div className="truncate font-mono text-[11.5px] text-muted">{secondary.length ? secondary.join(" · ") : "No user info sent"}</div>
      </div>
      <span className="ml-auto shrink-0">{name ? <Badge>signed in</Badge> : <Badge>anonymous</Badge>}</span>
    </div>
  );
}
