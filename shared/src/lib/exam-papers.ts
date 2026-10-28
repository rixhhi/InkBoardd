/** Exam papers as chalk lines. Struck when a watched title matches. Local — no Plus. */

import { canonicalTopic, subjectKey, topicFitsName } from "./exam-wall.ts";

export type ExamPaper = {
  id: string;
  name: string;
  aliases: string[];
};

const GATE_CS: ExamPaper[] = [
  { id: "ga", name: "General Aptitude", aliases: ["aptitude", "verbal", "numerical ability"] },
  { id: "em", name: "Engineering Mathematics", aliases: ["maths", "mathematics", "linear algebra", "calculus", "probability"] },
  { id: "dm", name: "Discrete Mathematics", aliases: ["discrete math", "graph theory", "combinatorics"] },
  { id: "dl", name: "Digital Logic", aliases: ["digital", "boolean", "combinational"] },
  { id: "coa", name: "Computer Organization", aliases: ["computer architecture", "coa", "cache", "pipelining"] },
  { id: "pds", name: "Programming and Data Structures", aliases: ["data structures", "dsa", "programming", "c programming"] },
  { id: "algo", name: "Algorithms", aliases: ["algorithm", "complexity", "greedy", "dynamic programming"] },
  { id: "toc", name: "Theory of Computation", aliases: ["toc", "automata", "turing", "regular language"] },
  { id: "cd", name: "Compiler Design", aliases: ["compiler", "lexical", "parsing"] },
  { id: "os", name: "Operating System", aliases: ["operating systems", "os", "deadlock", "scheduling", "memory management"] },
  { id: "db", name: "Databases", aliases: ["dbms", "sql", "normalization", "transactions"] },
  { id: "cn", name: "Computer Networks", aliases: ["computer network", "cn", "tcp", "osi", "routing"] },
  { id: "ml", name: "Machine Learning", aliases: ["ml", "regression", "classification", "neural"] },
  { id: "ai", name: "Artificial Intelligence", aliases: ["ai", "search", "knowledge representation"] },
];

const GATE_EE: ExamPaper[] = [
  { id: "em", name: "Engineering Mathematics", aliases: ["maths", "mathematics"] },
  { id: "enet", name: "Electric Circuits", aliases: ["network", "circuits"] },
  { id: "emach", name: "Electrical Machines", aliases: ["machines", "transformer", "induction"] },
  { id: "ps", name: "Power Systems", aliases: ["power system"] },
  { id: "pe", name: "Power Electronics", aliases: ["power electronic", "converter"] },
  { id: "control", name: "Control Systems", aliases: ["control"] },
  { id: "signals", name: "Signals and Systems", aliases: ["signal"] },
  { id: "analog", name: "Analog Electronics", aliases: ["analog"] },
  { id: "digital", name: "Digital Electronics", aliases: ["digital"] },
  { id: "emt", name: "Electromagnetics", aliases: ["electromagnetic", "field theory"] },
];


const GATE_ME: ExamPaper[] = [
  { id: "em", name: "Engineering Mathematics", aliases: ["maths"] },
  { id: "thermo", name: "Thermodynamics", aliases: ["thermo"] },
  { id: "som", name: "Strength of Materials", aliases: ["som", "solid mechanics"] },
  { id: "tom", name: "Theory of Machines", aliases: ["tom", "kinematics of machinery"] },
  { id: "fm", name: "Fluid Mechanics", aliases: ["fluid"] },
  { id: "ht", name: "Heat Transfer", aliases: ["heat"] },
  { id: "prod", name: "Manufacturing", aliases: ["production", "manufacturing"] },
  { id: "im", name: "Industrial Engineering", aliases: ["industrial", "or"] },
];

const GATE_CE: ExamPaper[] = [
  { id: "em", name: "Engineering Mathematics", aliases: ["maths"] },
  { id: "som", name: "Strength of Materials", aliases: ["som", "solid mechanics"] },
  { id: "sa", name: "Structural Analysis", aliases: ["structural"] },
  { id: "rcc", name: "RCC and Steel", aliases: ["rcc", "concrete", "steel"] },
  { id: "geotech", name: "Geotechnical", aliases: ["soil", "foundation"] },
  { id: "fluid", name: "Fluid Mechanics", aliases: ["fluid", "hydraulics"] },
  { id: "env", name: "Environmental", aliases: ["environment", "water supply"] },
  { id: "trans", name: "Transportation", aliases: ["highway", "traffic"] },
  { id: "survey", name: "Surveying", aliases: ["survey"] },
];

const JEE: ExamPaper[] = [
  { id: "mech", name: "Mechanics", aliases: ["kinematics", "newton", "work energy", "rotation", "gravitation"] },
  { id: "emag", name: "Electromagnetism", aliases: ["electrostat", "current", "magnetism", "emi", "ac"] },
  { id: "optics", name: "Optics and Waves", aliases: ["optics", "wave", "shm", "sound"] },
  { id: "thermal", name: "Thermal Physics", aliases: ["thermo", "kinetic theory", "heat"] },
  { id: "modern", name: "Modern Physics", aliases: ["modern", "atom", "nucleus", "semiconductor"] },
  { id: "organic", name: "Organic Chemistry", aliases: ["organic", "goc", "hydrocarbon", "alcohol"] },
  { id: "inorganic", name: "Inorganic Chemistry", aliases: ["inorganic", "periodic", "chemical bonding", "p block", "d block", "coordination"] },
  { id: "physical", name: "Physical Chemistry", aliases: ["physical", "mole", "equilibrium", "electrochem", "kinetics"] },
  { id: "algebra", name: "Algebra", aliases: ["quadratic", "sequence", "complex", "binomial", "permutation"] },
  { id: "calculus", name: "Calculus", aliases: ["limit", "continuity", "differentiation", "integration", "differential"] },
  { id: "coord", name: "Coordinate Geometry", aliases: ["straight line", "circle", "conic", "parabola", "ellipse"] },
  { id: "vec", name: "Vectors and 3D", aliases: ["vector", "3d", "three dimensional"] },
];

const NEET: ExamPaper[] = [
  { id: "zoo", name: "Zoology", aliases: ["animal", "human physiol", "reproduction", "evolution"] },
  { id: "bot", name: "Botany", aliases: ["plant", "photosynthesis", "ecology", "genetics"] },
  { id: "human", name: "Human Physiology", aliases: ["digestion", "respiration", "circulation", "neural", "endocrine"] },
  { id: "organic", name: "Organic Chemistry", aliases: ["organic"] },
  { id: "inorganic", name: "Inorganic Chemistry", aliases: ["inorganic", "periodic", "bonding"] },
  { id: "physical", name: "Physical Chemistry", aliases: ["physical", "equilibrium", "thermo"] },
  { id: "mech", name: "Mechanics", aliases: ["kinematics", "newton", "work"] },
  { id: "emag", name: "Electromagnetism", aliases: ["electrostat", "current", "magnet"] },
  { id: "modern", name: "Modern Physics", aliases: ["atom", "nucleus", "semiconductor"] },
];

const UPSC: ExamPaper[] = [
  { id: "hist", name: "History", aliases: ["ancient", "medieval", "modern india", "world history"] },
  { id: "polity", name: "Polity", aliases: ["constitution", "governance", "parliament"] },
  { id: "geo", name: "Geography", aliases: ["physical geo", "indian geo", "climate"] },
  { id: "eco", name: "Economy", aliases: ["economy", "budget", "inflation", "banking"] },
  { id: "env", name: "Environment", aliases: ["ecology", "biodiversity", "climate change"] },
  { id: "sci", name: "Science and Tech", aliases: ["science", "tech", "space"] },
  { id: "ethics", name: "Ethics", aliases: ["ethics", "integrity", "aptitude"] },
  { id: "csat", name: "CSAT", aliases: ["csat", "comprehension", "reasoning"] },
  { id: "ca", name: "Current Affairs", aliases: ["current", "newspaper", "hindu"] },
];

const BY_EXAM: Record<string, ExamPaper[]> = {
  NVLIA: GATE_CS,
  CNFPR: GATE_CS,
  TGAUE: JEE,
  BFLWJ: GATE_ME,
  JAQRK: GATE_EE,
  QGFRK: GATE_ME,
  PZSIU: GATE_CE,
  TMUVD: JEE,
  YOTUH: NEET,
  KSCGY: UPSC,
  NYHNH: UPSC,
};

export function papersForExam(examId: string | null | undefined): ExamPaper[] {
  return BY_EXAM[String(examId ?? "")] ?? [];
}

export function paperMatches(paper: ExamPaper, hay: string) {
  const n = canonicalTopic(hay);
  if (!n) return false;
  if (topicFitsName(paper.name, hay) || n.includes(canonicalTopic(paper.name))) return true;
  const pk = subjectKey(paper.name);
  if (pk && subjectKey(hay) === pk) return true;
  for (const a of paper.aliases) {
    const c = canonicalTopic(a);
    if (c.length >= 3 && (n.includes(c) || topicFitsName(a, hay))) return true;
  }
  return false;
}

export type StruckPaper = ExamPaper & { struck: boolean; hit: string | null };

export function strikePapers(papers: ExamPaper[], titles: string[]): StruckPaper[] {
  const clean = titles.map((t) => String(t ?? "").trim()).filter(Boolean);
  return papers.map((p) => {
    const hit = clean.find((t) => paperMatches(p, t)) ?? null;
    return { ...p, struck: Boolean(hit), hit };
  });
}

export function papersCaption(rows: StruckPaper[]) {
  const n = rows.length;
  if (!n) return "On this wall";
  const struck = rows.filter((r) => r.struck).length;
  if (!struck) return `${n} ${n === 1 ? "paper" : "papers"}`;
  return `${struck} of ${n} struck`;
}
