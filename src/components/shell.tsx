import { useState } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ChevronsUpDown, Inbox, LogOut, Menu, Moon, Search, Sun } from "lucide-react";
import { CommandCenter } from "./command";
import { useMountEffect } from "../lib/hooks";
import { Kbd } from "./ui";
import { setTheme } from "../lib/motion";
import { Toaster } from "../lib/toast";
import { orgsQuery, projectsQuery } from "../lib/queries";
import { allauth } from "../lib/api";
import { Logo, sessionKey, fetchSession } from "../auth";

export function Shell() {
  const { org } = useParams({ from: "/$org" });
  const orgs = useQuery(orgsQuery);
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  const [command, setCommand] = useState(false);
  useMountEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommand(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  // The API's issue `permalink` puts the project slug where the org belongs.
  // Any first segment that isn't an org is rewritten to the user's org.
  if (orgs.data && !orgs.data.some((o) => o.slug === org)) {
    const fallback = orgs.data.find((o) => o.slug === localStorage.getItem("org")) ?? orgs.data[0];
    if (fallback) return <Navigate to={location.href.replace(`/${org}`, `/${fallback.slug}`)} replace />;
  }
  localStorage.setItem("org", org);
  return (
    <div className="flex h-full">
      <div
        onClick={() => setDrawer(false)}
        className={clsx(
          "dialog-backdrop fixed inset-0 z-30 transition-opacity duration-200 md:hidden",
          drawer ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <Toaster />
      {command && <CommandCenter org={org} onClosed={() => setCommand(false)} />}
      <Sidebar org={org} open={drawer} onNavigate={() => setDrawer(false)} onSearch={() => { setDrawer(false); setCommand(true); }} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-panel px-2 md:hidden">
          <button onClick={() => setDrawer(true)} className="grid size-8 cursor-pointer place-items-center rounded-md text-muted hover:bg-hover hover:text-fg" aria-label="Menu">
            <Menu className="size-4" />
          </button>
          <Logo className="size-[18px]" />
          <span className="text-[13px] font-semibold">GlitchTip</span>
          <button onClick={() => setCommand(true)} className="ml-auto grid size-8 cursor-pointer place-items-center rounded-md text-muted hover:bg-hover hover:text-fg" aria-label="Search">
            <Search className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function Sidebar({ org, open, onNavigate, onSearch }: { org: string; open: boolean; onNavigate: () => void; onSearch: () => void }) {
  const orgs = useQuery(orgsQuery);
  const projects = useQuery(projectsQuery(org));
  const search = useSearch({ strict: false }) as { project?: string };
  const navigate = useNavigate();
  const qc = useQueryClient();
  const session = useQuery({ queryKey: sessionKey, queryFn: fetchSession, staleTime: Infinity });
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [orgOpen, setOrgOpen] = useState(false);
  const current = orgs.data?.find((o) => o.slug === org);
  const sorted = [...(projects.data ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  function toggleTheme() {
    setTheme(!dark);
    setDark(!dark);
  }

  async function signOut() {
    await allauth("/auth/session", { method: "DELETE" });
    qc.clear();
    qc.invalidateQueries({ queryKey: sessionKey });
  }

  const item = "flex h-9 md:h-7 items-center gap-2 rounded-md px-2 text-[12.5px] text-muted transition-colors duration-100 hover:bg-hover hover:text-fg";

  return (
    <aside
      onClick={(e) => (e.target as HTMLElement).closest("a") && onNavigate()}
      className={clsx(
        "fixed inset-y-0 left-0 z-40 flex w-[256px] shrink-0 flex-col border-r border-line bg-panel transition-transform duration-300 ease-drawer max-md:shadow-2xl md:static md:w-[216px] md:translate-x-0 md:transition-none",
        open ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="relative px-2 pt-2.5 pb-2">
        <button
          onClick={() => setOrgOpen(!orgOpen)}
          className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 hover:bg-hover"
        >
          <Logo className="size-[18px]" />
          <span className="truncate text-[13px] font-semibold">{current?.name ?? org}</span>
          <ChevronsUpDown className="ml-auto size-3.5 text-faint" />
        </button>
        {(
          <div
            inert={!orgOpen}
            className={clsx(
              "absolute inset-x-2 top-11 z-20 origin-top rounded-lg border border-line-strong bg-panel p-1 shadow-lg transition-[scale,opacity] duration-150",
              orgOpen ? "scale-100 opacity-100" : "pointer-events-none scale-98 opacity-0",
            )}
          >
            {orgs.data?.map((o) => (
              <button
                key={o.slug}
                onClick={() => {
                  setOrgOpen(false);
                  navigate({ to: "/$org/issues", params: { org: o.slug } });
                }}
                className={clsx(item, "w-full cursor-pointer", o.slug === org && "text-fg")}
              >
                {o.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-2 pb-2">
        <button
          onClick={onSearch}
          className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md border border-line bg-bg px-2 text-[12.5px] text-faint hover:border-line-strong hover:text-muted"
        >
          <Search className="size-3.5" />
          Search…
          <span className="ml-auto hidden items-center gap-0.5 md:flex"><Kbd>{navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}</Kbd><Kbd>K</Kbd></span>
        </button>
      </div>
      <nav className="px-2">
        <Link
          to="/$org/issues"
          params={{ org }}
          search={(s) => ({ ...s, project: undefined })}
          className={clsx(item, !search.project && "bg-hover text-fg")}
          activeOptions={{ exact: true, includeSearch: false }}
        >
          <Inbox className="size-3.5" />
          All issues
        </Link>
      </nav>

      <div className="mt-4 mb-1 px-4 text-[11px] font-medium text-faint">Projects</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {sorted.map((p) => (
          <Link
            key={p.id}
            to="/$org/issues"
            params={{ org }}
            search={(s) => ({ ...s, project: p.id })}
            className={clsx(item, search.project === p.id && "bg-hover text-fg")}
          >
            <span className="size-2 shrink-0 rounded-[3px]" style={{ background: p.color || "var(--faint)" }} />
            <span className="truncate">{p.name}</span>
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-1 border-t border-line px-2 py-2">
        <span className="min-w-0 flex-1 truncate px-2 text-[12px] text-muted">{session.data?.data?.user?.email}</span>
        <button onClick={toggleTheme} className="grid size-7 cursor-pointer place-items-center rounded-md text-muted hover:bg-hover hover:text-fg" title="Toggle theme">
          {dark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
        </button>
        <button onClick={signOut} className="grid size-7 cursor-pointer place-items-center rounded-md text-muted hover:bg-hover hover:text-fg" title="Sign out">
          <LogOut className="size-3.5" />
        </button>
      </div>
    </aside>
  );
}
