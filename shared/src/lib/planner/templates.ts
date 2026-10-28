import { addDaysKey, todayKey } from "./dates.ts";
import { fillPrefs, PACE_LECTURES, type PaceId, type PlannerPrefs } from "./types.ts";

export type PlanTemplateId = "gate-cs-90" | "jee-6m" | "neet-6m" | "custom";

export type PlanTemplate = {
  id: PlanTemplateId;
  label: string;
  hint: string;
  examId: string | null;
  days: number | null;
  pace: PaceId;
};

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: "gate-cs-90",
    label: "GATE CS · 90 days",
    hint: "Steady 3 lectures/day through a 90-day run",
    examId: "NVLIA",
    days: 90,
    pace: "steady",
  },
  {
    id: "jee-6m",
    label: "JEE · 6 months",
    hint: "Main & Advanced, two lectures a day to start",
    examId: "TMUVD",
    days: 180,
    pace: "relaxed",
  },
  {
    id: "neet-6m",
    label: "NEET · 6 months",
    hint: "Biology-heavy, three lectures a day",
    examId: "YOTUH",
    days: 180,
    pace: "steady",
  },
  {
    id: "custom",
    label: "Custom",
    hint: "Pick any exam, courses, and pace",
    examId: null,
    days: null,
    pace: "steady",
  },
];

export function templateById(id: string | null | undefined): PlanTemplate | null {
  if (!id) return null;
  return PLAN_TEMPLATES.find((t) => t.id === id) ?? null;
}

export function prefsFromTemplate(template: PlanTemplate, start = todayKey()): PlannerPrefs {
  const lectures = PACE_LECTURES[template.pace];
  return fillPrefs({
    startDate: start,
    examDate: template.days ? addDaysKey(start, template.days) : null,
    pace: template.pace,
    lecturesPerDay: lectures,
  });
}

export function wizardSearchFromTemplate(template: PlanTemplate): {
  exam?: string;
  days?: number;
  pace?: PaceId;
  template: PlanTemplateId;
} {
  return {
    exam: template.examId ?? undefined,
    days: template.days ?? undefined,
    pace: template.pace,
    template: template.id,
  };
}
