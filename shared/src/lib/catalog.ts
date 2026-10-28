export type Teacher = {
  slug: string;
  name: string;
  uid: string;
  subject: string;
  exam: string;
  bio: string;
  avatar: string;
  followers: string;
  rating: string;
};

export type Course = {
  id: string;
  teacherSlug: string;
  title: string;
  subject: string;
  lessons: number;
  hours: string;
  cover: string;
};

export type Lesson = {
  id: string;
  courseId: string;
  teacherSlug: string;
  title: string;
  duration: string;
  lessonId: string | null;
  live: boolean;
};

export const FEATURED_LESSON_ID = "2O24MEDDGPTI2AZ00YMV";

export const teachers: Teacher[] = [
  {
    slug: "agsir",
    name: "Dr Amit Gupta",
    uid: "XPVRVQS2XX",
    subject: "Biology",
    exam: "NEET UG",
    bio: "MBBS, MD (Mumbai). Top NEET UG expert from Kota. Mentor of thousands of pre-medical toppers.",
    avatar:
      "https://static.uacdn.net/educator_new/processed_image/2B6D827E-12BB-4F77-B070-DBC51747276D_.png",
    followers: "2.1M",
    rating: "4.9",
  },
  {
    slug: "rakshita_singh07",
    name: "Dr. Rakshita Singh",
    uid: "0PAP8WJG1P",
    subject: "Biology",
    exam: "NEET UG",
    bio: "NEET Biology faculty. Concept-first lectures with board-style notes you can revise from the recording.",
    avatar:
      "https://static.uacdn.net/educator_new/processed_thumbnail/FCDBA845-AE7B-4BD6-A131-FB60DC859EC8_.png",
    followers: "890K",
    rating: "4.8",
  },
  {
    slug: "physicsbyprateekjain",
    name: "Prateek Jain",
    uid: "99DG299FZQ",
    subject: "Physics",
    exam: "NEET · JEE",
    bio: "0% tricks, 100% concepts. Makes people fall in love with Physics. AIR 10, AIR 44 in recent years.",
    avatar:
      "https://static.uacdn.net/educator_new/processed_image/41291D60-60CE-4E94-AE9B-E1FA8AA98372_.png",
    followers: "1.4M",
    rating: "4.9",
  },
  {
    slug: "niteshdevnani",
    name: "Nitesh Devnani",
    uid: "GYXACP0F7O",
    subject: "Chemistry",
    exam: "NEET UG",
    bio: "ND Baba. Favourite NEET-UG educator. Mentored AIR 29, 103, 153 and many more.",
    avatar:
      "https://static.uacdn.net/educator_new/processed_image/5A549815-5747-4B97-8DBA-45C71C1BE67B_.png",
    followers: "1.8M",
    rating: "4.9",
  },
  {
    slug: "tamanna.chaudhary",
    name: "Tamanna Chaudhary",
    uid: "GAI17V9910",
    subject: "Physics",
    exam: "NEET UG",
    bio: "NEET Physics expert for 9 years. Mentored multiple sub-100 AIR students.",
    avatar:
      "https://static.uacdn.net/educator_new/processed_image/1E8C1DEA-2C1B-406F-B151-AA6D2CEB0614_.png",
    followers: "1.6M",
    rating: "4.8",
  },
  {
    slug: "seep.pahuja",
    name: "Seep Pahuja",
    uid: "0XAMIM71IT",
    subject: "Biology",
    exam: "NEET UG",
    bio: "High-yield NEET Biology with diagrams drawn live on the class board.",
    avatar:
      "https://static.uacdn.net/educator_new/processed_image/CBCD6B74-FA78-4E07-BDB4-FCF6DC2DA863_.png",
    followers: "1.1M",
    rating: "4.8",
  },
  {
    slug: "ajaymishraakm382-9673",
    name: "Ajay Mishra (AKM)",
    uid: "L0YKJEF41F",
    subject: "Physics",
    exam: "NEET · JEE",
    bio: "BTech HBTI Kanpur, MBA IIIT. 16 years at Aakash, IIT Study Circle and Allen.",
    avatar:
      "https://static.uacdn.net/educator_new/processed_image/1076AF0E-F467-444E-BD6F-1C315C6A170D_.png",
    followers: "720K",
    rating: "4.7",
  },
  {
    slug: "anupamupadhayay",
    name: "Anupam Upadhayay",
    uid: "VUQFK4GDHZ",
    subject: "Chemistry",
    exam: "NEET UG",
    bio: "Physical + inorganic chemistry with stepwise board work, built for NEET recall.",
    avatar:
      "https://static.uacdn.net/educator_new/processed_image/30C4AD1A-540A-4AAB-8A96-1D309A4835F3_.png",
    followers: "640K",
    rating: "4.7",
  },
  {
    slug: "beproton",
    name: "Akansha Karnwal",
    uid: "S5SB5M71SK",
    subject: "Biology",
    exam: "NEET UG",
    bio: "NCERT-line Biology with live annotation so every line on the slide is taught, not skipped.",
    avatar:
      "https://static.uacdn.net/educator_new/processed_image/B2A1613C-88D0-4620-9A89-C58AF7D744ED_.png",
    followers: "510K",
    rating: "4.8",
  },
];

const courseSeeds: Array<{
  id: string;
  teacherSlug: string;
  title: string;
  subject: string;
  lessons: number;
  hours: string;
}> = [
  { id: "med-live-sept", teacherSlug: "agsir", title: "NEET Biology Live — September", subject: "Biology", lessons: 8, hours: "14h" },
  { id: "human-physio", teacherSlug: "agsir", title: "Human Physiology Rapid Revision", subject: "Biology", lessons: 12, hours: "18h" },
  { id: "botany-core", teacherSlug: "rakshita_singh07", title: "Botany Core + NCERT Line", subject: "Biology", lessons: 10, hours: "16h" },
  { id: "genetics-rack", teacherSlug: "rakshita_singh07", title: "Genetics & Evolution Board", subject: "Biology", lessons: 7, hours: "11h" },
  { id: "mech-love", teacherSlug: "physicsbyprateekjain", title: "Mechanics from First Principles", subject: "Physics", lessons: 14, hours: "22h" },
  { id: "electro-pj", teacherSlug: "physicsbyprateekjain", title: "Electrostatics Intensive", subject: "Physics", lessons: 9, hours: "15h" },
  { id: "organic-nd", teacherSlug: "niteshdevnani", title: "Organic Chemistry — ND Baba", subject: "Chemistry", lessons: 16, hours: "24h" },
  { id: "ioc-nd", teacherSlug: "niteshdevnani", title: "Inorganic — Exceptions that Matter", subject: "Chemistry", lessons: 8, hours: "12h" },
  { id: "optics-tc", teacherSlug: "tamanna.chaudhary", title: "Ray & Wave Optics", subject: "Physics", lessons: 9, hours: "13h" },
  { id: "modern-tc", teacherSlug: "tamanna.chaudhary", title: "Modern Physics Sprint", subject: "Physics", lessons: 6, hours: "9h" },
  { id: "ecology-sp", teacherSlug: "seep.pahuja", title: "Ecology & Environment PYQ", subject: "Biology", lessons: 5, hours: "7h" },
  { id: "plant-sp", teacherSlug: "seep.pahuja", title: "Plant Physiology Draw-along", subject: "Biology", lessons: 8, hours: "12h" },
  { id: "shm-akm", teacherSlug: "ajaymishraakm382-9673", title: "SHM, Waves & Sound", subject: "Physics", lessons: 7, hours: "11h" },
  { id: "thermo-akm", teacherSlug: "ajaymishraakm382-9673", title: "Thermal Physics", subject: "Physics", lessons: 6, hours: "9h" },
  { id: "physical-au", teacherSlug: "anupamupadhayay", title: "Physical Chemistry Numericals", subject: "Chemistry", lessons: 11, hours: "17h" },
  { id: "mole-au", teacherSlug: "anupamupadhayay", title: "Mole Concept to Equilibrium", subject: "Chemistry", lessons: 8, hours: "12h" },
  { id: "cell-ak", teacherSlug: "beproton", title: "Cell: The Unit of Life", subject: "Biology", lessons: 6, hours: "8h" },
  { id: "repro-ak", teacherSlug: "beproton", title: "Reproduction & Development", subject: "Biology", lessons: 7, hours: "10h" },
];

export const courses: Course[] = courseSeeds.map((c) => ({
  ...c,
  cover: teachers.find((t) => t.slug === c.teacherSlug)?.avatar ?? "",
}));

const lessonTitles: Record<string, string[]> = {
  "med-live-sept": [
    "Live class — Animal Kingdom wrap + board notes",
    "Structural organisation in animals",
    "Digestion & absorption",
    "Breathing and exchange of gases",
    "Body fluids and circulation",
    "Excretory products",
    "Locomotion and movement",
    "Neural control and coordination",
  ],
  "human-physio": [
    "Chemical coordination",
    "Endocrine maps",
    "Reproduction in humans",
    "Reproductive health",
    "Immune system crash",
    "Sensory systems",
    "PYQ block 1",
    "PYQ block 2",
    "Assertion-reason drill",
    "NCERT highlighter pass",
    "Diagram practice",
    "Full physiology mock review",
  ],
};

function titlesFor(course: Course): string[] {
  const known = lessonTitles[course.id];
  if (known) return known;
  const n = course.lessons;
  return Array.from({ length: n }, (_, i) => `${course.title} · Class ${i + 1}`);
}

export const lessons: Lesson[] = courses.flatMap((course) => {
  const titles = titlesFor(course);
  return titles.map((title, i) => {
    const isFeatured = course.id === "med-live-sept" && i === 0;
    return {
      id: `${course.id}-l${i + 1}`,
      courseId: course.id,
      teacherSlug: course.teacherSlug,
      title,
      duration: isFeatured ? "1h 50m" : `${45 + ((i * 7) % 30)}m`,
      lessonId: isFeatured ? FEATURED_LESSON_ID : FEATURED_LESSON_ID,
      live: isFeatured,
    };
  });
});

export const featuredLesson = lessons.find((l) => l.live)!;

export function getTeacher(slug: string) {
  return teachers.find((t) => t.slug === slug);
}

export function coursesForTeacher(slug: string) {
  return courses.filter((c) => c.teacherSlug === slug);
}

export function getCourse(id: string) {
  return courses.find((c) => c.id === id);
}

export function lessonsForCourse(id: string) {
  return lessons.filter((l) => l.courseId === id);
}

export function getLesson(id: string) {
  return lessons.find((l) => l.id === id);
}

export function lessonByUnacademyId(lessonId: string) {
  return lessons.find((l) => l.lessonId === lessonId);
}

export function searchTeachers(q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return teachers;
  return teachers.filter((t) =>
    `${t.name} ${t.subject} ${t.exam} ${t.bio}`.toLowerCase().includes(s),
  );
}

export function extractLessonId(raw: string): string | null {
  const t = raw.trim();
  const m = t.match(/lesson-raw\/([A-Za-z0-9_-]{6,40})/);
  if (m?.[1]) return m[1];
  if (/^[A-Z0-9]{16,40}$/.test(t)) return t;
  return null;
}
