import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { api, hitsTotal, unwrap, type Issue } from "../lib/api";
import { issueHeadline } from "../lib/issue";
import { issueStatsQuery } from "../lib/queries";
import { ago, compact } from "../lib/format";
import { Badge, LevelDot, Spinner } from "../components/ui";
import { overviewRoute } from "../router";

const DAY = 24 * 3600_000;
const TEST_TITLE = /GLITCHTIP-VERIFY|GLITCHTIP-DISCORD-ALERT-TEST|smoke test/i;

type Heat = "new" | "climbing" | "steady";
type Row = { issue: Issue; day: number[]; last24: number; heat: Heat };

/** New since yesterday; climbing = at least half of its day landed in the last 6 hours. */
function heatOf(issue: Issue, day: number[]): Heat {
  if (Date.now() - new Date(issue.firstSeen).getTime() < DAY) return "new";
  const total = day.reduce((a, b) => a + b, 0);
  const recent = day.slice(-6).reduce((a, b) => a + b, 0);
  return total >= 5 && recent >= total / 2 ? "climbing" : "steady";
}

const HEAT_BAR: Record<Heat, string> = { new: "bg-error", climbing: "bg-warning", steady: "bg-muted/45" };
const HEAT_FILL: Record<Heat, string> = { new: "text-error", climbing: "text-warning", steady: "text-muted" };

export function OverviewPage() {
  const { org } = overviewRoute.useParams();
  const issues = useQuery({
    queryKey: ["overview-issues", org],
    queryFn: async () => {
      const r = await api.GET("/api/0/organizations/{organization_slug}/issues/", {
        params: { path: { organization_slug: org }, query: { query: "is:unresolved", sort: "-last_seen", limit: 100 } },
      });
      return { items: unwrap(r).filter((i) => !TEST_TITLE.test(i.title)), total: hitsTotal(r.response) };
    },
    refetchInterval: 60_000,
  });
  const all = issues.data?.items ?? [];
  const ids = all.map((i) => Number(i.id));
  const day = useQuery({ ...issueStatsQuery(org, ids, "24h"), refetchInterval: 60_000 });
  const fortnight = useQuery(issueStatsQuery(org, ids, "14d"));

  if (issues.isPending || (ids.length > 0 && day.isPending)) {
    return <div className="grid h-full place-items-center"><Spinner /></div>;
  }
  if (issues.isError) {
    return <div className="px-5 py-10 text-center text-muted">Couldn’t load issues — {String(issues.error.message)}</div>;
  }

  const rows: Row[] = all
    .map((issue) => {
      const d = day.data?.get(issue.id) ?? new Array<number>(24).fill(0);
      return { issue, day: d, last24: d.reduce((a, b) => a + b, 0), heat: heatOf(issue, d) };
    })
    .filter((r) => r.last24 > 0 || Date.now() - new Date(r.issue.lastSeen).getTime() < DAY);
  const movers = [...rows].filter((r) => r.last24 > 0).sort((a, b) => b.last24 - a.last24).slice(0, 8);
  const daily = new Array<number>(14).fill(0);
  for (const pts of fortnight.data?.values() ?? []) pts.forEach((v, i) => (daily[i] += v));

  const stats = [
    { n: rows.reduce((a, r) => a + r.last24, 0), label: "events in the last 24h" },
    { n: rows.length, label: "issues active in 24h" },
    { n: rows.filter((r) => r.heat === "new").length, label: "new issues in 24h", hot: true },
    { n: issues.data?.total ?? all.length, label: "unresolved overall" },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <header className="flex h-12 items-center gap-3 border-b border-line px-3 md:px-5">
        <h1 className="text-[14px] font-semibold">Overview</h1>
        <span className="text-[12px] text-faint">last 24 hours · refreshes every minute</span>
      </header>

      <div className="mx-auto flex max-w-[1100px] flex-col gap-8 px-3 py-5 md:px-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-line bg-panel px-4 py-3">
              <div className={clsx("text-[26px] leading-tight font-semibold tabular-nums", s.hot && s.n > 0 && "text-error")}>
                {s.n.toLocaleString()}
              </div>
              <div className="text-[12px] text-muted">{s.label}</div>
            </div>
          ))}
        </div>

        {movers.length > 0 ? (
          <Section title="Moving — events in the last 24h">
            <div className="flex flex-col gap-2">
              {movers.map((r) => (
                <MoverBar key={r.issue.id} org={org} row={r} max={movers[0].last24} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted">
              <Legend className="bg-error">new in 24h</Legend>
              <Legend className="bg-warning">climbing (half its day in the last 6h)</Legend>
              <Legend className="bg-muted/45">steady</Legend>
            </div>
          </Section>
        ) : (
          <div className="rounded-lg border border-line bg-panel py-10 text-center">
            <div className="text-[14px] font-medium">Nothing broken in the last 24 hours.</div>
          </div>
        )}

        {movers.length > 0 && (
          <Section title="Hourly events, last 24h">
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              {movers.slice(0, 6).map((r) => (
                <Timeline key={r.issue.id} org={org} row={r} />
              ))}
            </div>
          </Section>
        )}

        {fortnight.data && (
          <Section title="Daily events, last 14 days (unresolved issues)">
            <DailyChart points={daily} />
          </Section>
        )}

        {rows.length > 0 && (
          <Section title="Active in the last 24h">
            <div className="overflow-hidden rounded-lg border border-line bg-panel">
              <div className="flex h-8 items-center gap-3 border-b border-line px-3 text-[11px] font-medium text-faint">
                <span className="flex-1">Issue</span>
                <span className="w-14 text-right">24h</span>
                <span className="hidden w-14 text-right sm:block">Total</span>
                <span className="w-[68px] text-right">Seen</span>
              </div>
              {[...rows].sort((a, b) => b.issue.lastSeen.localeCompare(a.issue.lastSeen)).map((r) => (
                <TableRow key={r.issue.id} org={org} row={r} />
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-[11px] font-semibold tracking-wider text-faint uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <i className={clsx("inline-block size-2.5 rounded-[2px]", className)} />
      {children}
    </span>
  );
}

function MoverBar({ org, row, max }: { org: string; row: Row; max: number }) {
  const { head, tail } = issueHeadline(row.issue);
  return (
    <Link
      to="/$org/issues/$issueId"
      params={{ org, issueId: row.issue.id }}
      className="group grid grid-cols-[minmax(0,1fr)] gap-1 rounded-md md:grid-cols-[260px_minmax(0,1fr)] md:items-center md:gap-3"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[11.5px] font-semibold group-hover:underline">{row.issue.shortId}</span>
          {row.heat === "new" && <Badge tone="accent">New</Badge>}
        </div>
        <div className="truncate text-[12px] text-muted">{tail ? `${head}: ${tail}` : head}</div>
      </div>
      <div className="flex items-center gap-2">
        <div className={clsx("h-3.5 rounded-[3px]", HEAT_BAR[row.heat])} style={{ width: `${Math.max(1, (row.last24 / max) * 88)}%` }} />
        <span className="text-[12px] font-medium tabular-nums">{row.last24.toLocaleString()}</span>
      </div>
    </Link>
  );
}

function hourLabel(hoursAgo: number) {
  const d = new Date(Date.now() - hoursAgo * 3600_000);
  return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${String(d.getHours()).padStart(2, "0")}:00`;
}

function Timeline({ org, row }: { org: string; row: Row }) {
  const { head } = issueHeadline(row.issue);
  const max = Math.max(1, ...row.day);
  const n = row.day.length;
  return (
    <Link to="/$org/issues/$issueId" params={{ org, issueId: row.issue.id }} className="group min-w-0">
      <div className="flex items-baseline gap-2 text-[12px]">
        <span className="font-mono font-semibold group-hover:underline">{row.issue.shortId}</span>
        <span className="text-faint">peak {max}/h</span>
      </div>
      <svg viewBox={`0 0 ${n * 10} 60`} preserveAspectRatio="none" className={clsx("mt-1 h-[60px] w-full", HEAT_FILL[row.heat])} aria-hidden>
        {row.day.map((v, i) => {
          const h = v === 0 ? 0 : Math.max(2, (v / max) * 58);
          return <rect key={i} x={i * 10} y={60 - h} width={8.5} height={h} className="fill-current" />;
        })}
        <line x1={0} x2={n * 10} y1={59.5} y2={59.5} className="stroke-line-strong" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[10px] text-faint tabular-nums">
        <span>{hourLabel(23)}</span>
        <span>{hourLabel(12)}</span>
        <span>now</span>
      </div>
      <div className="truncate text-[11.5px] text-muted">{head}</div>
    </Link>
  );
}

function DailyChart({ points }: { points: number[] }) {
  const max = Math.max(1, ...points);
  const label = (daysAgo: number) =>
    new Date(Date.now() - daysAgo * DAY).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return (
    <div className="rounded-lg border border-line bg-panel px-4 pt-4 pb-2">
      <div className="flex h-[120px] items-end gap-[3px]">
        {points.map((v, i) => (
          <div key={i} className="group relative flex h-full flex-1 flex-col justify-end" title={`${label(points.length - 1 - i)}: ${v.toLocaleString()} events`}>
            <span className="mb-0.5 text-center text-[10px] text-faint tabular-nums opacity-0 group-hover:opacity-100">{compact(v)}</span>
            <div
              className={clsx("rounded-t-[2px]", i === points.length - 1 ? "bg-error/80" : "bg-muted/45")}
              style={{ height: v === 0 ? 1 : `${Math.max(2, (v / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-faint">
        <span>{label(points.length - 1)}</span>
        <span>{label(Math.floor(points.length / 2))}</span>
        <span>today</span>
      </div>
    </div>
  );
}

function TableRow({ org, row }: { org: string; row: Row }) {
  const { head, tail } = issueHeadline(row.issue);
  return (
    <Link
      to="/$org/issues/$issueId"
      params={{ org, issueId: row.issue.id }}
      className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0 hover:bg-hover"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <LevelDot level={row.issue.level} />
          <span className="shrink-0 font-semibold">{head}</span>
          {tail && <span className="hidden truncate text-muted md:inline">{tail}</span>}
        </div>
        <div className="flex min-w-0 items-center gap-2 pl-4 text-[11.5px] text-faint">
          <span className="truncate text-muted">{row.issue.project.name}</span>
          <span className="font-mono text-[11px]">{row.issue.shortId}</span>
          {row.heat === "new" && <Badge tone="accent">New</Badge>}
          {row.heat === "climbing" && <Badge tone="warn">Climbing</Badge>}
        </div>
      </div>
      <span className="w-14 text-right font-medium tabular-nums">{compact(row.last24)}</span>
      <span className="hidden w-14 text-right text-muted tabular-nums sm:block">{compact(row.issue.count)}</span>
      <span className="w-[68px] text-right text-[11.5px] tabular-nums">{ago(row.issue.lastSeen)} ago</span>
    </Link>
  );
}
