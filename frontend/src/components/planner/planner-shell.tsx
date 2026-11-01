import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Menu, PageBody } from "@/components/ui";
import { WidgetErrorBoundary } from "@/lib/error-component";
import { InlineAlert } from "@/components/ui/planner/kit.tsx";
import { COPY } from "@inkboard/shared/copy";
import { isBrowserOffline, readTodayCache } from "@inkboard/shared/planner/offline";
import { usePlanner } from "@inkboard/shared/planner/use-planner";
import { HelpButton } from "@/components/help/help-button";

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

type Section = { to: string; label: () => string; match: (p: string) => boolean; search?: Record<string, undefined>; /** Shown in the row every day. The rest live under "More". */ daily?: boolean };

/**
 * Nine planner pages were nine pills in a horizontal scroller — on a phone you saw four and
 * had to know the rest existed. The four you touch daily stay in the row; Dashboard, History,
 * Analytics, Badges, Settings and Guide sit under "More". Whatever page you are on is always
 * visible as the active pill, even when it belongs to "More".
 */
export const SECTIONS: readonly Section[] = [
  { to: "/planner/today", label: () => COPY.today, match: (p) => p.startsWith("/planner/today"), search: { add: undefined, day: undefined }, daily: true },
  { to: "/planner", label: () => COPY.month, match: (p) => p === "/planner", search: { day: undefined }, daily: true },
  { to: "/planner/ink", label: () => COPY.ink, match: (p) => p.startsWith("/planner/ink"), daily: true },
  { to: "/planner/dashboard", label: () => COPY.pace, match: (p) => p.startsWith("/planner/dashboard"), daily: true },
  { to: "/planner/history", label: () => COPY.history, match: (p) => p.startsWith("/planner/history") },
  { to: "/planner/analytics", label: () => COPY.instruments, match: (p) => p.startsWith("/planner/analytics") },
  { to: "/planner/badges", label: () => COPY.seals, match: (p) => p.startsWith("/planner/badges") },
  { to: "/planner/settings", label: () => COPY.settings, match: (p) => p.startsWith("/planner/settings") },
  { to: "/planner/guide", label: () => COPY.guide, match: (p) => p.startsWith("/planner/guide") },
];

/** Pills to draw in the row for this path: the daily ones, plus the current page if it is a "More" page. */
export function visibleSections(pathname: string, sections: readonly Section[] = SECTIONS): Section[] {
  const current = sections.find((s) => s.match(pathname));
  return sections.filter((s) => s.daily || s === current);
}

/** The "More" menu: everything not already in the row. */
export function moreSections(pathname: string, sections: readonly Section[] = SECTIONS): Section[] {
  const shown = new Set(visibleSections(pathname, sections));
  return sections.filter((s) => !shown.has(s));
}

const PILL = "inline-flex h-9 shrink-0 items-center rounded-full px-3 text-sm whitespace-nowrap transition-colors duration-[var(--dur-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function PlannerSubnav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const nav = useNavigate();
  const row = visibleSections(pathname);
  const more = moreSections(pathname);
  return (
    <nav aria-label="Planner" className="scroll-fade-x mb-4 flex gap-1 overflow-x-auto pb-2 [scrollbar-width:none]">
      {row.map((s) => {
        const current = s.match(pathname);
        return (
          <Link
            key={s.to}
            to={s.to}
            search={s.search as never}
            aria-current={current ? "page" : undefined}
            className={`${PILL} ${current ? "bg-fg text-bg" : "bg-surface-raised text-fg-muted hover:text-fg"}`}
          >
            {s.label()}
          </Link>
        );
      })}
      {more.length ? (
        <Menu
          label="More planner pages"
          align="start"
          items={more.map((s) => ({ id: s.to, label: s.label(), onSelect: () => void nav({ to: s.to, search: s.search as never }) }))}
          trigger={(p) => (
            <button {...p} type="button" className={`${PILL} gap-1 bg-surface-raised text-fg-muted hover:text-fg`}>
              More
              <ChevronDown aria-hidden="true" className="size-4" />
            </button>
          )}
        />
      ) : null}
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
        title={
          <span className="inline-flex items-center gap-1">
            {COPY.youreOffline}
            <HelpButton topic="offline" />
          </span>
        }
        body={
          cache
            ? `Today’s plan (“${cache.planName}”, ${cache.tasks.length} items) is saved on this device. Tick tasks, rate reviews, re-ink — it all queues here and syncs the moment you’re back.`
            : "Pages you have opened before still work. Changes queue on this device and sync the moment you’re back."
        }
      />
    </div>
  );
}
