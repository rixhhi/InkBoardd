import { lazy, Suspense, type ComponentType } from "react";
import { RouteFallback } from "@/components/fetching";

/** Load a screen after the first paint. The import stays out of the home script. */
export function lazyPage(load: () => Promise<{ default: ComponentType }>, label = "Opening this page") {
  const Page = lazy(load);
  // biome-ignore lint/correctness/noComponentHookFactories: lazyPage runs once per route at module load, never during render
  return function LazyRoutePage() {
    return (
      <Suspense fallback={<RouteFallback label={label} />}>
        <Page />
      </Suspense>
    );
  };
}