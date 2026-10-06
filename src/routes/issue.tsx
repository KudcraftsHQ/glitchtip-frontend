import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, ChevronsRight, Copy, ExternalLink, FileText, Link2 } from "lucide-react";
import { copy } from "../lib/toast";
import { issueMarkdown, issueUrl } from "../lib/markdown";
import { useLatest, useMountEffect } from "../lib/hooks";
import { api, unwrap, type IssueDetail, type IssueEvent } from "../lib/api";
import { issueStatsQuery } from "../lib/queries";
import { ago, compact, stamp } from "../lib/format";
import { Badge, Button, Kbd, LevelDot, Skeleton, Spinner, levelText } from "../components/ui";
import { issueRoute } from "../router";
import { issueHeadline } from "../lib/issue";
import { AdditionalData, Breadcrumbs, Contexts, ExceptionBlock, MessageBlock, RequestBlock, UserCard } from "../components/event";

export function IssuePage() {
  const { org, issueId } = issueRoute.useParams();
  const { event: eventId } = issueRoute.useSearch();
  const id = Number(issueId);
  const qc = useQueryClient();

  const issue = useQuery({
    queryKey: ["issue", id],
    queryFn: async () => unwrap(await api.GET("/api/0/issues/{issue_id}/", { params: { path: { issue_id: id } } })),
  });
  const event = useQuery({
    queryKey: ["issue-event", id, eventId ?? "latest"],
    queryFn: async () =>
      eventId
        ? unwrap(await api.GET("/api/0/issues/{issue_id}/events/{event_id}/", { params: { path: { issue_id: id, event_id: eventId } } }))
        : unwrap(await api.GET("/api/0/issues/{issue_id}/events/latest/", { params: { path: { issue_id: id } } })),
    placeholderData: (prev) => prev,
  });
  const tags = useQuery({
    queryKey: ["issue-tags", id],
    queryFn: async () => unwrap(await api.GET("/api/0/issues/{issue_id}/tags/", { params: { path: { issue_id: id } } })),
  });
  const stats = useQuery(issueStatsQuery(org, [id], "14d"));

  const update = useMutation({
    mutationFn: async (status: "resolved" | "unresolved" | "ignored") =>
      unwrap(await api.PUT("/api/0/issues/{issue_id}/", { params: { path: { issue_id: id } }, body: { status } })),
    onSuccess: (data) => {
      qc.setQueryData(["issue", id], (old: IssueDetail | undefined) => (old ? { ...old, status: data.status } : old));
      qc.invalidateQueries({ queryKey: ["issues", org] });
    },
  });

  const copyLink = () => copy(issueUrl(org, id), "Link copied");
  const copyMarkdown = () =>
    issue.data && copy(issueMarkdown(org, issue.data, event.data, tags.data), "Issue copied as Markdown");
  const keys = useLatest((e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("input, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "c") copyLink();
    else if (e.key === "m") copyMarkdown();
    else return;
    e.preventDefault();
  });
  useMountEffect(() => {
    const h = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  if (issue.isPending) return <DetailSkeleton />;
  if (issue.isError) return <div className="p-10 text-muted">Couldn’t load issue — {issue.error.message}</div>;
  const i = issue.data;
  const { head, tail } = issueHeadline(i);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3 text-[12.5px] md:px-5">
        <Link to="/$org/issues" params={{ org }} search={(s) => s} className="text-muted hover:text-fg">Issues</Link>
        <span className="text-faint">/</span>
        <Link to="/$org/issues" params={{ org }} search={{ project: i.project.id }} className="hidden text-muted hover:text-fg sm:inline">{i.project.name}</Link>
        <span className="hidden text-faint sm:inline">/</span>
        <button
          className="flex min-w-0 cursor-pointer items-center gap-1 font-mono text-[12px] whitespace-nowrap text-fg hover:text-muted"
          onClick={() => navigator.clipboard.writeText(i.shortId)}
          title="Copy short ID"
        >
          {i.shortId} <Copy className="size-3" />
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <Button onClick={copyLink} title="Copy link (c)" className="max-sm:px-1.5">
            <Link2 className="size-3.5" /><span className="hidden lg:inline">Copy link</span><span className="hidden lg:inline-flex"><Kbd>c</Kbd></span>
          </Button>
          <Button onClick={copyMarkdown} title="Copy as Markdown for AI (m)" className="max-sm:px-1.5">
            <FileText className="size-3.5" /><span className="hidden lg:inline">Copy for AI</span><span className="hidden lg:inline-flex"><Kbd>m</Kbd></span>
          </Button>
          <a
            href={`https://glitchtip.kudcrafts.com/${org}/issues/${i.id}`}
            target="_blank"
            rel="noreferrer"
            className="mr-2 hidden items-center gap-1 text-[12px] text-faint hover:text-fg md:flex"
          >
            Old UI <ExternalLink className="size-3" />
          </a>
          {i.status === "unresolved" ? (
            <>
              <Button variant="outline" onClick={() => update.mutate("ignored")} disabled={update.isPending}>Ignore</Button>
              <Button variant="primary" onClick={() => update.mutate("resolved")} disabled={update.isPending}>Resolve</Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => update.mutate("unresolved")} disabled={update.isPending}>
              {i.status === "resolved" ? "Resolved" : "Ignored"} · Reopen
            </Button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-8 px-4 py-5 lg:flex-row lg:px-6 lg:py-6">
          <div className="min-w-0 flex-1">
            {/* Title */}
            <div className="flex items-center gap-2 text-[11.5px]">
              <LevelDot level={i.level} />
              <span className={clsx("font-medium capitalize", levelText[i.level])}>{i.level}</span>
              {i.status !== "unresolved" && <Badge tone={i.status === "resolved" ? "ok" : "neutral"}>{i.status}</Badge>}
              {i.firstRelease && <Badge>since {i.firstRelease.shortVersion ?? i.firstRelease.version}</Badge>}
            </div>
            <h1 className="mt-2 text-[18px] font-semibold leading-tight tracking-tight break-words md:text-[20px]">{head}</h1>
            {tail && <p className="mt-1 text-[14px] leading-snug break-words text-muted">{tail}</p>}
            {i.culprit && <p className="mt-2 font-mono text-[12px] break-all text-faint">{i.culprit}</p>}

            {/* Stats strip */}
            <div className="mt-5 grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-panel sm:grid-cols-4 lg:flex lg:items-stretch">
              <Stat label="Events" value={compact(i.count)} />
              <Stat label="Users" value={compact(i.userCount)} />
              <Stat label="First seen" value={ago(i.firstSeen)} sub={stamp(i.firstSeen)} />
              <Stat label="Last seen" value={ago(i.lastSeen)} sub={stamp(i.lastSeen)} />
              <div className="col-span-full flex min-w-0 flex-1 flex-col justify-between border-t border-line px-4 py-2.5 lg:border-t-0">
                <span className="text-[11px] text-faint">Last 14 days</span>
                <Bars points={stats.data?.get(i.id) ?? []} />
              </div>
            </div>

            {/* Event */}
            {event.data && (
              <EventView key={event.data.eventID} event={event.data} org={org} issueId={i.id} fetching={event.isFetching} />
            )}
            {event.isPending && <div className="grid h-40 place-items-center"><Spinner /></div>}
          </div>

          {/* Right rail */}
          <aside className="w-full shrink-0 space-y-6 border-t border-line pt-6 lg:w-[280px] lg:border-t-0 lg:pt-0">
            <RailBlock title="Details">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12px]">
                <Dt>Project</Dt><dd className="truncate">{i.project.name}</dd>
                {i.project.platform && (<><Dt>Platform</Dt><dd>{i.project.platform}</dd></>)}
                {i.firstRelease && (<><Dt>First release</Dt><dd className="truncate font-mono text-[11.5px]">{i.firstRelease.shortVersion ?? i.firstRelease.version}</dd></>)}
                {i.lastRelease && (<><Dt>Last release</Dt><dd className="truncate font-mono text-[11.5px]">{i.lastRelease.shortVersion ?? i.lastRelease.version}</dd></>)}
                {i.logger && (<><Dt>Logger</Dt><dd>{i.logger}</dd></>)}
              </dl>
            </RailBlock>
            <RailBlock title="Tags">
              {tags.isPending && <Spinner />}
              <div className="space-y-4">
                {tags.data?.map((t) => (
                  <div key={t.key}>
                    <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
                      <span className="font-medium">{t.name || t.key}</span>
                      <span className="text-[11px] text-faint">{t.uniqueValues} values</span>
                    </div>
                    <div className="space-y-1">
                      {t.topValues.slice(0, 3).map((v) => {
                        const pct = t.totalValues ? Math.round((v.count / t.totalValues) * 100) : 0;
                        return (
                          <div key={v.value} className="relative flex h-6 items-center overflow-hidden rounded bg-sunken px-2 text-[11.5px]">
                            <span className="absolute inset-y-0 left-0 bg-fg/[0.07]" style={{ width: `${pct}%` }} />
                            <span className="relative truncate">{v.name || v.value}</span>
                            <span className="relative ml-auto pl-2 tabular-nums text-muted">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </RailBlock>
            {event.data?.contexts && <Contexts contexts={event.data.contexts as Record<string, Record<string, unknown>>} />}
            {event.data?.sdk && (
              <RailBlock title="SDK">
                <span className="font-mono text-[11.5px] break-all text-muted">
                  {String(event.data.sdk.name)} {String(event.data.sdk.version ?? "")}
                </span>
              </RailBlock>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function EventView({ event, org, issueId, fetching }: { event: IssueEvent; org: string; issueId: string; fetching: boolean }) {
  const navigate = useNavigate();
  const go = (e?: string | null) =>
    navigate({ to: "/$org/issues/$issueId", params: { org, issueId }, search: { event: e ?? undefined }, replace: true });
  // Exception/message first, then the event's extra data, then everything else.
  const rank = (t: string) => (t === "exception" || t === "message" ? 0 : 1);
  const entries = [...(event.entries ?? [])].sort((a, b) => rank(a.type) - rank(b.type));
  const lead = entries.filter((e) => rank(e.type) === 0).length;
  const tags = event.tags.flatMap((t) => (t.key && t.value != null ? [{ key: t.key, value: t.value }] : []));

  return (
    <div className="mt-8 transition-opacity duration-200 starting:opacity-0">
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-x-2 border-b border-line bg-bg/90 px-1 py-1.5 backdrop-blur">
        <span className="text-[13px] font-semibold">Event</span>
        <span className="font-mono text-[11.5px] text-muted">{event.eventID.slice(0, 12)}</span>
        <span className="text-[12px] text-faint"><span className="hidden sm:inline">· {stamp(event.dateCreated)} </span>· {ago(event.dateCreated)} ago</span>
        {fetching && <Spinner className="ml-1" />}
        <div className="ml-auto flex items-center gap-0.5">
          <NavBtn title="Older" disabled={!event.previousEventID} onClick={() => go(event.previousEventID)}><ChevronLeft className="size-3.5" /></NavBtn>
          <NavBtn title="Newer" disabled={!event.nextEventID} onClick={() => go(event.nextEventID)}><ChevronRight className="size-3.5" /></NavBtn>
          <NavBtn title="Latest" disabled={!event.nextEventID} onClick={() => go(null)}><ChevronsRight className="size-3.5" /></NavBtn>
        </div>
      </div>

      <UserCard user={event.user} />

      {tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t.key} className="inline-flex h-6 items-center overflow-hidden rounded border border-line text-[11.5px]">
              <span className="bg-sunken px-1.5 text-muted">{t.key}</span>
              <span className="px-1.5">{t.value}</span>
            </span>
          ))}
        </div>
      )}

      {entries.map((entry, n) => {
        const extra = n === lead && event.context ? <AdditionalData key="extra" data={event.context} /> : null;
        return [extra, renderEntry(entry, n)];
      })}
      {lead === entries.length && event.context && <AdditionalData data={event.context} />}
    </div>
  );
}

function renderEntry(entry: NonNullable<IssueEvent["entries"]>[number], n: number) {
        switch (entry.type) {
          case "exception":
            return <ExceptionBlock key={n} data={entry.data} />;
          case "message":
            return <MessageBlock key={n} data={entry.data} />;
          case "breadcrumbs":
            return <Breadcrumbs key={n} values={entry.data.values ?? []} />;
          case "request":
            return <RequestBlock key={n} data={entry.data} />;
          default:
            return null;
        }
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col justify-between border-r border-b border-line px-4 py-2.5 even:border-r-0 sm:border-b-0 sm:even:border-r lg:border-b-0" title={sub}>
      <span className="text-[11px] text-faint">{label}</span>
      <span className="mt-1 text-[16px] font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function Bars({ points }: { points: number[] }) {
  const max = Math.max(1, ...points);
  return (
    <div className="mt-1 flex h-7 items-end gap-[2px]">
      {points.map((v, i) => (
        <div
          key={i}
          title={`${v} events`}
          className={clsx("min-w-[3px] flex-1 rounded-[1px]", v ? "bg-error/70" : "bg-line-strong")}
          style={{ height: v ? `${Math.max(12, (v / max) * 100)}%` : "2px" }}
        />
      ))}
    </div>
  );
}

function NavBtn({ children, ...p }: { children: ReactNode; title: string; disabled: boolean; onClick: () => void }) {
  return (
    <button {...p} className="grid size-9 cursor-pointer place-items-center rounded-md text-muted md:size-7 hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-30">
      {children}
    </button>
  );
}

function RailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 text-[11px] font-medium tracking-wide text-faint uppercase">{title}</h3>
      {children}
    </section>
  );
}
const Dt = ({ children }: { children: ReactNode }) => <dt className="text-muted">{children}</dt>;

function DetailSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="h-12 shrink-0 border-b border-line" />
      <div className="mx-auto flex w-full max-w-[1280px] gap-8 px-4 py-6 lg:px-6">
        <div className="flex-1 space-y-3 motion-safe:animate-skeleton">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-2/5" />
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="mt-5 h-[66px] w-full rounded-lg" />
          <Skeleton className="mt-8 h-4 w-48" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
        <div className="hidden w-[280px] space-y-3 motion-safe:animate-skeleton lg:block">
          <Skeleton className="h-3 w-20" />
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-6 w-full" />)}
        </div>
      </div>
    </div>
  );
}
