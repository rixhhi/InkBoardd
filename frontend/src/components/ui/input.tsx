import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Kbd } from "./kbd";

export const FIELD =
  "h-10 w-full rounded-md bg-surface px-3 text-base text-fg shadow-1 placeholder:text-fg-faint " +
  "transition-[box-shadow] duration-[var(--dur-fast)] focus:outline-none focus:shadow-[0_0_0_2px_var(--color-ring)] " +
  "disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(FIELD, className)} {...props} />;
});

/** Labelled field. The label is always visible; `hint` goes below; `error` is announced. */
export function Field({
  label,
  hint,
  error,
  children,
  id: given,
}: {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: true }) => ReactNode;
  id?: string;
}) {
  const auto = useId();
  const id = given ?? auto;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint ? (
        <p id={hintId} className="text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Search box with clear button, optional shortcut hint, and a polite live result count. */
export const SearchInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
    value: string;
    onChange: (next: string) => void;
    onClear?: () => void;
    shortcut?: string;
    resultCount?: number | null;
    label: string;
  }
>(function SearchInput({ value, onChange, onClear, shortcut, resultCount, label, className, ...props }, ref) {
  const id = useId();
  const countId = `${id}-count`;
  return (
    <div className={cn("relative", className)}>
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-faint" />
      <input
        ref={ref}
        type="search"
        aria-label={label}
        aria-describedby={resultCount != null ? countId : undefined}
        className={cn(FIELD, "ui-search-field pl-9", (value || shortcut) && "pr-10")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        {...props}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-sm text-fg-muted hover:bg-surface-raised hover:text-fg"
          onClick={() => {
            onChange("");
            onClear?.();
          }}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : shortcut ? (
        <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">
          <Kbd>{shortcut}</Kbd>
        </span>
      ) : null}
      {resultCount != null ? (
        <span id={countId} className="sr-only" aria-live="polite">
          {resultCount === 1 ? "1 result" : `${resultCount} results`}
        </span>
      ) : null}
    </div>
  );
});
