import { ChevronDown, ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { TIME_SLOTS, WEEKDAYS, SPEEDS, DEFAULT_REVISION_INTERVALS, HARD_MAX_LECTURES } from "@inkboard/shared/planner/types";
import type { PaceId, PlannerPrefs, PlaybackSpeed, PlaylistMode, TimeSlot } from "@inkboard/shared/planner/types";
import { applyPace, isPastStart, PACE_CARDS, PLAYLIST_MODES, tomorrowKey } from "@inkboard/shared/planner/wizard";
import type { GenerateResult } from "@inkboard/shared/planner/types";
import { dailyPreviewCopy, requiredPaceCopy } from "@inkboard/shared/planner/wizard";
import { WizardSampleWeek } from "./wizard-preview.tsx";
import { Badge, Button, Field, IconButton, Input, Section, Segmented, Select, Surface, Switch } from "@/components/ui";
import { cn } from "@/lib/cn";

/** A card-style single choice (pace, time of day, how courses mix). */
function ChoiceCard({ on, onClick, title, hint, note, caution }: { on: boolean; onClick: () => void; title: string; hint: string; note?: string; caution?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg p-3 text-left shadow-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        on ? "bg-accent-subtle ring-1 ring-accent" : "bg-surface hover:bg-surface-raised",
      )}
    >
      <span aria-hidden="true" className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border", on ? "border-accent" : "border-line-strong")}>
        {on ? <span className="size-2 rounded-full bg-accent" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-fg">{title}</span>
        <span className="mt-0.5 block text-xs text-fg-muted">{hint}</span>
      </span>
      {note ? <Badge tone={caution ? "warn" : "accent"}>{note}</Badge> : null}
    </button>
  );
}

const dayChip = (on: boolean) =>
  `inline-flex h-9 min-w-11 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${on ? "bg-fg text-bg" : "bg-surface-raised text-fg-muted hover:text-fg"}`;

/** Step 3: pace, dates, days and time of day, with a live sample week. */
export function WizardPrefs({
  prefs,
  onChange,
  preview,
  onBack,
  onNext,
  onDropPlaylist,
}: {
  prefs: PlannerPrefs;
  onChange: (next: PlannerPrefs) => void;
  preview: GenerateResult;
  onBack: () => void;
  onNext: () => void;
  onDropPlaylist: (courseId: string) => void;
}) {
  const past = isPastStart(prefs.startDate);
  const feas = preview.summary.feasibility;
  const overshoot = Boolean(prefs.examDate && preview.summary.fitsBeforeExam === false);

  function setPace(id: PaceId) {
    onChange(applyPace(prefs, id, id === "custom" ? prefs.lecturesPerDay : undefined));
  }

  return (
    <div className="grid gap-8">
      <Section title="Pace" description="How many new classes a day.">
        <div className="grid gap-2 sm:grid-cols-2">
          {PACE_CARDS.map((card) => (
            <ChoiceCard key={card.id} on={prefs.pace === card.id} onClick={() => setPace(card.id)} title={card.label} hint={card.hint} note={card.note ?? undefined} caution={Boolean(card.caution)} />
          ))}
        </div>
        {prefs.pace === "custom" ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-fg">Classes per day</span>
            <IconButton label="Fewer classes" icon={Minus} variant="secondary" size="sm" disabled={prefs.lecturesPerDay <= 1} onClick={() => onChange(applyPace(prefs, "custom", prefs.lecturesPerDay - 1))} />
            <span className="min-w-8 text-center text-base font-semibold text-fg tabular-nums" aria-live="polite">
              {prefs.lecturesPerDay}
            </span>
            <IconButton label="More classes" icon={Plus} variant="secondary" size="sm" disabled={prefs.lecturesPerDay >= HARD_MAX_LECTURES} onClick={() => onChange(applyPace(prefs, "custom", prefs.lecturesPerDay + 1))} />
            <span className="text-xs text-fg-muted">max {HARD_MAX_LECTURES}</span>
          </div>
        ) : null}
      </Section>

      <Section title="Dates">
        <Surface className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date" error={past ? "That date is already over." : undefined}>
            {(p) => <Input {...p} type="date" value={prefs.startDate} onChange={(e) => onChange({ ...prefs, startDate: e.target.value })} />}
          </Field>
          <Field label="Exam date" hint="Optional. We'll warn you if the plan runs past it.">
            {(p) => <Input {...p} type="date" value={prefs.examDate ?? ""} min={prefs.startDate} onChange={(e) => onChange({ ...prefs, examDate: e.target.value || null })} />}
          </Field>
          {past ? (
            <div className="sm:col-span-2">
              <Button size="sm" variant="secondary" onClick={() => onChange({ ...prefs, startDate: tomorrowKey() })}>
                Start tomorrow
              </Button>
            </div>
          ) : null}
        </Surface>
        {overshoot && feas && prefs.examDate ? (
          <div role="status" className="mt-3 grid gap-2 rounded-lg bg-warn-subtle p-3">
            <p className="text-sm font-medium text-fg">{requiredPaceCopy(feas.requiredLecturesPerDay, prefs.examDate)}</p>
            <p className="text-xs text-fg-muted">We won&apos;t quietly pack more than {prefs.lecturesPerDay} a day. Pick a fix:</p>
            <div className="flex flex-wrap gap-2">
              {feas.raisePaceTo ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onChange(applyPace(prefs, feas.raisePaceTo!, feas.raisePaceTo === "custom" ? Math.min(HARD_MAX_LECTURES, Math.ceil(feas.requiredLecturesPerDay)) : undefined))}
                >
                  Raise pace to {feas.raisePaceTo}
                </Button>
              ) : null}
              {feas.extendExamDateBy > 0 ? (
                <Button size="sm" variant="secondary" onClick={() => onChange({ ...prefs, examDate: feas.finishDateAtCurrentPace })}>
                  Move exam to {feas.finishDateAtCurrentPace}
                </Button>
              ) : null}
              {feas.dropPlaylistSuggestions.slice(0, 2).map((s) => (
                <Button key={s.courseId} size="sm" variant="ghost" onClick={() => onDropPlaylist(s.courseId)}>
                  Drop {s.title}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </Section>

      <Section title="Study days">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Study days">
          {WEEKDAYS.map((d) => {
            const on = prefs.studyDays.includes(d.id);
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={on}
                aria-label={d.label}
                onClick={() => onChange({ ...prefs, studyDays: on ? prefs.studyDays.filter((x) => x !== d.id) : [...prefs.studyDays, d.id] })}
                className={dayChip(on)}
              >
                {d.short}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Time of day">
        <div className="grid gap-2 sm:grid-cols-2">
          {TIME_SLOTS.map((s) => (
            <ChoiceCard key={s.id} on={prefs.timeSlot === s.id} onClick={() => onChange({ ...prefs, timeSlot: s.id as TimeSlot })} title={s.label} hint={s.hint} />
          ))}
        </div>
      </Section>

      {preview.summary.lessonCount > 0 ? (
        <Surface className="grid gap-1">
          <p className="text-xs font-semibold tracking-[0.12em] text-fg-muted uppercase">Your first week</p>
          <p className="font-serif text-lg text-fg">{dailyPreviewCopy(preview, prefs)}</p>
          <WizardSampleWeek tasks={preview.tasks} compact />
        </Surface>
      ) : null}

      <details className="group rounded-lg bg-surface shadow-1">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg p-4 text-sm font-medium text-fg hover:bg-surface-raised/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          More options
          <ChevronDown aria-hidden="true" className="size-4 text-fg-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid gap-5 border-t border-line p-4">
          <Field label={`Cap on new classes · ${prefs.maxNewMinutesPerDay} min a day`}>
            {(p) => (
              <input
                {...p}
                type="range"
                min={30}
                max={300}
                step={10}
                value={prefs.maxNewMinutesPerDay}
                onChange={(e) => onChange({ ...prefs, maxNewMinutesPerDay: Number(e.target.value) })}
                className="w-full accent-[var(--color-accent)]"
              />
            )}
          </Field>
          <Switch label="Spaced revision" description="Revisit each class a few days after you watch it." checked={prefs.includeRevision} onCheckedChange={(on) => onChange({ ...prefs, includeRevision: on })} />
          {prefs.includeRevision ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Revision after">
              {DEFAULT_REVISION_INTERVALS.map((n) => {
                const on = prefs.revisionIntervals.includes(n);
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChange({ ...prefs, revisionIntervals: on ? prefs.revisionIntervals.filter((x) => x !== n) : [...prefs.revisionIntervals, n].sort((a, b) => a - b) })}
                    className={dayChip(on)}
                  >
                    +{n} days
                  </button>
                );
              })}
            </div>
          ) : null}
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium text-fg">How courses mix</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {PLAYLIST_MODES.map((m) => (
                <ChoiceCard
                  key={m.id}
                  on={prefs.playlistMode === m.id}
                  onClick={() => onChange({ ...prefs, playlistMode: m.id as PlaylistMode, mixMode: m.id === "rotate" ? "mix" : "one-subject" })}
                  title={m.label}
                  hint={m.hint}
                />
              ))}
            </div>
          </fieldset>
          <Switch label={`Light day after ${prefs.restEvery || 6} study days`} checked={prefs.restEvery > 0} onCheckedChange={(on) => onChange({ ...prefs, restEvery: on ? 6 : 0 })} />
          <Switch label="Add practice sheets (DPP)" description="When a class has a PDF, it's added as a task." checked={prefs.includeDpp} onCheckedChange={(on) => onChange({ ...prefs, includeDpp: on })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Catch-up day"
              value={prefs.catchUpDay == null ? "" : String(prefs.catchUpDay)}
              onChange={(v) => onChange({ ...prefs, catchUpDay: v === "" ? null : Number(v) })}
              options={[{ value: "", label: "None" }, ...WEEKDAYS.map((d) => ({ value: String(d.id), label: d.label }))]}
            />
            <Segmented
              label="Playback speed"
              size="sm"
              value={String(prefs.speed)}
              onChange={(v) => onChange({ ...prefs, speed: Number(v) as PlaybackSpeed })}
              options={SPEEDS.map((s) => ({ value: String(s), label: `${s}×` }))}
            />
          </div>
        </div>
      </details>

      <div className="sticky bottom-[calc(var(--tabbar-h,0px)+0.5rem)] z-10 flex items-center justify-between gap-3 rounded-lg bg-surface/95 p-3 shadow-2 backdrop-blur md:bottom-3">
        <Button type="button" variant="ghost" icon={ChevronLeft} onClick={onBack}>
          Courses
        </Button>
        <Button type="button" iconEnd={ChevronRight} onClick={onNext}>
          Preview
        </Button>
      </div>
    </div>
  );
}
