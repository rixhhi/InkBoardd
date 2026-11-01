import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pin, Share2 } from "lucide-react";
import { Button, Dialog, Field, Input, Select, Switch, toast } from "@/components/ui";
import { EXAMS } from "@inkboard/shared/exams";
import { describeError } from "@/lib/api-client";
import { ME_KEY, SHARE_KIND_LABEL, sendJson, useIsAdmin, type Audience, type Share, type ShareKind } from "@/lib/session";
import { dateInputValue, isoFromDateInput, useGroups, useMembers } from "./api";

export { useMembers } from "./api";

const KIND_HINT: Record<ShareKind, string> = {
  exam: "Opens the exam hub, its teachers and courses, and live classes for that exam.",
  teacher: "Opens the teacher's page, their courses and batches.",
  course: "Opens the course and all of its classes.",
  batch: "Opens the batch schedule and its classes.",
  lesson: "Opens one class only.",
};

const KIND_PLACEHOLDER: Record<ShareKind, string> = {
  exam: "",
  teacher: "Username or unacademy.com/@name link",
  course: "Course id or unacademy.com/course/… link",
  batch: "Batch id or unacademy.com/batch/… link",
  lesson: "Class id or lesson link",
};

function Picker<T extends { id: number }>({ items, picked, onChange, render, empty, label }: { items: T[]; picked: number[]; onChange: (ids: number[]) => void; render: (item: T) => React.ReactNode; empty: string; label: string }) {
  const [filter, setFilter] = useState("");
  const shown = items.filter((i) => !filter || String(render(i) ?? "").toLowerCase().includes(filter.toLowerCase()) || JSON.stringify(i).toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="mt-1 grid gap-2 rounded-md bg-surface-raised p-2">
      {items.length > 6 ? <Input aria-label={`Filter ${label}`} placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} className="h-9" /> : null}
      <fieldset aria-label={label} className="max-h-52 overflow-y-auto">
        {!items.length ? <p className="p-2 text-sm text-fg-muted">{empty}</p> : null}
        {shown.map((m) => (
          <label key={m.id} className="flex min-h-10 cursor-pointer items-center gap-2 rounded px-2 text-sm text-fg hover:bg-surface">
            <input
              type="checkbox"
              checked={picked.includes(m.id)}
              onChange={(e) => onChange(e.target.checked ? [...picked, m.id] : picked.filter((id) => id !== m.id))}
              className="size-4 accent-[var(--color-accent)]"
            />
            {render(m)}
          </label>
        ))}
      </fieldset>
      {picked.length ? <p className="px-2 text-xs text-fg-muted">{picked.length} selected</p> : null}
    </div>
  );
}

/** Start/end date pair used by the create and edit dialogs. */
function WindowFields({ start, end, onStart, onEnd }: { start: string; end: string; onStart: (v: string) => void; onEnd: (v: string) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Visible from" hint="Optional. Leave empty to share now.">
        {(p) => <Input {...p} type="date" value={start} onChange={(e) => onStart(e.target.value)} />}
      </Field>
      <Field label="Visible until" hint="Optional. Hidden after this day.">
        {(p) => <Input {...p} type="date" value={end} min={start || undefined} onChange={(e) => onEnd(e.target.value)} />}
      </Field>
    </div>
  );
}

/**
 * Share something with everyone, groups, or chosen members. Prefill `kind`/`ref`/`label`
 * when opened from a course, teacher, exam or batch page.
 */
export function ShareDialog({
  open,
  onOpenChange,
  kind: initialKind = "exam",
  refId = "",
  label: initialLabel = "",
  lockTarget = false,
  memberId,
  groupId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind?: ShareKind;
  refId?: string;
  label?: string;
  lockTarget?: boolean;
  memberId?: number;
  groupId?: number;
}) {
  const qc = useQueryClient();
  const members = useMembers(open);
  const groups = useGroups(open);
  const startAudience: Audience = memberId ? "user" : groupId ? "group" : "all";
  const [kind, setKind] = useState<ShareKind>(initialKind);
  const [ref, setRef] = useState(refId);
  const [label, setLabel] = useState(initialLabel);
  const [note, setNote] = useState("");
  const [audience, setAudience] = useState<Audience>(startAudience);
  const [users, setUsers] = useState<number[]>(memberId ? [memberId] : []);
  const [groupIds, setGroupIds] = useState<number[]>(groupId ? [groupId] : []);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
    setRef(refId || (initialKind === "exam" ? EXAMS[0]!.id : ""));
    setLabel(initialLabel);
    setNote("");
    setAudience(memberId ? "user" : groupId ? "group" : "all");
    setUsers(memberId ? [memberId] : []);
    setGroupIds(groupId ? [groupId] : []);
    setStart("");
    setEnd("");
    setPinned(false);
    setError(null);
  }, [open, initialKind, refId, initialLabel, memberId, groupId]);

  const examOptions = useMemo(() => EXAMS.map((e) => ({ value: e.id, label: `${e.name} — ${e.blurb}` })), []);

  const save = useMutation({
    mutationFn: () =>
      sendJson<{ shares: unknown[] }>("/api/admin/shares", "POST", {
        kind,
        ref,
        label: kind === "exam" ? EXAMS.find((e) => e.id === ref)?.name ?? label : label,
        note,
        audience,
        userIds: audience === "user" ? users : [],
        groupIds: audience === "group" ? groupIds : [],
        startsAt: isoFromDateInput(start, "start"),
        expiresAt: isoFromDateInput(end, "end"),
        pinned,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin"] });
      void qc.invalidateQueries({ queryKey: ME_KEY });
      const who = audience === "all" ? "every member" : audience === "group" ? `${groupIds.length} group${groupIds.length === 1 ? "" : "s"}` : `${users.length} member${users.length === 1 ? "" : "s"}`;
      toast.success(`Shared with ${who}`);
      onOpenChange(false);
    },
    onError: (err) => setError(describeError(err).body),
  });

  const memberList = members.data?.members ?? [];
  const groupList = groups.data?.groups ?? [];
  const canSave = Boolean(ref.trim()) && (audience === "all" || (audience === "user" ? users.length > 0 : groupIds.length > 0)) && (!start || !end || end >= start);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Share with members"
      description={KIND_HINT[kind]}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button icon={Share2} loading={save.isPending} disabled={!canSave} onClick={() => save.mutate()}>
            Share
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        {lockTarget ? (
          <p className="rounded-md bg-surface-raised px-3 py-2 text-sm text-fg">
            <span className="text-fg-muted">{SHARE_KIND_LABEL[kind]}: </span>
            {label || ref}
          </p>
        ) : (
          <div className="grid gap-4">
            <Select
              label="What"
              value={kind}
              onChange={(v) => {
                const k = v as ShareKind;
                setKind(k);
                setRef(k === "exam" ? EXAMS[0]!.id : "");
                setError(null);
              }}
              options={(Object.keys(SHARE_KIND_LABEL) as ShareKind[]).map((k) => ({ value: k, label: SHARE_KIND_LABEL[k] }))}
            />
            {kind === "exam" ? (
              <Select label="Exam" value={ref} onChange={setRef} options={examOptions} />
            ) : (
              <Field label={`${SHARE_KIND_LABEL[kind]} id or link`} hint="Paste a link from unacademy.com or from this app's address bar.">
                {(p) => <Input {...p} value={ref} onChange={(e) => setRef(e.target.value)} placeholder={KIND_PLACEHOLDER[kind]} spellCheck={false} />}
              </Field>
            )}
            {kind !== "exam" ? (
              <Field label="Name shown to members" hint="Optional. Filled in automatically once someone opens it.">
                {(p) => <Input {...p} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={160} />}
              </Field>
            ) : null}
          </div>
        )}

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium text-fg">Who can open it</legend>
          {(
            [
              ["all", "Every member, including people you add later"],
              ["group", "Groups"],
              ["user", "Specific members"],
            ] as const
          ).map(([value, text]) => (
            <label key={value} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-fg">
              <input type="radio" name="share-audience" checked={audience === value} onChange={() => setAudience(value)} className="size-4 accent-[var(--color-accent)]" />
              {text}
            </label>
          ))}
          {audience === "group" ? (
            <Picker
              label="Groups"
              items={groupList}
              picked={groupIds}
              onChange={setGroupIds}
              empty={groups.isLoading ? "Loading groups…" : "No groups yet. Create one on the Groups tab."}
              render={(g) => (
                <>
                  <span className="min-w-0 flex-1 truncate">{g.name}</span>
                  <span className="text-xs text-fg-muted tabular-nums">{g.memberIds.length} members</span>
                </>
              )}
            />
          ) : null}
          {audience === "user" ? (
            <Picker
              label="Members"
              items={memberList}
              picked={users}
              onChange={setUsers}
              empty={members.isLoading ? "Loading members…" : "No members yet. Add one on the Members tab."}
              render={(m) => (
                <>
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  <span className="truncate text-xs text-fg-muted">{m.email}</span>
                </>
              )}
            />
          ) : null}
        </fieldset>

        <Field label="Note for members" hint="Optional, e.g. “Finish chapters 1–3 by Friday”.">
          {(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} />}
        </Field>
        <WindowFields start={start} end={end} onStart={setStart} onEnd={setEnd} />
        <Switch label="Pin to the top" description="Pinned items lead the member's dashboard." checked={pinned} onCheckedChange={setPinned} />
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

/** Change a share's name, note, dates or pin without re-sharing it. */
export function EditShareDialog({ share, onOpenChange }: { share: Share | null; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!share) return;
    setLabel(share.label);
    setNote(share.note);
    setStart(dateInputValue(share.startsAt));
    setEnd(dateInputValue(share.expiresAt));
    setPinned(share.pinned);
    setError(null);
  }, [share]);

  const save = useMutation({
    mutationFn: () =>
      sendJson(`/api/admin/shares/${share!.id}`, "PATCH", {
        label,
        note,
        startsAt: isoFromDateInput(start, "start"),
        expiresAt: isoFromDateInput(end, "end"),
        pinned,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin"] });
      void qc.invalidateQueries({ queryKey: ME_KEY });
      toast.success("Share updated");
      onOpenChange(false);
    },
    onError: (err) => setError(describeError(err).body),
  });

  return (
    <Dialog
      open={share != null}
      onOpenChange={onOpenChange}
      title="Edit share"
      description={share ? `${SHARE_KIND_LABEL[share.kind]} · ${share.label || share.ref}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button icon={Pin} loading={save.isPending} disabled={Boolean(start && end && end < start)} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Name shown to members">{(p) => <Input {...p} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={160} />}</Field>
        <Field label="Note for members">{(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} />}</Field>
        <WindowFields start={start} end={end} onStart={setStart} onEnd={setEnd} />
        <Switch label="Pin to the top" checked={pinned} onCheckedChange={setPinned} />
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

/** "Share" button for page headers. Renders nothing for members. */
export function ShareButton({ kind, refId, label }: { kind: ShareKind; refId: string; label: string }) {
  const admin = useIsAdmin();
  const [open, setOpen] = useState(false);
  if (!admin || !refId) return null;
  return (
    <>
      <Button variant="secondary" icon={Share2} onClick={() => setOpen(true)}>
        Share
      </Button>
      <ShareDialog open={open} onOpenChange={setOpen} kind={kind} refId={refId} label={label} lockTarget />
    </>
  );
}
