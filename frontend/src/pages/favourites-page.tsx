import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/planner/confirm-dialog";
import { useAccess } from "@/lib/session";
import {
  continuePick,
  readFavourites,
  readPlaces,
  removeFavourite,
  subscribeFavourites,
} from "@inkboard/shared/favourites";

function clock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function FavouritesPage() {
  const access = useAccess();
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeFavourites(() => setTick((n) => n + 1)), []);
  void tick;
  const courses = readFavourites();
  const places = readPlaces();
  const [dropId, setDropId] = useState<string | null>(null);
  const dropping = courses.find((course) => course.courseId === dropId);

  return (
    <AppShell>
      <div className="board-pad">
        <Link to="/" className="ink-underline text-sm text-fg-muted">
          ← Wall
        </Link>
        <h1 className="mt-4 text-2xl font-medium">Saved courses</h1>
        <p className="mt-2 max-w-[62ch] text-sm text-fg-muted">
          Courses you want to finish. Open one to see every lecture, where you stopped, and how the chapter is going. This stays on this device.
        </p>
        {courses.length === 0 ? (
          <p className="mt-8 text-sm text-fg-muted">
            Nothing saved yet. Open a course and choose <span className="text-fg">Favourite</span>
            {access.perms.search ? (
              <>
                , or{" "}
                <Link to="/search" search={{ q: "" }} className="ink-underline">
                  search classes and teachers
                </Link>
              </>
            ) : null}
            .
          </p>
        ) : (
          <ul className="mt-8 divide-y divide-line border-y border-line">
            {courses.map((course) => {
              const mine = places.filter((p) => p.courseId === course.courseId);
              const pick = continuePick(
                mine.map((p) => ({ id: p.lessonId, title: p.title || "Class", duration: p.duration, playable: true })),
                mine,
              );
              const latest = mine[0];
              return (
                <li key={course.courseId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
                  <Link to="/favourites/$courseId" params={{ courseId: course.courseId }} className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{course.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-fg-muted">
                      {course.teacherName || (course.teacher ? `@${course.teacher}` : "Course")}
                      {latest ? ` · last at ${clock(latest.t)}` : ""}
                    </span>
                  </Link>
                  {pick ? (
                    <Link
                      to="/play/$lessonId"
                      params={{ lessonId: pick.lessonId }}
                      search={{
                        title: pick.title,
                        teacher: course.teacher,
                        course: course.courseId,
                        t: pick.t > 8 && !pick.finished ? pick.t : undefined,
                      }}
                      className="text-sm text-accent"
                    >
                      {pick.finished ? "Watch again" : "Continue"}
                      {pick.t > 8 && !pick.finished ? ` · ${clock(pick.t)}` : ""}
                    </Link>
                  ) : (
                    <Link to="/favourites/$courseId" params={{ courseId: course.courseId }} className="text-sm text-accent">
                      Open
                    </Link>
                  )}
                  <button type="button" className="ink-underline text-xs text-fg-muted" onClick={() => setDropId(course.courseId)}>
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <ConfirmDialog
          open={dropId != null}
          title="Remove this course?"
          body={dropping ? `“${dropping.title}” leaves this device. You can favourite it again later.` : "It leaves this device."}
          confirmLabel="Remove"
          onConfirm={() => {
            if (dropId) removeFavourite(dropId);
            setDropId(null);
          }}
          onClose={() => setDropId(null)}
        />
      </div>
    </AppShell>
  );
}
