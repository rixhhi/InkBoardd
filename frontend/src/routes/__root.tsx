import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
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
      { property: "og:image", content: site.image },
      { property: "og:type", content: site.type },
      { name: "twitter:card", content: site.card },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/favicon.svg" },
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

function OfflineWorker() {
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js", { type: "module" });
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
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <script dangerouslySetInnerHTML={{ __html: COMFORT_BOOTSTRAP }} />
        <script dangerouslySetInnerHTML={{ __html: FOLIO_BOOTSTRAP }} />
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
