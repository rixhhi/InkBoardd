import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Badge, List } from "@/components/ui";
import { cn } from "@/lib/cn";
import { examsByGroup, type Exam } from "@inkboard/shared/exams";
import { useAccess } from "@/lib/session";

/** Exam group → subject token. Colour is decorative; the group name is always printed beside it. */
const GROUP_TONE: Record<string, string> = {
  Medical: "var(--color-sub-biology)",
  Engineering: "var(--color-sub-physics)",
  Government: "var(--color-sub-chemistry)",
};

function groupTone(group: string) {
  return GROUP_TONE[group] ?? "var(--color-accent)";
}

export function ExamCatalog({
  current,
  onPrefetch,
}: {
  current?: string | null;
  onPrefetch?: (id: string) => void;
}) {
  const { exams: allowed, ready } = useAccess();
  const blocks = examsByGroup()
    .map(({ group, families }) => ({
      group,
      families: families.map((f) => ({ ...f, exams: allowed ? f.exams.filter((e) => allowed.has(e.id)) : f.exams })).filter((f) => f.exams.length),
    }))
    .filter((b) => b.families.length);
  if (ready && allowed && !blocks.length) {
    return <p className="rounded-md bg-surface px-4 py-6 text-center text-sm text-fg-muted">No exams are shared with you yet. Your admin decides what you can open.</p>;
  }
  return (
    <div className="space-y-8">
      {blocks.map(({ group, families }) => {
        const id = `exam-group-${group.replace(/\W+/g, "-")}`;
        return (
          <section key={group} aria-labelledby={id}>
            <h2 id={id} className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-fg-muted uppercase">
              <span aria-hidden="true" className="size-2 rounded-full" style={{ background: groupTone(group) }} />
              {group}
            </h2>
            <div className="mt-3 space-y-4">
              {families.map((fam) => (
                <div key={`${group}-${fam.label || fam.exams[0]?.id}`}>
                  {fam.label && fam.exams.length > 1 ? <p className="mb-1 text-xs text-fg-faint">{fam.label}</p> : null}
                  <List label={fam.label && fam.exams.length > 1 ? `${group} · ${fam.label}` : group} className="sm:grid-cols-2 xl:grid-cols-3">
                    {fam.exams.map((exam) => (
                      <li key={exam.id}>
                        <ExamRow exam={exam} group={group} current={current === exam.id} onPrefetch={onPrefetch} />
                      </li>
                    ))}
                  </List>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ExamRow({
  exam,
  group,
  current,
  onPrefetch,
}: {
  exam: Exam;
  group: string;
  current: boolean;
  onPrefetch?: (id: string) => void;
}) {
  return (
    <Link
      to="/exam/$goalId"
      params={{ goalId: exam.id }}
      onMouseEnter={() => onPrefetch?.(exam.id)}
      onFocus={() => onPrefetch?.(exam.id)}
      aria-current={current ? "page" : undefined}
      className={cn(
        "group/row flex min-h-14 items-center gap-3 rounded-md px-3 py-2.5 transition-colors duration-[var(--dur-fast)]",
        "hover:bg-surface-raised/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        current && "bg-accent-subtle hover:bg-accent-subtle",
      )}
    >
      {/* exam-mark: initial on a tinted tile; the group colour is repeated here so the row reads at a glance */}
      <span
        aria-hidden="true"
        data-group={group}
        className="flex size-11 shrink-0 items-center justify-center rounded-md bg-surface-raised font-serif text-lg font-semibold"
        style={{ color: groupTone(group) }}
      >
        {exam.name.slice(0, 1)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium text-fg">{exam.name}</span>
          {current ? <Badge tone="accent">Current</Badge> : null}
        </span>
        <span className="mt-0.5 block truncate text-sm text-fg-muted">{exam.blurb}</span>
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-faint opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-visible/row:opacity-100" />
    </Link>
  );
}
