import { useState } from "react";
import clsx from "clsx";
import { Check } from "lucide-react";
import { useMountEffect } from "./hooks";

type Toast = { id: number; text: string; leaving: boolean };
const listeners = new Set<(text: string) => void>();
let seq = 0;

export function toast(text: string) {
  listeners.forEach((l) => l(text));
}

export async function copy(text: string, label: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
    else legacyCopy(text); // plain-http dev hosts have no async clipboard
    toast(label);
  } catch {
    toast("Couldn’t reach the clipboard");
  }
}

function legacyCopy(text: string) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.cssText = "position:fixed;top:0;left:0;opacity:0";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("copy failed");
}

/** Bottom-centre stack, T3's toast motion: slide up on the expo curve, fade out. */
export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useMountEffect(() => {
    const add = (text: string) => {
      const id = ++seq;
      setToasts((t) => [...t.slice(-2), { id, text, leaving: false }]);
      setTimeout(() => setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x))), 1800);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2200);
    };
    listeners.add(add);
    return () => void listeners.delete(add);
  });
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={clsx(
            "dialog-glass flex h-9 items-center gap-2 rounded-lg border px-3 text-[12.5px] font-medium",
            "transition-[translate,opacity] duration-500 ease-out-expo starting:translate-y-[calc(100%+20px)] starting:opacity-0",
            t.leaving && "translate-y-2 opacity-0 duration-300",
          )}
        >
          <Check className="size-3.5 text-ok" />
          {t.text}
        </div>
      ))}
    </div>
  );
}
