import { createFileRoute } from "@tanstack/react-router";
import { upstream } from "@/lib/server/api-upstream";

/** Server-only: forwards to the API (see lib/server/api-upstream.ts). No page is rendered here. */
export const Route = createFileRoute("/readyz")({
  server: {
    handlers: {
      ANY: ({ request }) => upstream(request),
    },
  },
});
