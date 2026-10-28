import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Laptop, LogOut, Smartphone } from "lucide-react";
import { Badge, Button, Dialog, ErrorState, Skeleton, toast } from "@/components/ui";
import { apiJson, describeError } from "@/lib/api-client";
import { fmtAgo, sendJson } from "@/lib/session";

type SessionInfo = { id: string; createdAt: string; lastUsedAt: string; ip: string; userAgent: string; current: boolean };

const KEY = ["auth", "sessions"] as const;

/** "Chrome on Android" from a user-agent string. Good enough for a device list. */
export function deviceName(ua: string): { name: string; phone: boolean } {
  const s = ua || "";
  const browser = /Edg\//.test(s) ? "Edge" : /OPR\//.test(s) ? "Opera" : /Firefox\//.test(s) ? "Firefox" : /Chrome\//.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : "Browser";
  const os = /Android/.test(s) ? "Android" : /iPhone|iPad/.test(s) ? "iOS" : /Windows/.test(s) ? "Windows" : /Mac OS X/.test(s) ? "macOS" : /Linux/.test(s) ? "Linux" : "";
  return { name: os ? `${browser} on ${os}` : browser, phone: /Android|iPhone|iPad|Mobile/.test(s) };
}

/** Where you're signed in, with sign-out per device and for all other devices. */
export function SessionsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: KEY,
    queryFn: () => apiJson<{ sessions: SessionInfo[] }>("/api/me/sessions", { credentials: "same-origin" }),
    enabled: open,
    staleTime: 0,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => sendJson(`/api/me/sessions/${id}`, "DELETE"),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
    onError: (err) => toast.error(describeError(err).body),
  });
  const others = useMutation({
    mutationFn: () => sendJson("/api/me/sessions/revoke-others", "POST"),
    onSuccess: () => {
      toast.success("Signed out of every other device.");
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (err) => toast.error(describeError(err).body),
  });
  const sessions = list.data?.sessions ?? [];
  const hasOthers = sessions.some((s) => !s.current);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Signed-in devices"
      description="Sign out anywhere you don't recognise. Sessions last 30 days."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="danger" icon={LogOut} disabled={!hasOthers} loading={others.isPending} onClick={() => others.mutate()}>
            Sign out other devices
          </Button>
        </>
      }
    >
      {list.isPending ? (
        <div className="grid gap-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <ul className="grid gap-2" aria-label="Devices">
          {sessions.map((s) => {
            const d = deviceName(s.userAgent);
            const Icon = d.phone ? Smartphone : Laptop;
            return (
              <li key={s.id} className="flex items-center gap-3 rounded-md bg-surface-raised/50 px-3 py-2.5">
                <Icon aria-hidden="true" className="size-5 shrink-0 text-fg-muted" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-medium text-fg">
                    {d.name}
                    {s.current ? <Badge tone="accent">This device</Badge> : null}
                  </p>
                  <p className="truncate text-xs text-fg-muted">
                    Active {fmtAgo(s.lastUsedAt)}
                    {s.ip ? ` · ${s.ip}` : ""}
                  </p>
                </div>
                {!s.current ? (
                  <Button size="sm" variant="ghost" loading={revoke.isPending && revoke.variables === s.id} onClick={() => revoke.mutate(s.id)}>
                    Sign out
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
