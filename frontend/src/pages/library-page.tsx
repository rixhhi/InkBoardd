import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Bookmark, Clock3, Download, History, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  Badge,
  Button,
  ConfirmDialog,
  Dot,
  EmptyState,
  IconButton,
  List,
  ListRow,
  PageBody,
  PageHeader,
  Ring,
  TabPanel,
  Tabs,
  type TabDef,
} from "@/components/ui";
import { continuePick, readFavourites, readPlaces, removeFavourite, subscribeFavourites } from "@inkboard/shared/favourites";
import { readLater, removeLater } from "@inkboard/shared/library";
import { clearHistory, readHistory, removeEntry, subscribeHistory } from "@inkboard/shared/watch-history";
import { useCatalogRoot } from "@/lib/session";

export type LibraryTab = "saved" | "later" | "downloads" | "history";

const TABS: readonly TabDef[] = [
  { id: "saved", label: "Saved courses", icon: Bookmark },
  { id: "later", label: "Watch later", icon: Clock3 },
  { id: "downloads", label: "Downloaded", icon: Download },
  { id: "history", label: "History", icon: History },
];

function clock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

function ago(at: number) {
  const d = Date.now() - at;
  const m = Math.round(d / 60_000);
  if (m < 60) return `${Math.max(1, m)} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

function useTick(subscribe: (fn: () => void) => () => void) {
  const [, setTick] = useState(0);
  useEffect(() => subscribe(() => setTick((n) => n + 1)), [subscribe]);
}

/* ---------------- Saved courses ---------------- */

function SavedCourses() {
  const root = useCatalogRoot();
  useTick(subscribeFavourites);
  const courses = readFavourites();
  const places = readPlaces();
  const [dropId, setDropId] = useState<string | null>(null);
  const dropping = courses.find((c) => c.courseId === dropId);
  if (!courses.length) {
    return (
      <EmptyState
        icon={Bookmark}
        title="No saved courses"
        body="Open a course and press Save to keep it here with your place in each class."
        action={
          <Button variant="secondary" asChild>
            <Link to={root.to}>{root.to === "/" ? "Go to your dashboard" : "Browse exams"}</Link>
          </Button>
        }
      />
    );
  }
  return (
    <>
      <List label="Saved courses">
        {courses.map((course) => {
          const mine = places.filter((p) => p.courseId === course.courseId);
          const pick = continuePick(
            mine.map((p) => ({ id: p.lessonId, title: p.title || "Class", duration: p.duration, playable: true })),
            mine,
          );
          const latest = mine[0];
          const pct = latest && latest.duration > 0 ? Math.round((latest.t / latest.duration) * 100) : 0;
          return (
            <ListRow
              key={course.courseId}
              leading={<Ring value={pct} label={`${pct}% of last class watched`} />}
              title={
                <Link to="/favourites/$courseId" params={{ courseId: course.courseId }} className="hover:underline">
                  {course.title}
                </Link>
              }
              meta={
                <>
                  <span>{course.teacherName || (course.teacher ? `@${course.teacher}` : "Course")}</span>
                  {latest ? (
                    <>
                      <Dot />
                      <span>last at {clock(latest.t)}</span>
                    </>
                  ) : null}
                  {course.chaptersDone.length ? (
                    <>
                      <Dot />
                      <span>{course.chaptersDone.length} chapters done</span>
                    </>
                  ) : null}
                </>
              }
              trailing={
                <>
                  {pick ? (
                    <Button size="sm" variant="secondary" asChild>
                      <Link to="/play/$lessonId" params={{ lessonId: pick.lessonId }} search={{ course: course.courseId, teacher: course.teacher }}>
                        Continue
                      </Link>
                    </Button>
                  ) : null}
                  <IconButton label={`Remove ${course.title} from saved`} icon={Trash2} size="sm" onClick={() => setDropId(course.courseId)} />
                </>
              }
            />
          );
        })}
      </List>
      <ConfirmDialog
        open={Boolean(dropping)}
        onOpenChange={(o) => !o && setDropId(null)}
        title="Remove this course?"
        body={dropping ? `${dropping.title} leaves your saved list. Your watch positions stay.` : undefined}
        confirmLabel="Remove"
        onConfirm={() => {
          if (dropId) removeFavourite(dropId);
          setDropId(null);
        }}
      />
    </>
  );
}

/* ---------------- Watch later ---------------- */

function WatchLaterList() {
  const [, setTick] = useState(0);
  const items = readLater();
  if (!items.length) {
    return <EmptyState icon={Clock3} title="Nothing queued" body="Press L on a class, or use Later on a course row, to queue it here." />;
  }
  return (
    <List label="Watch later">
      {items.map((it) => (
        <ListRow
          key={it.lessonId}
          title={
            <Link to="/play/$lessonId" params={{ lessonId: it.lessonId }} search={{ title: it.title, teacher: it.teacher, course: it.course }} className="hover:underline">
              {it.title}
            </Link>
          }
          meta={
            <>
              {it.teacher ? <span>{it.teacher}</span> : null}
              <Dot />
              <span>added {ago(it.at)}</span>
            </>
          }
          trailing={
            <IconButton
              label={`Remove ${it.title} from watch later`}
              icon={Trash2}
              size="sm"
              onClick={() => {
                removeLater(it.lessonId);
                setTick((n) => n + 1);
              }}
            />
          }
        />
      ))}
    </List>
  );
}

/* ---------------- Downloads ---------------- */

function Downloads() {
  return (
    <EmptyState
      icon={Download}
      title="Saved for offline"
      body="Classes you saved to this device open in the offline player, which also works with no connection."
      action={
        <Button variant="secondary" asChild>
          <Link to="/offline">Open offline library</Link>
        </Button>
      }
    />
  );
}

/* ---------------- History ---------------- */

function HistoryList() {
  useTick(subscribeHistory);
  const [confirm, setConfirm] = useState(false);
  const entries = readHistory();
  if (!entries.length) {
    return <EmptyState icon={History} title="No history yet" body="Classes you watch show up here with where you stopped." />;
  }
  return (
    <>
      <div className="mb-2 flex justify-end">
        <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirm(true)}>
          Clear history
        </Button>
      </div>
      <List label="Watch history">
        {entries.map((e) => {
          const pct = e.duration > 0 ? Math.round((e.t / e.duration) * 100) : 0;
          return (
            <ListRow
              key={e.lessonId}
              leading={<Ring value={pct} label={`${pct}% watched`} />}
              title={
                <Link to="/play/$lessonId" params={{ lessonId: e.lessonId }} search={{ title: e.title, teacher: e.teacher, course: e.course }} className="hover:underline">
                  {e.title}
                </Link>
              }
              badge={pct >= 95 ? <Badge tone="ok">Done</Badge> : undefined}
              meta={
                <>
                  {e.teacher ? <span>{e.teacher}</span> : null}
                  <Dot />
                  <span>{clock(e.t)} of {clock(e.duration)}</span>
                  <Dot />
                  <span>{ago(e.at)}</span>
                </>
              }
              trailing={<IconButton label={`Remove ${e.title} from history`} icon={Trash2} size="sm" onClick={() => removeEntry(e.lessonId)} />}
            />
          );
        })}
      </List>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Clear watch history?"
        body="Continue-watching cards and progress rings reset. Saved courses are not affected."
        confirmLabel="Clear"
        onConfirm={() => {
          clearHistory();
          setConfirm(false);
        }}
      />
    </>
  );
}

/* ---------------- Page ---------------- */

export default function LibraryPage() {
  const search = useSearch({ from: "/library" }) as { tab?: LibraryTab };
  const nav = useNavigate();
  const tab: LibraryTab = search.tab ?? "saved";
  const counts = useMemo(() => ({ saved: readFavourites().length, later: readLater().length, history: readHistory().length }), [tab]);
  const tabs = TABS.map((t) => ({ ...t, count: t.id === "downloads" ? undefined : counts[t.id as keyof typeof counts] || undefined }));
  return (
    <AppShell>
      <PageHeader
        eyebrow="Library"
        title="Your library"
        subline="Everything here lives in this browser. Nothing is sent anywhere."
        tabs={<Tabs panels tabs={tabs} value={tab} label="Library sections" onChange={(id) => void nav({ to: "/library", search: { tab: id as LibraryTab } })} />}
      />
      <PageBody>
        <TabPanel id="saved" active={tab === "saved"}>
          <SavedCourses />
        </TabPanel>
        <TabPanel id="later" active={tab === "later"}>
          <WatchLaterList />
        </TabPanel>
        <TabPanel id="downloads" active={tab === "downloads"}>
          <Downloads />
        </TabPanel>
        <TabPanel id="history" active={tab === "history"}>
          <HistoryList />
        </TabPanel>
      </PageBody>
    </AppShell>
  );
}
