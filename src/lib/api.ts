import createClient, { type Middleware } from "openapi-fetch";
import type { paths, components } from "../api/api-schema";

export type Schemas = components["schemas"];
export type Issue = Schemas["IssueSchema"];
export type IssueDetail = Schemas["IssueDetailSchema"];
export type IssueEvent = Schemas["IssueEventDetailSchema"];
export type Project = Schemas["ProjectSchema"];
export type Organization = Schemas["OrganizationSchema"];
export type Frame = Schemas["StackTraceFrame"];
export type Breadcrumb = Schemas["APIEventBreadcrumb"];

export function csrfToken() {
  return document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1] ?? "";
}

const csrf: Middleware = {
  onRequest({ request }) {
    if (request.method !== "GET") request.headers.set("X-CSRFToken", csrfToken());
    return request;
  },
};

export const api = createClient<paths>({ credentials: "include" });
api.use(csrf);

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** openapi-fetch result → data, or throw so TanStack Query sees an error. */
export function unwrap<T>(r: { data?: T; error?: unknown; response: Response }): T {
  if (r.error !== undefined || r.data === undefined) {
    if (r.response.status === 401 || r.response.status === 403) {
      window.dispatchEvent(new Event("glitchtip:unauthorized"));
    }
    throw new ApiError(r.response.status, `${r.response.status} ${r.response.statusText}`);
  }
  return r.data;
}

/** GlitchTip paginates with a Link header: `<url>; rel="next"; results="true"; cursor="…"`. */
export function nextCursor(response: Response): string | null {
  const link = response.headers.get("link");
  if (!link) return null;
  for (const part of link.split(",")) {
    if (/rel="next"/.test(part) && /results="true"/.test(part)) {
      return part.match(/cursor="([^"]+)"/)?.[1] ?? null;
    }
  }
  return null;
}
export function hitsTotal(response: Response): number | null {
  const n = response.headers.get("x-hits");
  return n ? Number(n) : null;
}

// ---- allauth (headless, browser client) — plain fetch, its errors are part of the flow
export type AllauthResponse = {
  status: number;
  data?: { user?: { id: number; email: string; display: string } };
  meta?: { is_authenticated?: boolean };
  errors?: { message: string; param?: string }[];
};

export async function allauth(path: string, init?: { method?: string; body?: unknown }) {
  const res = await fetch(`/_allauth/browser/v1${path}`, {
    method: init?.method ?? "GET",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRFToken": csrfToken() },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({ status: res.status }))) as AllauthResponse & {
    data?: { flows?: { id: string; is_pending?: boolean }[] };
  };
  return { ...json, status: res.status };
}
