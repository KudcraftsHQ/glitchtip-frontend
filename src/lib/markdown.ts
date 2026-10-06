import type { IssueDetail, IssueEvent, Breadcrumb, Schemas } from "./api";
import { issueHeadline, normalizeFrame, type RawFrame } from "./issue";

export function issueUrl(org: string, issueId: string | number) {
  return `${window.location.origin}/${org}/issues/${issueId}`;
}

type ExceptionValue = { type?: string; value?: string; module?: string; mechanism?: { type?: string; handled?: boolean }; stacktrace?: { frames?: RawFrame[] } | null };
type IssueTag = Schemas["IssueTagSchema"];

const fence = (body: string, lang = "") => "```" + lang + "\n" + body.replace(/\n+$/, "") + "\n```";
const json = (v: unknown) => fence(JSON.stringify(v, null, 2), "json");

/** The whole issue as one Markdown document — sized for pasting into an AI chat. */
export function issueMarkdown(org: string, issue: IssueDetail, event?: IssueEvent, tags?: IssueTag[]) {
  const { head, tail } = issueHeadline(issue);
  const out: string[] = [];
  out.push(`# ${head}${tail ? `: ${tail}` : ""}`);
  out.push(
    [
      `- **Issue:** ${issue.shortId} · ${issueUrl(org, issue.id)}`,
      `- **Project:** ${issue.project.name}${issue.project.platform ? ` (${issue.project.platform})` : ""}`,
      `- **Level / status:** ${issue.level} / ${issue.status}`,
      `- **Events:** ${issue.count} · **Users:** ${issue.userCount ?? 0}`,
      `- **First seen:** ${issue.firstSeen} · **Last seen:** ${issue.lastSeen}`,
      issue.culprit ? `- **Culprit:** \`${issue.culprit}\`` : "",
      issue.firstRelease ? `- **Releases:** ${issue.firstRelease.version}${issue.lastRelease ? ` → ${issue.lastRelease.version}` : ""}` : "",
    ].filter(Boolean).join("\n"),
  );
  if (!event) return out.join("\n\n") + "\n";

  out.push(`## Event ${event.eventID}\n\n- **Time:** ${event.dateCreated}${event.platform ? `\n- **Platform:** ${event.platform}` : ""}`);

  const user = event.user as Record<string, unknown> | null | undefined;
  if (user && Object.keys(user).length) {
    const who = user.email || user.username || user.id;
    out.push(`## User\n\n${who ? `Signed in: **${who}**` : "Anonymous"}${user.ip_address ? ` · IP ${user.ip_address}` : ""}`);
  }

  for (const entry of event.entries ?? []) {
    if (entry.type === "exception") {
      const values = ((entry.data.values as ExceptionValue[] | undefined) ?? []).slice().reverse();
      const parts = values.map((v, i) => {
        const lines = [`### ${i ? "Caused by: " : ""}${v.type ?? "Exception"}: ${v.value ?? ""}`];
        if (v.mechanism) lines.push(`Mechanism: ${v.mechanism.type ?? "?"}, handled: ${v.mechanism.handled ?? "?"}`);
        const frames = (v.stacktrace?.frames ?? []).map(normalizeFrame).reverse();
        if (frames.length) {
          const trace = frames.map((f) => {
            const where = `${f.filename || f.abs_path || f.module || "?"}${f.lineno != null ? `:${f.lineno}` : ""}${f.colno != null ? `:${f.colno}` : ""}`;
            let line = `${f.in_app ? "→" : " "} at ${f.function || "<anonymous>"} (${where})`;
            if (f.in_app && f.context_line != null) {
              const ctx = [...(f.pre_context ?? []).slice(-3), `>> ${f.context_line}`, ...(f.post_context ?? []).slice(0, 2)];
              line += "\n" + ctx.map((c) => `      ${c ?? ""}`).join("\n");
            }
            return line;
          });
          lines.push("Stack trace (most recent call first, → = app code):\n\n" + fence(trace.join("\n")));
        }
        return lines.join("\n\n");
      });
      out.push(`## Exception\n\n${parts.join("\n\n")}`);
    } else if (entry.type === "message") {
      const text = String(entry.data.formatted ?? entry.data.message ?? "");
      if (text) out.push(`## Message\n\n${fence(text)}`);
    } else if (entry.type === "request") {
      const r = entry.data;
      const lines = [`${r.method ?? ""} ${r.url ?? ""}`.trim()];
      if (r.query?.length) lines.push("Query: " + r.query.map(([k, v]) => `${k}=${v}`).join("&"));
      if (r.data != null && r.data !== "") lines.push("Body:\n" + (typeof r.data === "string" ? r.data : JSON.stringify(r.data, null, 2)));
      if (r.headers?.length) lines.push("Headers:\n" + r.headers.map(([k, v]) => `${k}: ${v}`).join("\n"));
      out.push(`## Request\n\n${fence(lines.join("\n\n"))}`);
    } else if (entry.type === "breadcrumbs") {
      const crumbs = ((entry.data.values ?? []) as Breadcrumb[]).slice(-25);
      if (crumbs.length) {
        const rows = crumbs.map((b) => {
          const d = (b.data ?? {}) as Record<string, unknown>;
          const msg = b.message || (d.url ? [d.method, d.url, d.status_code].filter((x) => x != null).join(" ") : Object.keys(d).length ? JSON.stringify(d) : "");
          return `${b.timestamp ?? ""} [${b.level ?? "info"}] ${b.category || b.type || ""}: ${String(msg).slice(0, 200)}`;
        });
        out.push(`## Breadcrumbs (last ${crumbs.length})\n\n${fence(rows.join("\n"))}`);
      }
    }
  }

  if (event.context && Object.keys(event.context).length) out.push(`## Additional data\n\n${json(event.context)}`);
  const eventTags = event.tags.filter((t) => t.key && t.value != null);
  if (eventTags.length) out.push(`## Tags\n\n${eventTags.map((t) => `- ${t.key}: ${t.value}`).join("\n")}`);
  if (event.contexts && Object.keys(event.contexts).length) out.push(`## Contexts\n\n${json(event.contexts)}`);
  if (tags?.length) {
    out.push(
      `## Tag distribution across all events\n\n${tags
        .map((t) => `- ${t.key}: ${t.topValues.slice(0, 3).map((v) => `${v.value} (${v.count})`).join(", ")}${t.uniqueValues > 3 ? `, … ${t.uniqueValues} values` : ""}`)
        .join("\n")}`,
    );
  }
  return out.join("\n\n") + "\n";
}
