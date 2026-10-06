import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export const levelColor: Record<string, string> = {
  fatal: "bg-fatal",
  error: "bg-error",
  warning: "bg-warning",
  info: "bg-info",
  debug: "bg-debug",
};
export const levelText: Record<string, string> = {
  fatal: "text-fatal",
  error: "text-error",
  warning: "text-warning",
  info: "text-info",
  debug: "text-debug",
};

export function LevelDot({ level, className }: { level?: string | null; className?: string }) {
  return (
    <span
      className={clsx("inline-block size-2 shrink-0 rounded-full", levelColor[level ?? ""] ?? "bg-debug", className)}
    />
  );
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "accent" | "ok" | "warn"; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex h-[18px] items-center gap-1 rounded px-1.5 text-[11px] font-medium leading-none whitespace-nowrap",
        tone === "neutral" && "bg-hover text-muted",
        tone === "accent" && "bg-accent-soft text-accent",
        tone === "ok" && "bg-ok/12 text-ok",
        tone === "warn" && "bg-warning/12 text-warning",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Button({
  variant = "ghost",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline"; size?: "sm" | "md" }) {
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-[background-color,color,box-shadow,scale,opacity] duration-100 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none cursor-pointer",
        size === "md" ? "h-7 px-2.5 text-[12.5px]" : "h-6 px-2 text-[12px]",
        variant === "primary" && "bg-fg text-bg hover:opacity-90",
        variant === "outline" && "border border-line-strong bg-panel text-fg hover:bg-hover",
        variant === "ghost" && "text-muted hover:bg-hover hover:text-fg",
        className,
      )}
    />
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[17px] min-w-[17px] items-center justify-center rounded border border-line-strong bg-panel px-1 font-mono text-[10px] text-muted">
      {children}
    </kbd>
  );
}

export function Sparkline({ points, width = 84, height = 22, className }: { points: number[]; width?: number; height?: number; className?: string }) {
  if (!points.length) return <div style={{ width, height }} />;
  const max = Math.max(1, ...points);
  const step = width / points.length;
  const bar = Math.max(1, step - 1);
  return (
    <svg width={width} height={height} className={clsx("text-muted", className)} aria-hidden>
      {points.map((v, i) => {
        const h = v === 0 ? 1 : Math.max(2, (v / max) * height);
        return (
          <rect
            key={i}
            x={i * step}
            y={height - h}
            width={bar}
            height={h}
            rx={0.5}
            className={v === 0 ? "fill-line-strong" : "fill-current"}
          />
        );
      })}
    </svg>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={clsx("inline-block size-3.5 animate-spin rounded-full border-[1.5px] border-line-strong border-t-fg", className)}
    />
  );
}

/** T3's loading bar: a block that breathes in stepped opacity. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("rounded bg-fg/[0.08]", className)} />;
}
