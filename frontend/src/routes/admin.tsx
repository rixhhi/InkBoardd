import { createFileRoute } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { lazyPage } from "./-lazy-page";

type AdminTab = "overview" | "members" | "groups" | "sharing" | "activity" | "audit" | "settings" | "admins";
const TABS: readonly AdminTab[] = ["overview", "members", "groups", "sharing", "activity", "audit", "settings", "admins"];

export type AdminSearch = { tab?: AdminTab; member?: number };

export const Route = createFileRoute("/admin")({
  validateSearch: (s: Record<string, unknown>): AdminSearch => ({
    tab: TABS.includes(s.tab as AdminTab) ? (s.tab as AdminTab) : undefined,
    member: s.member != null && Number.isInteger(Number(s.member)) ? Number(s.member) : undefined,
  }),
  errorComponent: AppErrorComponent,
  head: () => ({ meta: [{ title: "Inkboard — admin" }] }),
  component: lazyPage(() => import("@/pages/admin-page"), "Opening the admin dashboard"),
});
