/**
 * Three cards a new member sees on Home the first time: what "Shared with you"
 * is, how to open a class, and that the Planner exists. Dismissed once per
 * account (the key syncs, so a second device does not show it again). Admins
 * never see it — they have the admin banner instead.
 */
import { Link } from "@tanstack/react-router";
import { Bell, CalendarDays, Play, Share2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, IconButton, Surface } from "@/components/ui";
import { useAccess } from "@/lib/session";

export const FIRST_RUN_KEY = "inkboard.first-run.v1";

/** True when this account has not dismissed the tour. SSR-safe (false until mounted). */
export function readFirstRunPending(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(FIRST_RUN_KEY) == null;
  } catch {
    return false;
  }
}

export function dismissFirstRun() {
  try {
    localStorage.setItem(FIRST_RUN_KEY, JSON.stringify({ dismissedAt: new Date().toISOString() }));
  } catch {
    /* private mode: it just shows again next time */
  }
}

const STEPS = [
  {
    icon: Share2,
    title: "Shared with you",
    body: "Your admin picks exams, teachers and courses for you. They appear on this page the moment they are shared — nothing to search for.",
  },
  {
    icon: Play,
    title: "Open a class, keep your place",
    body: "The board and the ink replay in sync. Close it any time; \u201cContinue\u201d brings you back to the same minute.",
  },
  {
    icon: CalendarDays,
    title: "Let the Planner lay it out",
    body: "Pick the courses and your exam date; it builds a day-by-day plan and shows which lessons you are starting to forget.",
    to: "/planner/today",
    cta: "Open the Planner",
  },
  {
    icon: Bell,
    title: "The bell tells you what changed",
    body: "New shares, a password set by your admin, anything you should know \u2014 top right, no email needed.",
  },
] as const;

export function FirstRun() {
  const access = useAccess();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!access.user || access.admin) return;
    setShow(readFirstRunPending());
  }, [access.user, access.admin]);
  if (!show) return null;
  const close = () => {
    dismissFirstRun();
    setShow(false);
  };
  return (
    <Surface className="enter relative p-4 sm:p-5" aria-labelledby="first-run-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-accent uppercase">Welcome</p>
          <h2 id="first-run-title" className="mt-1 font-serif text-xl text-fg">
            Four things worth knowing
          </h2>
        </div>
        <IconButton label="Dismiss the welcome" icon={X} size="sm" onClick={close} />
      </div>
      <ol className="stagger mt-4 grid gap-3 sm:grid-cols-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <li key={s.title} className="flex gap-3 rounded-md bg-surface-raised/60 p-3">
              <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">
                  <span className="sr-only">Step {i + 1}: </span>
                  {s.title}
                </p>
                <p className="mt-0.5 text-sm leading-snug text-fg-muted">{s.body}</p>
                {"to" in s ? (
                  <Button variant="ghost" size="sm" asChild className="-ml-2 mt-1">
                    <Link to={s.to} onClick={close}>
                      {s.cta}
                    </Link>
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" size="sm" onClick={close}>
          Got it
        </Button>
      </div>
    </Surface>
  );
}
