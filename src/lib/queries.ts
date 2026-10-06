import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "./api";

export const orgsQuery = queryOptions({
  queryKey: ["orgs"],
  queryFn: async () => unwrap(await api.GET("/api/0/organizations/")),
  staleTime: 5 * 60_000,
});

export const projectsQuery = (org: string) =>
  queryOptions({
    queryKey: ["projects", org],
    queryFn: async () =>
      unwrap(await api.GET("/api/0/organizations/{organization_slug}/projects/", { params: { path: { organization_slug: org } } })),
    staleTime: 5 * 60_000,
  });

export const issueStatsQuery = (org: string, ids: number[], period: "24h" | "14d") =>
  queryOptions({
    queryKey: ["issue-stats", org, period, ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const rows = unwrap(
        await api.GET("/api/0/organizations/{organization_slug}/issues-stats/", {
          params: { path: { organization_slug: org }, query: { groups: ids, statsPeriod: period } },
        }),
      );
      return new Map(rows.map((r) => [r.id, buckets(r.stats[period] ?? [], period)]));
    },
    staleTime: 60_000,
  });

/** The API only returns buckets that had events, unordered. Spread them over a fixed timeline. */
function buckets(points: number[][], period: "24h" | "14d") {
  const size = period === "24h" ? 3600 : 86400;
  const n = period === "24h" ? 24 : 14;
  const end = Math.floor(Date.now() / 1000 / size);
  const out = new Array<number>(n).fill(0);
  for (const [ts, count] of points) {
    const i = n - 1 - (end - Math.floor(ts / size));
    if (i >= 0 && i < n) out[i] += count;
  }
  return out;
}
