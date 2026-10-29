/**
 * Help deck. Every "?" button in the app opens one of these topics; the
 * Guide page (/planner/guide) stitches them together in reading order.
 *
 * Writing rules (so the help never becomes a manual nobody reads):
 *   - `what`  one or two sentences a tired student understands at 11pm.
 *   - `how`   numbered steps, each one an action you can do right now.
 *   - `why`   the reason this exists in *their* terms — exam, time, memory.
 *   - `tips`  optional. Things people only learn by accident.
 *   - `math`  optional. The formula, in plain words, for the curious.
 *   - `faq`   optional. The three questions people actually ask.
 *
 * Pure data; no React here. `helpTopic(id)` is total and never throws.
 */

export type HelpTopicId =
  | "ink"
  | "ink-scrubber"
  | "ink-reink"
  | "ink-calibration"
  | "ink-bridge"
  | "today"
  | "today-strip"
  | "pomodoro"
  | "month"
  | "dashboard-pace"
  | "dashboard-coverage"
  | "analytics"
  | "badges"
  | "revision-intervals"
  | "fit-to-exam"
  | "offline"
  | "admin-digest"
  | "admin-storylines"
  | "admin-member-ink";

export type HelpTopic = {
  id: HelpTopicId;
  /** Short title, as shown in the sheet header and the Guide table of contents. */
  title: string;
  /** Where this lives in the app, e.g. "Planner → Ink". */
  where: string;
  what: string;
  how: string[];
  why: string;
  tips?: string[];
  math?: string;
  faq?: { q: string; a: string }[];
  /** Related topics, shown as links at the foot of the sheet. */
  see?: HelpTopicId[];
};

export const HELP: Record<HelpTopicId, HelpTopic> = {
  ink: {
    id: "ink",
    title: "Ink — what you're forgetting",
    where: "Planner → Ink",
    what: "Every class you have studied is drawn as a handwritten ink stroke. Dark, crisp ink is a lesson you still remember well. Pale, blurry ink is one you are forgetting. A dotted ghost is one you have probably lost.",
    how: [
      "Scan the rows: each row is a subject, each stroke a lesson. The faintest strokes are the ones to look at first.",
      "Tap any stroke to open its card. You see how much the model thinks you remember, when it will fade further, and what to do about it.",
      "Drag the date slider (or press E) to jump to exam day and see what will have faded by then if you do nothing.",
      "Use the card at the bottom — Put the fading ones on the calendar — to turn the worst strokes into short review tasks on your real study days.",
    ],
    why: "Your plan tells you what to study next. It cannot tell you what you studied three weeks ago and have silently forgotten. Ink shows that gap before the exam does. Fifteen minutes re-inking a ghost today is cheaper than re-learning it in the last week.",
    tips: [
      "A short stroke is a lesson you only watched part of. The card offers 'Watch the part you skipped' and starts the player at the exact minute you stopped.",
      "The board is a lens on your own plan, not a test. Rating a lesson honestly is what makes it accurate.",
      "The admin sees exactly the same board for you — the same math, the same strokes — so you can ask them which ghost to tackle first.",
    ],
    math: "Retention is estimated as R = e^(−days ÷ stability). Days is how long since you last watched or reviewed the lesson. Stability is how slowly you forget it: it grows with every review and with how the recall went (shaky, ok, solid), using the same intervals your revision schedule uses. Crisp is R ≥ 0.7, fading is R ≥ 0.35, ghost is below that. At a review's due date R is about 0.45 — visibly greyed. Twice the gap, a ghost.",
    faq: [
      { q: "Why is a lesson I know well shown as a ghost?", a: "The model only knows what you tell it. Open the stroke and rate it 'solid'. It will darken, the next review moves further out, and the model learns that this lesson sticks for you (see Calibration)." },
      { q: "Why is a class I never watched missing?", a: "Ink only draws lessons you have touched: finished, reviewed, or at least partly watched. Unstarted classes belong on the calendar, not here." },
      { q: "Does scrubbing the date change anything?", a: "No. It is a preview. Nothing is written until you rate a lesson or add re-inks to your plan." },
    ],
    see: ["ink-scrubber", "ink-reink", "ink-bridge", "ink-calibration"],
  },

  "ink-scrubber": {
    id: "ink-scrubber",
    title: "The date slider",
    where: "Planner → Ink, under the summary",
    what: "A time machine for your memory. Slide right and the board fades the way the model expects it to by that day. The chalk tick marked EXAM is your exam date.",
    how: [
      "Drag the handle, or use ← → for one day at a time.",
      "Press Home to come back to today, End for the far end of the range.",
      "Press E to jump straight to exam day.",
      "Watch the headline number — '52% of your ink is still legible' — and the '−N pts from today' warning. That is how much you lose if you review nothing.",
    ],
    why: "Forgetting is invisible day to day; it is only obvious in hindsight. Seeing exam day now turns a vague worry into a specific list.",
    tips: ["Scrub to exam day, then open 'Put the fading ones on the calendar' with 'By the exam' selected: it picks exactly the strokes you just saw go pale."],
    see: ["ink", "ink-bridge"],
  },

  "ink-reink": {
    id: "ink-reink",
    title: "Re-inking a lesson",
    where: "Planner → Ink, tap a stroke",
    what: "Rating how a recall went. Three honest answers: shaky (had to look), ok (got there), solid (instant). The stroke goes dark again and the next review date is set.",
    how: [
      "Tap a stroke to open its card.",
      "Try to recall the lesson for thirty seconds — the key idea, the formula, the worked example.",
      "Press shaky, ok or solid. Be honest: a 'solid' you did not earn just hides the gap until the exam.",
      "If the card shows 'Watch the part you skipped', that is the first minute you never saw. Tap it and the player starts right there.",
    ],
    why: "Active recall — trying to remember before you look — is the single most effective study technique that exists, and it takes thirty seconds. Rating closes the loop so the planner knows when to ask again.",
    tips: [
      "A re-ink from this board also ticks off any revision task for that lesson due today or overdue. No double work.",
      "Undo is in the toast for a few seconds if you pressed the wrong rating.",
    ],
    see: ["ink", "ink-calibration", "revision-intervals"],
  },

  "ink-calibration": {
    id: "ink-calibration",
    title: "How the model learns you",
    where: "Happens automatically when you rate",
    what: "Everyone forgets at a different rate, and the same person forgets Thermodynamics faster than Kinematics. Each lesson keeps a small private multiplier that adjusts how fast its ink fades, based on how your ratings compare to what the model predicted.",
    how: [
      "Rate a lesson the model still called crisp as 'shaky' → that lesson now fades 20% faster. Its reviews come sooner.",
      "Rate a lesson the model called a ghost as 'solid' → it fades 25% slower. Its reviews space out.",
      "Agree with the model, or rate something in the fading band → nothing changes.",
      "Keep rating honestly. After a few reviews each lesson has its own personal curve.",
    ],
    why: "A fixed schedule treats every lesson and every student the same. That means it nags you about things you know and lets things you struggle with slip. A schedule that listens does neither.",
    math: "Multiplier starts at 1. Crisp-but-shaky: ×0.8. Ghost-but-solid: ×1.25. A confirmed crisp slowly recovers toward 1 (×1.1). Bounded between 0.5 and 2 so one odd day cannot wreck the picture. The multiplier scales stability in R = e^(−days ÷ stability).",
    faq: [
      { q: "Can I see or reset the multiplier?", a: "Not directly — it is meant to be invisible. It lives with the lesson's review record and syncs with your account. Rating 'solid' a few times in a row lifts a low multiplier back toward normal." },
    ],
    see: ["ink", "ink-reink"],
  },

  "ink-bridge": {
    id: "ink-bridge",
    title: "Put the fading ones on the calendar",
    where: "Planner → Ink, bottom card",
    what: "Turns the board into tasks. Pick a deadline and how many lessons, see exactly which ones land on which study days, then add them to your plan with one tap.",
    how: [
      "Choose a deadline: This week, Two weeks, or By the exam. The card picks lessons that will have faded below crisp by that day.",
      "Choose a count: 3, 5 or 8. Worst strokes come first.",
      "Read the preview: 'Today · 45 min: Continuity, Differentiation…' The '% left' is what you would remember on the deadline if you did nothing.",
      "Press 'Add N to my plan'. They appear on Tasks and the calendar as 'Re-ink: …' reviews, 15 minutes each.",
      "Rate them from Tasks like any other review. Undo is in the toast.",
    ],
    why: "Knowing what you are forgetting is not the same as doing something about it. This makes the doing a single tap and puts it where you will actually see it: on today's list.",
    tips: [
      "Lessons that already have a review scheduled in the window are skipped, so pressing it twice never doubles up.",
      "It respects your study days and holidays, and spreads re-inks so no day gets more than about a third of your daily minutes.",
      "The plan's end date stretches if a re-ink lands past it. Fit to exam still works afterwards.",
    ],
    see: ["ink", "today", "revision-intervals"],
  },

  today: {
    id: "today",
    title: "Tasks — your day on one page",
    where: "Planner → Tasks",
    what: "Today's list in the order to do it: lectures, re-inks, DPPs and anything you added yourself. Tick things off, rate reviews, start a focus block.",
    how: [
      "Work top to bottom. The caret marks the next thing.",
      "Tap the row to mark it done. Tap again to reopen.",
      "On a review, rate it shaky / ok / solid instead of just ticking — that is what schedules the next one.",
      "Fell behind? The 'Behind' banner offers push / spread / skip. Pick one; nothing is deleted, only moved.",
      "Use [ and ] to page days, T for today, ? for every shortcut.",
    ],
    why: "A plan you have to decode every morning is a plan you stop opening. This page answers one question — what now? — and gets out of the way.",
    tips: ["Drag a row onto a day in the week strip to move it.", "'Move to today' and 'Push a day' at the top act on everything pending for that day."],
    see: ["today-strip", "pomodoro", "ink-bridge", "month"],
  },

  "today-strip": {
    id: "today-strip",
    title: "The week strip",
    where: "Planner → Tasks, under the heading",
    what: "Seven days around the one you are looking at. Each cell shows the weekday, the date, and a small bar: full when the day is done, half when it is partly done, amber on a rest day.",
    how: ["Tap a day to view it.", "Drop a task on a day to move it there.", "Use the arrows at either end, or [ and ], to step a day."],
    why: "Seeing the week at a glance tells you whether tomorrow is light enough to absorb what you skip today.",
    see: ["today", "month"],
  },

  pomodoro: {
    id: "pomodoro",
    title: "Focus blocks",
    where: "Planner → Tasks, Focus card",
    what: "A timer bound to what you are actually studying. Work, short break, long break every few rounds. Every finished work block is logged as study time under that subject and lesson.",
    how: [
      "Press 'Start a focus block'. Pick the task you are on, or just a subject.",
      "Choose a preset — 25·5, 50·10, 15·3 — or set your own.",
      "Work until the ring closes. Take the break; it is part of the method.",
      "Switch what you're on mid-block if you move to a different task. Pause and resume survive reloads.",
    ],
    why: "Logging study time by hand never happens. Binding the clock to a task means your analytics, streak and seals fill themselves in from work you actually did.",
    tips: ["The tab title shows the clock, so you can switch to the player and still see it.", "Blocks under a minute are not logged — a false start costs you nothing."],
    see: ["today", "analytics"],
  },

  month: {
    id: "month",
    title: "Month — the whole plan at once",
    where: "Planner → Month",
    what: "Every day as a small board. The number is the date; the fraction is done / planned; chalk dust at the bottom is how much of your daily goal that day carries. Exam day and holidays are marked.",
    how: [
      "Tap a day to open its list on the right (below, on a phone).",
      "Drag a task from the day panel onto another day to move it.",
      "Switch Month / Week / Agenda with the tabs. Agenda is the plan as a plain list.",
      "Use 'Reschedule' when the plan has drifted: push everything, spread it, or skip the oldest.",
      "Download .ics to see it in your phone's calendar.",
    ],
    why: "Tasks shows the day; Month shows the shape of the weeks before the exam. Heavy weeks stand out before they arrive.",
    see: ["today", "fit-to-exam", "dashboard-pace"],
  },

  "dashboard-pace": {
    id: "dashboard-pace",
    title: "Pace — are you on track?",
    where: "Planner → Dashboard",
    what: "One sentence: ahead, on pace, or behind — worked out from what you have finished against what the plan expected by today, and whether you will land before the exam at your current rate.",
    how: [
      "Read the headline. If it says behind, the button next to it opens the catch-up options.",
      "Switch to Syllabus to see topic coverage; Minutes to see your daily totals over 7 / 30 / 90 days.",
      "A 'freeze used' note means a bad week was absorbed by a freeze week instead of breaking your streak.",
    ],
    why: "Falling behind is normal. Noticing in week two is recoverable; noticing in the last week is not.",
    see: ["dashboard-coverage", "fit-to-exam", "month"],
  },

  "dashboard-coverage": {
    id: "dashboard-coverage",
    title: "Coverage plates",
    where: "Planner → Dashboard → Syllabus",
    what: "One plate per topic the course lists. The hatched fill rises as you study it. A red edge means the topic is behind the plan.",
    how: ["Tap a plate to see the lessons under it.", "If a course does not list topics, the plate says so — that is the course, not you."],
    why: "Minutes studied can hide a whole chapter you never touched. Coverage can't.",
    see: ["dashboard-pace", "ink"],
  },

  analytics: {
    id: "analytics",
    title: "Instruments — how you actually study",
    where: "Planner → Analytics",
    what: "Minutes per day, weekday pattern, session lengths, subject split, and how the time was earned (watched, focus blocks, logged by hand). Compared with the previous period.",
    how: [
      "Read the headline insight first; it is the one thing the numbers are trying to tell you.",
      "Change the range to see whether a pattern is a week or a habit.",
      "Weekday pattern: find your dead day and either accept it or move one light task there.",
      "Session length: if most sessions are under 20 minutes, try a 50·10 focus block.",
    ],
    why: "You cannot change a habit you cannot see. Two weeks of honest data beats any study-tips article.",
    see: ["pomodoro", "dashboard-pace"],
  },

  badges: {
    id: "badges",
    title: "Seals",
    where: "Planner → Badges",
    what: "Stamps for things worth doing more than once: streaks, focus blocks, finishing a course, re-inking ghosts. Empty seals show what is closest to earning.",
    how: ["Nothing to do — they stamp themselves as you study.", "'Closest to earning' is a reasonable thing to aim at on a day you lack a plan."],
    why: "Small, visible progress on the weeks when the exam still feels far away.",
    see: ["today", "pomodoro"],
  },

  "revision-intervals": {
    id: "revision-intervals",
    title: "Revision intervals",
    where: "Planner → Settings",
    what: "How many days after a lesson each review falls: by default 1, 3, 7 and 21 days. A 'solid' rating stretches the next gap; a 'shaky' one shortens it.",
    how: [
      "Leave the defaults unless you have a reason. They are a well-studied spacing.",
      "Shorter intervals = more reviews, more confidence, more time. Longer = the opposite.",
      "Changing them affects future reviews and how fast Ink fades; existing dates stay put until the next rating.",
    ],
    why: "Spaced repetition works because the gaps grow. Reviewing something right before you would have forgotten it is what makes it stick.",
    math: "Gap for stage n = interval[n] × rating factor (shaky shortens, solid lengthens) × a small memory bonus for later stages. Ink stability = that gap × 1.25, so retention at the due date is about 0.45.",
    see: ["ink", "ink-reink", "ink-calibration"],
  },

  "fit-to-exam": {
    id: "fit-to-exam",
    title: "Fit to exam",
    where: "Plan wizard, and Dashboard when behind",
    what: "When the plan would end after the exam, this finds the lightest combination of lectures-per-day and daily minutes that lands before it, and offers it as one button.",
    how: ["Read the offer — '3/day, 120 min'. That is the smallest change that works.", "Press it. The plan is regenerated; nothing you have done is lost.", "If no setting fits, it says so. Then it is time to drop a course or a topic."],
    why: "Guessing at settings until the end date looks right is slow and demoralising. This does the search for you.",
    see: ["month", "dashboard-pace"],
  },

  offline: {
    id: "offline",
    title: "Working offline",
    where: "Anywhere, when the connection drops",
    what: "Pages you have opened before still open. Today's plan is saved on the device. Ticking tasks, rating reviews and re-inking all work; they queue here and sync the moment you are back online.",
    how: ["Open the planner once while online so the device has it.", "Study as normal. A banner tells you when you are offline.", "When the connection returns, changes push automatically within a few seconds."],
    why: "Trains, hostels, exam-centre car parks. Study should not depend on signal.",
    tips: ["Classes themselves need the Library's offline download to play without a connection; the planner does not."],
    see: ["today"],
  },

  "admin-digest": {
    id: "admin-digest",
    title: "This week — the member digest",
    where: "Admin → Overview",
    what: "One line per member, quietest first: minutes this week against last, active days out of seven, lessons touched, streak, how much of their ink is still crisp, and when they were last seen. A one-sentence nudge appears when there is something to act on.",
    how: [
      "Read the top line first — it is the person most likely to need a message.",
      "'+40% / −15% / new / same' compares this week's minutes with last week's.",
      "The small bar on the right is their ink: dark for crisp, grey for fading, empty for ghost.",
      "Tap a name to open their detail page, including their full ink board.",
    ],
    why: "Opening Activity, then Members, then each person to work out who has gone quiet takes ten minutes. This is the answer in ten seconds.",
    faq: [
      { q: "What counts as a ghost?", a: "A studied lesson the schedule expects them to have mostly forgotten (retention under 0.35). The warning only appears when they have at least five studied lessons and 40% or more are ghosts, so small samples do not raise alarms." },
      { q: "Why is someone at the top with 0 minutes but 'seen 1 h ago'?", a: "They opened the app but did not watch or finish anything. Opening counts for streak and 'active days'; minutes only count real study." },
    ],
    see: ["admin-storylines", "admin-member-ink"],
  },

  "admin-storylines": {
    id: "admin-storylines",
    title: "Storylines — activity as sittings",
    where: "Admin → Activity, and Overview → Last hour",
    what: "Instead of a raw event log, each member's activity is grouped into sittings: a run of events with no gap longer than 20 minutes. Consecutive watch ticks collapse into one line with the minutes summed. A green dot means they were active in the last five minutes.",
    how: ["Read a sitting as a sentence: who, when, what they opened, how long they watched.", "The header says how many are online now.", "Raw events are kept for an hour; daily totals for the charts are kept for a year."],
    why: "Forty 'watch tick' rows tell you nothing. 'Riya, 9:10–9:52, Kinematics, 38 min' tells you everything.",
    see: ["admin-digest"],
  },

  "admin-member-ink": {
    id: "admin-member-ink",
    title: "A member's ink board",
    where: "Admin → Members → a member",
    what: "The same Fading Ink board the member sees on their own Ink page, read-only. Same math, same strokes, same exam tick.",
    how: ["Scrub to exam day to see what they will have forgotten.", "Pale strokes clustered in one subject usually mean that subject needs a conversation, not more classes.", "You cannot rate for them — recall has to be theirs."],
    why: "Advice that matches what the student is looking at lands. 'Your Maths ink is fading — re-ink Limits this week' beats 'study more'.",
    see: ["ink", "admin-digest"],
  },
};

export const HELP_ORDER: HelpTopicId[] = [
  "today",
  "today-strip",
  "pomodoro",
  "month",
  "ink",
  "ink-scrubber",
  "ink-reink",
  "ink-bridge",
  "ink-calibration",
  "revision-intervals",
  "dashboard-pace",
  "dashboard-coverage",
  "fit-to-exam",
  "analytics",
  "badges",
  "offline",
  "admin-digest",
  "admin-storylines",
  "admin-member-ink",
];

/** Topics shown to members on the Guide page; admin topics are appended for admins. */
export const MEMBER_HELP_ORDER = HELP_ORDER.filter((id) => !id.startsWith("admin-"));
export const ADMIN_HELP_ORDER = HELP_ORDER.filter((id) => id.startsWith("admin-"));

export function helpTopic(id: string | null | undefined): HelpTopic | null {
  if (!id) return null;
  return (HELP as Record<string, HelpTopic>)[id] ?? null;
}

export function isHelpTopicId(id: string): id is HelpTopicId {
  return id in HELP;
}
