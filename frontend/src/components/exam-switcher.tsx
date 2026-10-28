import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clearExamId, writeExamId, useSelectedExam } from "@inkboard/shared/exam-pref";
import { examSeal, examsByGroup, type Exam } from "@inkboard/shared/exams";
import { COPY } from "@inkboard/shared/copy";
import { examHubQuery } from "@/lib/unacademy";
import { schedulePrefetch } from "@/lib/prefetch";

export function ExamSwitcher({ compact, variant = "dropdown" }: { compact?: boolean; variant?: "dropdown" | "seal" }) {
  const selected = useSelectedExam();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const nav = useNavigate();
  const titleId = useId();
  const qc = useQueryClient();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const wrapRef = useRef<HTMLDivElement>(null);
  const blocks = examsByGroup();

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = Math.min(360, Math.max(240, window.innerWidth - 24));
      if (variant === "seal") {
        const left = Math.min(r.right + 8, Math.max(12, window.innerWidth - width - 12));
        const top = Math.max(12, Math.min(r.top, window.innerHeight - 24));
        setPos({ top, left, width });
        return;
      }
      let left = r.left;
      if (left + width > window.innerWidth - 12) left = Math.max(12, window.innerWidth - width - 12);
      setPos({ top: r.bottom + 8, left, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, variant]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      const menu = document.getElementById(titleId)?.closest("[data-exam-menu]");
      if (menu?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const t = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, titleId]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("inkboard:open-exams", onOpen);
    return () => window.removeEventListener("inkboard:open-exams", onOpen);
  }, []);

  function pick(exam: Exam) {
    writeExamId(exam.id);
    setOpen(false);
    void nav({ to: "/exam/$goalId", params: { goalId: exam.id } });
  }

  const menu =
    open && pos
      ? createPortal(
          <div
            data-exam-menu
            role="listbox"
            aria-labelledby={titleId}
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            className="fixed z-[80] max-h-[min(70vh,32rem)] overflow-y-auto border border-line bg-surface p-4"
          >
            <p id={titleId} className="text-xs font-semibold tracking-[0.14em] uppercase text-fg-faint">
              Study for
            </p>
            <div className="mt-3 space-y-4">
              {blocks.map(({ group, families }) => (
                <div key={group}>
                  <p className="text-xs font-semibold tracking-[0.14em] uppercase text-fg-muted">{group}</p>
                  <ul className="mt-1 divide-y divide-line border-y border-line">
                    {families.flatMap((fam) =>
                      fam.exams.map((exam) => {
                        const on = selected?.id === exam.id;
                        return (
                          <li key={exam.id}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={on}
                              onMouseEnter={() => {
                                schedulePrefetch(() => qc.prefetchQuery(examHubQuery(exam.id)));
                              }}
                              onClick={() => pick(exam)}
                              className={`flex h-11 w-full items-center justify-between gap-3 text-left ${
                                on ? "text-accent" : "text-fg hover:text-accent"
                              }`}
                            >
                              <span className="font-serif text-sm">{exam.name}</span>
                              <span className="font-serif text-xs font-semibold tracking-[0.14em] uppercase text-fg-faint">{examSeal(exam)}</span>
                            </button>
                          </li>
                        );
                      }),
                    )}
                  </ul>
                </div>
              ))}
            </div>
            {!compact ? (
              <button
                type="button"
                onClick={() => {
                  clearExamId();
                  setOpen(false);
                  if (path !== "/") void nav({ to: "/" });
                }}
                className="mt-3 block text-xs text-fg-muted hover:text-fg"
              >
                {COPY.backToTheWall}
              </button>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={wrapRef} className={variant === "seal" ? "relative w-full" : "relative shrink-0"}>
      {variant === "seal" ? (
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={examSeal(selected) || "INK"}
          title={selected?.name ?? "Choose exam"}
          onClick={() => setOpen((v) => !v)}
          className={`folio-mark is-seal ${selected && (path === "/" || path.startsWith("/exam/")) ? "is-active" : ""}`}
        >
          <span className="folio-seal">{examSeal(selected) || "INK"}</span>
        </button>
      ) : (
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={selected?.name ?? "Exams"}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-10 max-w-[9.5rem] items-center gap-1.5 border border-line bg-elevated px-3 text-sm text-fg sm:max-w-[14rem]"
        >
          <span className="truncate font-serif">{selected?.name ?? "Exams"}</span>
        </button>
      )}
      {menu}
    </div>
  );
}
