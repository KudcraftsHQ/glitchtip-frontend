import type { Frame, Issue } from "./api";

export function issueHeadline(issue: Pick<Issue, "title" | "metadata" | "type">) {
  const m = issue.metadata as { type?: string; value?: string; title?: string };
  if (issue.type === "error" && m.type) return { head: m.type, tail: m.value ?? "" };
  return { head: m.title ?? issue.title, tail: "" };
}

/**
 * The API serializes frames in camelCase (`inApp`, `lineNo`, `context: [[n, line]]`)
 * even though the OpenAPI schema says snake_case. Accept both.
 */
export type RawFrame = Frame & { inApp?: boolean; lineNo?: number; colNo?: number; absPath?: string; context?: [number, string | null][] };
export function normalizeFrame(f: RawFrame): Frame {
  const lineno = f.lineno ?? f.lineNo ?? null;
  const ctx = f.context ?? [];
  return {
    ...f,
    // Some SDKs flag bundled dependencies as in-app; a node_modules path never is.
    in_app: (f.in_app ?? f.inApp ?? null) && !isLibraryPath(f.filename ?? f.abs_path ?? f.absPath ?? ""),
    lineno,
    colno: f.colno ?? f.colNo ?? null,
    abs_path: f.abs_path ?? f.absPath ?? null,
    pre_context: f.pre_context ?? ctx.filter(([n]) => lineno != null && n < lineno).map(([, t]) => t),
    context_line: f.context_line ?? ctx.find(([n]) => n === lineno)?.[1] ?? null,
    post_context: f.post_context ?? ctx.filter(([n]) => lineno != null && n > lineno).map(([, t]) => t),
  };
}


const isLibraryPath = (path: string) => /(^|\/)node_modules\/|^<anonymous>$|^native$|^\[native code\]$/.test(path);
