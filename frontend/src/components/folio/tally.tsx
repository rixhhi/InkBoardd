import { useEffect, useRef, useState } from "react";
import { tallyGroups, tallyTickIndex } from "@inkboard/shared/hand";

function Group({ n, tickAt }: { n: number; tickAt: number | null }) {
  const marks = Math.min(5, Math.max(0, n));
  return (
    <svg viewBox="0 0 22 16" className="h-4 w-5" aria-hidden="true">
      {[0, 1, 2, 3].map((i) =>
        i < marks ? (
          <path
            key={i}
            d={`M${3.5 + i * 4} 2.5v11`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            className={tickAt === i ? "tally-tick" : undefined}
          />
        ) : null,
      )}
      {marks === 5 ? (
        <path
          d="M2.5 13.5 L19.5 2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          className={tickAt === 4 ? "tally-tick" : undefined}
        />
      ) : null}
    </svg>
  );
}

export function Tally({ count }: { count: number }) {
  const n = Math.max(0, Math.min(40, Math.floor(count)));
  const prev = useRef<number | null>(null);
  const [tick, setTick] = useState<number | null>(null);

  useEffect(() => {
    setTick(tallyTickIndex(prev.current, n));
    prev.current = n;
  }, [n]);

  if (n <= 0) return null;
  const groups = tallyGroups(n);
  let seen = 0;
  return (
    <span className="flex flex-col items-center gap-1" aria-hidden="true">
      {groups.map((g, i) => {
        const start = seen;
        seen += g;
        const local = tick != null && tick >= start && tick < start + g ? tick - start : null;
        return <Group key={i} n={g} tickAt={local} />;
      })}
    </span>
  );
}
