import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock3, Database, KeyRound, ShieldCheck } from "lucide-react";
import { ErrorState, Section, Skeleton, Surface, Switch, toast } from "@/components/ui";
import { useSettings, type Settings } from "@/components/admin/api";
import { describeError } from "@/lib/api-client";
import { ME_KEY, sendJson, type AccessMode, type Permissions } from "@/lib/session";

function ModeOption({ checked, onSelect, title, body }: { checked: boolean; onSelect: () => void; title: string; body: string }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-md p-3 transition-colors ${checked ? "bg-accent-subtle" : "hover:bg-surface-raised/60"}`}>
      <input type="radio" name="mode" className="mt-0.5 size-4 accent-[var(--color-accent)]" checked={checked} onChange={onSelect} />
      <span>
        <span className="block text-sm font-medium text-fg">{title}</span>
        <span className="block text-sm text-fg-muted">{body}</span>
      </span>
    </label>
  );
}

export function SettingsTab() {
  const qc = useQueryClient();
  const q = useSettings();
  const save = useMutation({
    mutationFn: (body: Partial<{ accessMode: AccessMode; permissions: Partial<Permissions> }>) => sendJson<Settings>("/api/admin/settings", "PUT", body),
    onSuccess: (data) => {
      qc.setQueryData(["admin", "settings"], data);
      void qc.invalidateQueries({ queryKey: ME_KEY });
      toast.success("Saved");
    },
    onError: (err) => toast.error(describeError(err).body),
  });
  if (q.isLoading) return <Skeleton className="h-60" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const { accessMode, permissions } = q.data;
  const perm = (key: keyof Permissions) => (v: boolean) => save.mutate({ permissions: { [key]: v } });
  return (
    <div className="grid max-w-2xl gap-2">
      <Section title="What members can open">
        <Surface className="grid gap-1 p-2">
          <ModeOption checked={accessMode === "curated"} onSelect={() => save.mutate({ accessMode: "curated" })} title="Curated (recommended)" body="Members only see exams, teachers, courses, batches and classes you share." />
          <ModeOption checked={accessMode === "open"} onSelect={() => save.mutate({ accessMode: "open" })} title="Open" body="Members can browse and search the whole catalog. Shares still lead their dashboard." />
        </Surface>
      </Section>
      <Section title="Member features" description="Admins always see everything.">
        <Surface className="grid gap-5">
          <Switch label="Browse catalog" description="The Browse tab with every exam. Off: members only see their dashboard and what you share." checked={permissions.browse} onCheckedChange={perm("browse")} />
          <Switch label="Search" description="Search classes and teachers. In curated mode results are limited to shared teachers." checked={permissions.search} onCheckedChange={perm("search")} />
          <Switch label="Live classes" description="Live appears only for members with at least one shared exam, and lists that exam's classes." checked={permissions.live} onCheckedChange={perm("live")} />
          <Switch label="Planner" description="Study plans, tasks, focus timer and streaks. Saved to their account." checked={permissions.planner} onCheckedChange={perm("planner")} />
          <Switch label="Downloads for offline play" description="Saving classes to the server for offline use. Uses server disk; off by default." checked={permissions.downloads} onCheckedChange={perm("downloads")} />
        </Surface>
      </Section>
      <Section title="Security and data">
        <Surface className="grid gap-3 text-sm text-fg-muted">
          <p className="flex gap-2">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ok" />
            <span>Every API route needs a signed-in account. Passwords are salted scrypt hashes; sessions are HttpOnly cookies for 30 days. Five wrong passwords lock an account for 15 minutes from that address.</span>
          </p>
          <p className="flex gap-2">
            <KeyRound aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>New accounts and password resets can require a new password on first sign-in. Pausing, resetting or changing a role signs the person out everywhere.</span>
          </p>
          <p className="flex gap-2">
            <Database aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>Accounts, shares, plans, history and saved items are stored in the database and follow each person to any device.</span>
          </p>
          <p className="flex gap-2">
            <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>Raw member activity is kept for 1 hour. Daily watch totals are kept for a year; the admin audit log for 90 days.</span>
          </p>
        </Surface>
      </Section>
    </div>
  );
}
