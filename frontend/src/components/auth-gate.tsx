import { lazy, Suspense, useEffect, useRef, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { Button, EmptyState } from "@/components/ui";
import { Spinner } from "@/components/fetching";
import { isStaffRole, useAccess, useAuthStatus, useOnAuthLost } from "@/lib/session";

const ForcedPasswordPage = lazy(() => import("@/pages/auth-page").then((m) => ({ default: m.ForcedPasswordPage })));

/** Catalog pages a member reaches only through Browse/Search (shared items still open directly). */
function isBrowsePath(p: string): boolean {
  return p === "/browse" || p.startsWith("/browse/");
}
function isSearchPath(p: string): boolean {
  return p === "/search" || p.startsWith("/search/");
}

/** Pull this person's saved data on sign-in; reload once if it replaced what's on screen. */
function useAccountSync(userId: number | null) {
  const started = useRef<number | null>(null);
  useEffect(() => {
    if (userId == null || started.current === userId) return;
    started.current = userId;
    let cancelled = false;
    void import("@/lib/account-sync").then(async (m) => {
      const changed = await m.startAccountSync(userId);
      if (changed && !cancelled) window.location.reload();
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);
}

/** Pages that render without a session. Everything else needs one. */
export function isAuthPage(pathname: string): boolean {
  return pathname === "/login" || pathname === "/setup";
}

function Waiting() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center bg-bg">
      <p role="status" className="flex items-center gap-2 text-sm text-fg-muted">
        <Spinner />
        Checking your sign-in
      </p>
    </main>
  );
}

function Locked({ title, body }: { title: string; body: string }) {
  return (
    <main id="main" className="grid min-h-dvh place-items-center bg-bg px-4">
      <EmptyState
        icon={Lock}
        title={title}
        body={body}
        className="w-full max-w-md"
        action={
          <Button variant="secondary" asChild>
            <Link to="/">Go to your dashboard</Link>
          </Button>
        }
      />
    </main>
  );
}

/**
 * Client-side sign-in gate. The API is the real lock (every /api route checks
 * the session cookie); this only routes people to /setup or /login and hides
 * admin screens from members.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const href = useRouterState({ select: (s) => s.location.href });
  const nav = useNavigate();
  const status = useAuthStatus();
  const access = useAccess();
  const authPage = isAuthPage(pathname);
  const needsSetup = status.data?.needsSetup ?? false;
  const user = status.data?.user ?? null;
  useAccountSync(user && !user.mustChangePassword ? user.id : null);

  useOnAuthLost(() => {
    if (!isAuthPage(window.location.pathname)) void nav({ to: "/login", search: { next: window.location.pathname + window.location.search } });
  });

  useEffect(() => {
    if (!status.data || authPage) return;
    if (needsSetup) void nav({ to: "/setup", replace: true });
    else if (!user) void nav({ to: "/login", search: { next: href === "/" ? undefined : href }, replace: true });
  }, [status.data, authPage, needsSetup, user, href, nav]);

  if (authPage) return <>{children}</>;
  // Offline or API down: let the page render; the offline library and planner work locally,
  // and every catalog request is still checked by the API.
  if (status.isError) return <>{children}</>;
  if (!status.data || needsSetup || !user) return <Waiting />;
  if (user.mustChangePassword) {
    return (
      <Suspense fallback={<Waiting />}>
        <ForcedPasswordPage />
      </Suspense>
    );
  }
  if (pathname.startsWith("/admin") && !isStaffRole(user.role)) {
    return <Locked title="Admins only" body="This part of InkBoard is for admins." />;
  }
  if (access.ready && !access.admin) {
    if (pathname.startsWith("/planner") && !access.perms.planner) return <Locked title="Planner is off" body="Your admin has turned the planner off for members." />;
    if (pathname === "/live" || pathname.startsWith("/live/")) {
      if (!access.perms.live) {
        return access.shares.some((s) => s.kind === "exam") || access.open ? (
          <Locked title="Live classes are off" body="Your admin has turned live classes off for members." />
        ) : (
          <Locked title="Live opens with an exam" body="Live classes appear once your admin shares an exam with you." />
        );
      }
    }
    if (isBrowsePath(pathname) && !access.perms.browse) return <Locked title="Browse is off" body="Your dashboard shows everything your admin has shared with you." />;
    if (isSearchPath(pathname) && !access.perms.search) return <Locked title="Search is off" body="Open what your admin shared from your dashboard." />;
  }
  return <>{children}</>;
}
