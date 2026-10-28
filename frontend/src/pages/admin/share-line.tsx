import { Link } from "@tanstack/react-router";
import { Pencil, Pin, Trash2 } from "lucide-react";
import { Badge, IconButton, ListRow } from "@/components/ui";
import { SHARE_KIND_LABEL, fmtAgo, shareHref, type Share } from "@/lib/session";
import { fmtDay, shareWindow } from "@/components/admin/api";

/** One share in an admin list: kind, name, who, window, pin, edit, unshare. */
export function ShareLine({ s, who, onEdit, onRemove }: { s: Share; who?: string; onEdit?: () => void; onRemove: () => void }) {
  const href = shareHref(s);
  const win = shareWindow(s);
  return (
    <ListRow
      density="compact"
      struck={win === "expired"}
      leading={
        <Badge tone="accent" className="w-16 justify-center">
          {SHARE_KIND_LABEL[s.kind]}
        </Badge>
      }
      title={
        <span className="flex min-w-0 items-center gap-1.5">
          {s.pinned ? <Pin aria-label="Pinned" className="size-3.5 shrink-0 text-accent" /> : null}
          <Link to={href.to} params={href.params as never} search={href.search as never} className="truncate hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            {s.label || s.ref}
          </Link>
        </span>
      }
      badge={win === "scheduled" ? <Badge tone="info">From {fmtDay(s.startsAt)}</Badge> : win === "expired" ? <Badge tone="neutral">Ended</Badge> : s.expiresAt ? <Badge tone="warn">Until {fmtDay(s.expiresAt)}</Badge> : undefined}
      meta={
        <>
          {who ? <span>{who}</span> : null}
          {s.note ? <span className="truncate">· {s.note}</span> : null}
          <span>· {fmtAgo(s.createdAt)}</span>
        </>
      }
      trailing={
        <span className="flex items-center gap-0.5">
          {onEdit ? <IconButton label={`Edit ${s.label || s.ref}`} icon={Pencil} size="sm" onClick={onEdit} /> : null}
          <IconButton label={`Stop sharing ${s.label || s.ref}`} icon={Trash2} size="sm" onClick={onRemove} />
        </span>
      }
    />
  );
}
