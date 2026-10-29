/**
 * Fading Ink. Every studied lesson is a handwritten stroke whose ink density
 * is an estimate of how much of it you still remember. Drag the date scrubber
 * forward and watch the board fade toward the exam line; tap a faded stroke to
 * re-ink it (rate your recall, or jump to the first part you never watched).
 *
 * Pure math lives in @inkboard/shared/planner/ink. This file is presentation:
 * an SVG per subject row, a range input for time, and a small popover.
 */
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Play, RotateCcw } from "lucide-react";
import { addDaysKey, diffDays, formatDay } from "@inkboard/shared/planner/dates";
import { fadesOn, INK_BANDS, inkBand, inkSeed, inkSummary, reinkQueue, retentionAt, strokePath, type InkItem } from "@inkboard/shared/planner/ink";
import { SUBJECT_IDS, SUBJECT_MARK, subjectVar, type SubjectId } from "@inkboard/shared/planner/subjects";
import type { ReviewRating } from "@inkboard/shared/planner/types";
import { cn } from "@/lib/cn";
import { HelpButton } from "@/components/help/help-button";

export type FadingInkProps = {
  items: InkItem[];
  today: string;
  /** Exam day, drawn as a chalk line on the scrubber. */
  examDate?: string | null;
  /** Called when the member rates a lesson from the board. Omit for the read-only admin view. */
  onReink?: (item: InkItem, rating: ReviewRating) => void;
  /** Whose board this is, for the read-only view ("Riya's ink"). */
  owner?: string;
  className?: string;
};

const SUBJECT_LABEL: Record<SubjectId, string> = {
  physics: "Physics",
  chemistry: "Chemistry",
  maths: "Maths",
  biology: "Biology",
  cs: "Computer science",
  english: "English",
  reasoning: "Reasoning",
  other: "Other",
};

const STROKE_W = 104;
const STROKE_H = 16;

function fmtShort(key: string): string {
  return formatDay(key).replace(/,?\s*\d{4}$/, "");
}

/** Ink colour from retention: crisp ink at 1, paper-coloured ghost at 0. Opacity carries most of it so it works on any surface. */
function inkStyle(r: number, subject: SubjectId) {
  const alpha = 0.12 + 0.88 * r * r; // square so the fall-off reads like real ink drying out
  const blur = r < INK_BANDS.fading.min ? 0.6 : r < INK_BANDS.crisp.min ? 0.25 : 0;
  return { stroke: `color-mix(in srgb, ${subjectVar(subject)} ${Math.round(25 + 75 * r)}%, var(--color-fg))`, opacity: alpha, filter: blur ? `blur(${blur}px)` : undefined };
}

export function FadingInk({ items, today, examDate, onReink, owner, className }: FadingInkProps) {
  const id = useId();
  const [offset, setOffset] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const horizon = Math.max(14, examDate ? diffDays(examDate, today) + 7 : 60);
  const day = addDaysKey(today, offset);
  const summary = useMemo(() => inkSummary(items, day), [items, day]);
  const todaySummary = useMemo(() => inkSummary(items, today), [items, today]);
  const queue = useMemo(() => reinkQueue(items, day, 3), [items, day]);
  const rows = useMemo(() => {
    const by = new Map<SubjectId, InkItem[]>();
    for (const it of items) by.set(it.subject, [...(by.get(it.subject) ?? []), it]);
    return SUBJECT_IDS.filter((s) => by.has(s)).map((s) => ({ subject: s, items: by.get(s)! }));
  }, [items]);
  const pickedItem = picked ? items.find((i) => i.lessonId === picked) : null;
  const examOffset = examDate ? diffDays(examDate, today) : null;
  const possessive = owner ? `${owner.replace(/\s.*$/, "")}’s` : "your";

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Home") {
      e.preventDefault();
      setOffset(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setOffset(horizon);
    } else if (e.key === "e" && examOffset != null) {
      setOffset(Math.max(0, Math.min(horizon, examOffset)));
    }
  };

  if (!items.length) {
    return (
      <div className={cn("ink-board ink-board-empty", className)}>
        <svg aria-hidden="true" viewBox="0 0 120 16" className="h-4 w-28 text-fg-muted">
          <path d={strokePath(7, 120)} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" opacity={0.35} />
        </svg>
        <p className="mt-3 text-sm text-fg">Nothing written yet.</p>
        <p className="mt-1 max-w-prose text-xs text-fg-muted">Finish a class or rate a review and it shows up here as ink. Over the following days the ink fades at the rate your revision schedule expects. This board shows what to re-ink before it goes.</p>
      </div>
    );
  }

  return (
    <div className={cn("ink-board", className)} ref={boardRef}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="font-serif text-2xl text-fg tabular-nums">
            {Math.round(summary.mean * 100)}%
            <span className="ml-2 font-sans text-sm text-fg-muted">
              of {possessive} ink {offset === 0 ? "is still legible today" : `will be legible ${offset === examOffset ? "on exam day" : fmtShort(day)}`}
            </span>
          </p>
          <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-fg-muted">
            <Legend band="crisp" n={summary.crisp} />
            <Legend band="fading" n={summary.fading} />
            <Legend band="ghost" n={summary.ghost} />
            {offset > 0 && todaySummary.mean - summary.mean > 0.005 ? <span className="text-warn">−{Math.round((todaySummary.mean - summary.mean) * 100)} pts from today if nothing is reviewed</span> : null}
          </p>
        </div>
        {queue.length && onReink ? (
          <p className="text-xs text-fg-muted">
            Re-ink first:{" "}
            {queue.map((q, i) => (
              <span key={q.lessonId}>
                {i ? ", " : ""}
                <button type="button" className="text-fg underline decoration-dotted underline-offset-2 hover:text-accent" onClick={() => setPicked(q.lessonId)}>
                  {q.title}
                </button>
              </span>
            ))}
          </p>
        ) : null}
      </div>

      {/* Time scrubber */}
      <div className="ink-scrubber mt-5">
        <div className="flex items-center gap-2">
          <HelpButton topic="ink-scrubber" />
          <button type="button" className="ink-step" aria-label="One day earlier" onClick={() => setOffset((o) => Math.max(0, o - 1))} disabled={offset === 0}>
            <ChevronLeft aria-hidden="true" className="size-4" />
          </button>
          <div className="relative min-w-0 flex-1">
            <input
              id={`${id}-day`}
              type="range"
              min={0}
              max={horizon}
              step={1}
              value={offset}
              onChange={(e) => setOffset(Number(e.target.value))}
              onKeyDown={onKey}
              aria-label="Day to preview"
              aria-valuetext={offset === 0 ? "Today" : `${formatDay(day)}, ${offset} days from today`}
              className="ink-range"
              style={examOffset != null && examOffset >= 0 && examOffset <= horizon ? ({ "--exam-pos": `${(examOffset / horizon) * 100}%` } as React.CSSProperties) : undefined}
            />
            {examOffset != null && examOffset >= 0 && examOffset <= horizon ? (
              <span aria-hidden="true" className="ink-exam-tick" style={{ left: `${(examOffset / horizon) * 100}%` }}>
                <span className="ink-exam-label">Exam</span>
              </span>
            ) : null}
          </div>
          <button type="button" className="ink-step" aria-label="One day later" onClick={() => setOffset((o) => Math.min(horizon, o + 1))} disabled={offset === horizon}>
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-fg-faint tabular-nums">
          <button type="button" className={cn("hover:text-fg", offset === 0 && "text-fg")} onClick={() => setOffset(0)}>
            Today
          </button>
          <output htmlFor={`${id}-day`} className="text-fg-muted">
            {offset === 0 ? "Today" : `${fmtShort(day)} · +${offset}d`}
          </output>
          {examOffset != null && examOffset > 0 && examOffset <= horizon ? (
            <button type="button" className={cn("hover:text-fg", offset === examOffset && "text-fg")} onClick={() => setOffset(examOffset)}>
              Exam day
            </button>
          ) : (
            <span>+{horizon}d</span>
          )}
        </div>
      </div>

      {/* The board */}
      <section className="ink-rows mt-5" aria-label={`Ink by subject, as of ${formatDay(day)}`}>
        {rows.map(({ subject, items: list }) => (
          <div key={subject} className="ink-row">
            <div className="ink-row-head">
              <span aria-hidden="true" className="ink-mark" style={{ color: subjectVar(subject) }}>
                {SUBJECT_MARK[subject]}
              </span>
              <span className="truncate text-xs font-medium text-fg-muted">{SUBJECT_LABEL[subject]}</span>
              <span className="text-[11px] text-fg-faint tabular-nums">{list.length}</span>
            </div>
            <ul className="ink-strokes" aria-label={`${SUBJECT_LABEL[subject]} lessons`}>
              {list.map((it) => {
                const r = retentionAt(it, day);
                const band = inkBand(r);
                const style = inkStyle(r, it.subject);
                const active = picked === it.lessonId;
                return (
                  <li key={it.lessonId} className="ink-stroke-cell">
                    <button
                      type="button"
                      className={cn("ink-stroke", active && "is-active")}
                      aria-pressed={active}
                      aria-label={`${it.title}: ${INK_BANDS[band].label.toLowerCase()}, ${Math.round(r * 100)}% as of ${formatDay(day)}`}
                      title={`${it.title} · ${Math.round(r * 100)}%`}
                      onClick={() => setPicked(active ? null : it.lessonId)}
                    >
                      <svg viewBox={`0 0 ${STROKE_W} ${STROKE_H}`} width={STROKE_W} height={STROKE_H} aria-hidden="true" className="ink-svg">
                        <path d={strokePath(inkSeed(it.lessonId), STROKE_W, it.coverage)} fill="none" strokeWidth={band === "ghost" ? 1.2 : 2} strokeLinecap="round" strokeLinejoin="round" style={style} />
                        {band === "ghost" ? <path d={strokePath(inkSeed(it.lessonId), STROKE_W, it.coverage)} fill="none" stroke="var(--color-fg)" strokeWidth={0.6} strokeDasharray="1 3" opacity={0.25} /> : null}
                      </svg>
                      <span className="ink-caption">{it.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      {/* Detail / re-ink */}
      {pickedItem ? <InkDetail item={pickedItem} day={day} today={today} onReink={onReink} onClose={() => setPicked(null)} /> : null}

      {/* Screen-reader table of the same data */}
      <div className="sr-only">
      {/* Wrapper, not the table, carries sr-only: a 1px absolutely positioned table still widens the page's scrollable area on phones. */}
      <table>
        <caption>Estimated memory per lesson as of {formatDay(day)}</caption>
        <thead>
          <tr>
            <th>Lesson</th>
            <th>Subject</th>
            <th>Retention</th>
            <th>Last touched</th>
            <th>Fades on</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.lessonId}>
              <td>{it.title}</td>
              <td>{SUBJECT_LABEL[it.subject]}</td>
              <td>{Math.round(retentionAt(it, day) * 100)}%</td>
              <td>{it.lastTouch}</td>
              <td>{fadesOn(it)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-fg-faint">
        How it is drawn: retention ≈ e<sup>−days / stability</sup>, where stability comes from your revision intervals and how each recall went (shaky, ok, solid). Ink at a review’s due date is about half gone; twice that gap, a ghost. A shorter stroke is a lesson you only watched part of. It is a lens on your own plan, not a test.
      </p>
    </div>
  );
}

function Legend({ band, n }: { band: keyof typeof INK_BANDS; n: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg aria-hidden="true" viewBox="0 0 24 8" className="h-2 w-6">
        <path d="M1 4 C6 1 10 7 14 4 S20 2 23 4" fill="none" stroke="currentColor" strokeWidth={band === "ghost" ? 1 : 2} strokeLinecap="round" opacity={band === "crisp" ? 1 : band === "fading" ? 0.5 : 0.22} strokeDasharray={band === "ghost" ? "1 2" : undefined} />
      </svg>
      <span className="tabular-nums">
        {n} {INK_BANDS[band].label.toLowerCase()}
      </span>
    </span>
  );
}

function InkDetail({ item, day, today, onReink, onClose }: { item: InkItem; day: string; today: string; onReink?: FadingInkProps["onReink"]; onClose: () => void }) {
  const r = retentionAt(item, day);
  const rToday = retentionAt(item, today);
  const band = inkBand(r);
  const fade = fadesOn(item);
  const gapMin = item.firstGapSec != null ? Math.floor(item.firstGapSec / 60) : null;
  return (
    <section className="ink-detail mt-4" aria-label={`${item.title} details`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">{item.title}</p>
          <p className="truncate text-xs text-fg-muted">{item.courseTitle}</p>
        </div>
        <button type="button" className="shrink-0 text-xs text-fg-muted hover:text-fg" onClick={onClose}>
          Close
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-fg-faint">{day === today ? "Today" : fmtShort(day)}</dt>
          <dd className="text-fg tabular-nums">
            {Math.round(r * 100)}% · {INK_BANDS[band].label.toLowerCase()}
          </dd>
        </div>
        <div>
          <dt className="text-fg-faint">Last touched</dt>
          <dd className="text-fg">{fmtShort(item.lastTouch)}</dd>
        </div>
        <div>
          <dt className="text-fg-faint">Starts fading</dt>
          <dd className="text-fg">{fade <= today ? "Already" : fmtShort(fade)}</dd>
        </div>
        <div>
          <dt className="text-fg-faint">Reviews</dt>
          <dd className="text-fg">
            {item.stage ? `Stage ${item.stage}` : "None yet"}
            {item.rating ? ` · last ${item.rating}` : ""}
          </dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {onReink ? (
          <>
            <span className="text-xs text-fg-muted">
              <RotateCcw aria-hidden="true" className="mr-1 inline size-3.5" />
              Re-ink · how is your recall?
            </span>
            {(["shaky", "ok", "solid"] as ReviewRating[]).map((rt) => (
              <button key={rt} type="button" className="ink-rate" data-rating={rt} onClick={() => onReink(item, rt)}>
                {rt}
              </button>
            ))}
          </>
        ) : (
          <span className="text-xs text-fg-muted">{rToday < INK_BANDS.crisp.min ? "Worth a nudge: this one is fading now." : "Still fresh today."}</span>
        )}
        {onReink && gapMin != null ? (
          <Link to="/play/$lessonId" params={{ lessonId: item.lessonId }} search={{ title: item.title, t: item.firstGapSec! } as never} className="ink-rate ml-auto inline-flex items-center gap-1">
            <Play aria-hidden="true" className="size-3.5" />
            Watch the part you skipped · from {gapMin}:{String(item.firstGapSec! % 60).padStart(2, "0")}
          </Link>
        ) : onReink ? (
          <Link to="/play/$lessonId" params={{ lessonId: item.lessonId }} search={{ title: item.title } as never} className="ink-rate ml-auto inline-flex items-center gap-1">
            <Play aria-hidden="true" className="size-3.5" />
            Rewatch
          </Link>
        ) : null}
      </div>
    </section>
  );
}
