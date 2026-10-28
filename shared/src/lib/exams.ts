export type Exam = {
  id: string;
  slug: string;
  name: string;
  blurb: string;
  group: "Engineering" | "Medical" | "MBA" | "Government" | "School" | "Other";
  family?: string;
  sourceGoal?: string;
  product?: string;
};

export const EXAMS: Exam[] = [
  {
    id: "TMUVD",
    slug: "jee-main-and-advanced-preparation",
    name: "IIT JEE",
    blurb: "JEE Main & Advanced",
    group: "Engineering",
  },
  {
    id: "YOTUH",
    slug: "neet-ug",
    name: "NEET UG",
    blurb: "Medical entrance",
    group: "Medical",
  },
  {
    id: "NVLIA",
    slug: "gate-csit-dsai-interview-preparation",
    name: "GATE CS",
    blurb: "CS, IT & Data Science",
    group: "Engineering",
    family: "GATE",
  },
  {
    id: "CNFPR",
    slug: "gate-iconic-pro",
    name: "GATE Iconic Pro",
    blurb: "Super 30 & mentorship",
    group: "Engineering",
    family: "GATE",
    sourceGoal: "NVLIA",
    product: "iconic_pro",
  },
  {
    id: "PZSIU",
    slug: "gate-ese-civil",
    name: "GATE Civil",
    blurb: "Civil & ESE",
    group: "Engineering",
    family: "GATE",
  },
  {
    id: "JAQRK",
    slug: "gate-ese-ee-ec",
    name: "GATE EE / EC",
    blurb: "Electrical & Electronics",
    group: "Engineering",
    family: "GATE",
  },
  {
    id: "QGFRK",
    slug: "gate-ese-me-ch-xe",
    name: "GATE ME / CH",
    blurb: "Mechanical & Chemical",
    group: "Engineering",
    family: "GATE",
  },
  {
    id: "TGAUE",
    slug: "gate-pcm",
    name: "GATE PCM",
    blurb: "Physics, Chemistry, Maths",
    group: "Engineering",
    family: "GATE",
  },
  {
    id: "BFLWJ",
    slug: "gate-xe",
    name: "GATE XE",
    blurb: "Engineering Sciences",
    group: "Engineering",
    family: "GATE",
  },
  {
    id: "SIFWL",
    slug: "iit-jam",
    name: "IIT JAM",
    blurb: "M.Sc. entrance",
    group: "Engineering",
    family: "JAM",
  },
  {
    id: "XNDUS",
    slug: "cat-other-mba-entrance-tests",
    name: "CAT",
    blurb: "MBA entrance tests",
    group: "MBA",
  },
  {
    id: "KSCGY",
    slug: "upsc-civil-services-examination-ias-preparation",
    name: "UPSC CSE",
    blurb: "IAS & civil services",
    group: "Government",
    family: "UPSC",
  },
  {
    id: "NYHNH",
    slug: "upsc-optional",
    name: "UPSC Optional",
    blurb: "Optional papers",
    group: "Government",
    family: "UPSC",
  },
  {
    id: "RTPSX",
    slug: "bank-exams",
    name: "Bank Exams",
    blurb: "SBI, IBPS & more",
    group: "Government",
  },
  {
    id: "VLEMN",
    slug: "ssc-exams-non-technical-railway-exams",
    name: "SSC",
    blurb: "CGL, CHSL & Railways",
    group: "Government",
    family: "SSC",
  },
  {
    id: "BDNTN",
    slug: "ssc-je-state-ae-exams-hindi-english",
    name: "SSC JE",
    blurb: "JE & State AE",
    group: "Government",
    family: "SSC",
  },
  {
    id: "PLWCX",
    slug: "cbse-class-12",
    name: "CBSE 12",
    blurb: "Class 12 boards",
    group: "School",
  },
  {
    id: "GWDPZ",
    slug: "cbse-class-11",
    name: "CBSE 11",
    blurb: "Class 11 boards",
    group: "School",
  },
  {
    id: "GSZGO",
    slug: "cbse-class-10",
    name: "CBSE 10",
    blurb: "Class 10 boards",
    group: "School",
  },
  {
    id: "PEJLJ",
    slug: "cuet-ug-domain",
    name: "CUET UG",
    blurb: "Domain subjects",
    group: "School",
  },
  {
    id: "MRZFY",
    slug: "clat-other-5-year-llb-exams",
    name: "CLAT",
    blurb: "5-year LLB",
    group: "Other",
    family: "CLAT",
  },
  {
    id: "VVEMV",
    slug: "clat-pg-other-llm-exams",
    name: "CLAT PG",
    blurb: "LLM entrance",
    group: "Other",
    family: "CLAT",
  },
  {
    id: "UXSVA",
    slug: "3-year-llb-entrance-exams",
    name: "3-year LLB",
    blurb: "LLB after graduation",
    group: "Other",
    family: "CLAT",
  },
  {
    id: "BBKWG",
    slug: "ca-foundation",
    name: "CA Foundation",
    blurb: "CA entry level",
    group: "Other",
    family: "CA",
  },
  {
    id: "RXRWJ",
    slug: "ca-intermediate",
    name: "CA Intermediate",
    blurb: "Chartered accountancy",
    group: "Other",
    family: "CA",
  },
  {
    id: "JXSFF",
    slug: "ca-final-audit",
    name: "CA Final Audit",
    blurb: "Final — Audit",
    group: "Other",
    family: "CA",
  },
  {
    id: "WSFGN",
    slug: "ca-final-dt",
    name: "CA Final DT",
    blurb: "Final — Direct Tax",
    group: "Other",
    family: "CA",
  },
  {
    id: "MCRYW",
    slug: "company-secretary-executive-entrance-test",
    name: "CSEET",
    blurb: "CS entrance",
    group: "Other",
    family: "CA",
  },
  {
    id: "EUDWC",
    slug: "cs-executive-module-1",
    name: "CS Executive 1",
    blurb: "Company secretary",
    group: "Other",
    family: "CA",
  },
  {
    id: "KZXZX",
    slug: "cs-executive-module-2",
    name: "CS Executive 2",
    blurb: "Company secretary",
    group: "Other",
    family: "CA",
  },
  {
    id: "CKTCQ",
    slug: "judiciary-pcs-j",
    name: "Judiciary",
    blurb: "PCS (J)",
    group: "Other",
  },
];

export const EXAM_GROUPS: Exam["group"][] = [
  "Engineering",
  "Medical",
  "MBA",
  "Government",
  "School",
  "Other",
];

export const HOME_EXAMS = EXAMS.filter((e) =>
  ["TMUVD", "YOTUH", "NVLIA", "CNFPR", "SIFWL", "KSCGY", "VLEMN", "MRZFY", "RXRWJ"].includes(e.id),
);

export type ExamFamilyBlock = { label: string; exams: Exam[] };
export type ExamGroupBlock = { group: Exam["group"]; families: ExamFamilyBlock[] };

export function examsByGroup(): ExamGroupBlock[] {
  return EXAM_GROUPS.map((group) => {
    const exams = EXAMS.filter((e) => e.group === group);
    const families: ExamFamilyBlock[] = [];
    const used = new Set<string>();
    for (const exam of exams) {
      if (used.has(exam.id)) continue;
      if (exam.family) {
        const sibs = exams.filter((x) => x.family === exam.family);
        for (const s of sibs) used.add(s.id);
        families.push({ label: exam.family, exams: sibs });
      } else {
        used.add(exam.id);
        families.push({ label: "", exams: [exam] });
      }
    }
    return { group, families };
  }).filter((g) => g.families.length > 0);
}

export function getExam(id: string) {
  return EXAMS.find((e) => e.id === id || e.slug === id);
}

export function examSeal(exam: Exam | null | undefined): string {
  if (!exam) return "";
  const family = (exam.family || "").toUpperCase();
  if (family === "GATE") return "GATE";
  if (family === "UPSC") return "UPSC";
  if (family === "SSC") return "SSC";
  if (family === "JAM") return "JAM";
  if (family === "CLAT") return "CLAT";
  if (family === "CA") {
    const n = exam.name.toUpperCase();
    if (n.includes("CSEET") || /\bCS\b/.test(n) || n.startsWith("CS ")) return "CS";
    return "CA";
  }
  const n = exam.name.toUpperCase();
  if (n.includes("JEE")) return "JEE";
  if (n.includes("NEET")) return "NEET";
  if (n.includes("CUET")) return "CUET";
  if (n.includes("CBSE") || n.includes("CLASS")) return "CBSE";
  if (/\bCAT\b/.test(n)) return "CAT";
  if (n.includes("BANK")) return "BANK";
  if (n.includes("JUD")) return "JUD";
  return exam.name.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 4);
}

export function familyExams(exam: Exam) {
  if (!exam.family) return [];
  return EXAMS.filter((e) => e.family === exam.family);
}

export function examGoalIds(exam: Exam): string[] {
  if (exam.product === "iconic_pro" && exam.family) {
    return EXAMS.filter((e) => e.family === exam.family && !e.product).map((e) => e.id);
  }
  return [exam.sourceGoal || exam.id];
}

export function examMatchesGoal(exam: { id: string } | null | undefined, goalUid: string) {
  if (!exam) return true;
  if (!goalUid) return true;
  const full = getExam(exam.id);
  if (!full) return goalUid === exam.id;
  if (goalUid === full.id || goalUid === (full.sourceGoal || "")) return true;
  return examGoalIds(full).includes(goalUid);
}

export function iconicSubjectGoal(subject: string): string | null {
  const n = subject.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
  if (!n) return null;
  if (
    /\b(cs|it|ds|ai|computer|compiler|algorithm|operating|database|discrete|placement|programming)\b/.test(n) ||
    n.includes("cs it")
  ) {
    return "NVLIA";
  }
  if (n.includes("civil")) return "PZSIU";
  if (n.includes("electrical") || n.includes("electronics") || n === "ece" || n.includes("instrument")) return "JAQRK";
  if (n.includes("mechanical") || n.includes("chemical")) return "QGFRK";
  if (n.includes("environmental") || /(^|\s)xe(\s|$)/.test(n)) return "BFLWJ";
  if (n.includes("aptitude") || n.includes("mathematics") || n.startsWith("ga") || n.includes("pcm")) return "TGAUE";
  return null;
}

export function teacherSubject(topics: string | null | undefined) {
  const raw = String(topics ?? "").replace(/^teaches\s+/i, "").trim();
  if (!raw) return "General";
  const cut = raw.split(/\s+and\s+\d+/i)[0] || raw;
  return cut.trim() || "General";
}

export function groupTeachersBySubject<T extends { topics: string }>(teachers: T[]) {
  const map = new Map<string, { label: string; list: T[] }>();
  for (const t of teachers) {
    const label = teacherSubject(t.topics);
    const key = label.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim() || "general";
    const prev = map.get(key);
    if (prev) {
      prev.list.push(t);
      if (label !== "General" && (prev.label === "General" || label.length < prev.label.length)) prev.label = label;
    } else {
      map.set(key, { label, list: [t] });
    }
  }
  return [...map.values()]
    .sort((a, b) => {
      if (a.label === "General") return 1;
      if (b.label === "General") return -1;
      return b.list.length - a.list.length || a.label.localeCompare(b.label);
    })
    .map((g) => [g.label, g.list] as [string, T[]]);
}
