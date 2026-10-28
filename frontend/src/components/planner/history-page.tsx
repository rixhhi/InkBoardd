import { Link } from "@tanstack/react-router";
import { useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { StrikeTitle } from "@/components/folio/shelf.tsx";
import { LogStudyDialog } from "@/components/planner/log-study.tsx";
import { EmptyPanel, KitSelect, SegmentedControl } from "@/components/ui/planner/kit.tsx";
import { Button } from "@/components/ui";
import { ChevronLeft, ChevronRight, Download, Plus } from "lucide-react";
import { historyDayLine } from "@inkboard/shared/planner/day-board";
import { formatDay } from "@inkboard/shared/planner/dates";
import {
  allHistoryRows,
  dailyTotals,
  defaultHistoryFilter,
  filterHistory,
  historyCsvExport,
  rangeBounds,
  windowedRows,
  type HistoryFilter,
  type HistoryRow,
} from "@inkboard/shared/planner/history";
import { deleteSession, getServerSessions, liveSessions, patchSession, restoreSession, subscribeSessions } from "@inkboard/shared/planner/sessions";
import { setTaskStatus } from "@inkboard/shared/planner/storage";
import { usePlanner } from "@inkboard/shared/planner/use-planner";

const PAGE = 80;

function groupByDay(rows: HistoryRow[]) {
  const map = new Map<string, HistoryRow[]>();
  for (const r of rows) {
    const list = map.get(r.date) ?? [];
    list.push(r);
    map.set(r.date, list);
  }
  return [...map.entries()];
}

export function HistoryPage({ openLog = false }: { openLog?: boolean }) {
  const { plan } = usePlanner();
  const sessions = useSyncExternalStore(subscribeSessions, liveSessions, getServerSessions);
  const [filter, setFilter] = useState<HistoryFilter>(() => defaultHistoryFilter());
  const [page, setPage] = useState(0);
  const [logOpen, setLogOpen] = useState(() => openLog);
  const rows = useMemo(() => {
    const bounds = rangeBounds(filter.range, undefined, { from: filter.from, to: filter.to });
    return filterHistory(allHistoryRows(plan, sessions), { ...filter, ...bounds });
  }, [plan, sessions, filter]);
  const totals = dailyTotals(rows);
  const totalMap = Object.fromEntries(totals.map((t) => [t.date, t]));
  const windowed = windowedRows(rows, page, PAGE);
  const minutes = rows.reduce((n, r) => n + r.durationMin, 0);
  const groups = groupByDay(windowed.slice);

  function exportCsv() {
    const { csv, filename } = historyCsvExport(rows, filter);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-[72ch] py-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-fg-faint uppercase">Study log</p>
          <h1 className="font-serif text-2xl font-semibold sm:text-3xl">History</h1>
          <p className="mt-2 text-sm tabular text-fg-muted">
            {rows.length} in this range · {minutes} min
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={Plus} onClick={() => setLogOpen(true)}>
            Log a session
          </Button>
          <Button size="sm" variant="secondary" icon={Download} onClick={exportCsv}>
            Export the ledger
          </Button>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <SegmentedControl
          ariaLabel="Range"
          value={filter.range}
          onChange={(v) => {
            setFilter((f) => ({ ...f, range: v as HistoryFilter["range"], ...rangeBounds(v as HistoryFilter["range"]) }));
            setPage(0);
          }}
          options={[
            { id: "today", label: "Today" },
            { id: "7d", label: "7d" },
            { id: "30d", label: "30d" },
            { id: "90d", label: "90d" },
          ]}
        />
        <input
          value={filter.query}
          onChange={(e) => {
            setFilter((f) => ({ ...f, query: e.target.value }));
            setPage(0);
          }}
          placeholder="Lecture or notes"
          aria-label="Search lecture or notes"
          className="h-11 min-w-40 flex-1 border-0 border-b border-line bg-transparent px-0 text-sm"
        />
        <input
          value={filter.subject}
          onChange={(e) => {
            setFilter((f) => ({ ...f, subject: e.target.value }));
            setPage(0);
          }}
          placeholder="Subject"
          aria-label="Filter by subject"
          className="h-11 w-28 border-0 border-b border-line bg-transparent px-0 text-sm"
        />
        <input
          value={filter.teacher}
          onChange={(e) => {
            setFilter((f) => ({ ...f, teacher: e.target.value }));
            setPage(0);
          }}
          placeholder="Teacher"
          aria-label="Filter by teacher"
          className="h-11 w-28 border-0 border-b border-line bg-transparent px-0 text-sm"
        />
        <KitSelect
          value={filter.source}
          onChange={(v) => setFilter((f) => ({ ...f, source: v as HistoryFilter["source"] }))}
          ariaLabel="Source"
          options={[
            { id: "", label: "All sources" },
            { id: "watch", label: "Watch" },
            { id: "manual", label: "Manual" },
            { id: "focus", label: "Focus" },
          ]}
        />
      </div>

      {windowed.slice.length === 0 ? (
        <div className="mt-8">
          <EmptyPanel
            title="Nothing in this ledger."
            body="Log a session or watch a class. Export only includes what this filter shows."
            action={
              <Button size="sm" onClick={() => setLogOpen(true)}>
                Log a session
              </Button>
            }
          />
        </div>
      ) : (
        <ol className="mt-8">
          {groups.map(([day, list]) => (
            <li key={day} className="border-t border-line py-5">
              <Link to="/planner" search={{ day }} className="block">
                <p className="font-serif text-base font-semibold">
                  {historyDayLine(
                    formatDay(day, "EEE d"),
                    totalMap[day]?.minutes ?? 0,
                    list.filter((r) => r.completed).length,
                  )}
                </p>
                <p className="text-xs text-fg-muted">{formatDay(day, "EEEE d MMM")}</p>
              </Link>
              <ul className="mt-3">
                {list.map((r) => (
                  <li key={r.id} className="chalk-row">
                    <div className="chalk-line">
                      <span className="min-w-0 flex-1">
                        <StrikeTitle done={r.completed}>{r.lecture || r.subject || "Study"}</StrikeTitle>
                        <span className="chalk-meta">
                          <span className="tabular">{r.durationMin}m</span>
                          {r.teacher ? ` · ${r.teacher}` : ""}
                          {r.subject ? ` · ${r.subject}` : ""}
                          {r.source !== "watch" ? ` · ${r.source}` : ""}
                        </span>
                        {r.notes ? <span className="chalk-meta">{r.notes}</span> : null}
                      </span>
                      <span className="chalk-actions">
                        {r.lessonId ? (
                          <Link
                            to="/play/$lessonId"
                            params={{ lessonId: r.lessonId }}
                            search={{ title: r.lecture, teacher: r.teacher }}
                            className="h-11 px-2 text-xs text-accent"
                          >
                            Open
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          className="h-11 px-2 text-xs text-fg-muted"
                          onClick={() => {
                            const note = window.prompt("Notes", r.notes);
                            if (note == null) return;
                            patchSession(r.id, { notes: note });
                          }}
                        >
                          Notes
                        </button>
                        <button
                          type="button"
                          className="h-11 px-2 text-xs text-danger"
                          onClick={() => {
                            deleteSession(r.id);
                            toast.success("Session removed", {
                              action: {
                                label: "Undo",
                                onClick: () => {
                                  restoreSession(r);
                                  if (r.taskId && plan) setTaskStatus(plan.id, r.taskId, "pending");
                                },
                              },
                            });
                          }}
                        >
                          Delete
                        </button>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
      {windowed.pages > 1 ? (
        <nav aria-label="Pages" className="mt-4 flex items-center gap-2">
          <Button size="sm" variant="secondary" icon={ChevronLeft} disabled={windowed.page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            Previous
          </Button>
          <span className="text-xs tabular text-fg-muted">
            {windowed.page + 1} / {windowed.pages}
          </span>
          <Button size="sm" variant="secondary" iconEnd={ChevronRight} disabled={windowed.page + 1 >= windowed.pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </nav>
      ) : null}
      <LogStudyDialog open={logOpen} onClose={() => setLogOpen(false)} />
    </div>
  );
}
