import type { ReactNode } from "react";
import { moveTab } from "@/lib/a11y-tabs";
import { useState } from "react";
import { chartBars, chartLine, chartTip, chartXLabels, chartScale } from "@inkboard/shared/planner/charts";
import { progressPercent } from "@inkboard/shared/planner/daily";
import { subjectHatchClass, subjectIdOf, subjectMark } from "@inkboard/shared/planner/subjects";
import { Select } from "@/components/ui";

export { chartScale };

export function PlannerCard({
  children,
  className = "",
  raised,
  accent,
  interactive,
  id,
}: {
  children: ReactNode;
  className?: string;
  raised?: boolean;
  accent?: string;
  interactive?: boolean;
  id?: string;
}) {
  return (
    <div
      id={id}
      tabIndex={id ? -1 : undefined}
      className={`${raised ? "planner-card-raised" : "planner-card"} min-w-0 ${interactive ? "transition-[box-shadow] hover:shadow-[var(--shadow-2)]" : ""} ${className}`}
      style={accent ? { boxShadow: `inset 2px 0 0 ${accent}, var(--shadow-1)` } : undefined}
    >
      {children}
    </div>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-xs text-fg-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function StatTile({
  label,
  value,
  suffix = "",
  hint,
  icon,
}: {
  label: string;
  value: number;
  suffix?: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <PlannerCard className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-fg-muted">{label}</p>
        {icon}
      </div>
      <p className="mt-2 font-serif text-2xl font-semibold sm:text-3xl tabular">
        {value}
        {suffix}
      </p>
      {hint ? <p className="mt-1 text-xs text-fg-faint">{hint}</p> : null}
    </PlannerCard>
  );
}

export function ProgressBar({
  value,
  max = 100,
  color,
}: {
  value: number;
  max?: number;
  color?: string;
}) {
  const pct = progressPercent(value, max);
  return (
    <div className="h-1.5 overflow-hidden bg-elevated" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full bg-accent" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Chip({
  children,
  tone = "neutral",
  subject,
}: {
  children: ReactNode;
  tone?: "neutral" | "primary" | "warn" | "danger" | "accent";
  subject?: string | null;
}) {
  if (subject) {
    const id = subjectIdOf(subject);
    return (
      <span className={`inline-flex h-6 items-center gap-1 rounded-xs px-2 text-xs font-medium ${subjectHatchClass(id)}`}>
        <span className="hatch-mark" aria-hidden="true">
          {subjectMark(subject)}
        </span>
        {children}
      </span>
    );
  }
  const cls =
    tone === "primary"
      ? "bg-chip text-accent"
      : tone === "warn"
        ? "bg-elevated text-warn"
        : tone === "danger"
          ? "bg-elevated text-danger"
          : tone === "accent"
            ? "bg-elevated text-accent"
            : "bg-elevated text-fg-muted";
  return <span className={`inline-flex h-6 items-center rounded-xs px-2 text-xs font-medium ${cls}`}>{children}</span>;
}

export function SubjectDot({ subject }: { subject?: string | null }) {
  const id = subjectIdOf(subject);
  return (
    <span
      className={`inline-grid size-5 shrink-0 place-items-center rounded-xs ${subjectHatchClass(id)} hatch-mark`}
      aria-hidden="true"
    >
      {subjectMark(subject)}
    </span>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
  ariaLabel: string;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg bg-surface-raised p-1" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          tabIndex={value === o.id ? 0 : -1}
          className={`h-8 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring ${value === o.id ? "bg-surface text-fg shadow-1" : "text-fg-muted hover:text-fg"}`}
          onClick={() => onChange(o.id)}
          onKeyDown={(e) => {
            const next = moveTab(options.map((row) => row.id), value, e.key);
            if (!next) return;
            e.preventDefault();
            onChange(next as T);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function KitSelect({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  ariaLabel: string;
}) {
  // Thin adapter over the kit Select: planner call sites keep {id,label} options and an aria label.
  return <Select label={ariaLabel} hideLabel value={value} onChange={onChange} options={options.map((o) => ({ value: o.id, label: o.label }))} className="min-w-40" />;
}

export function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-11 place-items-center text-fg-muted hover:text-fg active:scale-[0.98]"
    >
      {children}
    </button>
  );
}

export function InlineAlert({
  title,
  body,
  action,
  tone = "warn",
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  tone?: "warn" | "danger" | "primary";
}) {
  const ink = tone === "danger" ? "text-danger" : tone === "primary" ? "text-accent" : "text-warn";
  return (
    <div className={`ink-alert ${ink}`} role="status">
      <p className="text-sm font-medium text-fg">{title}</p>
      {body ? <p className="mt-1 text-xs text-fg-muted">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function EmptyPanel({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="board-state is-empty">
      <h2 className="font-serif text-base font-semibold">{title}</h2>
      <p className="mt-1 max-w-prose text-sm text-fg-muted">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function SkeletonBlock({ className = "h-24" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function ChartTable({
  caption,
  rows,
}: {
  caption: string;
  rows: { label: string; value: string }[];
}) {
  return (
    <div className="sr-only">
      {/* Wrapper, not the table, carries sr-only: a 1px absolutely positioned table still widens the page's scrollable area on phones. */}
      <table>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th>Period</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.label}-${i}`}>
            <td>{r.label}</td>
            <td>{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
      </div>
  );
}

export function BarChart({
  values,
  goal,
  labels,
}: {
  values: number[];
  goal?: number;
  labels?: string[];
}) {
  const layout = chartBars(values, goal, labels);
  const [tip, setTip] = useState<string | null>(null);
  if (layout.empty) {
    return (
      <p className="flex h-32 items-center justify-center text-sm text-fg-muted" role="img" aria-label="No sessions yet">
        No sessions yet — log one
      </p>
    );
  }
  const peak = Math.max(0, ...layout.bars.map((b) => b.value));
  const xLabels = chartXLabels(labels, layout.bars.length);
  return (
    <div className="min-w-0" data-chart-peak={peak}>
      <div className="flex gap-2">
        <div className="flex w-9 shrink-0 flex-col justify-between py-0.5 text-right text-xs tabular text-fg-faint" aria-hidden="true">
          <span>{layout.max}</span>
          {layout.goal ? <span>goal</span> : null}
          <span>0</span>
        </div>
        <div className="min-w-0 flex-1">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="h-32 w-full"
            role="img"
            aria-label={`Minutes per day, peak ${peak}${layout.goal ? `, goal ${layout.goal}` : ""}`}
          >
            {layout.goalY != null ? (
              <g className="text-fg-muted">
                <line
                  x1="0"
                  x2="100"
                  y1={layout.goalY}
                  y2={layout.goalY}
                  stroke="currentColor"
                  strokeDasharray="2 2"
                  opacity="0.45"
                />
              </g>
            ) : null}
            <g className="text-accent">
              {layout.bars.map((b, i) =>
                b.h > 0 ? (
                  <rect
                    key={i}
                    x={b.x}
                    y={b.y}
                    width={b.w}
                    height={b.h}
                    rx="0"
                    fill="currentColor"
                    className="cursor-pointer"
                    onPointerEnter={() => setTip(chartTip(b, layout.goal))}
                    onPointerLeave={() => setTip(null)}
                    onFocus={() => setTip(chartTip(b, layout.goal))}
                    onBlur={() => setTip(null)}
                    tabIndex={0}
                  >
                    <title>{chartTip(b, layout.goal)}</title>
                  </rect>
                ) : (
                  <rect key={`z-${i}`} x={b.x} y={99} width={b.w} height={0.4} fill="currentColor" className="text-line" />
                ),
              )}
            </g>
          </svg>
          {xLabels.length ? (
            <div className="mt-1 flex text-xs tabular text-fg-faint" aria-hidden="true">
              {xLabels.map((lab, i) => (
                <span key={i} className="min-w-0 flex-1 truncate text-center">
                  {lab ?? ""}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {layout.goal ? (
        <p className="mt-1 text-xs tabular text-fg-faint">Dashed line · {layout.goal} min goal</p>
      ) : null}
      <p className="mt-0.5 min-h-4 text-xs tabular text-fg-muted" role="status">
        {tip ?? "\u00a0"}
      </p>
      <ChartTable
        caption={`Minutes per day, peak ${peak}${layout.goal ? `, goal ${layout.goal}` : ""}`}
        rows={layout.bars.map((b, i) => ({
          label: b.label || labels?.[i] || `Day ${i + 1}`,
          value: `${b.value} min`,
        }))}
      />
    </div>
  );
}

export function Sparkline({ values }: { values: number[] }) {
  const line = chartLine(values);
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-6 w-full text-accent"
      role="img"
      aria-label={`Trend over ${values.length} days, last ${values.at(-1) ?? 0}`}
    >
      <path d={line.d} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function LineChart({
  values,
  goal,
  labels,
}: {
  values: number[];
  goal?: number;
  labels?: string[];
}) {
  const layout = chartLine(values, goal, labels);
  const [tip, setTip] = useState<string | null>(null);
  if (layout.empty) {
    return (
      <p className="flex h-40 items-center justify-center text-sm text-fg-muted" role="img" aria-label="No sessions yet">
        No sessions yet — log one
      </p>
    );
  }
  const peak = Math.max(0, ...layout.points.map((p) => p.value));
  const xLabels = chartXLabels(labels, layout.points.length);
  return (
    <div className="min-w-0" data-chart-peak={peak}>
      <div className="flex gap-2">
        <div className="flex w-9 shrink-0 flex-col justify-between py-0.5 text-right text-xs tabular text-fg-faint" aria-hidden="true">
          <span>{layout.max}</span>
          {layout.goal ? <span>goal</span> : null}
          <span>0</span>
        </div>
        <div className="min-w-0 flex-1">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="ink-line h-40 w-full text-accent"
            role="img"
            aria-label={`Minutes, peak ${peak}${layout.goal ? `, goal ${layout.goal}` : ""}`}
          >
            {layout.goalY != null ? (
              <line
                x1="0"
                x2="100"
                y1={layout.goalY}
                y2={layout.goalY}
                stroke="currentColor"
                className="text-fg-muted"
                strokeDasharray="2 2"
                opacity="0.45"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            <path d={layout.d} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            {layout.points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r="1.2"
                fill="currentColor"
                className="cursor-pointer"
                onPointerEnter={() => setTip(chartTip(p, layout.goal))}
                onPointerLeave={() => setTip(null)}
                onFocus={() => setTip(chartTip(p, layout.goal))}
                onBlur={() => setTip(null)}
                tabIndex={0}
              >
                <title>{chartTip(p, layout.goal)}</title>
              </circle>
            ))}
          </svg>
          {xLabels.length ? (
            <div className="mt-1 flex text-xs tabular text-fg-faint" aria-hidden="true">
              {xLabels.map((lab, i) => (
                <span key={i} className="min-w-0 flex-1 truncate text-center">
                  {lab ?? ""}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {layout.goal ? (
        <p className="mt-1 text-xs tabular text-fg-faint">Dashed line · {layout.goal} min goal</p>
      ) : null}
      <p className="mt-0.5 min-h-4 text-xs tabular text-fg-muted" role="status">
        {tip ?? "\u00a0"}
      </p>
      <ChartTable
        caption={`Minutes, peak ${peak}${layout.goal ? `, goal ${layout.goal}` : ""}`}
        rows={layout.points.map((p, i) => ({
          label: p.label || labels?.[i] || `Day ${i + 1}`,
          value: `${p.value} min`,
        }))}
      />
    </div>
  );
}
