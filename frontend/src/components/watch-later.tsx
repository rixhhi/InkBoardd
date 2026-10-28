import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { isLater, readLater, removeLater, toggleLater, type LaterItem } from "@inkboard/shared/library";

export function LaterButton({
  lessonId,
  title,
  teacher,
  course,
}: {
  lessonId?: string | null;
  title: string;
  teacher?: string;
  course?: string;
}) {
  const id = lessonId?.trim() || "";
  const [on, setOn] = useState(() => Boolean(id) && isLater(id));
  if (!id) return null;
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Unfold this class" : "Fold this class"}
      title={on ? "Folded" : "Fold"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOn(toggleLater({ lessonId: id, title, teacher, course }));
      }}
      className={`ink-underline h-11 px-1 text-xs ${on ? "text-accent" : "text-fg-muted"}`}
    >
      {on ? "Folded" : "Fold"}
    </button>
  );
}

export function WatchLater() {
  const [tick, setTick] = useState(0);
  const items = useMemo(() => {
    void tick;
    return readLater();
  }, [tick]);

  if (items.length === 0) return null;

  return (
    <section>
      <p className="text-xs font-semibold tracking-[0.14em] uppercase text-fg-faint">Folded</p>
      <ul className="mt-2 divide-y divide-line border-y border-line">
        {items.map((item: LaterItem) => (
          <li key={item.lessonId} className="flex items-center gap-3 py-2.5">
            <Link
              to="/play/$lessonId"
              params={{ lessonId: item.lessonId }}
              search={{ title: item.title, teacher: item.teacher, course: item.course }}
              className="min-w-0 flex-1"
            >
              <span className="block truncate text-sm">{item.title}</span>
              {item.teacher ? <span className="mt-0.5 block text-xs text-fg-muted">@{item.teacher}</span> : null}
            </Link>
            <button
              type="button"
              aria-label="Unfold"
              className="ink-underline text-xs text-fg-muted"
              onClick={() => {
                removeLater(item.lessonId);
                setTick((n) => n + 1);
              }}
            >
              Unfold
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
