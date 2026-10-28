import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MediaFallback } from "@/components/media-fallback";
import {
  clearRecents,
  readRecents,
  readSaved,
  toggleSaved,
  type RecentSearch,
  type SavedTeacher,
} from "@inkboard/shared/library";

export function SavedTeachers() {
  const [items, setItems] = useState<SavedTeacher[]>([]);

  useEffect(() => {
    setItems(readSaved());
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="board-pad">
      <p className="text-xs font-semibold tracking-[0.14em] uppercase text-fg-faint">Saved teachers</p>
      <ul className="mt-3 divide-y divide-line border-y border-line">
        {items.map((t) => (
          <li key={t.username} className="flex items-center gap-3 py-3">
            <Link to="/teacher/$slug" params={{ slug: t.username }} className="flex min-w-0 flex-1 items-center gap-3">
              {t.avatar ? (
                <img src={t.avatar} alt="" loading="lazy" decoding="async" className="size-10 bg-elevated object-cover" />
              ) : (
                <MediaFallback label={t.name} className="size-10" />
              )}
              <span className="min-w-0">
                <span className="block truncate font-serif text-sm">{t.name}</span>
                <span className="text-xs text-fg-muted">@{t.username}</span>
              </span>
            </Link>
            <button
              type="button"
              aria-label="Unsave"
              className="grid size-11 place-items-center text-fg-muted hover:text-fg"
              onClick={() => {
                toggleSaved(t);
                setItems(readSaved());
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RecentSearches({ onPick }: { onPick?: (q: string) => void }) {
  const [items, setItems] = useState<RecentSearch[]>([]);
  const nav = useNavigate();

  useEffect(() => {
    setItems(readRecents());
  }, []);

  if (items.length === 0) return null;

  return (
    <p className="mt-5 text-xs text-fg-muted">
      Recent ·{" "}
      {items.map((r, i) => (
        <span key={r.q}>
          {i ? " · " : null}
          <button
            type="button"
            className="hover:text-accent"
            onClick={() => {
              onPick?.(r.q);
              void nav({ to: "/search", search: { q: r.q } });
            }}
          >
            {r.q}
          </button>
        </span>
      ))}
      {" · "}
      <button
        type="button"
        className="hover:text-fg"
        onClick={() => {
          clearRecents();
          setItems([]);
        }}
      >
        Clear
      </button>
    </p>
  );
}
