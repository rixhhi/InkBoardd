import { useEffect, useRef } from "react";
import { Fetching } from "@/components/fetching";

export function InfiniteTrigger({
  onVisible,
  disabled,
  label,
  auto = true,
}: {
  onVisible: () => void;
  disabled?: boolean;
  label: string;
  auto?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onVisible);
  cb.current = onVisible;

  useEffect(() => {
    if (!auto || disabled) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) cb.current();
      },
      { rootMargin: "480px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [auto, disabled]);

  const wait = /^more /i.test(label) ? `Fetching ${label.charAt(0).toLowerCase()}${label.slice(1)}` : label;
  return (
    <div ref={ref} className="mt-6">
      {disabled ? (
        <Fetching label={wait} compact />
      ) : (
        <button
          type="button"
          onClick={onVisible}
          className="h-11 text-sm text-fg-muted hover:text-fg"
        >
          {label}
        </button>
      )}
    </div>
  );
}
