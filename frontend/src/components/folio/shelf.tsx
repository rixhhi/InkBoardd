import { catalogMetaClass, catalogTitleClass } from "@/components/catalog-row";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { initialsFrom } from "@inkboard/shared/initials";
import { subjectHatchClassFor } from "@inkboard/shared/planner/subjects";
import { setShelfLedger, type ShelfLedgerPayload } from "@inkboard/shared/shelf";

export function useShelfLedger(payload: ShelfLedgerPayload) {
  const key = useMemo(() => JSON.stringify(payload), [payload]);
  useEffect(() => {
    setShelfLedger(payload);
    return () => setShelfLedger(null);
    // payload is mirrored by key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

export function WallLink({
  children = "← Wall",
  to,
}: {
  children?: ReactNode;
  to?: string;
}) {
  if (to) {
    return (
      <a href={to} className="ink-underline text-sm text-fg-muted">
        {children}
      </a>
    );
  }
  return (
    <Link to="/" className="ink-underline text-sm text-fg-muted">
      {children}
    </Link>
  );
}

export function LargeStamp({ src, name }: { src?: string; name: string }) {
  const mark = initialsFrom(name) || name.slice(0, 2).toUpperCase();
  return (
    <span className="stamp-mat is-large" aria-hidden={Boolean(src)}>
      {src ? (
        <img src={src} alt="" width={168} height={168} loading="lazy" decoding="async" className="stamp-face" />
      ) : (
        <span className="stamp-face stamp-initials">{mark}</span>
      )}
    </span>
  );
}

export function StrikeTitle({
  done,
  children,
  className = "",
}: {
  done?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(id);
  }, []);
  return (
    <span className={`chalk-title strike-title${done ? " is-on" : ""}${ready ? " is-ready" : ""}${className ? ` ${className}` : ""}`}>
      {children}
    </span>
  );
}

export function ChalkLead({
  n,
  title,
  meta,
  struck,
  live,
  next,
  progress,
}: {
  n: number | string;
  title: string;
  meta?: string;
  struck?: boolean;
  live?: boolean;
  next?: boolean;
  progress?: number;
}) {
  const watched = progress != null && progress > 2 ? Math.min(100, Math.round(progress)) : 0;
  return (
    <>
      {next ? <span className="chalk-caret" aria-hidden="true" /> : null}
      <span className="chalk-num tabular">{n}</span>
      <span className="min-w-0 flex-1">
        <StrikeTitle done={struck}>{title}</StrikeTitle>
        {meta ? (
          <span className="chalk-meta">
            {live ? <span className="text-danger">Live · </span> : null}
            {meta}
          </span>
        ) : null}
        {watched > 0 ? (
          <span className="desk-watch" aria-hidden="true">
            <span style={{ width: `${watched}%` }} />
          </span>
        ) : null}
      </span>
    </>
  );
}

export function ChalkRow({
  next,
  struck,
  children,
  actions,
}: {
  next?: boolean;
  struck?: boolean;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <li className={`chalk-row${next ? " is-next" : ""}${struck ? " is-struck" : ""}`}>
      {children}
      {actions ? <div className="chalk-actions">{actions}</div> : null}
    </li>
  );
}

export function IndexLine({
  kicker,
  title,
  meta,
}: {
  kicker?: string;
  title: string;
  meta?: string;
}) {
  return (
    <>
      <span className={`desk-tick ${subjectHatchClassFor(kicker || title)}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className={catalogTitleClass}>{title}</span>
        {kicker || meta ? (
          <span className={catalogMetaClass}>
            {kicker ? <span>{kicker}</span> : null}
            {kicker && meta ? <span aria-hidden="true"> · </span> : null}
            {meta ? <span>{meta}</span> : null}
          </span>
        ) : null}
      </span>
    </>
  );
}

export function SeekHit({
  avatar,
  name,
  username,
  meta,
  onOpen,
}: {
  avatar?: string;
  name: string;
  username: string;
  meta?: string;
  onOpen?: () => void;
}) {
  const mark = initialsFrom(name) || username.slice(0, 2).toUpperCase();
  return (
    <Link to="/teacher/$slug" params={{ slug: username }} data-search-hit className="stamp-hit" onClick={() => onOpen?.()}>
      {avatar ? (
        <img src={avatar} alt="" width={36} height={36} loading="lazy" decoding="async" className="stamp-face" />
      ) : (
        <span className="stamp-face stamp-initials">{mark}</span>
      )}
      <span className="min-w-0">
        <span className={catalogTitleClass}>{name}</span>
        <span className={catalogMetaClass}>
          @{username}
          {meta ? ` · ${meta}` : ""}
        </span>
      </span>
    </Link>
  );
}

export function ShelfEmpty({
  title,
  body,
  action,
  heading,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  heading?: 1 | 2;
}) {
  const Title = heading === 1 ? "h1" : heading === 2 ? "h2" : "p";
  return (
    <div className="shelf-empty">
      <Title className={heading ? "font-serif text-display" : "text-lg font-medium"}>{title}</Title>
      {body ? <p className="mt-2 max-w-[65ch] text-sm text-fg-muted">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function LineSkel({ n = 8 }: { n?: number }) {
  return (
    <div className="mt-6" aria-hidden="true">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="line-skel" />
      ))}
    </div>
  );
}

export function WriteField({
  value,
  onChange,
  onSubmit,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  label: string;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
    >
      <label className="block max-w-[65ch]">
        <span className="sr-only">{label}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className="write-field"
        />
      </label>
    </form>
  );
}

export function MuteWord({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected?: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" onClick={onSelect} className={`inline-flex h-8 items-center rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${selected ? "bg-fg text-bg" : "bg-surface-raised text-fg-muted hover:text-fg"}`} aria-pressed={selected}>
      {label}
    </button>
  );
}

export function Brief({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text.trim()) return null;
  return (
    <div className="mt-3 max-w-[65ch]">
      <button type="button" className="ink-underline text-sm text-fg-muted" onClick={() => setOpen((v) => !v)}>
        {open ? "Fold the brief" : "Read the brief"}
      </button>
      {open ? <p className="mt-2 text-sm leading-relaxed text-fg-muted">{text}</p> : null}
    </div>
  );
}
