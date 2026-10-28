import { COPY } from "@inkboard/shared/copy";

export function DeskSkip() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[80] focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg"
    >
      {COPY.skipToBoard}
    </a>
  );
}
