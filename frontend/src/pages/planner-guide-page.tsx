import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { HelpBody } from "@/components/help/help-button";
import { PlannerCard } from "@/components/ui/planner/kit.tsx";
import { ADMIN_HELP_ORDER, HELP, MEMBER_HELP_ORDER } from "@inkboard/shared/help";
import { useAccess } from "@/lib/session";

/**
 * The Guide. Every "?" topic in reading order, on one page you can send
 * someone a link to (#ink, #admin-digest, …). Same text as the sheets.
 */
export default function GuidePage() {
  const access = useAccess();
  const order = access.admin ? [...MEMBER_HELP_ORDER, ...ADMIN_HELP_ORDER] : MEMBER_HELP_ORDER;
  const hash = useRouterState({ select: (s) => s.location.hash });
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) el.scrollIntoView({ block: "start" });
  }, [hash]);
  return (
    <div className="grid gap-6 py-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label="Guide contents" className="lg:sticky lg:top-[calc(var(--header-h)+1rem)] lg:self-start">
        <p className="text-xs font-semibold tracking-wide text-fg-faint uppercase">Guide</p>
        <h1 className="mt-1 font-serif text-2xl text-fg">How the planner thinks</h1>
        <p className="mt-2 text-sm text-fg-muted">Every “?” in the app, in reading order. Each one: what it is, how to use it, why it exists.</p>
        <ol className="guide-toc mt-4">
          {order.map((id) => (
            <li key={id}>
              <a href={`#${id}`}>{HELP[id].title}</a>
            </li>
          ))}
        </ol>
      </nav>
      <div className="min-w-0">
        {order.map((id) => (
          <section key={id} id={id} className="guide-topic" aria-labelledby={`guide-${id}`}>
            <h2 id={`guide-${id}`} className="font-serif text-xl font-semibold text-fg">
              {HELP[id].title}
            </h2>
            <PlannerCard className="mt-3">
              <HelpBody topic={HELP[id]} compact />
            </PlannerCard>
          </section>
        ))}
      </div>
    </div>
  );
}
