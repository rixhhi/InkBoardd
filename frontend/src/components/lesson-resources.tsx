import { useEffect, useState } from "react";
import { resourceLinks } from "@inkboard/shared/notes";
import { Dialog } from "@/components/ui";
import type { UaLesson } from "@/lib/unacademy";

type Item = {
  key: string;
  label: string;
  hint: string;
  href: string;
};

export function LessonResources({ lesson }: { lesson: UaLesson }) {
  const [open, setOpen] = useState(false);
  const links = resourceLinks(lesson);
  const items: Item[] = [
    {
      key: "pdf",
      label: "Class PDF",
      hint: links.slides ? "Slides without ink" : "Not uploaded yet",
      href: links.slides,
    },
    {
      key: "dpp",
      label: links.dppName === "DPP" ? "DPP" : links.dppName,
      hint: links.dppPdf ? "Daily practice problems (PDF)" : "Not uploaded yet",
      href: links.dppPdf,
    },
    {
      key: "notes",
      label: "Notes",
      hint: links.notes ? "Slides with handwriting" : "Not uploaded yet",
      href: links.notes,
    },
  ];
  const available = items.filter((i) => i.href).length;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!available) return null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="ink-underline h-11 px-1 text-xs text-fg-muted"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Notes{available ? ` · ${available}` : ""}
      </button>
      {open ? (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)} title={lesson.title} kicker="Notes">
            <ul className="mt-5 divide-y divide-line border-y border-line">
              {items.map((item) => (
                <li key={item.key}>
                  {item.href ? (
                    <a
                      href={item.href}
                      download
                      className="flex min-h-12 items-baseline justify-between gap-4 py-3"
                      onClick={() => setOpen(false)}
                    >
                      <span>
                        <span className="block text-sm">{item.label}</span>
                        <span className="mt-0.5 block text-xs text-fg-muted">{item.hint}</span>
                      </span>
                      <span className="ink-underline text-xs text-fg-muted">Save</span>
                    </a>
                  ) : (
                    <div className="flex min-h-12 items-baseline justify-between gap-4 py-3 opacity-50">
                      <span>
                        <span className="block text-sm">{item.label}</span>
                        <span className="mt-0.5 block text-xs text-fg-muted">{item.hint}</span>
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <button type="button" className="ink-underline mt-4 text-sm text-fg-muted" onClick={() => setOpen(false)}>
              Close
            </button>
        </Dialog>
      ) : null}
    </>
  );
}
