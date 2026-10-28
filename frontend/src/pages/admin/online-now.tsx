import { Link } from "@tanstack/react-router";
import { Avatar } from "@/components/ui";
import { fmtAgo } from "@/lib/session";
import type { Online } from "@/components/admin/api";

const VERB: Record<string, string> = { watch: "Watching", lesson: "Opened", course: "On course", batch: "On batch", exam: "On exam", teacher: "On teacher", login: "Signed in", page: "Browsing" };

/** Members with activity in the last 5 minutes. */
export function OnlineNow({ items }: { items: Online[] }) {
  if (!items.length) return <p className="py-4 text-sm text-fg-muted">Nobody is studying right now.</p>;
  return (
    <ul className="m-0 grid list-none gap-1 p-0" aria-label="Online now">
      {items.map((o) => {
        const name = o.name ?? o.user?.name ?? "Member";
        return (
          <li key={o.userId} className="flex min-h-12 items-center gap-3 rounded-md px-2 py-1.5 hover:bg-surface-raised/60">
            <span className="relative">
              <Avatar name={name} size="sm" decorative />
              <span aria-hidden="true" className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-ok ring-2 ring-surface" />
            </span>
            <div className="min-w-0 flex-1">
              <Link to="/admin" search={{ member: o.userId }} className="block truncate text-sm font-medium text-fg hover:underline">
                {name}
              </Link>
              <p className="truncate text-xs text-fg-muted">
                {VERB[o.kind] ?? "Active"} {o.label ? `· ${o.label}` : ""}
              </p>
            </div>
            <time dateTime={o.at} className="shrink-0 text-xs text-fg-faint">
              {fmtAgo(o.at)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}
