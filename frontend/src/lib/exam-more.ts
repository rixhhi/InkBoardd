export type More<T> = { items: T[]; next: number | null; error: string };

export function blankMore<T>(): More<T> {
  return { items: [], next: null, error: "" };
}

export function appendMore<T>(state: More<T>, items: T[], next: number | null): More<T> {
  return { items: [...state.items, ...items], next, error: "" };
}

export function failMore<T>(state: More<T>, error: string): More<T> {
  return { ...state, error };
}

export function visibleNext<T>(hubNext: number | null | undefined, more: More<T>): number | null {
  if (more.items.length === 0) return hubNext ?? null;
  return more.next;
}
