/** Scale bar heights so a single >0 day is visible even when the goal is larger. */
export function chartScale(values: number[], goal?: number) {
  const nums = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const peak = Math.max(goal && goal > 0 ? goal : 0, ...nums);
  const max = peak > 0 ? peak : 1;
  return {
    max,
    empty: nums.every((v) => v === 0),
    percents: nums.map((v) => (v <= 0 ? 0 : (v / max) * 100)),
    goalPercent: goal && goal > 0 ? Math.min(100, (goal / max) * 100) : null,
  };
}

export type ChartBar = {
  x: number;
  y: number;
  w: number;
  h: number;
  value: number;
  label?: string;
};

export type ChartPoint = {
  x: number;
  y: number;
  value: number;
  label?: string;
};

const PLOT = 100;
/** Floor so a 40-min day against a 90-min goal still paints a visible SVG bar. */
const MIN_VISIBLE = 8;

export function chartBars(
  values: number[],
  goal?: number,
  labels?: string[],
): {
  empty: boolean;
  max: number;
  goal: number | undefined;
  goalY: number | null;
  bars: ChartBar[];
} {
  const scale = chartScale(values, goal);
  const n = Math.max(1, values.length);
  const gap = n > 24 ? 0.12 : n > 10 ? 0.22 : 0.4;
  const slot = PLOT / n;
  const bars = scale.percents.map((p, i) => {
    const h = p <= 0 ? 0 : Math.max(MIN_VISIBLE, p);
    return {
      x: i * slot + gap / 2,
      y: PLOT - h,
      w: Math.max(0.35, slot - gap),
      h,
      value: numsOrZero(values[i]),
      label: labels?.[i],
    };
  });
  return {
    empty: scale.empty,
    max: scale.max,
    goal,
    goalY: scale.goalPercent == null ? null : PLOT - scale.goalPercent,
    bars,
  };
}

export function chartLine(
  values: number[],
  goal?: number,
  labels?: string[],
): {
  empty: boolean;
  max: number;
  goal: number | undefined;
  goalY: number | null;
  points: ChartPoint[];
  d: string;
} {
  const scale = chartScale(values, goal);
  const n = Math.max(1, values.length);
  const points = scale.percents.map((p, i) => ({
    x: n === 1 ? 50 : (i / (n - 1)) * 100,
    y: 100 - p,
    value: numsOrZero(values[i]),
    label: labels?.[i],
  }));
  const d = points.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`).join(" ");
  return {
    empty: scale.empty,
    max: scale.max,
    goal,
    goalY: scale.goalPercent == null ? null : 100 - scale.goalPercent,
    points,
    d,
  };
}

function numsOrZero(v: number | undefined) {
  return Number.isFinite(v) && (v ?? 0) > 0 ? (v as number) : 0;
}

export function chartTip(bar: ChartBar | ChartPoint, goal?: number) {
  const bits = [bar.label, `${bar.value} min`];
  if (goal && goal > 0) bits.push(`goal ${goal} min`);
  return bits.filter(Boolean).join(" · ");
}

export function chartXLabels(labels: string[] | undefined, count: number): (string | null)[] {
  if (!labels?.length || count <= 0) return [];
  if (count <= 7) return labels.slice(0, count).map((l) => shortLabel(l));
  return labels.slice(0, count).map((l, i) => (i === 0 || i === count - 1 || i === Math.floor((count - 1) / 2) ? shortLabel(l) : null));
}

function shortLabel(raw: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(8);
  return raw.length > 4 ? raw.slice(0, 3) : raw;
}

/** Prefer the study-day log; fall back to session minutes so a lone log still charts. */
export function minutesOnDate(
  days: { date: string; minutesStudied: number }[],
  date: string,
  sessionMinutes = 0,
) {
  const logged = days.find((d) => d.date === date)?.minutesStudied ?? 0;
  const a = Number.isFinite(logged) ? logged : 0;
  const b = Number.isFinite(sessionMinutes) ? sessionMinutes : 0;
  return Math.max(0, a, b);
}

export function sessionMinutesByDate(
  sessions: { date: string; durationMin: number; deletedAt?: string | null }[],
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const s of sessions) {
    if (s.deletedAt) continue;
    const n = Number.isFinite(s.durationMin) ? s.durationMin : 0;
    if (n <= 0) continue;
    map[s.date] = (map[s.date] ?? 0) + n;
  }
  return map;
}
