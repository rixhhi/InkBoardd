import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderPlus, Pencil, Share2, Trash2, UsersRound } from "lucide-react";
import { Avatar, Button, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, IconButton, Input, Skeleton, Surface, toast } from "@/components/ui";
import { ShareDialog } from "@/components/admin/share-dialog";
import { useGroups, useMembers, type Group } from "@/components/admin/api";
import { describeError } from "@/lib/api-client";
import { ME_KEY, sendJson } from "@/lib/session";

/** Cohorts: share with a whole group at once; moving a member in or out changes what they see immediately. */
export function GroupsTab() {
  const q = useGroups();
  const members = useMembers();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Group | "new" | null>(null);
  const [deleting, setDeleting] = useState<Group | null>(null);
  const [sharing, setSharing] = useState<Group | null>(null);
  const names = new Map((members.data?.members ?? []).map((m) => [m.id, m.name]));

  const remove = useMutation({
    mutationFn: (id: number) => sendJson(`/api/admin/groups/${id}`, "DELETE"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin"] });
      void qc.invalidateQueries({ queryKey: ME_KEY });
      setDeleting(null);
      toast.success("Group deleted");
    },
  });

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[var(--measure)] text-sm text-fg-muted">Put members in groups (a batch, a class, a target year) and share with the whole group. Members can be in several groups.</p>
        <Button icon={FolderPlus} onClick={() => setEditing("new")}>
          New group
        </Button>
      </div>
      {q.isLoading ? <Skeleton className="h-40" /> : null}
      {q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
      {q.data && !q.data.groups.length ? (
        <EmptyState icon={UsersRound} title="No groups yet" body="Groups make sharing with a batch of students one step." action={<Button icon={FolderPlus} onClick={() => setEditing("new")}>New group</Button>} />
      ) : null}
      {q.data?.groups.length ? (
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {q.data.groups.map((g) => (
            <li key={g.id}>
              <Surface className="flex h-full flex-col gap-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-medium text-fg">{g.name}</h3>
                    {g.description ? <p className="mt-0.5 line-clamp-2 text-sm text-fg-muted">{g.description}</p> : null}
                  </div>
                  <IconButton label={`Edit ${g.name}`} icon={Pencil} size="sm" onClick={() => setEditing(g)} />
                  <IconButton label={`Delete ${g.name}`} icon={Trash2} size="sm" onClick={() => setDeleting(g)} />
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2" aria-hidden="true">
                    {g.memberIds.slice(0, 5).map((id) => (
                      <span key={id} className="rounded-full ring-2 ring-surface">
                        <Avatar name={names.get(id) ?? "?"} size="sm" decorative />
                      </span>
                    ))}
                  </div>
                  <p className="text-sm text-fg-muted">
                    {g.memberIds.length} member{g.memberIds.length === 1 ? "" : "s"} · {g.shareCount ?? 0} share{g.shareCount === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="mt-auto flex gap-2">
                  <Button size="sm" variant="secondary" icon={Share2} onClick={() => setSharing(g)}>
                    Share with group
                  </Button>
                </div>
              </Surface>
            </li>
          ))}
        </ul>
      ) : null}
      <GroupDialog group={editing} onOpenChange={(v) => !v && setEditing(null)} />
      <ShareDialog open={sharing != null} onOpenChange={(v) => !v && setSharing(null)} groupId={sharing?.id} />
      <ConfirmDialog
        open={deleting != null}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "group"}?`}
        body="Members stay, but everything shared with this group stops being shared with them."
        confirmLabel="Delete group"
        busy={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
      />
    </div>
  );
}

function GroupDialog({ group, onOpenChange }: { group: Group | "new" | null; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const members = useMembers(group != null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isNew = group === "new";

  useEffect(() => {
    if (!group) return;
    setName(isNew ? "" : group.name);
    setDescription(isNew ? "" : group.description);
    setPicked(isNew ? [] : group.memberIds);
    setFilter("");
    setError(null);
  }, [group, isNew]);

  const save = useMutation({
    mutationFn: () =>
      isNew
        ? sendJson("/api/admin/groups", "POST", { name, description, memberIds: picked })
        : sendJson(`/api/admin/groups/${(group as Group).id}`, "PATCH", { name, description, memberIds: picked }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin"] });
      void qc.invalidateQueries({ queryKey: ME_KEY });
      toast.success(isNew ? "Group created" : "Group saved");
      onOpenChange(false);
    },
    onError: (err) => setError(describeError(err).body),
  });

  const list = (members.data?.members ?? []).filter((m) => !filter || `${m.name} ${m.email}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <Dialog
      open={group != null}
      onOpenChange={onOpenChange}
      title={isNew ? "New group" : "Edit group"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>
            {isNew ? "Create group" : "Save"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Name">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. NEET 2027 · Morning batch" autoFocus />}</Field>
        <Field label="Description" hint="Optional.">
          {(p) => <Input {...p} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />}
        </Field>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium text-fg">
            Members <span className="font-normal text-fg-muted">· {picked.length} selected</span>
          </legend>
          <Input aria-label="Filter members" placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} className="h-9" />
          <div className="max-h-64 overflow-y-auto rounded-md bg-surface-raised p-2">
            {!members.isLoading && !list.length ? <p className="p-2 text-sm text-fg-muted">No members match.</p> : null}
            {list.map((m) => (
              <label key={m.id} className="flex min-h-10 cursor-pointer items-center gap-2 rounded px-2 text-sm text-fg hover:bg-surface">
                <input type="checkbox" checked={picked.includes(m.id)} onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, m.id] : cur.filter((x) => x !== m.id)))} className="size-4 accent-[var(--color-accent)]" />
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                <span className="truncate text-xs text-fg-muted">{m.email}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
