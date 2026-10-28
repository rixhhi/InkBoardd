import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageBody } from "@/components/ui";
import { WidgetErrorBoundary } from "@/lib/error-component";
import { InlineAlert } from "@/components/ui/planner/kit.tsx";
import { COPY } from "@inkboard/shared/copy";
import { isBrowserOffline, readTodayCache } from "@inkboard/shared/planner/offline";
import { usePlanner } from "@inkboard/shared/planner/use-planner";

/** Planner pages share the app shell; the planner keeps its own section nav under the context bar. */
export function PlannerShell({ children }: { children: React.ReactNode }) {
  const { quotaError } = usePlanner();

  return (
    <AppShell>
      <PageBody>
        <div id="planner-main" className="pt-4">
          <PlannerSubnav />
          <OfflineBanner />
          {quotaError ? (
            <div className="mb-4">
              <InlineAlert tone="danger" title="Not saved — export a backup" body={quotaError} />
            </div>
          ) : null}
          <WidgetErrorBoundary title={COPY.slateSlipped}>{children}</WidgetErrorBoundary>
        </div>
      </PageBody>
    </AppShell>
  );
}

const SECTIONS = [
  { to: "/planner/today", label: () => COPY.today, match: (p: string) => p.startsWith("/planner/today"), search: { add: undefined, day: undefined } },
  { to: "/planner", label: () => COPY.month, match: (p: string) => p === "/planner", search: { day: undefined } },
  { to: "/planner/dashboard", label: () => COPY.pace, match: (p: string) => p.startsWith("/planner/dashboard") },
  { to: "/planner/history", label: () => COPY.history, match: (p: string) => p.startsWith("/planner/history") },
  { to: "/planner/analytics", label: () => COPY.instruments, match: (p: string) => p.startsWith("/planner/analytics") },
  { to: "/planner/badges", label: () => COPY.seals, match: (p: string) => p.startsWith("/planner/badges") },
  { to: "/planner/settings", label: () => COPY.settings, match: (p: string) => p.startsWith("/planner/settings") },
] as const;

function PlannerSubnav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav aria-label="Planner" className="scroll-fade-x mb-4 flex gap-1 overflow-x-auto pb-2 [scrollbar-width:none]">
      {SECTIONS.map((s) => {
        const current = s.match(pathname);
        return (
          <Link
            key={s.to}
            to={s.to}
            search={"search" in s ? (s.search as never) : undefined}
            aria-current={current ? "page" : undefined}
            className={`inline-flex h-9 shrink-0 items-center rounded-full px-3 text-sm whitespace-nowrap transition-colors duration-[var(--dur-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
              current ? "bg-fg text-bg" : "bg-surface-raised text-fg-muted hover:text-fg"
            }`}
          >
            {s.label()}
          </Link>
        );
      })}
    </nav>
  );
}

function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const sync = () => setOffline(isBrowserOffline());
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  if (!offline) return null;
  const cache = readTodayCache();
  return (
    <div className="mb-4">
      <InlineAlert
        title={COPY.youreOffline}
        body={
          cache
            ? `Today’s plan (“${cache.planName}”, ${cache.tasks.length} items) is saved on this device. The board still works. Sync resumes when you’re back.`
            : "What is already on this device still works. Sync resumes when you’re back."
        }
      />
    </div>
  );
}
