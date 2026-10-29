import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, UserPlus, Users } from "lucide-react";
import { Avatar, Badge, Button, Dialog, EmptyState, ErrorState, Field, Input, Skeleton, Switch, toast } from "@/components/ui";
import { suggestPassword } from "@/components/admin/bits";
import { useGroups, useMembers } from "@/components/admin/api";
import { describeError } from "@/lib/api-client";
import { fmtAgo, fmtMinutes, sendJson, type SessionUser } from "@/lib/session";

export function MembersTab() {
  const qc = useQueryClient();
  const q = useMembers();
  const groups = useGroups();
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("");
  const [group, setGroup] = useState<number | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin"] });
  const groupName = new Map((groups.data?.groups ?? []).map((g) => [g.id, g.name]));

  const rows = (q.data?.members ?? []).filter(
    (m) => (!filter || `${m.name} ${m.email}`.toLowerCase().includes(filter.toLowerCase())) && (group == null || (m.groupIds ?? []).includes(group)),
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Filter members" placeholder="Filter by name or email" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs flex-1" />
        {groups.data?.groups.length ? (
          <div className="scroll-fade-x flex gap-1 overflow-x-auto" role="group" aria-label="Filter by group">
            <button type="button" aria-pressed={group == null} onClick={() => setGroup(null)} className={chip(group == null)}>
              All
            </button>
            {groups.data.groups.map((g) => (
              <button key={g.id} type="button" aria-pressed={group === g.id} onClick={() => setGroup(group === g.id ? null : g.id)} className={chip(group === g.id)}>
                {g.name}
              </button>
            ))}
          </div>
        ) : null}
        <Button icon={UserPlus} onClick={() => setAdding(true)} className="ml-auto">
          Add member
        </Button>
      </div>
      {q.isLoading ? <Skeleton className="h-48" /> : null}
      {q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
      {q.data && !q.data.members.length ? (
        <EmptyState icon={Users} title="No members yet" body="Only admins create accounts. There is no public sign-up." action={<Button icon={UserPlus} onClick={() => setAdding(true)}>Add member</Button>} />
      ) : null}
      {q.data?.members.length && !rows.length ? <p className="py-6 text-center text-sm text-fg-muted">No members match.</p> : null}
      {rows.length ? (
        <div className="overflow-x-auto rounded-lg bg-surface shadow-1">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-line text-xs tracking-wide text-fg-muted uppercase">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Member</th>
                <th scope="col" className="px-4 py-3 font-semibold">Groups</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">7 days</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Active days · 30d</th>
                <th scope="col" className="px-4 py-3 font-semibold">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-b border-line last:border-0 hover:bg-surface-raised/50">
                  <td className="px-4 py-3">
                    <Link to="/admin" search={{ member: m.id }} className="flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                      <Avatar name={m.name} size="sm" decorative />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-fg hover:underline">{m.name}</span>
                        <span className="block truncate text-xs text-fg-muted">{m.email}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap gap-1">
                      {(m.groupIds ?? []).map((g) => (
                        <Badge key={g}>{groupName.get(g) ?? "Group"}</Badge>
                      ))}
                      {!(m.groupIds ?? []).length ? <span className="text-fg-faint">—</span> : null}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {m.resetRequestedAt ? <Badge tone="danger">Asked for a reset</Badge> : null}
                    {m.status !== "active" ? <Badge tone="warn">Paused</Badge> : m.mustChangePassword ? <Badge tone="info">New password pending</Badge> : <Badge tone="ok">Active</Badge>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMinutes(m.stats?.watchSeconds7d ?? 0)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{m.stats?.activeDays30d ?? 0}</td>
                  <td className="px-4 py-3 text-fg-muted">{fmtAgo(m.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <AddAccountDialog open={adding} onOpenChange={setAdding} onDone={refresh} kind="member" />
    </div>
  );
}

function chip(on: boolean) {
  return `inline-flex h-8 shrink-0 items-center rounded-full px-3 text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${on ? "bg-fg text-bg" : "bg-surface-raised text-fg-muted hover:text-fg"}`;
}

/** Create a member (any admin) or an admin (super admin). Shows copyable sign-in details after. */
export function AddAccountDialog({ open, onOpenChange, onDone, kind }: { open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void; kind: "member" | "admin" }) {
  const groups = useGroups(open && kind === "member");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(suggestPassword);
  const [mustChange, setMustChange] = useState(true);
  const [groupIds, setGroupIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const noun = kind === "admin" ? "admin" : "member";

  const save = useMutation({
    mutationFn: () =>
      sendJson<{ member?: SessionUser; admin?: SessionUser }>(kind === "admin" ? "/api/admin/admins" : "/api/admin/members", "POST", {
        name,
        email,
        password,
        mustChangePassword: mustChange,
        ...(kind === "member" ? { groupIds } : {}),
      }),
    onSuccess: (res) => {
      setCreated({ email: (res.member ?? res.admin)!.email, password });
      onDone();
    },
    onError: (err) => setError(describeError(err).body),
  });

  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) {
      setName("");
      setEmail("");
      setPassword(suggestPassword());
      setMustChange(true);
      setGroupIds([]);
      setError(null);
      setCreated(null);
    }
  };

  const copy = () => {
    if (!created) return;
    void navigator.clipboard?.writeText(`InkBoard sign-in\n${location.origin}/login\nEmail: ${created.email}\nPassword: ${created.password}`);
    toast.success("Sign-in details copied");
  };

  if (created) {
    return (
      <Dialog
        open={open}
        onOpenChange={close}
        title={`${noun[0]!.toUpperCase()}${noun.slice(1)} added`}
        description={mustChange ? "Send these details privately. They'll pick their own password the first time they sign in." : "Send these details privately. They can change the password from the account menu."}
        footer={
          <>
            <Button variant="secondary" icon={Copy} onClick={copy}>
              Copy details
            </Button>
            <Button onClick={() => close(false)}>Done</Button>
          </>
        }
      >
        <dl className="grid gap-2 rounded-md bg-surface-raised p-4 font-mono text-sm">
          <div className="flex gap-2"><dt className="w-20 shrink-0 text-fg-muted">Sign in</dt><dd className="break-all">{typeof location !== "undefined" ? `${location.origin}/login` : "/login"}</dd></div>
          <div className="flex gap-2"><dt className="w-20 shrink-0 text-fg-muted">Email</dt><dd className="break-all">{created.email}</dd></div>
          <div className="flex gap-2"><dt className="w-20 shrink-0 text-fg-muted">Password</dt><dd className="break-all">{created.password}</dd></div>
        </dl>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={`Add ${kind === "admin" ? "an admin" : "a member"}`}
      description={kind === "admin" ? "Admins manage members, groups, sharing and settings. Only you can add or remove admins." : "They sign in with this email and password. Nothing is shared with them until you share it."}
      footer={
        <>
          <Button variant="secondary" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button icon={Plus} loading={save.isPending} disabled={!email || password.length < 10} onClick={() => save.mutate()}>
            Add {noun}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Name">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" autoFocus />}</Field>
        <Field label="Email">{(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />}</Field>
        <Field label={mustChange ? "Temporary password" : "Password"} hint="Suggested. At least 10 characters, with letters and a number.">
          {(p) => (
            <div className="flex gap-2">
              <Input {...p} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className="font-mono" />
              <Button type="button" variant="secondary" onClick={() => setPassword(suggestPassword())}>
                New
              </Button>
            </div>
          )}
        </Field>
        <Switch label="Ask for a new password on first sign-in" description="Recommended. You won't know the password they choose." checked={mustChange} onCheckedChange={setMustChange} />
        {kind === "member" && groups.data?.groups.length ? (
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-fg">Groups</legend>
            <div className="flex flex-wrap gap-1.5">
              {groups.data.groups.map((g) => {
                const on = groupIds.includes(g.id);
                return (
                  <button key={g.id} type="button" aria-pressed={on} onClick={() => setGroupIds(on ? groupIds.filter((x) => x !== g.id) : [...groupIds, g.id])} className={chip(on)}>
                    {g.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
