/**
 * The Guide: every "?" in the planner, grouped by where you meet it.
 *
 * Each topic is a closed card that shows its one-line answer; open it for
 * the steps, the why, the tips and the FAQ. Deep links (#topic-id) from the
 * help sheets open the right card and scroll to it. A filter box narrows the
 * deck to whatever you type, so "why did my pace go red" finds the answer
 * without reading nineteen sections.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { BarChart3, CalendarDays, ChevronDown, Droplets, Gauge, ListChecks, Search, Settings2, ShieldCheck, type LucideIcon } from "lucide-react";
import { HelpBody } from "@/components/help/help-button";
import { ADMIN_HELP_ORDER, HELP, MEMBER_HELP_ORDER, type HelpTopic, type HelpTopicId } from "@inkboard/shared/help";
import { useAccess } from "@/lib/session";

type ChapterKey = "tasks" | "month" | "ink" | "dashboard" | "instruments" | "settings" | "admin";

const CHAPTERS: { key: ChapterKey; title: string; blurb: string; icon: LucideIcon }[] = [
  { key: "tasks", title: "Tasks", blurb: "Your day on one page, and the focus timer that runs it.", icon: ListChecks },
  { key: "month", title: "Month", blurb: "The whole plan at once, and moving things around in it.", icon: CalendarDays },
  { key: "ink", title: "Ink", blurb: "What you are forgetting, how the model learns you, and how to re-ink.", icon: Droplets },
  { key: "dashboard", title: "Dashboard", blurb: "Pace, coverage, and what to do when you fall behind.", icon: Gauge },
  { key: "instruments", title: "Analytics & Badges", blurb: "How you actually study, and the seals you earn along the way.", icon: BarChart3 },
  { key: "settings", title: "Settings & everywhere", blurb: "Intervals you can tune, and what happens when the connection drops.", icon: Settings2 },
  { key: "admin", title: "Admin", blurb: "The member digest, storylines, and a member's ink board.", icon: ShieldCheck },
];

function chapterOf(t: HelpTopic): ChapterKey {
  if (t.id.startsWith("admin-")) return "admin";
  if (t.id.startsWith("ink")) return "ink";
  const w = t.where;
  if (w.startsWith("Planner → Tasks")) return "tasks";
  if (w.startsWith("Planner → Month")) return "month";
  if (w.includes("Dashboard")) return "dashboard";
  if (w.startsWith("Planner → Analytics") || w.startsWith("Planner → Badges")) return "instruments";
  return "settings";
}

function haystack(t: HelpTopic): string {
  return [t.title, t.where, t.what, t.why, ...t.how, ...(t.tips ?? []), t.math ?? "", ...(t.faq ?? []).flatMap((f) => [f.q, f.a])].join("\n").toLowerCase();
}

export default function GuidePage() {
  const access = useAccess();
  const order = useMemo(() => (access.admin ? [...MEMBER_HELP_ORDER, ...ADMIN_HELP_ORDER] : MEMBER_HELP_ORDER), [access.admin]);
  const hash = useRouterState({ select: (s) => s.location.hash });
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<HelpTopicId>>(() => new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return new Set(order);
    return new Set(order.filter((id) => haystack(HELP[id]).includes(q)));
  }, [order, q]);

  const chapters = useMemo(
    () =>
      CHAPTERS.map((ch) => ({ ...ch, topics: order.filter((id) => chapterOf(HELP[id]) === ch.key) })).filter((ch) => ch.topics.length),
    [order],
  );
  const visibleChapters = chapters.map((ch) => ({ ...ch, topics: ch.topics.filter((id) => matches.has(id)) })).filter((ch) => ch.topics.length);

  // Deep link: open the card and bring it into view once it has rendered.
  useEffect(() => {
    if (!hash) return;
    const id = hash as HelpTopicId;
    if (!(id in HELP)) return;
    setOpen((s) => (s.has(id) ? s : new Set(s).add(id)));
    const raf = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(raf);
  }, [hash]);

  // Press "/" anywhere on the page to jump to the filter box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggle = (id: HelpTopicId, next: boolean) =>
    setOpen((s) => {
      if (s.has(id) === next) return s;
      const n = new Set(s);
      if (next) n.add(id);
      else n.delete(id);
      return n;
    });
  const allOpen = order.every((id) => open.has(id));
  const expandAll = () => setOpen(new Set(order));
  const collapseAll = () => setOpen(new Set());

  const total = order.length;
  const shown = visibleChapters.reduce((n, ch) => n + ch.topics.length, 0);

  return (
    <div className="guide py-6">
      <header className="guide-hero">
        <p className="text-xs font-semibold tracking-wide text-fg-faint uppercase">Guide</p>
        <h1 className="mt-1 font-serif text-3xl text-fg sm:text-4xl">How the planner thinks</h1>
        <p className="mt-3 max-w-prose text-base text-fg-muted">
          Every “?” in the app, grouped by where you meet it. Each card opens to the steps, the reasoning, and the questions people actually ask. Tap a
          chapter to jump, or type what you are stuck on.
        </p>
        <div className="guide-tools">
          <label className="guide-search">
            <Search aria-hidden="true" className="size-4 shrink-0 text-fg-faint" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter the guide… (press /)"
              aria-label="Filter guide topics"
              autoComplete="off"
              spellCheck={false}
            />
            {q ? (
              <button type="button" className="guide-clear" onClick={() => setQuery("")}>
                Clear
              </button>
            ) : null}
          </label>
          <p className="guide-count" aria-live="polite">
            {q ? `${shown} of ${total} topics` : `${total} topics · ${chapters.length} chapters`}
          </p>
          <button type="button" className="guide-toggle-all" onClick={allOpen ? collapseAll : expandAll}>
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        </div>
      </header>

      <div className="guide-grid">
        <nav aria-label="Guide chapters" className="guide-nav">
          <ol>
            {chapters.map((ch) => {
              const n = ch.topics.filter((id) => matches.has(id)).length;
              return (
                <li key={ch.key} className={n ? undefined : "is-dim"}>
                  <a href={`#chapter-${ch.key}`}>
                    <ch.icon aria-hidden="true" className="size-4" />
                    <span>{ch.title}</span>
                    <b>{n}</b>
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="min-w-0">
          {visibleChapters.length ? (
            visibleChapters.map((ch) => (
              <section key={ch.key} id={`chapter-${ch.key}`} className="guide-chapter" aria-labelledby={`chapter-${ch.key}-h`}>
                <div className="guide-chapter-head">
                  <span className="guide-chapter-icon" aria-hidden="true">
                    <ch.icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 id={`chapter-${ch.key}-h`} className="font-serif text-2xl font-semibold text-fg">
                      {ch.title}
                    </h2>
                    <p className="text-sm text-fg-muted">{ch.blurb}</p>
                  </div>
                </div>
                <div className="guide-topics">
                  {ch.topics.map((id) => {
                    const t = HELP[id];
                    const isOpen = open.has(id);
                    return (
                      <details key={id} id={id} className="guide-topic" open={isOpen} onToggle={(e) => toggle(id, (e.currentTarget as HTMLDetailsElement).open)}>
                        <summary className="guide-summary">
                          <span className="guide-summary-text">
                            <span className="guide-where">{t.where}</span>
                            <h3 className="guide-title">{t.title}</h3>
                            <span className="guide-what">{t.what}</span>
                          </span>
                          <ChevronDown aria-hidden="true" className="guide-chevron size-5" />
                        </summary>
                        <div className="guide-topic-body">{isOpen ? <HelpBody topic={t} compact /> : null}</div>
                      </details>
                    );
                  })}
                </div>
              </section>
            ))
          ) : (
            <div className="guide-empty">
              <p className="font-serif text-xl text-fg">Nothing in the guide mentions “{query.trim()}”.</p>
              <p className="mt-2 text-sm text-fg-muted">Try a shorter word — “pace”, “ink”, “offline”, “exam” — or clear the filter.</p>
              <button type="button" className="guide-toggle-all mt-4" onClick={() => setQuery("")}>
                Clear filter
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
