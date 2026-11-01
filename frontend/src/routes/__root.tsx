import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import { AuthProvider } from "@inkboard/shared/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { NotFoundPage } from "@/components/not-found";
import { PlannerSyncProvider } from "@/components/planner-sync";
import { AuthGate } from "@/components/auth-gate";
import { ComfortBoot } from "@/components/planner/comfort-boot.tsx";
import { ThemeProvider, useTheme } from "@/components/theme-provider.tsx";
import { THEME_BOOTSTRAP } from "@inkboard/shared/theme";
import { COMFORT_BOOTSTRAP } from "@inkboard/shared/planner/comfort";
import { FOLIO_BOOTSTRAP } from "@inkboard/shared/folio";
import { AppErrorComponent } from "@/lib/error-component";
import { retryDelay, shouldRetry } from "@/lib/api-client";
import { openCommandPalette } from "@inkboard/shared/command-palette";
import appCss from "../styles.css?url";
import site from "@/lib/og/site.json";
import { lazy, Suspense, useEffect, useRef, useState } from "react";

const BadgeWatcher = lazy(() =>
  import("@/components/planner/badge-watcher.tsx").then((m) => ({ default: m.BadgeWatcher })),
);
const CommandPalette = lazy(() =>
  import("@/components/folio/write-line.tsx").then((m) => ({ default: m.CommandPalette })),
);
const PlannerShortcuts = lazy(() =>
  import("@/components/planner/shortcuts.tsx").then((m) => ({ default: m.PlannerShortcuts })),
);

const APP_NAME = "Inkboard";

/**
 * Absolute base for og:image. Scrapers (WhatsApp, Telegram, Slack) do not resolve a relative
 * og:image, so a share preview showed no picture. VERCEL_PROJECT_PRODUCTION_URL is set by Vercel;
 * SITE_URL is for PM2/Docker installs. Falls back to relative when neither is known.
 */
function siteOrigin(): string {
  const explicit = typeof process !== "undefined" ? process.env?.SITE_URL?.trim() : "";
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = typeof process !== "undefined" ? process.env?.VERCEL_PROJECT_PRODUCTION_URL?.trim() : "";
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  return "";
}

export const Route = createRootRoute({
  notFoundComponent: NotFoundPage,
  errorComponent: AppErrorComponent,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: APP_NAME },
      { name: "theme-color", content: "#0e0f12" },
      { name: "description", content: site.description },
      { property: "og:title", content: site.title },
      { property: "og:description", content: site.description },
      { property: "og:image", content: `${siteOrigin()}${site.image}` },
      { property: "og:type", content: site.type },
      { name: "twitter:card", content: site.card },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      // iOS ignores SVG touch icons; it needs a raster.
      { rel: "apple-touch-icon", href: "/icon-192.png" },
    ],
  }),
  component: Root,
});

function ThemeColor() {
  const { resolved } = useTheme();
  const color = resolved === "light" ? "#f4f1ea" : "#0e0f12";
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", color);
  }, [color]);
  return null;
}

function ThemedToaster() {
  const { resolved } = useTheme();
  return (
    <Toaster
      theme={resolved}
      position="bottom-center"
      duration={3000}
      visibleToasts={2}
      offset={24}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "board-toast",
          title: "board-toast-title",
          actionButton: "board-toast-action",
        },
      }}
    />
  );
}

function DeferredChrome() {
  const [on, setOn] = useState(false);
  const pendingOpen = useRef(false);
  useEffect(() => {
    if (on) return;
    const arm = (open: boolean) => {
      if (open) pendingOpen.current = true;
      setOn(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        arm(true);
      }
    };
    window.addEventListener("keydown", onKey);
    const idle = window.requestIdleCallback?.(() => arm(false), { timeout: 2500 });
    const timer = window.setTimeout(() => arm(false), 2000);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (typeof idle === "number") window.cancelIdleCallback?.(idle);
      window.clearTimeout(timer);
    };
  }, [on]);
  useEffect(() => {
    if (!on || !pendingOpen.current) return;
    pendingOpen.current = false;
    openCommandPalette();
  }, [on]);
  if (!on) return null;
  return (
    <Suspense fallback={null}>
      <BadgeWatcher />
      <CommandPalette />
      <PlannerShortcuts />
    </Suspense>
  );
}

/**
 * Registers the service worker and, when a new build is waiting, offers a Reload
 * instead of swapping workers under the page (which could mix two builds' chunks).
 */
function OfflineWorker() {
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    const offer = (worker: ServiceWorker) => {
      toast("Inkboard has an update", {
        id: "sw-update",
        duration: Number.POSITIVE_INFINITY,
        action: { label: "Reload", onClick: () => worker.postMessage({ type: "SKIP_WAITING" }) },
      });
    };
    void navigator.serviceWorker
      .register("/sw.js", { type: "module" })
      .then((reg) => {
        // Already waiting (page was opened after a deploy) or arriving now.
        if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const fresh = reg.installing;
          if (!fresh) return;
          fresh.addEventListener("statechange", () => {
            if (fresh.state === "installed" && navigator.serviceWorker.controller) offer(fresh);
          });
        });
        // Check for a new build when the tab comes back, at most once an hour.
        let last = Date.now();
        const onVisible = () => {
          if (document.visibilityState !== "visible" || Date.now() - last < 60 * 60_000) return;
          last = Date.now();
          void reg.update().catch(() => {});
        };
        document.addEventListener("visibilitychange", onVisible);
      })
      .catch(() => {});
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);
  return null;
}

function Root() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 10 * 60_000, gcTime: 60 * 60_000, retry: shouldRetry, retryDelay, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-bg text-fg">
        <InlineScript code={THEME_BOOTSTRAP} />
        <InlineScript code={COMFORT_BOOTSTRAP} />
        <InlineScript code={FOLIO_BOOTSTRAP} />
        <PreviewHostBridge />
        <AuthProvider>
          <QueryClientProvider client={client}>
            <ThemeProvider>
              <ThemeColor />
              <PlannerSyncProvider>
                <ComfortBoot />
                <DeferredChrome />
                <OfflineWorker />
                <AuthGate>
                  <Outlet />
                </AuthGate>
                <ThemedToaster />
              </PlannerSyncProvider>
            </ThemeProvider>
          </QueryClientProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}

/**
 * Render-blocking bootstraps (theme, comfort, folio) that must run before first paint so
 * the page never flashes the wrong scheme. The sources are compile-time constants from
 * this repo, never user input.
 */
function InlineScript({ code }: { code: string }) {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: constant bootstrap source, see above
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
