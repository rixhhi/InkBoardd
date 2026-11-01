import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export type Crumb = { label: string; to?: string; params?: Record<string, string>; search?: Record<string, unknown> };

/**
 * Every page starts with one of these. It owns the single <h1>, so the a11y
 * tests can rely on it, and gives breadcrumb, eyebrow, actions and tabs a fixed home.
 */
export function PageHeader({
  eyebrow,
  title,
  titleId,
  subline,
  crumbs,
  actions,
  tabs,
  leading,
  className,
  compact = false,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  titleId?: string;
  subline?: ReactNode;
  crumbs?: Crumb[];
  actions?: ReactNode;
  tabs?: ReactNode;
  leading?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <header className={cn("page-pad", compact ? "pt-4 pb-3" : "pt-6 pb-4 sm:pt-8", className)}>
      {crumbs?.length ? (
        <nav aria-label="Breadcrumb" className="mb-3">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-fg-muted">
            {crumbs.map((c, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a breadcrumb's position is its identity
              <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                {i > 0 ? <ChevronRight aria-hidden="true" className="size-3.5 text-fg-faint" /> : null}
                {c.to ? (
                  <Link to={c.to} params={c.params as never} search={c.search as never} className="rounded-sm hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current={i === crumbs.length - 1 ? "page" : undefined}>{c.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-x-6">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          {leading}
          <div className="min-w-0">
            {eyebrow ? <p className="text-xs font-semibold tracking-[0.14em] text-accent uppercase">{eyebrow}</p> : null}
            <h1 id={titleId} className={cn("font-serif text-fg [text-wrap:balance]", compact ? "text-xl sm:text-2xl" : "mt-1 text-2xl sm:text-3xl")}>
              {title}
            </h1>
            {subline ? <div className="mt-2 max-w-[var(--measure)] text-sm text-fg-muted sm:text-base">{subline}</div> : null}
          </div>
        </div>
        {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2 sm:max-w-[60%] sm:justify-end">{actions}</div> : null}
      </div>
      {tabs ? <div className="mt-4">{tabs}</div> : null}
    </header>
  );
}

/** Sticky filter/sort row under a PageHeader. Scrolls horizontally on narrow screens. */
export function Toolbar({ children, className, sticky = true, trailing }: { children: ReactNode; className?: string; sticky?: boolean; trailing?: ReactNode }) {
  return (
    <div
      role="toolbar"
      aria-label="Filters"
      className={cn(
        "page-pad flex items-center gap-2 py-2",
        sticky && "sticky top-[var(--header-h)] z-[var(--z-sticky)] bg-bg/90 backdrop-blur",
        className,
      )}
    >
      <div className="scroll-fade-x flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none]">{children}</div>
      {trailing ? <div className="flex shrink-0 items-center gap-2">{trailing}</div> : null}
    </div>
  );
}

/** Page body wrapper: horizontal padding + bottom space for the mobile tab bar. */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("page-pad pb-[calc(var(--tabbar-h)+1.5rem)] md:pb-10", className)}>{children}</div>;
}

/** Titled group within a page. `h2` by default. */
export function Section({
  title,
  action,
  children,
  className,
  level = 2,
  description,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  level?: 2 | 3;
  description?: ReactNode;
}) {
  const H = level === 2 ? "h2" : "h3";
  return (
    <section className={cn("mt-8 first:mt-0", className)}>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <H className={cn("font-semibold text-fg", level === 2 ? "text-lg" : "text-base")}>{title}</H>
          {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
