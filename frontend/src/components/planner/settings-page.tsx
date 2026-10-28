import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarPlus, Download, History, RotateCcw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/planner/confirm-dialog.tsx";
import { Button, Dialog, Field, Input, List, ListRow, Segmented, Select, Surface, Switch } from "@/components/ui";
import { useTheme } from "@/components/theme-provider.tsx";
import type { ThemeMode } from "@inkboard/shared/theme";
import { MilestoneForm } from "@/components/planner/settings-milestone.tsx";
import { COPY } from "@inkboard/shared/copy";
import { backupSummary, dryRunImport, exportPlannerJson, formatBytes, importPlannerBackup, plannerStorageBytes } from "@inkboard/shared/planner/backup";
import { applyComfort } from "@inkboard/shared/planner/comfort";
import { formatClock } from "@inkboard/shared/planner/daily";
import { describeDiff, previewRebuild } from "@inkboard/shared/planner/scheduler";
import { PACE_CARDS } from "@inkboard/shared/planner/wizard";
import { DEFAULT_PROFILE, readProfile, writeProfile, } from "@inkboard/shared/planner/profile";
import {
  createRecoveryPoint,
  listRecoveryPoints,
  restoreRecoveryPoint,
} from "@inkboard/shared/planner/recovery";
import { reminderSupported, requestReminderPermission } from "@inkboard/shared/planner/reminders";
import {
  deletePlan,
  patchPlan,
  readPlanner,
  replacePlanTasks,
  resetPlannerWorkspace,
  snapshotUndo,
  undoLast,
} from "@inkboard/shared/planner/storage";
import { WEEKDAYS, type PlanDiff, type PlanTask, type PlannerPrefs } from "@inkboard/shared/planner/types";
import { usePlanner } from "@inkboard/shared/planner/use-planner";
import { loadCourseDetail } from "@/lib/unacademy";
import { publishFormLedger } from "@inkboard/shared/planner/instruments";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function hourLabel(h: number, hour12 = true) {
  return formatClock(h * 60, hour12);
}

function syncCopy(sync: string, lastSyncedAt: string | null) {
  if (sync === "local-only") return "Saved on this device. It syncs to your account once you're signed in.";
  if (sync === "syncing") return "Syncing…";
  if (sync === "offline") return "Offline — changes stay here until you're back online.";
  if (sync === "error") return "Not synced. Retry from this page.";
  if (lastSyncedAt) return `Saved to your account · ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  return "Saved to your account.";
}

/** One settings block: heading, optional line, and a kit surface. */
function Block({ title, description, children, id }: { title: string; description?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="grid gap-3">
      <div>
        <h2 id={id} className="text-lg font-semibold text-fg">
          {title}
        </h2>
        {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
      </div>
      <Surface className="grid gap-5">{children}</Surface>
    </section>
  );
}

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "Match device" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function PlannerSettingsPage() {
  const { plan, state, sync, retrySync, lastSyncedAt } = usePlanner();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const importRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  useEffect(() => {
    setProfile(readProfile());
  }, []);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetTyped, setResetTyped] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rebuildPreview, setRebuildPreview] = useState<{ tasks: PlanTask[]; diff: PlanDiff } | null>(null);
  const [rebuildBusy, setRebuildBusy] = useState(false);
  const [importPreview, setImportPreview] = useState<{ raw: string; summary: ReturnType<typeof dryRunImport> } | null>(
    null,
  );
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [points, setPoints] = useState(listRecoveryPoints);
  const [storageBytes, setStorageBytes] = useState(0);
  const [saved, setSaved] = useState(false);
  const summary = useMemo(() => backupSummary(state), [state]);
  useEffect(() => {
    setStorageBytes(plannerStorageBytes());
  }, [state]);

  useEffect(() => {
    publishFormLedger({
      kicker: "Settings",
      title: "Settings",
      lines: [
        syncCopy(sync, lastSyncedAt ?? null),
        plan ? plan.name : "No plan",
        `${summary.plans} plans · ${summary.tasks} tasks`,
      ],
    });
    return () => publishFormLedger(null);
  }, [sync, lastSyncedAt, plan, summary.plans, summary.tasks]);

  function saveProfile(over: Partial<typeof profile>) {
    const next = writeProfile(over);
    setProfile(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
    return next;
  }

  async function previewRemaining() {
    if (!plan) return;
    setRebuildBusy(true);
    try {
      const date = plan.prefs.startDate;
      const fresh = await Promise.all(
        plan.courses.map(async (c) => {
          try {
            const detail = await loadCourseDetail({ data: { uid: c.courseId, teacher: c.teacherUsername } });
            return {
              ...c,
              lessons: detail.lessons.map((l) => ({
                lessonId: l.replayId || l.uid,
                title: l.title,
                durationSec: l.durationSec,
                rank: l.rank,
                week: l.week,
                notesUrl: l.notesUrl,
                dppUrl: l.dppUrl,
                playable: l.playable,
                status: l.status,
              })),
            };
          } catch {
            return c;
          }
        }),
      );
      const { tasks, diff } = previewRebuild(plan.tasks, plan.prefs, fresh, date);
      setRebuildPreview({ tasks, diff });
    } finally {
      setRebuildBusy(false);
    }
  }

  function applyRemaining() {
    if (!plan || !rebuildPreview) return;
    if (!createRecoveryPoint("rebuild remaining", readPlanner())) {
      toast.error(`${COPY.recoveryMarkFail} Export a backup first.`);
      return;
    }
    snapshotUndo();
    replacePlanTasks(plan.id, rebuildPreview.tasks, rebuildPreview.tasks[rebuildPreview.tasks.length - 1]?.date ?? plan.endDate);
    toast.success(describeDiff(rebuildPreview.diff), { action: { label: "Undo", onClick: () => undoLast() } });
    setRebuildPreview(null);
  }

  const dayChip = (on: boolean) =>
    `inline-flex h-9 min-w-11 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${on ? "bg-fg text-bg" : "bg-surface-raised text-fg-muted hover:text-fg"}`;

  return (
    <div className="grid max-w-3xl gap-8 py-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.14em] text-accent uppercase">Planner</p>
          <h1 className="mt-1 font-serif text-2xl text-fg sm:text-3xl">Settings</h1>
          <p className="mt-1.5 text-sm text-fg-muted">Your profile, pace, reminders and backups. Dates use this device&apos;s calendar.</p>
        </div>
        <span
          className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-medium transition-opacity ${saved ? "bg-ok-subtle text-ok opacity-100" : "opacity-0"}`}
          role="status"
          aria-live="polite"
        >
          {saved ? "Saved" : ""}
        </span>
      </header>

      <Block title="Profile" id="ps-profile" description="Used for streaks, goals and the dashboard.">
        <Field label="Your name">{(p) => <Input {...p} value={profile.name} onChange={(e) => saveProfile({ name: e.target.value })} autoComplete="name" placeholder="How the planner greets you" />}</Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Segmented
            label="Streak counts"
            value={profile.streakMode}
            onChange={(v) => saveProfile({ streakMode: v })}
            options={[
              { value: "any", label: "Any study" },
              { value: "goal", label: "Daily goal met" },
            ]}
          />
          <Segmented
            label="Daily goal in"
            value={profile.dailyGoalMode}
            onChange={(v) => saveProfile({ dailyGoalMode: v })}
            options={[
              { value: "minutes", label: "Minutes" },
              { value: "lectures", label: "Lectures" },
            ]}
          />
        </div>
        <Field label="Weekly minutes goal" hint="30 to 4000 minutes.">
          {(p) => (
            <Input
              {...p}
              type="number"
              inputMode="numeric"
              min={30}
              max={4000}
              value={profile.weeklyMinutes}
              onChange={(e) => saveProfile({ weeklyMinutes: Number(e.target.value) || DEFAULT_PROFILE.weeklyMinutes })}
              className="sm:max-w-40"
            />
          )}
        </Field>
        <div className="grid gap-2">
          <p className="text-sm font-medium text-fg">Subject milestones</p>
          <p className="-mt-1 text-xs text-fg-muted">“Finish Physics by …” goals show on your dashboard.</p>
          {profile.milestones.length ? (
            <ul className="m-0 grid list-none gap-1 p-0">
              {profile.milestones.map((m) => (
                <li key={m.id} className="flex items-center gap-2 rounded-md bg-surface-raised/60 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-fg">
                    {m.subject} <span className="text-fg-muted">by {m.by}</span>
                  </span>
                  <Button size="sm" variant="ghost" icon={Trash2} onClick={() => saveProfile({ milestones: profile.milestones.filter((x) => x.id !== m.id) })} aria-label={`Remove ${m.subject} milestone`}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <MilestoneForm onAdd={(m) => saveProfile({ milestones: [...profile.milestones, m] })} />
        </div>
      </Block>

      <Block title="Appearance and comfort" id="ps-look" description="Saved to your account and applied on every device.">
        <Segmented label="Theme" value={themeMode} onChange={setThemeMode} options={THEME_OPTIONS} />
        <Segmented
          label="Text size"
          value={String(profile.fontScale) as "100" | "112" | "125"}
          onChange={(v) => applyComfort(saveProfile({ fontScale: Number(v) as 100 | 112 | 125 }))}
          options={[
            { value: "100", label: "100%" },
            { value: "112", label: "112%" },
            { value: "125", label: "125%" },
          ]}
        />
        <Switch label="Reduce motion" description="Fewer animations and transitions." checked={profile.reduceMotion} onCheckedChange={(on) => applyComfort(saveProfile({ reduceMotion: on }))} />
        <Switch label="High contrast" description="Stronger text and borders." checked={profile.highContrast} onCheckedChange={(on) => applyComfort(saveProfile({ highContrast: on }))} />
        <Switch label="12-hour clock" description="7pm instead of 19:00." checked={profile.hour12} onCheckedChange={(on) => saveProfile({ hour12: on })} />
        <Select
          label="Week starts on"
          value={String(profile.weekStartsOn)}
          onChange={(value) => saveProfile({ weekStartsOn: value === "0" ? 0 : 1 })}
          options={[
            { value: "1", label: "Monday" },
            { value: "0", label: "Sunday" },
          ]}
          className="sm:max-w-56"
        />
      </Block>

      {plan ? (
        <Block title="Active plan" id="ps-plan" description={plan.examName ? `${plan.examName} · ${plan.tasks.length} tasks` : `${plan.tasks.length} tasks`}>
          <Field label="Plan name">{(p) => <Input {...p} defaultValue={plan.name} onBlur={(e) => patchPlan(plan.id, { name: e.target.value })} />}</Field>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium text-fg">Pace</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {PACE_CARDS.map((card) => {
                const on = plan.prefs.pace === card.id;
                return (
                  <button
                    key={card.id}
                    type="button"
                    aria-pressed={on}
                    className={`rounded-lg p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${on ? "bg-accent-subtle ring-1 ring-accent" : "bg-surface-raised/60 hover:bg-surface-raised"}`}
                    onClick={() => patchPlan(plan.id, { prefs: { ...plan.prefs, pace: card.id, lecturesPerDay: card.lectures } as PlannerPrefs })}
                  >
                    <span className="block text-sm font-semibold text-fg">{card.label}</span>
                    <span className="mt-0.5 block text-xs text-fg-muted">{card.hint}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          <Field label="Daily minutes">
            {(p) => (
              <Input
                {...p}
                type="number"
                inputMode="numeric"
                defaultValue={plan.prefs.dailyMinutes}
                onBlur={(e) => patchPlan(plan.id, { prefs: { ...plan.prefs, dailyMinutes: Number(e.target.value) || plan.prefs.dailyMinutes } })}
                className="sm:max-w-40"
              />
            )}
          </Field>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium text-fg">Study days</legend>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => {
                const on = plan.prefs.studyDays.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={on}
                    className={dayChip(on)}
                    onClick={() => {
                      const studyDays = on ? plan.prefs.studyDays.filter((x) => x !== d.id) : [...plan.prefs.studyDays, d.id];
                      patchPlan(plan.id, { prefs: { ...plan.prefs, studyDays } });
                    }}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          </fieldset>
          {reminderSupported() ? (
            <div className="grid gap-3">
              <Switch
                label="Daily reminder"
                description="Asks for notification permission only when you turn it on."
                checked={plan.prefs.reminders}
                onCheckedChange={async (on) => {
                  if (on) await requestReminderPermission();
                  patchPlan(plan.id, { prefs: { ...plan.prefs, reminders: on } });
                }}
              />
              {plan.prefs.reminders ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Select label="Time" value={String(plan.prefs.reminderHour ?? 19)} onChange={(v) => patchPlan(plan.id, { prefs: { ...plan.prefs, reminderHour: Number(v) } })} options={HOURS.map((h) => ({ value: String(h), label: hourLabel(h, profile.hour12) }))} />
                  <Select label="Quiet from" value={String(plan.prefs.quietStart ?? 22)} onChange={(v) => patchPlan(plan.id, { prefs: { ...plan.prefs, quietStart: Number(v) } })} options={HOURS.map((h) => ({ value: String(h), label: hourLabel(h, profile.hour12) }))} />
                  <Select label="Quiet until" value={String(plan.prefs.quietEnd ?? 7)} onChange={(v) => patchPlan(plan.id, { prefs: { ...plan.prefs, quietEnd: Number(v) } })} options={HOURS.map((h) => ({ value: String(h), label: hourLabel(h, profile.hour12) }))} />
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button type="button" variant="secondary" icon={RotateCcw} loading={rebuildBusy} onClick={() => void previewRemaining()}>
              Apply to remaining tasks
            </Button>
            <Button type="button" variant="danger" icon={Trash2} onClick={() => setConfirmDelete(true)} className="sm:ml-auto">
              Delete plan
            </Button>
          </div>
        </Block>
      ) : (
        <Surface className="flex flex-wrap items-center gap-4">
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-subtle text-accent">
            <CalendarPlus className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-fg">No plan yet.</p>
            <p className="text-sm text-fg-muted">Pace, study days and reminders appear here once you make a plan.</p>
          </div>
          <Button asChild>
            <Link to="/planner/new">Lay out a plan</Link>
          </Button>
        </Surface>
      )}

      <Block title="Data and backups" id="ps-data" description={`${syncCopy(sync, lastSyncedAt ?? null)} · ${summary.plans} plans · ${summary.tasks} tasks · ${formatBytes(storageBytes)} here`}>
        {sync === "error" ? (
          <p role="alert" className="flex flex-wrap items-center gap-2 rounded-md bg-warn-subtle px-3 py-2 text-sm text-fg">
            Your latest changes haven&apos;t reached your account yet.
            <Button type="button" size="sm" variant="secondary" onClick={() => void retrySync()}>
              Retry now
            </Button>
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            icon={Download}
            onClick={() => {
              const blob = new Blob([exportPlannerJson()], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "inkboard-planner.json";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export backup
          </Button>
          <Button type="button" variant="secondary" icon={Upload} onClick={() => importRef.current?.click()}>
            Import backup
          </Button>
          <input
            ref={importRef}
            type="file"
            accept="application/json"
            className="hidden"
            aria-label="Choose a backup file"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const raw = await file.text();
                setImportPreview({ raw, summary: dryRunImport(raw) });
              } catch {
                toast.error("That file isn’t a valid Inkboard backup.");
              }
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="secondary"
            icon={History}
            onClick={() => {
              if (!createRecoveryPoint("manual", readPlanner())) {
                toast.error(COPY.recoveryMarkFail);
                return;
              }
              setPoints(listRecoveryPoints());
              toast.success("Recovery point saved");
            }}
          >
            Save recovery point
          </Button>
        </div>
        <div className="grid gap-2">
          <p className="text-sm font-medium text-fg">Recovery points</p>
          {points.length ? (
            <List label="Recovery points">
              {points.map((p) => (
                <ListRow
                  key={p.id}
                  density="compact"
                  title={<span className="capitalize">{p.reason}</span>}
                  meta={
                    <>
                      <span>{new Date(p.at).toLocaleString()}</span>
                      <span>
                        · {p.planCount} plans / {p.taskCount} tasks
                      </span>
                    </>
                  }
                  trailing={
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (restoreRecoveryPoint(p.id)) {
                          setPoints(listRecoveryPoints());
                          toast.success("Restored");
                        } else toast.error("Restore failed");
                      }}
                    >
                      Restore
                    </Button>
                  }
                />
              ))}
            </List>
          ) : (
            <p className="text-xs text-fg-muted">None yet. One is saved automatically before a rebuild, import, delete or reset.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-danger/30 px-3 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-fg">Reset planner</p>
            <p className="text-xs text-fg-muted">Deletes every plan, task and log. A recovery point is saved first.</p>
          </div>
          <Button type="button" variant="danger" onClick={() => setConfirmReset(true)}>
            Reset workspace
          </Button>
        </div>
      </Block>

      <p className="text-xs text-fg-faint">Class videos, slides and notes are fetched from Unacademy for personal study. Inkboard is not affiliated with Unacademy.</p>

      {rebuildPreview ? (
        <Dialog
          open
          onOpenChange={(o) => !o && setRebuildPreview(null)}
          title="Apply to remaining tasks?"
          description={`${describeDiff(rebuildPreview.diff)} Completed classes stay put.`}
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setRebuildPreview(null)}>
                Cancel
              </Button>
              <Button type="button" onClick={applyRemaining}>
                Apply
              </Button>
            </>
          }
        >
          <p className="text-sm text-fg-muted">A recovery point is saved before anything changes, and you can undo from the toast.</p>
        </Dialog>
      ) : null}

      {importPreview ? (
        <Dialog
          open
          onOpenChange={(o) => !o && setImportPreview(null)}
          title="Import backup"
          description={`${importPreview.summary.plans} plans · ${importPreview.summary.tasks} tasks · ${importPreview.summary.name}`}
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setImportPreview(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant={importMode === "replace" ? "danger" : "primary"}
                onClick={() => {
                  try {
                    importPlannerBackup(importPreview.raw, importMode);
                    toast.success("Imported", { action: { label: "Undo", onClick: () => undoLast() } });
                    setImportPreview(null);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Import failed");
                  }
                }}
              >
                {importMode === "replace" ? "Replace my data" : "Merge"}
              </Button>
            </>
          }
        >
          <Segmented
            label="How to import"
            value={importMode}
            onChange={setImportMode}
            options={[
              { value: "merge", label: "Merge with mine" },
              { value: "replace", label: "Replace mine" },
            ]}
          />
          <p className="mt-3 text-xs text-fg-muted">{importMode === "merge" ? "Plans and tasks from the file are added; newer edits win." : "Everything here is replaced by the file. A recovery point is saved first."}</p>
        </Dialog>
      ) : null}

      <ConfirmDialog
        open={confirmDelete && Boolean(plan)}
        title="Delete this plan?"
        body="A recovery point is saved first. You can restore it from this page."
        confirmLabel="Delete"
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (!plan) return;
          if (!createRecoveryPoint("delete plan", readPlanner())) {
            toast.error(COPY.recoveryMarkFail);
            return;
          }
          snapshotUndo();
          deletePlan(plan.id);
          setConfirmDelete(false);
          toast.success("Plan deleted", { action: { label: "Undo", onClick: () => undoLast() } });
        }}
      />

      {confirmReset ? (
        <Dialog
          open
          onOpenChange={(o) => {
            if (o) return;
            setConfirmReset(false);
            setResetTyped("");
          }}
          title="Delete all planner data?"
          description="Type DELETE to confirm. A recovery point is saved first."
          footer={
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setConfirmReset(false);
                  setResetTyped("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={resetTyped !== "DELETE"}
                onClick={() => {
                  if (resetTyped !== "DELETE") return;
                  if (!createRecoveryPoint("reset workspace", readPlanner())) {
                    toast.error(`${COPY.recoveryMarkFail} Export a backup first.`);
                    return;
                  }
                  resetPlannerWorkspace();
                  setConfirmReset(false);
                  setResetTyped("");
                  toast.success("Workspace reset");
                }}
              >
                Delete all
              </Button>
            </>
          }
        >
          <Input value={resetTyped} onChange={(e) => setResetTyped(e.target.value)} placeholder="DELETE" aria-label="Type DELETE to confirm" autoComplete="off" className="font-mono" />
        </Dialog>
      ) : null}
    </div>
  );
}
