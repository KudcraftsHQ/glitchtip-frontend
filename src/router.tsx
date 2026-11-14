import { createRootRoute, createRoute, createRouter, Navigate, Outlet, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { orgsQuery } from "./lib/queries";
import { queryClient } from "./lib/query-client";
import { Shell } from "./components/shell";
import { IssuesPage, type IssuesSearch } from "./routes/issues";
import { IssuePage } from "./routes/issue";
import { OverviewPage } from "./routes/overview";
import { Spinner } from "./components/ui";

const rootRoute = createRootRoute({ component: Outlet });

function OrgRedirect() {
  const orgs = useQuery(orgsQuery);
  if (orgs.isPending) return <div className="grid h-full place-items-center"><Spinner /></div>;
  const last = localStorage.getItem("org");
  const org = orgs.data?.find((o) => o.slug === last) ?? orgs.data?.[0];
  if (!org) return <div className="grid h-full place-items-center text-muted">No organizations</div>;
  return <Navigate to="/$org/issues" params={{ org: org.slug }} replace />;
}

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: OrgRedirect });

export const orgRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$org",
  // The API's issue `permalink` puts the project slug where the org belongs
  // (/facemap/issues/123). Rewrite any first segment that isn't an org to the
  // user's org here, once per navigation. Doing it with <Navigate> inside Shell
  // re-fired the navigation on every render and froze the tab.
  beforeLoad: async ({ params, location }) => {
    const orgs = await queryClient.ensureQueryData(orgsQuery);
    if (orgs.some((o) => o.slug === params.org)) return;
    const fallback = orgs.find((o) => o.slug === localStorage.getItem("org")) ?? orgs[0];
    if (!fallback) return;
    throw redirect({ href: location.href.replace(`/${params.org}`, `/${fallback.slug}`), replace: true });
  },
  component: Shell,
});

const orgIndexRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/",
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$org/issues", params, replace: true });
  },
});

export const issuesRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "issues",
  validateSearch: (s: Record<string, unknown>): IssuesSearch => ({
    query: typeof s.query === "string" ? s.query : undefined,
    project: s.project != null && s.project !== "" ? String(s.project) : undefined,
    sort: typeof s.sort === "string" ? (s.sort as IssuesSearch["sort"]) : undefined,
    env: typeof s.env === "string" ? s.env : undefined,
  }),
  component: IssuesPage,
});

export const overviewRoute = createRoute({ getParentRoute: () => orgRoute, path: "overview", component: OverviewPage });

export const issueRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "issues/$issueId",
  validateSearch: (s: Record<string, unknown>): { event?: string } => ({
    event: typeof s.event === "string" ? s.event : undefined,
  }),
  component: IssuePage,
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, orgRoute.addChildren([orgIndexRoute, overviewRoute, issuesRoute, issueRoute])]),
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
