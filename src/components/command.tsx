import { useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowRight, CornerDownLeft, FileText, Folder, Inbox, Link2, Search, SunMoon } from "lucide-react";
import { copy } from "../lib/toast";
import { issueMarkdown, issueUrl } from "../lib/markdown";
import type { IssueDetail, IssueEvent, Schemas } from "../lib/api";
import { api, hitsTotal, unwrap, type Issue } from "../lib/api";
import { projectsQuery } from "../lib/queries";
import { issueHeadline } from "../lib/issue";
import { ago, compact } from "../lib/format";
import { Badge, Kbd, LevelDot, Spinner } from "./ui";
import { setTheme, useExit } from "../lib/motion";

/**
 * The API does full-text search on whole words, and `*` adds a title substring
 * match. Appending `*` to the free text makes results appear mid-word while typing.
 * Structured tokens (`is:resolved`, `user.email:x`) must lead, free text trails.
 */
export function toApiQuery(input: string) {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const structured = tokens.filter((t) => /^[\w.-]+:\S/.test(t));
  const text = tokens.filter((t) => !/^[\w.-]+:\S/.test(t)).join(" ");
  const free = text && !text.endsWith("*") ? `${text}*` : text;
  return [...structured, free].filter(Boolean).join(" ");
}

type Item = { id: string; group: string; render: ReactNode; run: () => void };

export function CommandCenter({ org, onClosed }: { org: string; onClosed: () => void }) {
  const navigate = useNavigate();
  const { closing, close: onClose } = useExit(onClosed);
  const qc = useQueryClient();
  const { issueId } = useParams({ strict: false }) as { issueId?: string };
  const { event: eventId } = useSearch({ strict: false }) as { event?: string };
  const [input, setInput] = useState("");
  const [term, setTerm] = useState("");
  const [active, setActive] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const listRef = useRef<HTMLDivElement>(null);
  const projects = useQuery(projectsQuery(org));

  const issues = useQuery({
    queryKey: ["command-search", org, term],
    enabled: term.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const r = await api.GET("/api/0/organizations/{organization_slug}/issues/", {
        params: { path: { organization_slug: org }, query: { query: toApiQuery(term), sort: "-last_seen", limit: 12 } },
      });
      return { items: unwrap(r), total: hitsTotal(r.response) };
    },
  });
  const recent = useQuery({
    queryKey: ["command-recent", org],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/0/organizations/{organization_slug}/issues/", {
          params: { path: { organization_slug: org }, query: { query: "is:unresolved", sort: "-last_seen", limit: 6 } },
        }),
      ),
    staleTime: 30_000,
  });

  function onInput(v: string) {
    setInput(v);
    setActive(0);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setTerm(v.trim()), 140);
  }
  const go = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const openIssue = (i: Issue) => go(() => navigate({ to: "/$org/issues/$issueId", params: { org, issueId: i.id } }));
  const searchInList = go(() => navigate({ to: "/$org/issues", params: { org }, search: { query: toApiQuery(input) || undefined } }));

  const q = input.trim().toLowerCase();
  const matchedProjects = (projects.data ?? [])
    .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.slug ?? "").includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, q ? 5 : 4);
  const actions = [
    { id: "all", label: "All issues", icon: <Inbox className="size-3.5" />, run: () => navigate({ to: "/$org/issues", params: { org }, search: {} }) },
    { id: "resolved", label: "Recently resolved", icon: <ArrowRight className="size-3.5" />, run: () => navigate({ to: "/$org/issues", params: { org }, search: { query: "is:resolved" } }) },
    {
      id: "theme",
      label: "Toggle dark mode",
      icon: <SunMoon className="size-3.5" />,
      run: () => setTheme(!document.documentElement.classList.contains("dark")),
    },
  ];
  const issueActions: typeof actions = [];
  if (issueId) {
    const id = Number(issueId);
    const issue = qc.getQueryData<IssueDetail>(["issue", id]);
    issueActions.push(
      { id: "copy-link", label: `Copy link to ${issue?.shortId ?? "this issue"}`, icon: <Link2 className="size-3.5" />, run: () => void copy(issueUrl(org, id), "Link copied") },
      {
        id: "copy-md",
        label: "Copy issue as Markdown (for AI)",
        icon: <FileText className="size-3.5" />,
        run: () => {
          if (!issue) return;
          const event = qc.getQueryData<IssueEvent>(["issue-event", id, eventId ?? "latest"]);
          const tags = qc.getQueryData<Schemas["IssueTagSchema"][]>(["issue-tags", id]);
          void copy(issueMarkdown(org, issue, event, tags), "Issue copied as Markdown");
        },
      },
    );
  }
  const matches = (a: { label: string }) => !q || a.label.toLowerCase().includes(q);
  const shownActions = actions.filter(matches);
  const shownIssueActions = issueActions.filter((a) => matches(a) || "copy markdown link".includes(q));

  const issueRows = q ? (issues.data?.items ?? []) : (recent.data ?? []);
  const items: Item[] = [
    ...(q
      ? [{ id: "search", group: "", render: <SearchAll input={input} total={issues.data?.total} />, run: searchInList }]
      : []),
    ...shownIssueActions.map((a) => ({
      id: a.id,
      group: "This issue",
      render: <span className="flex items-center gap-2.5 text-muted">{a.icon}<span className="text-fg">{a.label}</span></span>,
      run: go(a.run),
    })),
    ...issueRows.map((i) => ({ id: `i${i.id}`, group: q ? "Issues" : "Recent unresolved", render: <IssueItem issue={i} q={term} />, run: openIssue(i) })),
    ...matchedProjects.map((p) => ({
      id: `p${p.id}`,
      group: "Projects",
      render: (
        <span className="flex items-center gap-2.5">
          <Folder className="size-3.5 text-faint" />
          <span className="size-2 rounded-[3px]" style={{ background: p.color || "var(--faint)" }} />
          {p.name}
        </span>
      ),
      run: go(() => navigate({ to: "/$org/issues", params: { org }, search: { project: p.id } })),
    })),
    ...shownActions.map((a) => ({
      id: a.id,
      group: "Actions",
      render: <span className="flex items-center gap-2.5 text-muted">{a.icon}<span className="text-fg">{a.label}</span></span>,
      run: go(a.run),
    })),
  ];
  const current = Math.min(active, Math.max(0, items.length - 1));

  function move(to: number) {
    const next = (to + items.length) % Math.max(1, items.length);
    setActive(next);
    listRef.current?.querySelector(`[data-item="${next}"]`)?.scrollIntoView({ block: "nearest" });
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) move(current + 1);
    else if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) move(current - 1);
    else if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && q) searchInList();
    else if (e.key === "Enter") items[current]?.run();
    else if (e.key === "Escape") onClose();
    else return;
    e.preventDefault();
  }

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-3 pt-[12vh]" onMouseDown={onClose}>
      <div
        className={clsx(
          "dialog-backdrop absolute inset-0 transition-opacity duration-200 starting:opacity-0",
          closing && "opacity-0",
        )}
      />
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={clsx(
          "dialog-glass relative flex max-h-[70vh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border",
          "origin-top transition-[scale,opacity,translate] duration-200 ease-in-out will-change-transform",
          "starting:scale-98 starting:opacity-0 max-sm:starting:translate-y-4",
          closing && "scale-98 opacity-0 max-sm:translate-y-4",
        )}
      >
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4">
          {issues.isFetching ? <Spinner /> : <Search className="size-4 text-faint" />}
          <input
            autoFocus
            value={input}
            onChange={(e) => onInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search issues, projects, actions…"
            className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint md:text-[14px]"
          />
          <span className="hidden sm:inline-flex"><Kbd>esc</Kbd></span>
        </div>
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {items.map((it, n) => {
            const header = it.group && it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <div key={it.id}>
                {header && <div className="px-2.5 pt-2.5 pb-1 text-[11px] font-medium text-faint">{header}</div>}
                <button
                  data-item={n}
                  onMouseMove={() => n !== current && setActive(n)}
                  onClick={it.run}
                  className={clsx("flex w-full cursor-pointer items-center rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors duration-100", n === current && "bg-fg/[0.07]")}
                >
                  <span className="min-w-0 flex-1">{it.render}</span>
                  <CornerDownLeft className={clsx("ml-2 size-3.5 shrink-0 text-faint transition-opacity duration-100", n === current ? "opacity-100" : "opacity-0")} />
                </button>
              </div>
            );
          })}
          {q && issues.isSuccess && issueRows.length === 0 && !issues.isFetching && (
            <div className="px-3 py-6 text-center text-[12.5px] text-muted">
              No issues match <span className="text-fg">“{input.trim()}”</span>. Search matches whole words in titles and messages; try a filter like <code className="font-mono">user.email:you@x.com</code>.
            </div>
          )}
        </div>
        <div className="hidden h-9 shrink-0 items-center gap-4 border-t border-line px-4 text-[11px] text-faint sm:flex">
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
          <span className="flex items-center gap-1"><Kbd>⌘</Kbd><Kbd>↵</Kbd> show all in list</span>
          <span className="ml-auto">Filters: <span className="font-mono">is:resolved level:error key:value</span></span>
        </div>
      </div>
    </div>
  );
}

function SearchAll({ input, total }: { input: string; total?: number | null }) {
  return (
    <span className="flex items-center gap-2.5">
      <Search className="size-3.5 text-faint" />
      <span className="truncate">Search all issues for <span className="font-medium">“{input.trim()}”</span></span>
      {total != null && <span className="ml-auto shrink-0 text-[11.5px] text-faint tabular-nums">{total} results</span>}
    </span>
  );
}

function IssueItem({ issue, q }: { issue: Issue; q: string }) {
  const { head, tail } = issueHeadline(issue);
  return (
    <span className="flex min-w-0 items-start gap-2.5">
      <LevelDot level={issue.level} className="mt-[6px]" />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 font-semibold"><Highlight text={head} q={q} /></span>
          <span className="truncate text-muted"><Highlight text={tail} q={q} /></span>
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[11.5px] whitespace-nowrap text-faint">
          <span className="truncate text-muted">{issue.project.name}</span>
          <span className="hidden font-mono text-[11px] sm:inline">{issue.shortId}</span>
          {issue.status !== "unresolved" && <Badge tone={issue.status === "resolved" ? "ok" : "neutral"}>{issue.status}</Badge>}
        </span>
      </span>
      <span className="shrink-0 pt-px text-right text-[11.5px] text-faint tabular-nums">
        {compact(issue.count)} ev · {ago(issue.lastSeen)}
      </span>
    </span>
  );
}

function Highlight({ text, q }: { text: string; q: string }) {
  const words = q.replace(/\S+:\S+/g, "").split(/\s+/).map((w) => w.replace(/\*/g, "")).filter((w) => w.length > 1);
  if (!words.length || !text) return <>{text}</>;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 ? <mark key={i} className="rounded-[2px] bg-warning/25 text-inherit">{part}</mark> : part,
      )}
    </>
  );
}


