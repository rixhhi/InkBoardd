import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Slot, Slottable } from "@radix-ui/react-slot";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap select-none " +
  "transition-[background-color,color,box-shadow,opacity] duration-[var(--dur-fast)] ease-[var(--ease-out)] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring " +
  "disabled:opacity-50 disabled:cursor-not-allowed aria-busy:cursor-progress";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:brightness-110 active:brightness-95 shadow-1",
  secondary: "bg-surface-raised text-fg shadow-1 hover:bg-surface hover:shadow-2",
  ghost: "bg-transparent text-fg-muted hover:bg-surface-raised hover:text-fg",
  danger: "bg-danger text-bg hover:brightness-110 active:brightness-95 shadow-1",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-base",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    /** Legacy alias for variant="ghost". */
    quiet?: boolean;
    icon?: LucideIcon;
    iconEnd?: LucideIcon;
    /** Render the single child (e.g. a router Link) with button styling instead of a <button>. */
    asChild?: boolean;
  }
>(function Button(
  { variant = "primary", size = "md", loading = false, quiet = false, icon: Icon, iconEnd: IconEnd, asChild = false, className, children, disabled, type = "button", ...props },
  ref,
) {
  const look: ButtonVariant = quiet ? "ghost" : variant;
  const classes = cn(BASE, VARIANT[look], SIZE[size], "touch:min-h-[var(--hit-min)]", className);
  if (asChild) {
    // Slottable keeps the child element as the rendered tag while still letting icons sit beside its content.
    return (
      <Slot ref={ref as never} className={classes} {...(props as Record<string, unknown>)}>
        {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0" /> : null}
        <Slottable>{children}</Slottable>
        {IconEnd ? <IconEnd aria-hidden="true" className="size-4 shrink-0" /> : null}
      </Slot>
    );
  }
  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <span className="sr-only">Working</span>
          <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
        </>
      ) : Icon ? (
        <Icon aria-hidden="true" className="size-4 shrink-0" />
      ) : null}
      {children}
      {IconEnd ? <IconEnd aria-hidden="true" className="size-4 shrink-0" /> : null}
    </button>
  );
});

/** A button that is only an icon. `label` is required and becomes the accessible name + tooltip. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
    label: string;
    icon: LucideIcon;
    size?: ButtonSize;
    variant?: Exclude<ButtonVariant, "primary"> | "primary";
    pressed?: boolean;
    children?: ReactNode;
  }
>(function IconButton({ label, icon: Icon, size = "md", variant = "ghost", pressed, className, children, type = "button", ...props }, ref) {
  const dim = size === "sm" ? "size-8" : size === "lg" ? "size-11" : "size-10";
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(BASE, VARIANT[variant], dim, "px-0", pressed && "bg-surface-raised text-fg", "touch:min-h-[var(--hit-min)] touch:min-w-[var(--hit-min)]", className)}
      {...props}
    >
      <Icon aria-hidden="true" className={size === "sm" ? "size-4" : "size-5"} />
      {children}
    </button>
  );
});
