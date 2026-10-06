import { createRootRoute, createRoute, createRouter, Navigate, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { orgsQuery } from "./lib/queries";
import { Shell } from "./components/shell";
import { IssuesPage, type IssuesSearch } from "./routes/issues";
import { IssuePage } from "./routes/issue";
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

export const orgRoute = createRoute({ getParentRoute: () => rootRoute, path: "$org", component: Shell });

const orgIndexRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/",
  component: () => {
    const { org } = orgRoute.useParams();
    return <Navigate to="/$org/issues" params={{ org }} replace />;
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

export const issueRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "issues/$issueId",
  validateSearch: (s: Record<string, unknown>): { event?: string } => ({
    event: typeof s.event === "string" ? s.event : undefined,
  }),
  component: IssuePage,
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, orgRoute.addChildren([orgIndexRoute, issuesRoute, issueRoute])]),
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
