import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Copy, LogOut, Pause, Play, Share2, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Avatar, Badge, Button, ConfirmDialog, Dialog, ErrorState, Field, Input, List, Menu, PageBody, PageHeader, Progress, Section, Skeleton, Surface, toast } from "@/components/ui";
import { ActivityFeed, DayBars, StatTile, suggestPassword } from "@/components/admin/bits";
import { EditShareDialog, ShareDialog } from "@/components/admin/share-dialog";
import { get, useGroups, type MemberDetail } from "@/components/admin/api";
import { describeError } from "@/lib/api-client";
import { fmtAgo as ago, fmtMinutes, sendJson, type SessionUser, type Share } from "@/lib/session";
import { ShareLine } from "./share-line";

export function MemberDetailView({ id }: { id: number }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["admin", "member", id], queryFn: () => get<MemberDetail>(`/api/admin/members/${id}`), refetchInterval: 60_000 });
  const groups = useGroups();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [editing, setEditing] = useState<Share | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin"] });

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => sendJson<{ member: SessionUser }>(`/api/admin/members/${id}`, "PATCH", body),
    onSuccess: () => refresh(),
    onError: (err) => toast.error(describeError(err).body),
  });
  const signout = useMutation({
    mutationFn: () => sendJson(`/api/admin/members/${id}/signout`, "POST"),
    onSuccess: () => toast.success("Signed out on every device"),
  });
  const remove = useMutation({
    mutationFn: () => sendJson(`/api/admin/members/${id}`, "DELETE"),
    onSuccess: () => {
      refresh();
      toast.success("Member removed");
      void nav({ to: "/admin", search: { tab: "members" } });
    },
  });
  const unshare = useMutation({ mutationFn: (sid: number) => sendJson(`/api/admin/shares/${sid}`, "DELETE"), onSuccess: () => refresh() });

  const back = (
    <Button variant="ghost" size="sm" icon={ArrowLeft} asChild>
      <Link to="/admin" search={{ tab: "members" }}>
        Members
      </Link>
    </Button>
  );

  if (q.isLoading) {
    return (
      <AppShell>
        <PageHeader eyebrow="Member" title={<Skeleton className="h-8 w-56" />} />
        <PageBody>
          <Skeleton className="h-72" />
        </PageBody>
      </AppShell>
    );
  }
  if (q.isError || !q.data) {
    return (
      <AppShell>
        <PageBody className="py-10">
          <ErrorState error={q.error} heading action={back} />
        </PageBody>
      </AppShell>
    );
  }
  const { member, stats, daily, activity, shares, effectiveShares, planner, lessons } = q.data;
  const paused = member.status === "disabled";
  const first = member.name.split(" ")[0];
  const memberGroups = new Set(q.data.groups.map((g) => g.id));
  const inherited = effectiveShares.filter((s) => s.audience !== "user");

  return (
    <AppShell>
      <PageHeader
        crumbs={[{ label: "Admin", to: "/admin" }, { label: "Members", to: "/admin", search: { tab: "members" } }, { label: member.name }]}
        eyebrow={paused ? "Paused member" : member.mustChangePassword ? "Member · new password pending" : "Member"}
        title={member.name}
        subline={`${member.email} · joined ${new Date(member.createdAt).toLocaleDateString()} · seen ${ago(member.lastSeenAt)}`}
        leading={<Avatar name={member.name} size="lg" decorative />}
        actions={
          <>
            <Button icon={Share2} onClick={() => setShareOpen(true)}>
              Share with {first}
            </Button>
            <Button variant="secondary" icon={paused ? Play : Pause} loading={patch.isPending} onClick={() => patch.mutate({ status: paused ? "active" : "disabled" })}>
              {paused ? "Resume" : "Pause"}
            </Button>
            <Menu
              label="More actions"
              align="end"
              items={[
                { id: "reset", label: "Reset password", icon: Copy, onSelect: () => setResetOpen(true) },
                { id: "out", label: "Sign out everywhere", icon: LogOut, onSelect: () => signout.mutate() },
                "separator" as const,
                { id: "del", label: "Remove member", icon: Trash2, danger: true, onSelect: () => setConfirmDelete(true) },
              ]}
              trigger={(p) => (
                <Button {...p} variant="secondary">
                  More
                </Button>
              )}
            />
          </>
        }
      />
      <PageBody>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Watch · 7 days" value={fmtMinutes(stats?.watchSeconds7d ?? 0)} />
          <StatTile label="Watch · 30 days" value={fmtMinutes(stats?.watchSeconds30d ?? 0)} />
          <StatTile label="Classes · 7 days" value={stats?.lessons7d ?? 0} />
          <StatTile label="Active days · 30" value={stats?.activeDays30d ?? 0} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Surface>
            <DayBars days={daily} label="Minutes watched per day (30 days)" empty="No watch time yet. Share something and check back once they've opened a class." />
          </Surface>
          <Surface className="grid content-start gap-3">
            <h2 className="flex items-center gap-2 text-sm font-medium text-fg">
              <CalendarDays aria-hidden="true" className="size-4 text-fg-muted" />
              Study plan
            </h2>
            {planner ? (
              <>
                <p className="text-sm text-fg">
                  <span className="font-medium">{planner.planName}</span>
                  {planner.examName ? <span className="text-fg-muted"> · {planner.examName}</span> : null}
                </p>
                <div>
                  <div className="mb-1 flex justify-between text-xs text-fg-muted">
                    <span>Overall</span>
                    <span className="tabular-nums">
                      {planner.tasksDone}/{planner.tasksTotal} tasks
                    </span>
                  </div>
                  <Progress value={planner.tasksTotal ? (planner.tasksDone / planner.tasksTotal) * 100 : 0} label="Plan progress" />
                </div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-fg-muted">Today</dt>
                    <dd className="tabular-nums text-fg">
                      {planner.todayDone}/{planner.todayTotal} done
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-fg-muted">Studied · 7 days</dt>
                    <dd className="tabular-nums text-fg">{planner.minutes7d} min</dd>
                  </div>
                </dl>
                <p className="text-xs text-fg-faint">Synced {ago(planner.updatedAt)}</p>
              </>
            ) : (
              <p className="text-sm text-fg-muted">{first} hasn't made a study plan yet.</p>
            )}
          </Surface>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div>
            <Section title="Classes · 30 days" description="From daily totals, kept for a year.">
              {lessons.length ? (
                <ol className="m-0 grid list-none gap-1 p-0">
                  {lessons.map((l) => (
                    <li key={l.ref} className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-surface-raised/60">
                      <Link to="/play/$lessonId" params={{ lessonId: l.ref }} search={{ title: l.label }} className="min-w-0 flex-1 truncate text-fg hover:underline">
                        {l.label || l.ref}
                      </Link>
                      <span className="shrink-0 text-xs text-fg-muted tabular-nums">
                        {fmtMinutes(l.seconds)} · {l.lastDay.slice(5)}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-fg-muted">No classes watched in the last 30 days.</p>
              )}
            </Section>
            <Section title="Last hour">
              <ActivityFeed items={activity} empty={`Nothing from ${first} in the last hour.`} />
            </Section>
          </div>
          <div>
            <Section title="Groups">
              {groups.data?.groups.length ? (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Groups">
                  {groups.data.groups.map((g) => {
                    const on = memberGroups.has(g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        aria-pressed={on}
                        disabled={patch.isPending}
                        onClick={() => patch.mutate({ groupIds: on ? [...memberGroups].filter((x) => x !== g.id) : [...memberGroups, g.id] })}
                        className={`inline-flex h-8 items-center rounded-full px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${on ? "bg-fg text-bg" : "bg-surface-raised text-fg-muted hover:text-fg"}`}
                      >
                        {g.name}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-fg-muted">
                  No groups yet.{" "}
                  <Link to="/admin" search={{ tab: "groups" }} className="text-accent hover:underline">
                    Create one
                  </Link>
                </p>
              )}
            </Section>
            <Section title="Shared only with them">
              {shares.length ? (
                <List label="Personal shares">
                  {shares.map((s) => (
                    <ShareLine key={s.id} s={s} onEdit={() => setEditing(s)} onRemove={() => unshare.mutate(s.id)} />
                  ))}
                </List>
              ) : (
                <p className="text-sm text-fg-muted">Nothing personal yet.</p>
              )}
            </Section>
            <Section title="Also sees" description="Shared with everyone or with their groups, active now.">
              {inherited.length ? (
                <ul className="m-0 grid list-none gap-1 p-0">
                  {inherited.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 text-sm">
                      <Badge>{s.audience === "all" ? "Everyone" : groups.data?.groups.find((g) => g.id === s.groupId)?.name ?? "Group"}</Badge>
                      <span className="min-w-0 truncate text-fg">{s.label || s.ref}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-fg-muted">Nothing else.</p>
              )}
            </Section>
          </div>
        </div>
      </PageBody>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Remove ${member.name}?`}
        body="Their account, shares, saved plans and history are deleted. This cannot be undone. Pause them instead to keep it."
        confirmLabel="Remove member"
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
      <ResetPasswordDialog open={resetOpen} onOpenChange={setResetOpen} path={`/api/admin/members/${id}`} email={member.email} />
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} memberId={id} />
      <EditShareDialog share={editing} onOpenChange={(v) => !v && setEditing(null)} />
    </AppShell>
  );
}

export function ResetPasswordDialog({ open, onOpenChange, path, email }: { open: boolean; onOpenChange: (v: boolean) => void; path: string; email: string }) {
  const [password, setPassword] = useState(suggestPassword);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => sendJson(path, "PATCH", { password, mustChangePassword: true }),
    onSuccess: () => setDone(true),
    onError: (err) => setError(describeError(err).body),
  });
  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) {
      setDone(false);
      setError(null);
      setPassword(suggestPassword());
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={done ? "Password reset" : "Reset password"}
      description={done ? "They were signed out everywhere and will pick a new password when they sign in." : `Sets a temporary password for ${email} and signs them out on every device.`}
      footer={
        done ? (
          <>
            <Button
              variant="secondary"
              icon={Copy}
              onClick={() => {
                void navigator.clipboard?.writeText(password);
                toast.success("Password copied");
              }}
            >
              Copy
            </Button>
            <Button onClick={() => close(false)}>Done</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>
              Reset
            </Button>
          </>
        )
      }
    >
      {done ? (
        <p className="rounded-md bg-surface-raised p-3 font-mono text-sm break-all">{password}</p>
      ) : (
        <Field label="Temporary password" error={error ?? undefined}>
          {(p) => (
            <div className="flex gap-2">
              <Input {...p} value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
              <Button type="button" variant="secondary" onClick={() => setPassword(suggestPassword())}>
                New
              </Button>
            </div>
          )}
        </Field>
      )}
    </Dialog>
  );
}
