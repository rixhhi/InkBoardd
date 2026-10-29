import { extractLessonId } from "@inkboard/shared/catalog";

export const PALETTE_EVENT = "inkboard:open-palette";

export type WriteMode = "write" | "teachers";

export function openCommandPalette(seed?: string, mode: WriteMode = "write") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PALETTE_EVENT, { detail: { seed: seed ?? "", mode } }));
}

export type PaletteRow = {
  group: "Jump" | "Exams" | "Teachers" | "Recent" | "Watch later" | "Resume" | "Lectures" | "Actions";
  value: string;
  label: string;
  hint?: string;
  avatar?: string;
  href:
    | { kind: "exam"; id: string }
    | { kind: "teacher"; slug: string }
    | { kind: "search"; q: string }
    | { kind: "play"; lessonId: string; title: string; teacher?: string; course?: string }
    | { kind: "path"; to: string; search?: Record<string, string | number | undefined> }
    | { kind: "action"; name: "recovery" | "csv" | "share" };
};

export function teacherQuery(raw: string) {
  const q = raw.trim().replace(/^@+/, "");
  if (q.length < 2) return "";
  if (/\s/.test(q)) return "";
  if (!/^[a-zA-Z][a-zA-Z0-9._-]{1,39}$/.test(q)) return "";
  return q;
}

/** Names as well as usernames: "chandan", "Chandan Kumar", "@agsir". */
export function teacherNameQuery(raw: string) {
  const q = raw.trim().replace(/^@+/, "").replace(/\s+/g, " ");
  if (q.length < 2) return "";
  if (!/^[a-zA-Z][a-zA-Z0-9 ._-]{0,59}$/.test(q)) return "";
  return q.slice(0, 60);
}

export function teacherHitScore(row: { label: string; hint?: string; href: PaletteRow["href"] }, query: string) {
  const q = query.trim().toLowerCase().replace(/^@+/, "");
  if (!q) return 1;
  const name = row.label.toLowerCase();
  const hint = (row.hint ?? "").toLowerCase();
  const slug = row.href.kind === "teacher" ? row.href.slug.toLowerCase() : "";
  const compact = q.replace(/[^a-z0-9]/g, "");
  const compactName = name.replace(/[^a-z0-9]/g, "");
  const compactSlug = slug.replace(/[^a-z0-9]/g, "");
  if (name === q || slug === q || compactSlug === compact) return 100;
  if (name.startsWith(q) || slug.startsWith(q) || compactSlug.startsWith(compact) || compactName.startsWith(compact)) return 80;
  if (name.split(/\s+/).some((w) => w.startsWith(q))) return 65;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const words = name.split(/\s+/);
    if (words[0]?.startsWith(tokens[0]!) && words[words.length - 1]?.startsWith(tokens[tokens.length - 1]!)) return 70;
  }
  if (name.includes(q) || slug.includes(q) || hint.includes(q) || compactSlug.includes(compact)) return 40;
  return 0;
}

export const TEACHER_LINE_LIMIT = 60;

export function rankTeacherRows(rows: PaletteRow[], query: string, limit = TEACHER_LINE_LIMIT): PaletteRow[] {
  const q = query.trim().toLowerCase().replace(/^@+/, "");
  if (!q) return rows.slice(0, limit);
  return rows
    .map((row) => ({ row, score: teacherHitScore(row, q) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.row);
}

export function matchingExams<T extends { id: string; name: string; group: string; family?: string }>(
  exams: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase().replace(/^@+/, "");
  if (!q) return exams.slice(0, 12);
  return exams.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      e.group.toLowerCase().includes(q) ||
      e.id.toLowerCase() === q ||
      (e.family ?? "").toLowerCase().includes(q),
  );
}

export function buildPaletteRows(input: {
  query: string;
  exams: { id: string; name: string; group: string; family?: string }[];
  saved: { username: string; name: string }[];
  recents: { q: string }[];
  later: { lessonId: string; title: string; teacher?: string; course?: string }[];
  history: { lessonId: string; title: string; teacher?: string; course?: string }[];
  lectures: { lessonId: string; title: string; teacher: string; course?: string }[];
}): PaletteRow[] {
  const rows: PaletteRow[] = [
    { group: "Jump", value: "home inkboard", label: "Home", href: { kind: "path", to: "/" } },
    { group: "Jump", value: "tasks today planner", label: "Tasks", href: { kind: "path", to: "/planner/today" } },
    { group: "Jump", value: "calendar planner", label: "Month", href: { kind: "path", to: "/planner" } },
    { group: "Jump", value: "dashboard planner", label: "Pace", href: { kind: "path", to: "/planner/dashboard" } },
    { group: "Jump", value: "history planner", label: "History", href: { kind: "path", to: "/planner/history" } },
    { group: "Jump", value: "analytics planner", label: "Instruments", href: { kind: "path", to: "/planner/analytics" } },
    { group: "Jump", value: "ink memory fading review re-ink forget", label: "Ink · what you're forgetting", href: { kind: "path", to: "/planner/ink" } },
    { group: "Jump", value: "badges planner", label: "Seals", href: { kind: "path", to: "/planner/badges" } },
    { group: "Jump", value: "settings planner", label: "Settings", href: { kind: "path", to: "/planner/settings" } },
    { group: "Jump", value: "new plan wizard", label: "Lay out a plan", href: { kind: "path", to: "/planner/new" } },
    { group: "Jump", value: "offline saved classes", label: "Saved classes", href: { kind: "path", to: "/offline" } },
  ];

  const q = teacherQuery(input.query);
  if (q) {
    rows.unshift({
      group: "Teachers",
      value: `search teacher ${q}`,
      label: `Search @${q}`,
      hint: "Open teacher search",
      href: { kind: "search", q },
    });
  }

  const lessonId = extractLessonId(input.query);
  if (lessonId) {
    rows.unshift({
      group: "Jump",
      value: `play lesson ${lessonId}`,
      label: `Play ${lessonId}`,
      hint: "Open class",
      href: { kind: "play", lessonId, title: "Class" },
    });
  }

  for (const exam of matchingExams(input.exams, input.query)) {
    rows.push({
      group: "Exams",
      value: `exam ${exam.name} ${exam.group} ${exam.id}`,
      label: exam.name,
      hint: exam.group,
      href: { kind: "exam", id: exam.id },
    });
  }

  for (const t of input.saved.slice(0, 16)) {
    rows.push({
      group: "Teachers",
      value: `saved ${t.username} ${t.name}`,
      label: t.name || t.username,
      hint: `@${t.username}`,
      href: { kind: "teacher", slug: t.username },
    });
  }

  for (const r of input.recents.slice(0, 8)) {
    rows.push({
      group: "Recent",
      value: `recent ${r.q}`,
      label: r.q.startsWith("@") ? r.q : `@${r.q}`,
      hint: "Recent search",
      href: { kind: "search", q: r.q.replace(/^@+/, "") },
    });
  }

  for (const item of input.later.slice(0, 12)) {
    rows.push({
      group: "Watch later",
      value: `later ${item.title} ${item.lessonId}`,
      label: item.title,
      hint: item.teacher,
      href: { kind: "play", lessonId: item.lessonId, title: item.title, teacher: item.teacher, course: item.course },
    });
  }

  for (const item of input.history.slice(0, 12)) {
    rows.push({
      group: "Resume",
      value: `continue ${item.title} ${item.lessonId}`,
      label: item.title,
      hint: item.teacher,
      href: { kind: "play", lessonId: item.lessonId, title: item.title, teacher: item.teacher, course: item.course },
    });
  }

  for (const t of input.lectures.slice(0, 24)) {
    rows.push({
      group: "Lectures",
      value: `lecture ${t.title} ${t.teacher} ${t.lessonId}`,
      label: t.title,
      hint: t.teacher,
      href: { kind: "play", lessonId: t.lessonId, title: t.title, teacher: t.teacher, course: t.course },
    });
  }

  rows.push(
    {
      group: "Actions",
      value: "log study",
      label: "Log study",
      href: { kind: "path", to: "/planner/history", search: { log: 1 } },
    },
    {
      group: "Actions",
      value: "add task",
      label: "Add task",
      href: { kind: "path", to: "/planner/today", search: { add: 1 } },
    },
    {
      group: "Actions",
      value: "start today's session",
      label: "Start class",
      href: { kind: "path", to: "/planner/today" },
    },
    {
      group: "Actions",
      value: "reschedule overdue",
      label: "Reschedule overdue",
      href: { kind: "path", to: "/planner" },
    },
    { group: "Actions", value: "create recovery point", label: "Create recovery point", href: { kind: "action", name: "recovery" } },
    { group: "Actions", value: "export csv", label: "Export CSV", href: { kind: "action", name: "csv" } },
    { group: "Actions", value: "share progress card", label: "Share progress card", href: { kind: "action", name: "share" } },
  );

  return rows;
}

export function groupPaletteRows(rows: PaletteRow[]) {
  const order: PaletteRow["group"][] = [
    "Teachers",
    "Exams",
    "Jump",
    "Recent",
    "Watch later",
    "Resume",
    "Lectures",
    "Actions",
  ];
  return order
    .map((group) => ({ group, items: rows.filter((r) => r.group === group) }))
    .filter((g) => g.items.length);
}

export const WRITE_LINE_LIMIT = 8;

export type WriteLineHeading = "Exams" | "Teachers" | "Classes" | "Plan";

const WRITE_COPY: Record<string, string> = {
  Home: "All exams",
  Tasks: "Open today’s tasks",
  Month: "Open the month",
  Calendar: "Open the month",
  Pace: "Open pace",
  Dashboard: "Open pace",
  History: "Open history",
  Instruments: "Open instruments",
  Analytics: "Open instruments",
  Seals: "Open seals",
  Badges: "Open seals",
  Settings: "Open settings",
  "Lay out a plan": "Lay out a plan",
  "New plan": "Lay out a plan",
  "Saved classes": "Open saved classes",
  "Add task": "Write a task",
  "Start the board": "Start class",
  "Start today’s session": "Start class",
  "Jump to last class": "Continue",
  "Log study": "Log a session",
  "Reschedule overdue": "Catch the overdue",
  "Create recovery point": "Keep a recovery mark",
  "Export CSV": "Export the ledger",
  "Share progress card": "Share a card",
};

export function writeLineCopy(row: PaletteRow) {
  if (WRITE_COPY[row.label]) return WRITE_COPY[row.label];
  if (row.label.startsWith("Search catalog for ")) {
    return `Look for ${row.label.slice("Search catalog for ".length)}`;
  }
  if (row.label.startsWith("Play ")) {
    return `Open class ${row.label.slice(5)}`;
  }
  if (row.label.startsWith("Search @")) {
    return `Find ${row.label.slice("Search ".length)}`;
  }
  return row.label;
}

export function writeLineBucket(group: PaletteRow["group"]): WriteLineHeading {
  if (group === "Exams") return "Exams";
  if (group === "Teachers" || group === "Recent") return "Teachers";
  if (group === "Watch later" || group === "Resume" || group === "Lectures") return "Classes";
  return "Plan";
}

export function writeLineLead(input: {
  query: string;
  history: { lessonId: string; title: string; teacher?: string; course?: string }[];
  hasPlan: boolean;
}): PaletteRow {
  const q = input.query.trim();
  if (q) {
    const lessonId = extractLessonId(q);
    if (lessonId) {
      return {
        group: "Jump",
        value: `play lesson ${lessonId}`,
        label: `Play ${lessonId}`,
        hint: "Open class",
        href: { kind: "play", lessonId, title: "Class" },
      };
    }
    return {
      group: "Jump",
      value: `search catalog ${q}`,
      label: `Search catalog for ${q}`,
      href: { kind: "search", q: q.replace(/^@+/, "") },
    };
  }
  const last = input.history[0];
  if (last) {
    return {
      group: "Jump",
      value: `last class ${last.lessonId}`,
      label: "Jump to last class",
      hint: last.title,
      href: { kind: "play", lessonId: last.lessonId, title: last.title, teacher: last.teacher, course: last.course },
    };
  }
  if (input.hasPlan) {
    return {
      group: "Jump",
      value: "open today board",
      label: "Open today’s tasks",
      href: { kind: "path", to: "/planner/today" },
    };
  }
  return {
    group: "Jump",
    value: "lay out a plan lead",
    label: "Lay out a plan",
    href: { kind: "path", to: "/planner/new" },
  };
}

function sameHref(a: PaletteRow, b: PaletteRow) {
  const x = a.href;
  const y = b.href;
  if (x.kind !== y.kind) return false;
  if (x.kind === "path" && y.kind === "path") return x.to === y.to;
  if (x.kind === "play" && y.kind === "play") return x.lessonId === y.lessonId;
  if (x.kind === "exam" && y.kind === "exam") return x.id === y.id;
  if (x.kind === "teacher" && y.kind === "teacher") return x.slug === y.slug;
  if (x.kind === "search" && y.kind === "search") return x.q === y.q;
  if (x.kind === "action" && y.kind === "action") return x.name === y.name;
  return false;
}

export function rankWriteLine(rows: PaletteRow[], lead: PaletteRow, limit = WRITE_LINE_LIMIT): PaletteRow[] {
  const rest = rows.filter((r) => r.value !== lead.value && !sameHref(r, lead));
  const order: Record<PaletteRow["group"], number> = {
    Teachers: 0,
    Exams: 1,
    Resume: 2,
    Lectures: 3,
    "Watch later": 4,
    Recent: 5,
    Jump: 6,
    Actions: 7,
  };
  rest.sort((a, b) => (order[a.group] ?? 9) - (order[b.group] ?? 9));
  return [lead, ...rest].slice(0, limit);
}

export function groupWriteLine(rows: PaletteRow[]) {
  if (rows.length === 0) return [];
  const [lead, ...rest] = rows;
  if (!lead) return [];
  const buckets: Record<WriteLineHeading, PaletteRow[]> = { Exams: [], Teachers: [], Classes: [], Plan: [] };
  for (const row of rest) buckets[writeLineBucket(row.group)].push(row);
  const out: { group: string; items: PaletteRow[] }[] = [{ group: "", items: [lead] }];
  for (const group of ["Exams", "Teachers", "Classes", "Plan"] as const) {
    if (buckets[group].length) out.push({ group, items: buckets[group] });
  }
  return out;
}

