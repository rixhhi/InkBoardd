export function NotesButton({
  href,
  label = "Notes",
  className = "",
}: {
  href: string;
  label?: string;
  className?: string;
}) {
  if (!href) return null;
  return (
    <a
      href={href}
      download
      className={`ink-underline inline-flex h-11 items-center px-1 text-xs text-fg-muted ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {label}
    </a>
  );
}
