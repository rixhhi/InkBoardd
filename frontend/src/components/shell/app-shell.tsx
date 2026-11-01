import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Bookmark, ChevronRight, KeyRound, LaptopMinimal, LogOut, Moon, Search, Settings, ShieldCheck, Sun, SunMoon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/cn";
import { NAV_ITEMS, isImmersive, navActive, navTrail, visibleNav, type NavItem } from "@/lib/nav";
import { Avatar, IconButton, Kbd, Menu } from "@/components/ui";
import { roleLabel, signOut, useAccess } from "@/lib/session";
import { UpstreamBanner } from "@/components/upstream-banner";
import { WidgetErrorBoundary } from "@/lib/error-component";
import { useTheme } from "@/components/theme-provider.tsx";
import { openCommandPalette } from "@inkboard/shared/command-palette";
import { COPY } from "@inkboard/shared/copy";
import { LEDGER_EVENT, LEDGER_FOCUS_EVENT, folioMode, isTypingTarget, type LedgerFocus } from "@inkboard/shared/folio";
import { nextThemeMode } from "@inkboard/shared/theme";
import { usePlannerTodayProgress } from "@inkboard/shared/planner/use-planner";
import { NotificationsBell } from "@/components/notifications-bell";

const SavedSheet = lazy(() => import("@/components/folio/saved-sheet").then((m) => ({ default: m.SavedSheet })));
const PasswordDialog = lazy(() => import("@/components/password-dialog").then((m) => ({ default: m.PasswordDialog })));
const SessionsDialog = lazy(() => import("@/components/sessions-dialog").then((m) => ({ default: m.SessionsDialog })));

/** NAV_ITEMS filtered by role and the admin's member feature switches. */
function useNavItems(): NavItem[] {
  const a = useAccess();
  return visibleNav({ admin: a.admin, live: a.perms.live, planner: a.perms.planner, browse: a.perms.browse });
}

/** Signed-in person: name, role, password change, sign out. */
function AccountMenu({ compact = false }: { compact?: boolean }) {
  const a = useAccess();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [pw, setPw] = useState(false);
  const [devices, setDevices] = useState(false);
  if (!a.user) return null;
  const user = a.user;
  return (
    <>
      <Menu
        label="Account"
        align={compact ? "end" : "start"}
        side={compact ? "bottom" : "top"}
        header={
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium text-fg">{user.name}</p>
            <p className="truncate text-xs text-fg-muted">{user.email}</p>
            <p className="mt-1 text-[11px] font-semibold tracking-wide text-accent uppercase">{roleLabel(user.role)}</p>
          </div>
        }
        items={[
          ...(a.admin ? [{ id: "admin", label: "Admin dashboard", icon: ShieldCheck, onSelect: () => void navigate({ to: "/admin" }) }] : []),
          { id: "pw", label: "Change password", icon: KeyRound, onSelect: () => setPw(true) },
          { id: "devices", label: "Signed-in devices", icon: LaptopMinimal, onSelect: () => setDevices(true) },
          "separator" as const,
          { id: "out", label: "Sign out", icon: LogOut, danger: true, onSelect: () => void signOut(qc) },
        ]}
        trigger={(p) => (
          <button
            {...p}
            type="button"
            className={cn(
              "flex items-center gap-2 rounded-md text-left text-sm text-fg-muted hover:bg-surface-raised/60 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
              compact ? "size-10 justify-center" : "h-11 w-full px-2",
            )}
          >
            <Avatar name={user.name} size="sm" decorative />
            {/* Accessible name = this prefix + the visible text, so the name never contradicts what sighted users read. */}
            <span className="sr-only">Account menu{compact ? `, ${user.name}, ${roleLabel(user.role)}` : ":"}</span>
            {!compact ? (
              <span className="hidden min-w-0 flex-1 lg:block">
                <span className="block truncate font-medium text-fg">{user.name}</span>
                <span className="block truncate text-xs">{roleLabel(user.role)}</span>
              </span>
            ) : null}
          </button>
        )}
      />
      {pw ? (
        <Suspense fallback={null}>
          <PasswordDialog open={pw} onOpenChange={setPw} />
        </Suspense>
      ) : null}
      {devices ? (
        <Suspense fallback={null}>
          <SessionsDialog open={devices} onOpenChange={setDevices} />
        </Suspense>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */

export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[var(--z-toast)] focus:rounded-md focus:bg-fg focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-bg"
    >
      {COPY.skipToBoard}
    </a>
  );
}

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine !== false);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return online;
}

/* ------------------------------------------------------------------ */

function NavLink({ id, collapsed, onNavigate }: { id: (typeof NAV_ITEMS)[number]["id"]; collapsed?: boolean; onNavigate?: () => void }) {
  const item = NAV_ITEMS.find((i) => i.id === id)!;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = navActive(pathname) === id;
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
      className={cn(
        "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-[var(--dur-fast)]",
        "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
        active ? "bg-surface-raised text-fg" : "text-fg-muted hover:bg-surface-raised/60 hover:text-fg",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.75} />
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
    </Link>
  );
}

function Sidebar() {
  const items = useNavItems();
  const { mode, setMode } = useTheme();
  const progress = usePlannerTodayProgress();
  const online = useOnline();
  const ThemeIcon = mode === "dark" ? Moon : mode === "light" ? Sun : SunMoon;
  const themeLabel = `Theme: ${mode}. Switch to ${nextThemeMode(mode)}`;
  return (
    <aside
      aria-label="Primary"
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-bg md:flex",
        "w-[var(--sidebar-w-narrow)] lg:w-[var(--sidebar-w)]",
      )}
    >
      <div className="flex h-[var(--header-h)] items-center px-3 lg:px-4">
        <Link to="/" className="flex items-center gap-2 rounded-md font-serif text-lg font-semibold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <span aria-hidden="true" data-glyph="I" className="glyph grid size-7 place-items-center rounded-md bg-fg text-sm text-bg" />
          <span className="sr-only">Inkboard, home</span>
          <span aria-hidden="true" className="hidden lg:inline">
            Inkboard
          </span>
        </Link>
      </div>

      <nav aria-label="Navigation" className="flex flex-col gap-0.5 px-2 lg:px-3">
        {items.map((item) => (
          <span key={item.id} className="contents">
            <span className="hidden lg:contents">
              <NavLink id={item.id} />
            </span>
            <span className="contents lg:hidden">
              <NavLink id={item.id} collapsed />
            </span>
          </span>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-0.5 px-2 pb-3 lg:px-3">
        {progress.total ? (
          <Link
            to="/planner/today"
            search={{ add: undefined }}
            className="hidden items-center justify-between rounded-md px-3 py-2 text-xs text-fg-muted hover:bg-surface-raised/60 hover:text-fg lg:flex"
          >
            <span>Today</span>
            <span className="font-mono tabular-nums">
              {progress.done}/{progress.total}
            </span>
          </Link>
        ) : null}
        {!online ? <p className="hidden px-3 py-1 text-xs text-warn lg:block">{COPY.youreOffline}</p> : null}
        <AccountMenu />
        <div className="flex items-center justify-between gap-1 lg:px-1">
          <Link
            to="/settings"
            aria-label="Settings"
            title="Settings"
            className="grid size-10 place-items-center rounded-md text-fg-muted hover:bg-surface-raised/60 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
          >
            <Settings aria-hidden="true" className="size-5" strokeWidth={1.75} />
          </Link>
          <IconButton label={themeLabel} icon={ThemeIcon} onClick={() => setMode(nextThemeMode(mode))} className="hidden lg:inline-flex" />
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */

function ContextBar({ onLibrary }: { onLibrary: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const access = useAccess();
  const canSearch = access.perms.search || access.perms.browse;
  const trail = navTrail(pathname);
  return (
    <header className="sticky top-0 z-[var(--z-nav)] flex h-[var(--header-h)] items-center gap-2 border-b border-line bg-bg/90 px-3 backdrop-blur sm:px-4 lg:px-6">
      <Link to="/" className="font-serif text-base font-semibold text-fg md:hidden">
        Inkboard<span className="sr-only">, home</span>
      </Link>
      {trail.length ? (
        <nav aria-label="You are here" className="hidden min-w-0 items-center gap-1 text-sm text-fg-muted md:flex">
          {trail.map((t, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a breadcrumb's position is its identity
            <span key={`${t}-${i}`} className="flex items-center gap-1">
              {i > 0 ? <ChevronRight aria-hidden="true" className="size-3.5 text-fg-faint" /> : null}
              <span className={cn("truncate", i === trail.length - 1 && "text-fg")}>{t}</span>
            </span>
          ))}
        </nav>
      ) : null}

      <div className="ml-auto flex items-center gap-1">
        {canSearch ? (
        <>
        <button
          type="button"
          onClick={() => openCommandPalette()}
          className="hidden h-9 w-64 items-center gap-2 rounded-md bg-surface px-3 text-sm text-fg-faint shadow-1 hover:text-fg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:flex lg:w-80"
        >
          <Search aria-hidden="true" className="size-4" />
          <span className="flex-1 text-left">Search classes and teachers</span>
          <Kbd>Ctrl K</Kbd>
        </button>
        <IconButton label={`${COPY.search} (Control or Command K)`} icon={Search} onClick={() => openCommandPalette()} className="sm:hidden" />
        </>
        ) : null}
        <NotificationsBell />
        <IconButton label="Library panel (Control or Command B)" icon={Bookmark} onClick={onLibrary} />
        <span className="md:hidden">
          <AccountMenu compact />
        </span>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */

function TabBar() {
  const items = useNavItems();
  return (
    <nav
      aria-label="Navigation"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      className="fixed inset-x-0 bottom-0 z-[var(--z-nav)] grid h-[var(--tabbar-h)] border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {items.map((item) => (
        <TabLink key={item.id} id={item.id} />
      ))}
    </nav>
  );
}

function TabLink({ id }: { id: (typeof NAV_ITEMS)[number]["id"] }) {
  const item = NAV_ITEMS.find((i) => i.id === id)!;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = navActive(pathname) === id;
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-[var(--hit-min)] flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
        "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
        active ? "text-fg" : "text-fg-muted",
      )}
    >
      <Icon aria-hidden="true" className="size-5" strokeWidth={active ? 2 : 1.75} />
      {item.label}
    </Link>
  );
}

/* ------------------------------------------------------------------ */

function useLibraryPanel(pathname: string) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<LedgerFocus>("auto");
  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    const onFocus = (e: Event) => {
      setFocus((e as CustomEvent<LedgerFocus>).detail ?? "library");
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b" && !isTypingTarget(e.target)) {
        e.preventDefault();
        onToggle();
      }
    };
    window.addEventListener(LEDGER_EVENT, onToggle);
    window.addEventListener(LEDGER_FOCUS_EVENT, onFocus);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(LEDGER_EVENT, onToggle);
      window.removeEventListener(LEDGER_FOCUS_EVENT, onFocus);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  useEffect(() => {
    setOpen(false);
    setFocus("auto");
  }, [pathname]);
  return { open, setOpen, focus };
}

function OfflineNotice() {
  const online = useOnline();
  if (online) return null;
  return (
    <p role="status" className="page-pad mt-3 rounded-md bg-warn-subtle px-4 py-2 text-sm text-fg">
      <span className="font-semibold">{COPY.youreOffline}.</span> Saved work on this device still works.
    </p>
  );
}

/**
 * The app frame. Sidebar ≥768px (labels ≥1024px), tab bar <768px, context bar on top.
 * Immersive routes (player, live stage) get only a thin back bar — pass `immersive`
 * or let the pathname decide.
 */
export function AppShell({ children, compact, immersive }: { children: ReactNode; compact?: boolean; immersive?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const full = !(immersive ?? compact ?? isImmersive(pathname));
  const mode = folioMode(pathname);
  const panel = useLibraryPanel(pathname);

  if (!full) {
    return (
      <div className="min-h-dvh bg-bg text-fg">
        <SkipLink />
        <header className="flex h-12 items-center px-2">
          <Link
            to="/"
            aria-label={COPY.backToTheWall}
            className="grid size-10 place-items-center rounded-md text-fg-muted hover:bg-surface-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
          >
            <ArrowLeft aria-hidden="true" className="size-5" strokeWidth={1.75} />
          </Link>
        </header>
        <main id="main" tabIndex={-1} className="outline-none">
          <WidgetErrorBoundary title={COPY.slateSlipped}>{children}</WidgetErrorBoundary>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh bg-bg text-fg">
      <SkipLink />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <ContextBar onLibrary={() => panel.setOpen(true)} />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[var(--content-max)] flex-1 outline-none">
          <UpstreamBanner />
          {pathname.startsWith("/planner") ? null : <OfflineNotice />}
          <WidgetErrorBoundary title={COPY.slateSlipped}>{children}</WidgetErrorBoundary>
        </main>
        <footer className="page-pad hidden py-6 text-xs text-fg-faint md:block">Inkboard</footer>
      </div>
      <TabBar />
      {panel.open ? (
        <Suspense fallback={null}>
          <SavedSheet mode={mode} focus={panel.focus} onOpenChange={panel.setOpen} />
        </Suspense>
      ) : null}
    </div>
  );
}
