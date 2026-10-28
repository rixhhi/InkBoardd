export const SUBJECT_IDS = ["physics", "chemistry", "maths", "biology", "cs", "english", "reasoning", "other"] as const;
export type SubjectId = (typeof SUBJECT_IDS)[number];

const ALIASES: Record<string, SubjectId> = {
  physics: "physics",
  phy: "physics",
  chemistry: "chemistry",
  chem: "chemistry",
  maths: "maths",
  math: "maths",
  mathematics: "maths",
  biology: "biology",
  bio: "biology",
  zoology: "biology",
  botany: "biology",
  cs: "cs",
  "computer science": "cs",
  "cs & it": "cs",
  "cs and it": "cs",
  "ds & ai": "cs",
  "ds and ai": "cs",
  dsai: "cs",
  dsa: "cs",
  "data structures": "cs",
  "artificial intelligence": "cs",
  english: "english",
  reasoning: "reasoning",
  aptitude: "reasoning",
};

export const SUBJECT_MARK: Record<SubjectId, string> = {
  physics: "Ph",
  chemistry: "Ch",
  maths: "Ma",
  biology: "Bi",
  cs: "Cs",
  english: "En",
  reasoning: "Rs",
  other: "·",
};

const SKIP_WORDS = new Set(["and", "of", "the", "for", "in", "to", "a", "gate", "jee", "neet", "upsc", "iit"]);

export function subjectIdOf(label: string | undefined | null): SubjectId {
  const key = (label || "").trim().toLowerCase();
  if (!key) return "other";
  if (ALIASES[key]) return ALIASES[key];
  if (key.includes("phys") || key.includes("electrostat") || key.includes("kinematic") || /\boptics?\b/.test(key) || key.includes("magnetism") || /\bmechanics\b/.test(key)) {
    return "physics";
  }
  if (key.includes("chem") || key.includes("organic") || key.includes("inorganic")) return "chemistry";
  if (key.includes("math") || key.includes("algebra") || key.includes("calculus") || key.includes("trigono")) return "maths";
  if (key.includes("bio") || key.includes("zoo") || key.includes("botan") || key.includes("physiol")) return "biology";
  if (
    key.includes("comp") ||
    key.includes("algorithm") ||
    key.includes("compiler") ||
    key.includes("dbms") ||
    key.includes("operating") ||
    /\bcs\b/.test(key) ||
    key.includes("toc") ||
    /\bai\b/.test(key) ||
    key.includes("data struct")
  ) {
    return "cs";
  }
  if (key.includes("eng") && !key.includes("engine")) return "english";
  if (key.includes("apt") || key.includes("reason")) return "reasoning";
  return "other";
}

/** Two-letter seal for a plate. Taken from the name — never a stray middot. */
export function subjectMark(label: string | undefined | null): string {
  if (/^tests?$/i.test(String(label ?? "").trim())) return "Ts";
  if (/^crash$/i.test(String(label ?? "").trim())) return "Cr";
  if (/^papers?$/i.test(String(label ?? "").trim())) return "Sy";
  const words = String(label ?? "")
    .replace(/&/g, " ")
    .split(/[^A-Za-z0-9]+/)
    .map((w) => w.trim())
    .filter((w) => w && !SKIP_WORDS.has(w.toLowerCase()));
  if (!words.length) {
    const id = subjectIdOf(label);
    return id === "other" ? "" : SUBJECT_MARK[id];
  }
  const first = words[0]!;
  if (first.length <= 3) return first.toUpperCase();
  if (words.length >= 2) return (first[0]! + words[1]![0]!).toUpperCase();
  return first[0]!.toUpperCase() + first[1]!.toLowerCase();
}

function hatchBucket(label: string | undefined | null): number {
  const s = String(label ?? "").toLowerCase();
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (n * 33 + s.charCodeAt(i)) >>> 0;
  return n % 4;
}

export function subjectVar(id: SubjectId): string {
  return `var(--color-sub-${id})`;
}

export function subjectClass(id: SubjectId): string {
  return `text-[var(--color-sub-${id})]`;
}

export function subjectHatchClass(id: SubjectId): string {
  return `hatch-${id}`;
}

/** Hatch for a live label so unmapped plates are never a blank tile. */
export function subjectHatchClassFor(label: string | undefined | null): string {
  const id = subjectIdOf(label);
  if (id !== "other") return `hatch-${id}`;
  const n = hatchBucket(label);
  return n === 0 ? "hatch-other" : `hatch-other-${n}`;
}

export function subjectWash(id: SubjectId): { background: string; color: string } {
  return {
    background: `color-mix(in srgb, var(--color-sub-${id}) 12%, transparent)`,
    color: `var(--color-sub-${id})`,
  };
}
