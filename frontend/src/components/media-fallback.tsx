import type { LucideIcon } from "lucide-react";
import { initialsFrom } from "@inkboard/shared/initials";

export function MediaFallback({
  label,
  icon: Icon,
  className = "aspect-video w-full",
}: {
  label?: string | null;
  icon?: LucideIcon;
  className?: string;
}) {
  const initials = initialsFrom(label);
  return (
    <div className={`grid place-items-center bg-elevated ${className}`} aria-hidden="true">
      {initials ? (
        <span className="font-serif text-sm tracking-wide text-fg-muted">{initials}</span>
      ) : Icon ? (
        <Icon className="size-7 text-fg-muted" />
      ) : (
        <span className="size-8 bg-chip" />
      )}
    </div>
  );
}
