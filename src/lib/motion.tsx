import { useRef, useState, type ReactNode } from "react";
import clsx from "clsx";

/** Keep an overlay mounted through its exit transition, then call `onClosed`. */
export function useExit(onClosed: () => void, duration = 200) {
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  function close() {
    if (closing) return;
    setClosing(true);
    timer.current = setTimeout(onClosed, duration);
  }
  return { closing, close };
}

/** Switch palettes without every transition on the page animating to the new colors. */
export function setTheme(dark: boolean) {
  const root = document.documentElement;
  root.classList.add("no-transitions");
  root.classList.toggle("dark", dark);
  localStorage.setItem("theme", dark ? "dark" : "light");
  void root.offsetHeight; // flush styles before transitions come back
  requestAnimationFrame(() => root.classList.remove("no-transitions"));
}

/**
 * Height-animated disclosure (grid-rows 0fr ↔ 1fr). Children mount on first open and
 * stay mounted, so collapsing animates too.
 */
export function Collapse({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  return (
    <div
      inert={!open}
      className={clsx(
        "grid transition-[grid-template-rows,opacity] duration-200 ease-drawer",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        className,
      )}
    >
      <div className="min-h-0 overflow-hidden">{mounted && children}</div>
    </div>
  );
}
