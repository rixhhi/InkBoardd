export type MissedTask = {
  id: string;
  date: string;
  status: string;
  deletedAt?: string | null;
};

/** Pending work from before today, in its current order. */
export function missedMoves<T extends MissedTask>(tasks: T[], today: string): T[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return [];
  return tasks.filter((task) => !task.deletedAt && task.status === "pending" && task.date < today);
}
