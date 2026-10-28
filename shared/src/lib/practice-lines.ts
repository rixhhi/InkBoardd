/** Public Unacademy DPP catalog. Names and counts only — no quiz player. */

const UID = /^[A-Za-z0-9]{4,16}$/;

export type PracticeLine = {
  uid: string;
  title: string;
  educator: string;
  topic: string;
  questions: number;
  attempts: string;
  locked: boolean;
};

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function asStr(v: unknown) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function asNum(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function asArr(v: unknown) {
  return Array.isArray(v) ? v : [];
}

export function practicePageUrl(slug: string, goalUid: string) {
  return `https://unacademy.com/goal/${encodeURIComponent(slug)}/${encodeURIComponent(goalUid)}/practice`;
}

export function parsePracticeCard(raw: unknown, locked: boolean): PracticeLine | null {
  const r = asObj(raw);
  const uid = asStr(r.uid);
  if (!UID.test(uid)) return null;
  const klass = asObj(r.classDetails);
  const educator = asObj(r.educatorDetails);
  const title = asStr(klass.className || r.title).replace(/\s+/g, " ").trim();
  if (!title) return null;
  const first = asStr(educator.firstName);
  const last = asStr(educator.lastName);
  const name = `${first} ${last}`.trim() || asStr(educator.name);
  const questions = Math.max(0, Math.trunc(asNum(r.numQuestions ?? asObj(r.sessionDetails).numQuestions)));
  return {
    uid,
    title,
    educator: name,
    topic: asStr(klass.topicGroupName || klass.topicName),
    questions,
    attempts: asStr(r.totalQuizAttempts),
    locked,
  };
}

export function parsePracticePage(raw: unknown): { lines: PracticeLine[]; locked: boolean; available: boolean } {
  const root = asObj(raw);
  const props = asObj(asObj(root.props).pageProps);
  const page = Object.keys(props).length ? props : asObj(root.pageProps);
  const goal = asObj(page.goalInfo);
  const locked = Boolean(goal.isFreeUnavailable);
  const available = goal.isPracticeAvailable !== false;
  const cards = asArr(asObj(page.practicesByEducators).dppCards);
  const lines: PracticeLine[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    const line = parsePracticeCard(card, locked);
    if (!line || seen.has(line.uid)) continue;
    seen.add(line.uid);
    lines.push(line);
  }
  return { lines, locked, available: available || lines.length > 0 };
}

export function practiceCaption(line: PracticeLine) {
  const bits: string[] = [];
  if (line.educator) bits.push(line.educator);
  if (line.questions > 0) bits.push(`${line.questions} Q`);
  bits.push("locked");
  return bits.join(" · ");
}

export function practicePlateCaption(count: number) {
  if (count <= 0) return "On this wall";
  return count === 1 ? "1 DPP" : `${count} DPPs`;
}

export function practiceMinutes(questions: number) {
  if (!(questions > 0)) return 20;
  return Math.max(15, Math.min(90, questions));
}
