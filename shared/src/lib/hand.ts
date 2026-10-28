/** Tally groups of at most five marks. */
export function tallyGroups(n: number): number[] {
  const count = Math.max(0, Math.min(40, Math.floor(n)));
  const groups: number[] = [];
  let left = count;
  while (left > 0) {
    groups.push(Math.min(5, left));
    left -= 5;
  }
  return groups;
}

/** Index of the mark that just appeared, or null if this is not a tick. */
export function tallyTickIndex(prev: number | null, next: number): number | null {
  if (prev == null || !(next > prev) || next <= 0) return null;
  return next - 1;
}

export const STRIKE_MS = 240;
export const ERASER_MS = 320;
export const TALLY_MS = 400;
export const PLAYER_IDLE_MS = 2000;
export const PLAYER_HELP_MS = 2400;
