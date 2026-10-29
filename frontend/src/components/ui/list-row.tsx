import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The one row. Lessons, batch sessions, search hits, favourites, library items
 * all render through this so spacing, hit areas and focus rings match.
 *
 *   ┌──────┬────────────────────────────────────┬──────────┐
 *   │ lead │ title                        badge │ trailing │
 *   │      │ meta · meta · meta                 │ actions  │
 *   └──────┴────────────────────────────────────┴──────────┘
 *
 * The whole row is NOT a link (nested interactive elements are invalid).
 * Make `title` the link; `trailing` holds secondary buttons. `onActivate`
 * is a convenience for rows where one tap should open the primary target.
 */
export function ListRow({
  leading,
  title,
  meta,
  badge,
  trailing,
  density = "comfortable",
  current = false,
  struck = false,
  className,
  as: Tag = "li",
  onActivate,
}: {
  leading?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  badge?: ReactNode;
  trailing?: ReactNode;
  density?: "comfortable" | "compact";
  /** The "you are here" / next-up row. */
  current?: boolean;
  /** Unavailable item: dim it, keep it readable (no strike-through: that reads as "cancelled"). */
  struck?: boolean;
  className?: string;
  as?: "li" | "div";
  onActivate?: () => void;
}) {
  return (
    <Tag
      aria-current={current ? "true" : undefined}
      className={cn(
        "group/row relative flex items-center gap-3 rounded-md transition-colors duration-[var(--dur-fast)]",
        density === "compact" ? "min-h-11 px-2 py-1.5" : "min-h-14 px-3 py-2.5",
        "hover:bg-surface-raised/60 focus-within:bg-surface-raised/60",
        current && "bg-accent-subtle hover:bg-accent-subtle",
        onActivate && "cursor-pointer",
        className,
      )}
      onClick={
        onActivate
          ? (e) => {
              // Let real controls inside the row handle their own clicks.
              if ((e.target as HTMLElement).closest("a,button,input,select,textarea,[role=button]")) return;
              onActivate();
            }
          : undefined
      }
    >
      {/* Dim the picture and title, not the row: an opacity on the row pulls the badge text under 4.5:1. */}
      {leading ? <div className={cn("flex shrink-0 items-center", struck && "opacity-70")}>{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <div className={cn("min-w-0 flex-1 truncate font-medium", struck ? "text-fg-muted" : "text-fg", density === "compact" ? "text-sm" : "text-base")}>{title}</div>
          {/* A badge may take up to half the row; past that it ellipsises so the title keeps its share on phones. */}
          {badge ? <div className="flex min-w-0 max-w-[50%] shrink-0">{badge}</div> : null}
        </div>
        {meta ? <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-muted [&>*]:truncate">{meta}</div> : null}
      </div>
      {trailing ? (
        <div className={cn("flex shrink-0 items-center gap-1", "fine:opacity-0 fine:group-hover/row:opacity-100 fine:group-focus-within/row:opacity-100 fine:transition-opacity")}>{trailing}</div>
      ) : null}
    </Tag>
  );
}

/** Divider-free list container for ListRow. */
export function List({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <ul aria-label={label} className={cn("stagger m-0 grid list-none grid-cols-1 gap-0.5 p-0", className)}>
      {children}
    </ul>
  );
}

/** A thumbnail slot for `leading`: fixed 16:9 box so the list never shifts while images load. */
export function Thumb({ src, alt = "", className, size = "md" }: { src?: string | null; alt?: string; className?: string; size?: "sm" | "md" }) {
  return (
    <div className={cn("overflow-hidden rounded-sm bg-surface-raised", size === "sm" ? "h-9 w-16" : "h-12 w-[5.33rem]", className)}>
      {src ? <img src={src} alt={alt} loading="lazy" decoding="async" className="size-full object-cover" /> : null}
    </div>
  );
}

/** Metadata separator for `meta` children. */
/** Join meta bits with dots, skipping empty ones, so a row never starts with a stray "·". */
export function MetaLine({ parts }: { parts: ReactNode[] }) {
  const kept = parts.filter((p) => p !== null && p !== undefined && p !== false && p !== "");
  return (
    <>
      {kept.map((p, i) => (
        <span key={i} className="contents">
          {i > 0 ? <Dot /> : null}
          {typeof p === "string" ? <span>{p}</span> : p}
        </span>
      ))}
    </>
  );
}

export function Dot() {
  return (
    <span aria-hidden="true" className="text-fg-faint">
      ·
    </span>
  );
}
