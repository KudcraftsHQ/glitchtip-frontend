import { formatDistanceToNowStrict, format } from "date-fns";

export function ago(iso?: string | null) {
  if (!iso) return "—";
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: false })
    .replace(/ seconds?/, "s")
    .replace(/ minutes?/, "m")
    .replace(/ hours?/, "h")
    .replace(/ days?/, "d")
    .replace(/ months?/, "mo")
    .replace(/ years?/, "y");
}

export function stamp(iso?: string | null) {
  if (!iso) return "—";
  return format(new Date(iso), "MMM d, HH:mm:ss");
}

export function compact(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  if (v < 1000) return String(v);
  if (v < 1_000_000) return (v / 1000).toFixed(v < 10_000 ? 1 : 0).replace(/\.0$/, "") + "k";
  return (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
}
