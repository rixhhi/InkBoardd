import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Share2 } from "lucide-react";
import { Button, ConfirmDialog, EmptyState, ErrorState, Input, List, Section, Skeleton, toast } from "@/components/ui";
import { EditShareDialog, ShareDialog } from "@/components/admin/share-dialog";
import { get, shareWindow, useGroups, useMembers, useSettings } from "@/components/admin/api";
import { ME_KEY, SHARE_KIND_LABEL, sendJson, type Share, type ShareKind } from "@/lib/session";
import { ShareLine } from "./share-line";

type Filter = "all" | ShareKind;
type When = "any" | "active" | "scheduled" | "expired";

function chip(on: boolean) {
  return `inline-flex h-8 shrink-0 items-center rounded-full px-3 text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${on ? "bg-fg text-bg" : "bg-surface-raised text-fg-muted hover:text-fg"}`;
}

export function SharingTab() {
  const qc = useQueryClient();
  const shares = useQuery({ queryKey: ["admin", "shares"], queryFn: () => get<{ shares: Share[] }>("/api/admin/shares") });
  const members = useMembers();
  const groups = useGroups();
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Share | null>(null);
  const [pending, setPending] = useState<Share | null>(null);
  const [kind, setKind] = useState<Filter>("all");
  const [when, setWhen] = useState<When>("any");
  const [text, setText] = useState("");

  const unshare = useMutation({
    mutationFn: (sid: number) => sendJson(`/api/admin/shares/${sid}`, "DELETE"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin"] });
      void qc.invalidateQueries({ queryKey: ME_KEY });
      setPending(null);
      toast.success("Unshared. Members lose access straight away.");
    },
  });

  const names = new Map((members.data?.members ?? []).map((m) => [m.id, m.name]));
  const groupNames = new Map((groups.data?.groups ?? []).map((g) => [g.id, g.name]));
  const all = shares.data?.shares ?? [];
  const list = useMemo(
    () =>
      all.filter(
        (s) =>
          (kind === "all" || s.kind === kind) &&
          (when === "any" || shareWindow(s) === when) &&
          (!text || `${s.label} ${s.ref} ${s.note}`.toLowerCase().includes(text.toLowerCase())),
      ),
    [all, kind, when, text],
  );
  const everyone = list.filter((s) => s.audience === "all");
  const byGroup = list.filter((s) => s.audience === "group");
  const personal = list.filter((s) => s.audience === "user");
  const counts = { active: all.filter((s) => shareWindow(s) === "active").length, scheduled: all.filter((s) => shareWindow(s) === "scheduled").length, expired: all.filter((s) => shareWindow(s) === "expired").length };

  const lineFor = (s: Share, who?: string) => <ShareLine key={s.id} s={s} who={who} onEdit={() => setEditing(s)} onRemove={() => setPending(s)} />;

  return (
    <div className="grid gap-6">
      {settings.data?.accessMode === "open" ? (
        <p role="status" className="rounded-md bg-warn-subtle px-4 py-3 text-sm text-fg">
          <strong>Open mode is on:</strong> members can browse everything. Shares still appear on their dashboard. Switch to curated in Settings to limit them to what you share.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[var(--measure)] text-sm text-fg-muted">
          Share an exam, teacher, course, batch or single class with everyone, a group, or chosen members. Add dates to schedule it or let it expire. Sharing an exam also unlocks Live for it.
        </p>
        <Button icon={Share2} onClick={() => setOpen(true)}>
          Share something
        </Button>
      </div>

      {all.length ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label="Filter shares" placeholder="Filter by name or note" value={text} onChange={(e) => setText(e.target.value)} className="h-9 max-w-xs flex-1" />
            <div className="scroll-fade-x flex gap-1 overflow-x-auto" role="group" aria-label="Show">
              {(
                [
                  ["any", `All ${all.length}`],
                  ["active", `Live now ${counts.active}`],
                  ["scheduled", `Scheduled ${counts.scheduled}`],
                  ["expired", `Ended ${counts.expired}`],
                ] as const
              ).map(([v, label]) => (
                <button key={v} type="button" aria-pressed={when === v} onClick={() => setWhen(v)} className={chip(when === v)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="scroll-fade-x flex gap-1 overflow-x-auto" role="group" aria-label="Kind">
            <button type="button" aria-pressed={kind === "all"} onClick={() => setKind("all")} className={chip(kind === "all")}>
              Every kind
            </button>
            {(Object.keys(SHARE_KIND_LABEL) as ShareKind[]).map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={chip(kind === k)}>
                {SHARE_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {shares.isLoading ? <Skeleton className="h-40" /> : null}
      {shares.isError ? <ErrorState error={shares.error} onRetry={() => void shares.refetch()} /> : null}
      {shares.data && !all.length ? (
        <EmptyState icon={Share2} title="Nothing shared yet" body="Members see an empty dashboard until you share something." action={<Button icon={Share2} onClick={() => setOpen(true)}>Share something</Button>} />
      ) : null}
      {all.length && !list.length ? <p className="py-6 text-center text-sm text-fg-muted">No shares match these filters.</p> : null}

      {everyone.length ? (
        <Section title="Every member" description={`${everyone.length} item${everyone.length === 1 ? "" : "s"}`}>
          <List label="Shared with every member">{everyone.map((s) => lineFor(s))}</List>
        </Section>
      ) : null}
      {byGroup.length ? (
        <Section title="Groups" description={`${byGroup.length} item${byGroup.length === 1 ? "" : "s"}`}>
          <List label="Shared with groups">{byGroup.map((s) => lineFor(s, groupNames.get(s.groupId!) ?? "Group"))}</List>
        </Section>
      ) : null}
      {personal.length ? (
        <Section title="Specific members" description={`${personal.length} item${personal.length === 1 ? "" : "s"}`}>
          <List label="Shared with specific members">{personal.map((s) => lineFor(s, names.get(s.userId!) ?? "Member"))}</List>
        </Section>
      ) : null}

      <ShareDialog open={open} onOpenChange={setOpen} />
      <EditShareDialog share={editing} onOpenChange={(v) => !v && setEditing(null)} />
      <ConfirmDialog
        open={pending != null}
        onOpenChange={(v) => {
          if (!v) setPending(null);
        }}
        title={`Stop sharing ${pending?.label || pending?.ref || ""}?`}
        body="Members lose access to it, and to the classes they reached through it, right away."
        confirmLabel="Unshare"
        busy={unshare.isPending}
        onConfirm={() => {
          if (pending) unshare.mutate(pending.id);
        }}
      />
    </div>
  );
}
