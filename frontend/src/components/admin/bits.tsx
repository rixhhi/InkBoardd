/**
 * Small building blocks shared by the admin and member dashboards:
 * a stat tile, a day-bar chart, and an activity feed.
 */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { BookOpen, CirclePlay, GraduationCap, KeyRound, LogIn, Radio, Settings2, ShieldCheck, UserRound, Users } from "lucide-react";
import { Surface } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fmtAgo, fmtMinutes } from "@/lib/session";

export type ActivityItem = {
  id: number;
  userId: number;
  at: string;
  kind: string;
  ref: string;
  label: string;
  path: string;
  seconds: number;
  user?: { name: string; email: string; role: string } | null;
};

export function StatTile({ label, value, hint, icon: Icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon }) {
  return (
    <Surface className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold tracking-[0.12em] text-fg-muted uppercase">{label}</p>
        {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0 text-fg-faint" /> : null}
      </div>
      <p className="mt-2 font-serif text-3xl text-fg tabular-nums">{value}</p>
      {hint ? <p className="mt-1 truncate text-xs text-fg-muted">{hint}</p> : null}
    </Surface>
  );
}

/** Minutes per day as bars. A text table sits behind it for screen readers. */
export function DayBars({ days, label }: { days: { day: string; seconds: number }[]; label: string }) {
  const max = Math.max(60, ...days.map((d) => d.seconds));
  const total = days.reduce((n, d) => n + d.seconds, 0);
  return (
    <figure className="min-w-0">
      <figcaption className="mb-3 flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-fg">{label}</span>
        <span className="text-fg-muted tabular-nums">{fmtMinutes(total)} total</span>
      </figcaption>
      <div aria-hidden="true" className="flex h-32 items-end gap-1">
        {days.map((d) => {
          const h = Math.round((d.seconds / max) * 100);
          return (
            <div key={d.day} className="group/bar flex h-full min-w-0 flex-1 flex-col justify-end" title={`${d.day}: ${fmtMinutes(d.seconds)}`}>
              <div className={cn("w-full rounded-t-sm transition-colors", d.seconds ? "bg-accent group-hover/bar:brightness-110" : "bg-line")} style={{ height: `${Math.max(d.seconds ? 4 : 2, h)}%` }} />
            </div>
          );
        })}
      </div>
      <div aria-hidden="true" className="mt-1 flex justify-between text-[10px] text-fg-faint tabular-nums">
        <span>{days[0]?.day.slice(5)}</span>
        <span>{days[days.length - 1]?.day.slice(5)}</span>
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Minutes</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <td>{d.day}</td>
              <td>{Math.round(d.seconds / 60)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

const KIND: Record<string, { icon: LucideIcon; verb: string }> = {
  watch: { icon: CirclePlay, verb: "Watched" },
  lesson: { icon: CirclePlay, verb: "Opened class" },
  course: { icon: BookOpen, verb: "Opened course" },
  batch: { icon: Users, verb: "Opened batch" },
  exam: { icon: GraduationCap, verb: "Opened exam" },
  teacher: { icon: UserRound, verb: "Opened teacher" },
  login: { icon: LogIn, verb: "Signed in" },
  password: { icon: KeyRound, verb: "Changed password" },
  admin: { icon: Settings2, verb: "Admin" },
  setup: { icon: ShieldCheck, verb: "Set up InkBoard" },
  page: { icon: Radio, verb: "Visited" },
};

function targetOf(a: ActivityItem): { to: string; params?: Record<string, string>; search?: Record<string, string> } | null {
  if (!a.ref) return null;
  switch (a.kind) {
    case "watch":
    case "lesson":
      return { to: "/play/$lessonId", params: { lessonId: a.ref }, search: a.label ? { title: a.label } : {} };
    case "course":
      return { to: "/course/$courseId", params: { courseId: a.ref } };
    case "batch":
      return { to: "/batch/$batchId", params: { batchId: a.ref } };
    case "exam":
      return { to: "/exam/$goalId", params: { goalId: a.ref } };
    case "teacher":
      return { to: "/teacher/$slug", params: { slug: a.ref } };
    default:
      return null;
  }
}

export function ActivityFeed({ items, showUser = false, empty = "Nothing yet." }: { items: ActivityItem[]; showUser?: boolean; empty?: string }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-fg-muted">{empty}</p>;
  return (
    <ol className="m-0 grid list-none gap-0.5 p-0">
      {items.map((a) => {
        const k = KIND[a.kind] ?? { icon: Radio, verb: a.kind };
        const Icon = k.icon;
        const target = targetOf(a);
        const text = a.kind === "admin" || a.kind === "login" || a.kind === "setup" || a.kind === "password" ? a.label || k.verb : a.label || a.ref;
        return (
          <li key={a.id} className="flex min-h-12 items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-raised/60">
            <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-raised text-fg-muted">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-fg">
                {showUser && a.user ? <span className="font-medium">{a.user.name} · </span> : null}
                <span className="text-fg-muted">{k.verb === text ? "" : `${k.verb} `}</span>
                {target ? (
                  <Link to={target.to} params={target.params as never} search={target.search as never} className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    {text}
                  </Link>
                ) : (
                  <span>{text}</span>
                )}
              </p>
              <p className="text-xs text-fg-faint">
                <time dateTime={a.at} title={new Date(a.at).toLocaleString()}>
                  {fmtAgo(a.at)}
                </time>
                {a.kind === "watch" && a.seconds ? ` · ${fmtMinutes(a.seconds)}` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Generates a readable password that meets the server rule (10+ chars, letters and a digit). */
export function suggestPassword(): string {
  const words = "chalk ink slate quill board notes lamp atlas prism orbit cedar river amber delta".split(" ");
  const buf = new Uint32Array(3);
  crypto.getRandomValues(buf);
  const w = (n: number) => words[n % words.length]!;
  return `${w(buf[0]!)}-${w(buf[1]!)}-${(buf[2]! % 900) + 100}`;
}
