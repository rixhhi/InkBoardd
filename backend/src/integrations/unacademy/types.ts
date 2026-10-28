import type { CrashDoor } from "@inkboard/shared/crash-doors";
import type { Exam } from "@inkboard/shared/exams";
import type { LessonStatus, UaLesson } from "@inkboard/shared/parse-lesson";

export type Educator = {
  username: string;
  uid: string;
  name: string;
  bio: string;
  avatar: string;
  followers: number;
  languages: string[];
  designation: string;
  courseCount: number;
};
export type TopicRef = {
  uid: string;
  name: string;
  level: number;
  parent?: string;
  parentUid?: string;
};
export type TopicCovered = TopicRef & { courseCount: number };
export type UaCourse = {
  uid: string;
  name: string;
  slug: string;
  thumbnail: string;
  itemCount: number;
  language: string;
  startsAt: string | null;
  endsAt: string | null;
  viewCount: number;
  topics: TopicRef[];
};
export type CourseDetail = {
  course: UaCourse & { description: string; authorName: string; authorUsername: string };
  lessons: UaLesson[];
  nextOffset: number | null;
  total: number;
};
export type EducatorPage = {
  educator: Educator;
  courses: UaCourse[];
  totalCourses: number;
  nextOffset: number | null;
  topics: TopicCovered[];
  sort: "latest" | "popular";
};
export type EducatorHit = {
  username: string;
  uid: string;
  name: string;
  bio: string;
  avatar: string;
  followers: number;
  courseCount: number;
  inExam?: boolean;
  topics?: string;
};
export type ExamTeacher = {
  username: string;
  uid: string;
  name: string;
  bio: string;
  avatar: string;
  followers: number;
  topics: string;
  rank: number | null;
};
export type ExamPage = {
  exam: Exam;
  teachers: ExamTeacher[];
  total: number;
  nextOffset: number | null;
};
export type ExamPlaylist = {
  uid: string;
  name: string;
  topic: string;
  lessonCount: number;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  thumbnail: string;
  courseUid?: string;
  courseSlug?: string;
};
export type ExamSubject = {
  uid: string;
  name: string;
  icon: string;
};
export type ExamCourse = {
  uid: string;
  name: string;
  slug: string;
  topic: string;
  lessonCount: number;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  thumbnail: string;
  liveAt: string | null;
  classUid: string | null;
  classSlug: string | null;
  replayId: string | null;
  status: LessonStatus;
  goalUid?: string;
  goalName?: string;
};
export type ExamHub = ExamPage & {
  playlists: ExamPlaylist[];
  trending: ExamCourse[];
  subjects: ExamSubject[];
  courses: ExamCourse[];
  coursesTotal: number;
  coursesNext: number | null;
  live: LiveSlot[];
  later: LiveSlot[];
  week: LiveSlot[];
  crash: CrashDoor[];
  partial?: string[];
};
export type UaBatch = {
  uid: string;
  name: string;
  slug: string;
  thumbnail: string;
  startsAt: string | null;
  endsAt: string | null;
  goalName: string;
  goalUid: string;
  syllabusTag: string;
  language: string;
  authors: { name: string; username: string; avatar: string }[];
  state: number;
};
export type BatchSession = {
  uid: string;
  title: string;
  slug: string;
  liveAt: string | null;
  durationSec: number;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  courseUid: string;
  courseSlug: string;
  courseName: string;
  status: LessonStatus;
  rank: number;
  replayId: string | null;
};
export type BatchDetail = {
  batch: UaBatch & {
    description: string;
    lessonsCount: number;
    liveClasses: number;
    mockTests: number;
  };
  sessions: BatchSession[];
  nextPastRank: number | null;
  nextUpcomingRank: number | null;
};
export type SpecialCourse = UaCourse & {
  liveAt: string | null;
  classUid: string | null;
  classSlug: string | null;
  status: LessonStatus;
  replayId: string | null;
};
export type ClassDetail = {
  uid: string;
  title: string;
  slug: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  courseUid: string;
  courseSlug: string;
  courseName: string;
  liveAt: string | null;
  durationSec: number;
  status: LessonStatus;
  replayId: string | null;
  notesUrl: string | null;
  slidesUrl: string | null;
  hlsUrls: string[];
  livePlayer: string;
  attendance: number;
};
export type LiveSlot = {
  classUid: string;
  classSlug: string;
  title: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  cover: string;
  liveAt: string | null;
  status: LessonStatus;
  replayId: string | null;
  attendance: number;
  goalUid?: string;
  goalName?: string;
  plus?: boolean;
};
export type ReplayHit = {
  title: string;
  replayId: string;
};
