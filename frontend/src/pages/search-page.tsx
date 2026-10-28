import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, History, ListTodo, SearchX, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Avatar, Badge, Button, Chip, EmptyState, ErrorState, List, ListRow, PageBody, PageHeader, SearchInput, Section, Skeleton } from "@/components/ui";
import { EducatorCatalog } from "@/components/educator-catalog";
import { describeError } from "@/lib/api-client";
import { nextSearchQuery } from "@/lib/search-draft";
import { searchHitTarget } from "@/lib/search-keys";
import { COPY } from "@inkboard/shared/copy";
import { useSelectedExam } from "@inkboard/shared/exam-pref";
import { usernameFromQuery, usernameIfNoHits } from "@inkboard/shared/search-query";
import { clearRecents, pushRecent, readRecents, type RecentSearch } from "@inkboard/shared/library";
import { isReplayId, searchEducators } from "@/lib/unacademy";
import { shelfEmptyCopy } from "@inkboard/shared/shelf";
import { lectureHref, searchStudy, type StudyHit } from "@inkboard/shared/local-search";
import { byCatalogScore } from "@inkboard/shared/catalog-rank";
import { readBookmarks } from "@inkboard/shared/planner/bookmarks";
import { usePlannerSnapshot } from "@inkboard/shared/planner/use-planner";
import { useCatalogRoot } from "@/lib/session";

/** Teacher hit. `data-search-hit` is the roving-focus hook for ArrowUp/ArrowDown. */
function TeacherHit({ avatar, name, username, meta, onOpen }: { avatar?: string; name: string; username: string; meta?: string; onOpen?: () => void }) {
  return (
    <ListRow
      leading={<Avatar name={name} src={avatar} size="md" decorative />}
      title={
        <Link
          to="/teacher/$slug"
          params={{ slug: username }}
          data-search-hit
          onClick={() => onOpen?.()}
          className="after:absolute after:inset-0 after:rounded-md hover:underline focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-ring"
        >
          {name}
        </Link>
      }
      meta={
        <>
          <span>@{username}</span>
          {meta ? <span>{meta}</span> : null}
        </>
      }
    />
  );
}

/** A planner task or bookmark on this device that matches the query. */
function LocalHit({ hit }: { hit: StudyHit & { kind: "task" | "bookmark" } }) {
  const Icon = hit.kind === "task" ? ListTodo : Bookmark;
  return (
    <ListRow
      density="compact"
      leading={<Icon aria-hidden="true" className="size-4 text-fg-faint" />}
      title={
        <a
          href={hit.href}
          data-search-hit
          className="after:absolute after:inset-0 after:rounded-md hover:underline focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-ring"
        >
          {hit.title}
        </a>
      }
      badge={<Badge tone="neutral">{hit.kind === "task" ? "Plan" : "Bookmark"}</Badge>}
      meta={
        hit.snippet.match ? (
          <span>
            {hit.snippet.before}
            <mark className="rounded-sm bg-accent-subtle px-0.5 text-fg">{hit.snippet.match}</mark>
            {hit.snippet.after}
          </span>
        ) : undefined
      }
    />
  );
}

export default function SearchPage() {
  const root = useCatalogRoot();
  const { q, topic, sort, tab } = useSearch({ from: "/search" });
  const nav = useNavigate();
  const exam = useSelectedExam();
  const empty = shelfEmptyCopy(q);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(q);
  const directUser = usernameFromQuery(q);
  const planner = usePlannerSnapshot();
  const localHits = useMemo(() => {
    const tasks = planner.plans.flatMap((plan) =>
      plan.deletedAt
        ? []
        : plan.tasks
            .filter((task) => !task.deletedAt)
            .map((task) => ({
              title: task.title,
              text: task.note ?? "",
              href: task.lessonId ? lectureHref(task.lessonId, 0) : "/planner/today",
              kind: "task" as const,
            })),
    );
    const marks = readBookmarks().map((mark) => ({
      title: mark.title,
      text: mark.note,
      href: lectureHref(mark.lessonId, mark.seconds),
      kind: "bookmark" as const,
    }));
    return searchStudy([...tasks, ...marks], q) as (StudyHit & { kind: "task" | "bookmark" })[];
  }, [planner.plans, q]);

  useEffect(() => {
    setDraft(q);
  }, [q]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = nextSearchQuery(draft, q);
      if (next === null) return;
      if (next) pushRecent(next);
      void nav({ to: "/search", search: { q: next, topic: undefined, sort, tab } });
    }, 250);
    return () => window.clearTimeout(handle);
  }, [draft, q, nav, sort, tab]);

  useEffect(() => {
    if (q.trim()) return;
    inputRef.current?.focus();
  }, [q]);

  const lookup = useQuery({
    queryKey: ["seek", q.trim().toLowerCase(), exam?.id ?? ""],
    enabled: q.trim().length >= 2 && !isReplayId(q.trim()) && !directUser,
    queryFn: ({ signal }) => searchEducators({ data: { q: q.trim(), goalId: exam?.id }, signal }),
  });

  const hits = lookup.data?.hits ?? [];
  const fallbackUser = !directUser && !lookup.isLoading && lookup.isFetched ? usernameIfNoHits(q, hits.length) : "";
  const usernameQ = directUser || fallbackUser;
  const blank = !q.trim();

  function go(next: string) {
    const t = next.trim();
    if (t.length < 2) return;
    pushRecent(t);
    void nav({ to: "/search", search: { q: t, topic: undefined, sort, tab } });
  }

  function onResultKeys(e: { key: string; preventDefault: () => void }) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const hits = [...document.querySelectorAll<HTMLElement>("[data-search-hit]")];
    const active = document.activeElement;
    const index = hits.findIndex((el) => el === active);
    const next = searchHitTarget(hits.length, index, e.key);
    if (next === "stay") return;
    e.preventDefault();
    if (next === "field") {
      inputRef.current?.focus();
      return;
    }
    hits[next]?.focus();
  }

  if (usernameQ) {
    return (
      <AppShell>
        <EducatorCatalog
          username={usernameQ}
          topicUid={topic}
          sort={sort ?? "latest"}
          tab={tab ?? "courses"}
          exam={exam}
          onTopic={(uid) => void nav({ to: "/search", search: { q: usernameQ, topic: uid, sort, tab } })}
          onSort={(s) => void nav({ to: "/search", search: { q: usernameQ, topic, sort: s, tab } })}
          onTab={(next) => void nav({ to: "/search", search: { q: usernameQ, topic, sort, tab: next } })}
        />
      </AppShell>
    );
  }

  const resultCount = blank || lookup.isLoading ? null : hits.length + localHits.length;

  const field = (
    <SearchInput
      ref={inputRef}
      autoFocus
      label={COPY.search}
      placeholder={COPY.writeWhere}
      value={draft}
      onChange={setDraft}
      onClear={() => inputRef.current?.focus()}
      resultCount={resultCount}
      className="mt-4 max-w-xl"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          go(draft);
        }
      }}
    />
  );

  return (
    <AppShell>
      <div onKeyDown={onResultKeys}>
        <PageHeader
          compact
          crumbs={[{ label: root.label, to: root.to }, { label: COPY.search }]}
          eyebrow={exam ? exam.name : undefined}
          title={COPY.search}
          subline={blank ? empty.body : undefined}
          tabs={field}
        />
        <PageBody>
          {blank ? (
            <BlankSearch onPick={go} />
          ) : (
            <>
              {localHits.length ? (
                <Section title="On this device" level={2}>
                  <List label="On this device">
                    {localHits.map((hit) => (
                      <LocalHit key={`${hit.kind}:${hit.href}:${hit.title}`} hit={hit} />
                    ))}
                  </List>
                </Section>
              ) : null}

              {lookup.isLoading ? (
                <div role="status" aria-label="Searching the catalog" className="mt-6 grid gap-2">
                  <Skeleton className="h-14" />
                  <Skeleton className="h-14" />
                  <Skeleton className="h-14" />
                </div>
              ) : lookup.isError ? (
                <ErrorState
                  error={lookup.error}
                  title={COPY.searchDidNotLand}
                  body={describeError(lookup.error).body}
                  onRetry={() => void lookup.refetch()}
                  className="mt-6"
                />
              ) : hits.length === 0 ? (
                <EmptyState
                  icon={SearchX}
                  title={empty.title}
                  body={empty.body}
                  className="mt-6"
                  action={
                    <Button variant="ghost" asChild>
                      <Link to={root.to}>{root.back}</Link>
                    </Button>
                  }
                />
              ) : (
                <div id="search-results" className="mt-2">
                  {(() => {
                    const inExam = hits.filter((h) => h.inExam);
                    const outside = hits.filter((h) => !h.inExam);
                    const groups =
                      exam && inExam.length
                        ? [
                            { title: `In ${exam.name}`, items: inExam },
                            ...(outside.length ? [{ title: "Other exams", items: outside }] : []),
                          ]
                        : [{ title: "Teachers", items: hits }];
                    return groups.map((g) => (
                      <Section key={g.title} title={g.title} level={2} description={`${g.items.length === 1 ? "1 teacher" : `${g.items.length} teachers`}`}>
                        <List label={g.title}>
                          {byCatalogScore(g.items, q, (hit) => ({
                            title: hit.name,
                            topic: hit.topics || hit.bio,
                            educator: hit.username,
                          })).map((h) => (
                            <TeacherHit
                              key={h.uid || h.username}
                              avatar={h.avatar}
                              name={h.name}
                              username={h.username}
                              meta={h.topics || h.bio}
                              onOpen={() => pushRecent(q)}
                            />
                          ))}
                        </List>
                      </Section>
                    ));
                  })()}
                </div>
              )}
            </>
          )}
        </PageBody>
      </div>
    </AppShell>
  );
}

/** Blank query: recent searches and a hint. Saved courses and history live on /library. */
function BlankSearch({ onPick }: { onPick: (q: string) => void }) {
  const [ready, setReady] = useState(false);
  const [recents, setRecents] = useState<RecentSearch[]>([]);
  useEffect(() => {
    setRecents(readRecents());
    setReady(true);
  }, []);
  if (!ready) return <Skeleton className="h-8 w-64" />;
  return (
    <>
      {recents.length ? (
        <Section
          title="Recent searches"
          level={2}
          action={
            <Button
              variant="ghost"
              size="sm"
              icon={X}
              onClick={() => {
                clearRecents();
                setRecents([]);
              }}
            >
              Clear
            </Button>
          }
        >
          <div role="group" aria-label="Recent searches" className="flex flex-wrap gap-1.5">
            {recents.map((r) => (
              <Chip key={r.q} onClick={() => onPick(r.q)}>
                <History aria-hidden="true" className="size-3.5 text-fg-faint" />
                {r.q}
              </Chip>
            ))}
          </div>
        </Section>
      ) : null}
      <Section title="Try" level={2}>
        <ul className="m-0 grid list-none gap-1 p-0 text-sm text-fg-muted">
          <li>
            A teacher’s username, like <Chip onClick={() => onPick("@brijesh.jindal")}>@brijesh.jindal</Chip>
          </li>
          <li>A subject or topic, like “thermodynamics”.</li>
          <li>A class id from a shared link.</li>
        </ul>
      </Section>
      <p className="mt-6 text-sm text-fg-muted">
        Saved courses and watch history are in{" "}
        <Link to="/library" className="text-fg underline underline-offset-2">
          Library
        </Link>
        .
      </p>
    </>
  );
}
