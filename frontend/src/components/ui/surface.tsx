import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Static panel: a bounded region on the page background. */
export const Surface = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { padded?: boolean }>(function Surface(
  { className, padded = true, ...props },
  ref,
) {
  return <div ref={ref} className={cn("rounded-lg bg-surface shadow-1", padded && "p-4 sm:p-5", className)} {...props} />;
});

/** Interactive container: lifts on hover. Wrap it in a Link or give it a role. */
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { padded?: boolean; interactive?: boolean }>(function Card(
  { className, padded = true, interactive = true, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-lg bg-surface shadow-1 transition-[box-shadow,transform] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
        interactive && "hover:shadow-2 focus-within:shadow-2",
        padded && "p-4 sm:p-5",
        className,
      )}
      {...props}
    />
  );
});
