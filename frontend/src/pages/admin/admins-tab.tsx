import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, Pause, Play, ShieldCheck, ShieldMinus, Trash2, UserPlus } from "lucide-react";
import { Avatar, Badge, Button, ConfirmDialog, ErrorState, ListRow, List, Menu, Select, Skeleton, Surface, toast } from "@/components/ui";
import { get, useMembers } from "@/components/admin/api";
import { describeError } from "@/lib/api-client";
import { fmtAgo, roleLabel, sendJson, useCurrentUser, type SessionUser } from "@/lib/session";
import { AddAccountDialog } from "./members-tab";
import { ResetPasswordDialog } from "./member-detail";

/** Super admin only: add, promote, pause, demote and remove admins. */
export function AdminsTab() {
  const qc = useQueryClient();
  const me = useCurrentUser();
  const q = useQuery({ queryKey: ["admin", "admins"], queryFn: () => get<{ admins: SessionUser[] }>("/api/admin/admins") });
  const members = useMembers();
  const [adding, setAdding] = useState(false);
  const [promote, setPromote] = useState("");
  const [removing, setRemoving] = useState<SessionUser | null>(null);
  const [resetting, setResetting] = useState<SessionUser | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin"] });
  const onError = (err: unknown) => toast.error(describeError(err).body);

  const patch = useMutation({ mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => sendJson(`/api/admin/admins/${id}`, "PATCH", body), onSuccess: refresh, onError });
  const remove = useMutation({
    mutationFn: (id: number) => sendJson(`/api/admin/admins/${id}`, "DELETE"),
    onSuccess: () => {
      refresh();
      setRemoving(null);
      toast.success("Admin removed");
    },
    onError,
  });
  const makeAdmin = useMutation({
    mutationFn: (memberId: number) => sendJson("/api/admin/admins", "POST", { memberId }),
    onSuccess: () => {
      refresh();
      setPromote("");
      toast.success("They're an admin now. They were signed out to pick up the new role.");
    },
    onError,
  });

  const admins = q.data?.admins ?? [];
  const candidates = (members.data?.members ?? []).filter((m) => m.status === "active");

  return (
    <div className="grid max-w-3xl gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[var(--measure)] text-sm text-fg-muted">Admins manage members, groups, sharing and settings, and see activity. Only you, the super admin, can add or remove admins.</p>
        <Button icon={UserPlus} onClick={() => setAdding(true)}>
          Add admin
        </Button>
      </div>
      {q.isLoading ? <Skeleton className="h-40" /> : null}
      {q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
      {admins.length ? (
        <List label="Admins">
          {admins.map((a) => {
            const isSuper = a.role === "superadmin";
            const paused = a.status === "disabled";
            return (
              <ListRow
                key={a.id}
                leading={<Avatar name={a.name} size="sm" decorative />}
                title={
                  <span className="flex items-center gap-1.5">
                    {a.name}
                    {a.id === me?.id ? <span className="text-xs text-fg-muted">(you)</span> : null}
                  </span>
                }
                badge={isSuper ? <Badge tone="accent">{roleLabel(a.role)}</Badge> : paused ? <Badge tone="warn">Paused</Badge> : <Badge>{roleLabel(a.role)}</Badge>}
                meta={
                  <>
                    <span>{a.email}</span>
                    <span>· seen {fmtAgo(a.lastSeenAt)}</span>
                  </>
                }
                trailing={
                  isSuper ? (
                    <Crown aria-hidden="true" className="size-4 text-accent" />
                  ) : (
                    <Menu
                      label={`Actions for ${a.name}`}
                      items={[
                        { id: "pause", label: paused ? "Resume" : "Pause", icon: paused ? Play : Pause, onSelect: () => patch.mutate({ id: a.id, body: { status: paused ? "active" : "disabled" } }) },
                        { id: "reset", label: "Reset password", icon: ShieldCheck, onSelect: () => setResetting(a) },
                        { id: "demote", label: "Make member", icon: ShieldMinus, onSelect: () => patch.mutate({ id: a.id, body: { role: "member" } }) },
                        "separator" as const,
                        { id: "remove", label: "Remove admin", icon: Trash2, danger: true, onSelect: () => setRemoving(a) },
                      ]}
                      trigger={(p) => (
                        <Button {...p} size="sm" variant="ghost">
                          Manage
                        </Button>
                      )}
                    />
                  )
                }
              />
            );
          })}
        </List>
      ) : null}

      <Surface className="grid gap-3">
        <h2 className="text-sm font-medium text-fg">Promote a member</h2>
        <p className="text-sm text-fg-muted">They keep their sign-in. Their group memberships are cleared because admins see everything.</p>
        <div className="flex flex-wrap items-end gap-2">
          <Select
            label="Member"
            value={promote}
            onChange={setPromote}
            options={[{ value: "", label: candidates.length ? "Pick a member" : "No active members" }, ...candidates.map((m) => ({ value: String(m.id), label: `${m.name} · ${m.email}` }))]}
            className="min-w-0 flex-1"
          />
          <Button variant="secondary" icon={ShieldCheck} disabled={!promote} loading={makeAdmin.isPending} onClick={() => makeAdmin.mutate(Number(promote))}>
            Make admin
          </Button>
        </div>
      </Surface>

      <AddAccountDialog open={adding} onOpenChange={setAdding} onDone={refresh} kind="admin" />
      {resetting ? <ResetPasswordDialog open onOpenChange={(v) => !v && setResetting(null)} path={`/api/admin/admins/${resetting.id}`} email={resetting.email} /> : null}
      <ConfirmDialog
        open={removing != null}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={`Remove ${removing?.name ?? "admin"}?`}
        body="Their account is deleted. Shares they created stay. To keep the account, choose Make member instead."
        confirmLabel="Remove admin"
        busy={remove.isPending}
        onConfirm={() => {
          if (removing) remove.mutate(removing.id);
        }}
      />
    </div>
  );
}
