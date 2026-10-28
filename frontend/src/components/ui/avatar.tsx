import { useState } from "react";
import { initialsFrom } from "@inkboard/shared/initials";
import { cn } from "@/lib/cn";

const SIZE = { xs: "size-6 text-[10px]", sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-base", xl: "size-20 text-xl" } as const;

/** Teacher/user avatar with initials fallback. Decorative when `name` is shown next to it — pass `decorative`. */
export function Avatar({
  src,
  name,
  size = "md",
  decorative = false,
  className,
}: {
  src?: string | null;
  name: string;
  size?: keyof typeof SIZE;
  decorative?: boolean;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const show = src && !broken;
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      className={cn("inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-surface-raised font-semibold text-fg-muted select-none", SIZE[size], className)}
    >
      {show ? (
        <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-cover" onError={() => setBroken(true)} />
      ) : (
        initialsFrom(name) || "?"
      )}
    </span>
  );
}
