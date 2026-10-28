import { createFileRoute } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import type { NewSearch } from "@/components/planner/wizard-page.tsx";
import type { PaceId } from "@inkboard/shared/planner/types";
import type { PlanTemplateId } from "@inkboard/shared/planner/templates";
import { lazyPage } from "./-lazy-page";

const PACES = new Set<PaceId>(["relaxed", "steady", "intense", "custom"]);
const TEMPLATES = new Set<PlanTemplateId>(["gate-cs-90", "jee-6m", "neet-6m", "custom"]);

export const Route = createFileRoute("/planner/new")({
  validateSearch: (s: Record<string, unknown>): NewSearch => ({
    exam: typeof s.exam === "string" ? s.exam : undefined,
    teacher: typeof s.teacher === "string" ? s.teacher : undefined,
    course: typeof s.course === "string" ? s.course : undefined,
    days: typeof s.days === "number" ? s.days : typeof s.days === "string" ? Number(s.days) || undefined : undefined,
    pace: typeof s.pace === "string" && PACES.has(s.pace as PaceId) ? (s.pace as PaceId) : undefined,
    template: typeof s.template === "string" && TEMPLATES.has(s.template as PlanTemplateId) ? (s.template as PlanTemplateId) : undefined,
  }),
  errorComponent: AppErrorComponent,
  component: lazyPage(() => import("@/components/planner/wizard-page.tsx").then((m) => ({ default: m.PlannerNew })), "Opening a new plan"),
});
