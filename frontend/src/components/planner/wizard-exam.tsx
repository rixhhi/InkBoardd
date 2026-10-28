import { useMemo, useState } from "react";
import { Check, GraduationCap } from "lucide-react";
import { COPY } from "@inkboard/shared/copy";
import { EXAMS, type Exam } from "@inkboard/shared/exams";
import { EmptyState, SearchInput } from "@/components/ui";
import { useAccess } from "@/lib/session";

/**
 * Step 1: pick the exam the plan is for. Every exam this person can open is
 * listed (members see only exams shared with them); typing filters the grid.
 */
export function WizardExam({ examId, onPick }: { examId: string; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const access = useAccess();
  const allowed = useMemo(() => (access.exams ? EXAMS.filter((e) => access.exams!.has(e.id)) : EXAMS), [access.exams]);
  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return allowed;
    return allowed.filter((e) => `${e.name} ${e.blurb} ${e.family ?? ""} ${e.group}`.toLowerCase().includes(needle));
  }, [q, allowed]);
  const groups = useMemo(() => {
    const out = new Map<Exam["group"], Exam[]>();
    for (const e of hits) out.set(e.group, [...(out.get(e.group) ?? []), e]);
    return [...out.entries()];
  }, [hits]);

  if (!allowed.length) {
    return <EmptyState icon={GraduationCap} title="No exams shared yet" body="Plans are built from an exam's courses. Ask your admin to share an exam with you." />;
  }

  return (
    <div className="grid gap-5">
      <div>
        <h2 className="text-lg font-semibold text-fg">{COPY.writeAnExam}</h2>
        <p className="mt-0.5 text-sm text-fg-muted">The plan uses this exam&apos;s teachers and courses. You can change it later.</p>
      </div>
      {allowed.length > 6 ? <SearchInput label="Filter exams" placeholder="Filter by name, e.g. JEE, NEET, GATE" value={q} onChange={setQ} resultCount={hits.length} className="sm:max-w-md" /> : null}
      {!hits.length ? <p className="py-6 text-center text-sm text-fg-muted">No exam matches “{q}”.</p> : null}
      {groups.map(([group, list]) => (
        <section key={group} aria-label={group} className="grid gap-2">
          {groups.length > 1 ? <h3 className="text-xs font-semibold tracking-[0.12em] text-fg-muted uppercase">{group}</h3> : null}
          <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
            {list.map((e) => {
              const on = e.id === examId;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => onPick(e.id)}
                    className={`flex w-full items-center gap-3 rounded-lg p-3 text-left shadow-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${on ? "bg-accent-subtle ring-1 ring-accent" : "bg-surface hover:bg-surface-raised"}`}
                  >
                    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-raised font-serif text-sm font-semibold text-fg">
                      {e.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-fg">{e.name}</span>
                      <span className="block truncate text-xs text-fg-muted">{e.blurb}</span>
                    </span>
                    {on ? <Check aria-label="Selected" className="size-4 shrink-0 text-accent" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
