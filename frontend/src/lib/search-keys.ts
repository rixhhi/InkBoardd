export type SearchHitMove = number | "field" | "stay";

/** Where ArrowUp/ArrowDown should go among search hits. -1 means the field is focused. */
export function searchHitTarget(count: number, activeIndex: number, key: string): SearchHitMove {
  if (key !== "ArrowDown" && key !== "ArrowUp") return "stay";
  if (count <= 0) return "stay";
  if (key === "ArrowDown") {
    if (activeIndex < 0) return 0;
    if (activeIndex >= count - 1) return "stay";
    return activeIndex + 1;
  }
  if (activeIndex <= 0) return "field";
  return activeIndex - 1;
}
