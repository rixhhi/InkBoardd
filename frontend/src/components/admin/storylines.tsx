/**
 * Activity as storylines. A flat log ("Riya opened X", "Riya watched Y",
 * "Riya opened Z") becomes one line per member per sitting: who, when they
 * started, what they did in order, and whether they are still here. Pure
 * grouping lives in `groupStorylines` so it can be unit-tested.
 */
import { Link } from "@tanstack/react-router";
import { signInLabel } from "@inkboard/shared/device";
import { Avatar } from "@/components/ui";
import { fmtAgo, fmtMinutes } from "@/lib/session";
import type { ActivityItem } from "./bits";

export type Storyline = {
  userId: number;
  name: string;
  /** Newest event first within the sitting. */
  events: ActivityItem[];
  startedAt: string;
  lastAt: string;
  watchSeconds: number;
  online: boolean;
};

/** A new sitting starts after this much silence from the same member. */
export const SITTING_GAP_MS = 20 * 60 * 1000;
const ONLINE_MS = 5 * 60 * 1000;

/** Group a newest-first activity list into per-member sittings, newest sitting first. */
export function groupStorylines(items: ActivityItem[], now: number = Date.now()): Storyline[] {
  const out: Storyline[] = [];
  const open = new Map<number, Storyline>();
  for (const a of items) {
    const t = Date.parse(a.at);
    const cur = open.get(a.userId);
    if (cur && Date.parse(cur.startedAt) - t <= SITTING_GAP_MS) {
      cur.events.push(a);
      cur.startedAt = a.at;
      cur.watchSeconds += a.kind === "watch" ? a.seconds : 0;
      continue;
    }
    const s: Storyline = {
      userId: a.userId,
      name: a.user?.name ?? `Member ${a.userId}`,
      events: [a],
      startedAt: a.at,
      lastAt: a.at,
      watchSeconds: a.kind === "watch" ? a.seconds : 0,
      online: now - t <= ONLINE_MS,
    };
    open.set(a.userId, s);
    out.push(s);
  }
  return out;
}

const VERB: Record<string, string> = {
  watch: "watched",
  lesson: "opened",
  course: "opened course",
  batch: "opened batch",
  exam: "opened exam",
  teacher: "opened teacher",
  login: "signed in",
  page: "browsed",
  password: "changed password",
};

function describe(a: ActivityItem): string {
  if (a.kind === "login") {
    const d = signInLabel(a.label);
    return d ? `signed in on ${d}` : "signed in";
  }
  const verb = VERB[a.kind] ?? a.kind;
  const what = a.label || a.ref;
  if (a.kind === "watch") return what ? `watched ${what}${a.seconds ? ` for ${fmtMinutes(a.seconds)}` : ""}` : "watched";
  return what ? `${verb} ${what}` : verb;
}

/** Collapse runs: three "watched X" ticks for the same lesson become one with the minutes summed. */
function collapse(events: ActivityItem[]): ActivityItem[] {
  const out: ActivityItem[] = [];
  for (const e of [...events].reverse()) {
    const prev = out[out.length - 1];
    if (prev && prev.kind === e.kind && prev.ref === e.ref && prev.kind === "watch") {
      out[out.length - 1] = { ...prev, seconds: prev.seconds + e.seconds, at: e.at };
      continue;
    }
    out.push(e);
  }
  return out;
}

export function Storylines({ items, empty = "No member activity in the last hour." }: { items: ActivityItem[]; empty?: string }) {
  const lines = groupStorylines(items);
  if (!lines.length) return <p className="py-6 text-center text-sm text-fg-muted">{empty}</p>;
  return (
    <ol className="m-0 grid list-none gap-1 p-0">
      {lines.map((s) => {
        const steps = collapse(s.events);
        return (
          <li key={`${s.userId}-${s.startedAt}`} className="story">
            <div className="story-head">
              <span className="relative shrink-0">
                <Avatar name={s.name} size="sm" decorative />
                {s.online ? <span aria-hidden="true" className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-ok ring-2 ring-surface" /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
                  <Link to="/admin" search={{ member: s.userId }} className="truncate font-medium text-fg hover:underline">
                    {s.name}
                  </Link>
                  <span className="text-xs text-fg-faint tabular-nums">
                    {s.online ? <span className="text-ok">online · </span> : null}
                    {fmtAgo(s.startedAt)}
                    {s.watchSeconds ? ` · ${fmtMinutes(s.watchSeconds)} watched` : ""}
                  </span>
                </p>
              </div>
            </div>
            <ol className="story-steps">
              {steps.map((e) => (
                <li key={e.id} className="story-step">
                  <span className="story-dot" aria-hidden="true" data-kind={e.kind} />
                  <span className="min-w-0 truncate text-sm text-fg-muted">{describe(e)}</span>
                  <time dateTime={e.at} className="shrink-0 text-[11px] text-fg-faint tabular-nums">
                    {fmtAgo(e.at)}
                  </time>
                </li>
              ))}
            </ol>
          </li>
        );
      })}
    </ol>
  );
}
