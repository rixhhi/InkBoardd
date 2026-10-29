import { test } from "node:test";
import assert from "node:assert/strict";
import { groupStorylines, SITTING_GAP_MS } from "@/components/admin/storylines";
import type { ActivityItem } from "@/components/admin/bits";

const NOW = Date.parse("2026-10-29T10:00:00.000Z");
let id = 1000;
function ev(userId: number, minutesAgo: number, kind: string, extra: Partial<ActivityItem> = {}): ActivityItem {
  return { id: id--, userId, at: new Date(NOW - minutesAgo * 60_000).toISOString(), kind, ref: "", label: "", path: "", seconds: 0, user: { name: `U${userId}`, email: "", role: "member" }, ...extra };
}

test("one sitting per member until a 20-minute silence, newest first, watch minutes summed", () => {
  // Newest-first input, as the API returns it.
  const items = [ev(1, 1, "watch", { seconds: 300 }), ev(2, 3, "lesson"), ev(1, 6, "watch", { seconds: 600 }), ev(1, 40, "login"), ev(1, 45, "lesson")];
  const lines = groupStorylines(items, NOW);
  assert.deepEqual(
    lines.map((l) => [l.userId, l.events.length, l.watchSeconds, l.online]),
    [
      [1, 2, 900, true],
      [2, 1, 0, true],
      [1, 2, 0, false], // 40 and 45 min ago: a separate sitting, and not online
    ],
  );
  assert.equal(lines[0]!.startedAt, items[2]!.at);
  assert.equal(lines[0]!.lastAt, items[0]!.at);
});

test("gap boundary is inclusive at exactly the sitting gap", () => {
  const a = ev(1, 0, "lesson");
  const b = { ...ev(1, 0, "lesson"), at: new Date(Date.parse(a.at) - SITTING_GAP_MS).toISOString() };
  const c = { ...ev(1, 0, "lesson"), at: new Date(Date.parse(a.at) - SITTING_GAP_MS - 1).toISOString() };
  assert.equal(groupStorylines([a, b], NOW).length, 1);
  assert.equal(groupStorylines([a, c], NOW).length, 2);
});

test("members without a user record still get a line", () => {
  const lines = groupStorylines([{ ...ev(9, 2, "page"), user: null }], NOW);
  assert.equal(lines[0]!.name, "Member 9");
});
