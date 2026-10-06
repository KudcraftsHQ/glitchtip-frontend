import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { allauth } from "./lib/api";
import { Button, Spinner } from "./components/ui";

export const sessionKey = ["session"] as const;
export const fetchSession = () => allauth("/auth/session");

export function Login() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = needsCode
      ? await allauth("/auth/2fa/authenticate", { method: "POST", body: { code } })
      : await allauth("/auth/login", { method: "POST", body: { email, password } });
    setBusy(false);
    if (res.status === 200) {
      qc.invalidateQueries({ queryKey: sessionKey });
      return;
    }
    const pending = (res.data as { flows?: { id: string; is_pending?: boolean }[] } | undefined)?.flows?.find(
      (f) => f.is_pending,
    );
    if (res.status === 401 && pending?.id === "mfa_authenticate") {
      setNeedsCode(true);
      return;
    }
    setError(res.errors?.[0]?.message ?? "Sign in failed");
  }

  const field =
    "h-9 w-full rounded-md border border-line-strong bg-panel px-3 text-[13px] outline-none placeholder:text-faint focus:border-fg/40";

  return (
    <div className="grid h-full place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-[320px] space-y-3">
        <div className="mb-6 flex items-center gap-2">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">GlitchTip</span>
        </div>
        {needsCode ? (
          <input autoFocus className={field} placeholder="Authenticator code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" />
        ) : (
          <>
            <input autoFocus className={field} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            <input className={field} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </>
        )}
        {error && <p className="text-[12px] text-accent">{error}</p>}
        <Button variant="primary" className="h-9! w-full" disabled={busy}>
          {busy ? <Spinner className="border-t-bg" /> : needsCode ? "Verify" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className ?? "size-5"} aria-hidden>
      <rect width="20" height="20" rx="5" className="fill-accent" />
      <path d="M5 13.5 8 7l3 5 1.6-2.6L15 13.5" fill="none" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
