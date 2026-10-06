import { useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowDownWideNarrow, Search, X } from "lucide-react";
import { api, hitsTotal, nextCursor, unwrap, type Issue } from "../lib/api";
import { issueHeadline } from "../lib/issue";
import { toApiQuery } from "../components/command";
import { copy } from "../lib/toast";
import { issueUrl } from "../lib/markdown";
import { issueStatsQuery, projectsQuery } from "../lib/queries";
import { ago, compact } from "../lib/format";
import { useLatest, useMountEffect } from "../lib/hooks";
import { Badge, Button, Kbd, LevelDot, Sparkline, Spinner } from "../components/ui";
import { issuesRoute } from "../router";

export type IssuesSearch = {
  query?: string;
  project?: string;
  sort?: "-last_seen" | "-first_seen" | "-count" | "-priority";
  env?: string;
};

const STATUSES = [
  { key: "unresolved", label: "Unresolved" },
  { key: "resolved", label: "Resolved" },
  { key: "ignored", label: "Ignored" },
  { key: "all", label: "All" },
] as const;

const SORTS = [
  { key: "-last_seen", label: "Last seen" },
  { key: "-first_seen", label: "First seen" },
  { key: "-count", label: "Events" },
  { key: "-priority", label: "Priority" },
] as const;

const DEFAULT_QUERY = "is:unresolved";

function statusOf(query: string) {
  return query.match(/\bis:(unresolved|resolved|ignored)\b/)?.[1] ?? "all";
}
function withStatus(query: string, status: string) {
  const rest = query.replace(/\bis:\w+\s*/g, "").trim();
  return status === "all" ? rest : `is:${status}${rest ? " " + rest : ""}`;
}

export function IssuesPage() {
  const { org } = issuesRoute.useParams();
  const search = issuesRoute.useSearch();
  const navigate = useNavigate({ from: issuesRoute.fullPath });
  const qc = useQueryClient();
  const query = search.query ?? DEFAULT_QUERY;
  const sort = search.sort ?? "-last_seen";
  const status = statusOf(query);
  const projects = useQuery(projectsQuery(org));
  const project = projects.data?.find((p) => p.id === search.project);

  const issues = useInfiniteQuery({
    queryKey: ["issues", org, query, sort, search.project ?? null, search.env ?? null],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const r = await api.GET("/api/0/organizations/{organization_slug}/issues/", {
        params: {
          path: { organization_slug: org },
          query: {
            query: toApiQuery(query),
            sort,
            limit: 50,
            cursor: pageParam,
            project: search.project ? [Number(search.project)] : undefined,
            environment: search.env ? [search.env] : undefined,
          },
        },
      });
      return { items: unwrap(r), next: nextCursor(r.response), total: hitsTotal(r.response) };
    },
    getNextPageParam: (last) => last.next,
    refetchInterval: 30_000,
  });
  const rows = issues.data?.pages.flatMap((p) => p.items) ?? [];
  const stats = useQuery(issueStatsQuery(org, rows.map((r) => Number(r.id)), "24h"));

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  const [draft, setDraft] = useState(query);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const update = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: "resolved" | "unresolved" | "ignored" }) =>
      unwrap(
        await api.PUT("/api/0/organizations/{organization_slug}/issues/", {
          params: { path: { organization_slug: org }, query: { id: ids.map(Number) } },
          body: { status },
        }),
      ),
    onSuccess: () => {
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["issues", org] });
    },
  });

  function setSearch(next: Partial<IssuesSearch>) {
    setSelected(new Set());
    setCursor(0);
    navigate({ search: (s) => ({ ...s, ...next }) });
  }
  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }
  function moveTo(i: number) {
    const clamped = Math.max(0, Math.min(rows.length - 1, i));
    setCursor(clamped);
    listRef.current?.querySelector(`[data-row="${clamped}"]`)?.scrollIntoView({ block: "nearest" });
  }

  const keys = useLatest((e: KeyboardEvent) => {
    const typing = (e.target as HTMLElement).closest("input, textarea");
    if (e.key === "/" && !typing) {
      e.preventDefault();
      searchRef.current?.focus();
      return;
    }
    if (typing || e.metaKey || e.ctrlKey) return;
    const row = rows[cursor];
    if (e.key === "j" || e.key === "ArrowDown") moveTo(cursor + 1);
    else if (e.key === "k" || e.key === "ArrowUp") moveTo(cursor - 1);
    else if (e.key === "x" && row) toggle(row.id);
    else if (e.key === "c" && row) copy(issueUrl(org, row.id), `Link to ${row.shortId} copied`);
    else if ((e.key === "Enter" || e.key === "o") && row)
      navigate({ to: "/$org/issues/$issueId", params: { org, issueId: row.id } });
    else if (e.key === "e") {
      const ids = selected.size ? [...selected] : row ? [row.id] : [];
      if (ids.length) update.mutate({ ids, status: status === "resolved" ? "unresolved" : "resolved" });
    } else return;
    e.preventDefault();
  });
  useMountEffect(() => {
    const h = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3 py-2 md:h-12 md:flex-nowrap md:px-5 md:py-0">
        <h1 className="flex items-center gap-2 text-[14px] font-semibold">
          {project ? (
            <>
              <span className="size-2.5 rounded-[3px]" style={{ background: project.color || "var(--faint)" }} />
              {project.name}
            </>
          ) : (
            "All issues"
          )}
        </h1>
        <div className="order-3 flex w-full items-center overflow-x-auto rounded-md bg-sunken p-0.5 md:order-none md:w-auto">
          {STATUSES.map((s) => (
            <button
              key={s.key}
              onClick={() => {
                const q = withStatus(query, s.key);
                setDraft(q);
                setSearch({ query: q === DEFAULT_QUERY ? undefined : q });
              }}
              className={clsx(
                "h-7 flex-1 cursor-pointer rounded px-2.5 text-[12px] font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-150 md:h-6 md:flex-none",
                status === s.key ? "bg-panel text-fg shadow-sm" : "text-muted hover:text-fg",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <form
          className="order-4 flex h-8 w-full items-center gap-2 rounded-md border border-line bg-panel px-2 focus-within:border-line-strong md:order-none md:ml-auto md:h-7 md:w-[340px]"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch({ query: draft.trim() === DEFAULT_QUERY ? undefined : draft.trim() });
            searchRef.current?.blur();
          }}
        >
          <Search className="size-3.5 text-faint" />
          <input
            ref={searchRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
            placeholder="Search issues…"
            className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint md:text-[12.5px]"
          />
          <span className="hidden md:inline-flex"><Kbd>/</Kbd></span>
        </form>
        <label className="ml-auto flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted hover:bg-hover md:ml-0">
          <ArrowDownWideNarrow className="size-3.5" />
          <select
            value={sort}
            onChange={(e) => setSearch({ sort: e.target.value === "-last_seen" ? undefined : (e.target.value as IssuesSearch["sort"]) })}
            className="cursor-pointer appearance-none bg-transparent text-fg outline-none"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </label>
      </header>

      {/* Column header / bulk bar */}
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line bg-bg px-3 text-[11px] font-medium text-faint md:px-5">
        <input
          type="checkbox"
          checked={allChecked}
          onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)))}
          className="size-3.5 cursor-pointer accent-fg"
        />
        {selected.size > 0 ? (
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto text-fg transition-[opacity,translate] duration-200 ease-drawer starting:translate-y-1 starting:opacity-0">
            <span className="mr-2 text-[12px]">{selected.size} selected</span>
            {status !== "resolved" && (
              <Button size="sm" variant="outline" onClick={() => update.mutate({ ids: [...selected], status: "resolved" })}>Resolve <Kbd>e</Kbd></Button>
            )}
            {status !== "ignored" && (
              <Button size="sm" variant="outline" onClick={() => update.mutate({ ids: [...selected], status: "ignored" })}>Ignore</Button>
            )}
            {status !== "unresolved" && (
              <Button size="sm" variant="outline" onClick={() => update.mutate({ ids: [...selected], status: "unresolved" })}>Unresolve</Button>
            )}
            <Button size="sm" onClick={() => setSelected(new Set())}><X className="size-3" /></Button>
            {update.isPending && <Spinner className="ml-1" />}
          </div>
        ) : (
          <span className="flex-1">Issue</span>
        )}
        <span className="ml-auto hidden w-[84px] text-right lg:block">24h</span>
        <span className="hidden w-14 text-right md:block">Events</span>
        <span className="hidden w-[76px] text-right md:block">Seen</span>
      </div>

      {/* Rows */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {issues.isPending && <ListSkeleton />}
        {issues.isError && (
          <div className="px-5 py-10 text-center text-muted">Couldn’t load issues — {String(issues.error.message)}</div>
        )}
        {issues.isSuccess && rows.length === 0 && <Empty status={status} />}
        {rows.map((issue, i) => (
          <IssueRow
            key={issue.id}
            issue={issue}
            index={i}
            org={org}
            active={i === cursor}
            checked={selected.has(issue.id)}
            onCheck={() => toggle(issue.id)}
            onHover={() => setCursor(i)}
            stats={stats.data?.get(issue.id)}
            showProject={!search.project}
          />
        ))}
        {issues.hasNextPage && (
          <div className="flex justify-center py-4">
            <Button variant="outline" onClick={() => issues.fetchNextPage()} disabled={issues.isFetchingNextPage}>
              {issues.isFetchingNextPage ? <Spinner /> : "Load more"}
            </Button>
          </div>
        )}
      </div>

      <footer className="flex h-8 shrink-0 items-center gap-4 border-t border-line px-3 text-[11px] text-faint md:px-5">
        <span>{issues.data?.pages[0]?.total ?? rows.length} issues</span>
        <span className="ml-auto hidden items-center gap-1 md:flex"><Kbd>j</Kbd><Kbd>k</Kbd> move</span>
        <span className="hidden items-center gap-1 md:flex"><Kbd>x</Kbd> select</span>
        <span className="hidden items-center gap-1 md:flex"><Kbd>↵</Kbd> open</span>
        <span className="hidden items-center gap-1 md:flex"><Kbd>e</Kbd> resolve</span>
        <span className="hidden items-center gap-1 md:flex"><Kbd>c</Kbd> copy link</span>
      </footer>
    </div>
  );
}

function IssueRow({
  issue, index, org, active, checked, onCheck, onHover, stats, showProject,
}: {
  issue: Issue; index: number; org: string; active: boolean; checked: boolean;
  onCheck: () => void; onHover: () => void; stats?: number[]; showProject: boolean;
}) {
  const { head, tail } = issueHeadline(issue);
  const isNew = Date.now() - new Date(issue.firstSeen).getTime() < 24 * 3600_000;
  return (
    <div
      data-row={index}
      onMouseEnter={onHover}
      className={clsx(
        "group relative flex items-center gap-3 border-b border-line px-3 py-2.5 transition-[background-color,opacity] duration-100 md:px-5 md:py-2",
        checked ? "bg-sel" : active ? "md:bg-hover" : "md:hover:bg-hover",
      )}
    >
      {active && <span className="absolute inset-y-0 left-0 hidden w-[2px] bg-fg/70 md:block" />}
      <input type="checkbox" checked={checked} onChange={onCheck} className="size-4 cursor-pointer accent-fg md:size-3.5" />
      <Link
        to="/$org/issues/$issueId"
        params={{ org, issueId: issue.id }}
        className="flex min-w-0 flex-1 flex-col gap-0.5"
      >
        <div className="flex min-w-0 items-center gap-2">
          <LevelDot level={issue.level} />
          <span className={clsx("min-w-0 shrink-0 truncate font-semibold max-md:max-w-full", issue.status === "resolved" && "text-muted line-through decoration-faint")}>{head}</span>
          {tail && <span className="hidden truncate text-muted md:inline">{tail}</span>}
        </div>
        {tail && <span className="line-clamp-2 pl-4 text-[12.5px] text-muted md:hidden">{tail}</span>}
        <div className="flex min-w-0 items-center gap-2 pl-4 text-[11.5px] text-faint">
          {showProject && <span className="min-w-0 truncate text-muted">{issue.project.name}</span>}
          <span className="hidden shrink-0 font-mono text-[11px] sm:inline">{issue.shortId}</span>
          {issue.culprit && <span className="hidden truncate font-mono text-[11px] md:inline">{issue.culprit}</span>}
          <span className="ml-auto shrink-0 tabular-nums md:hidden">{compact(issue.count)} ev · {ago(issue.lastSeen)}</span>
          {isNew && <Badge tone="accent">New</Badge>}
          {issue.status === "ignored" && <Badge>Ignored</Badge>}
          {issue.numComments > 0 && <Badge>{issue.numComments} comments</Badge>}
        </div>
      </Link>
      <Sparkline points={stats ?? []} className={clsx("hidden lg:block", issue.level === "error" || issue.level === "fatal" ? "text-error/70" : "text-muted")} />
      <span className="hidden w-14 text-right font-medium tabular-nums md:block">{compact(issue.count)}</span>
      <span className="hidden w-[76px] flex-col items-end md:flex text-[11.5px] tabular-nums leading-tight">
        <span title={issue.lastSeen}>{ago(issue.lastSeen)}</span>
        <span className="text-faint" title={issue.firstSeen}>{ago(issue.firstSeen)} old</span>
      </span>
    </div>
  );
}

function Empty({ status }: { status: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-24 text-center">
      <div className="text-[14px] font-medium">{status === "unresolved" ? "Nothing broken." : "No issues"}</div>
      <div className="text-muted">{status === "unresolved" ? "No unresolved issues match this view." : "Try a different filter."}</div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="motion-safe:animate-skeleton">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-line px-3 py-3 md:px-5">
          <div className="size-3.5 rounded-[3px] bg-fg/[0.08]" />
          <div className="flex-1 space-y-2">
            <div className="h-3 rounded bg-fg/[0.08]" style={{ width: `${38 + ((i * 37) % 40)}%` }} />
            <div className="h-2.5 w-40 rounded bg-fg/[0.06]" />
          </div>
          <div className="hidden h-5 w-[84px] rounded bg-fg/[0.06] lg:block" />
          <div className="hidden h-3 w-10 rounded bg-fg/[0.08] md:block" />
          <div className="hidden h-3 w-12 rounded bg-fg/[0.06] md:block" />
        </div>
      ))}
    </div>
  );
}
