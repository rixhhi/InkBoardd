import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { uid } from "@inkboard/shared/planner/ids";
import type { MilestoneGoal } from "@inkboard/shared/planner/profile";

export function MilestoneForm({ onAdd }: { onAdd: (m: MilestoneGoal) => void }) {
  const [subject, setSubject] = useState("");
  const [by, setBy] = useState("");
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!subject.trim() || !by) return;
        onAdd({ id: uid("ms"), subject: subject.trim(), by });
        setSubject("");
        setBy("");
      }}
    >
      <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject, e.g. Physics" className="min-w-0 flex-1 basis-40" aria-label="Milestone subject" />
      <Input type="date" value={by} onChange={(e) => setBy(e.target.value)} className="w-auto basis-40" aria-label="Finish by" />
      <Button type="submit" variant="secondary" icon={Plus} disabled={!subject.trim() || !by}>
        Add
      </Button>
    </form>
  );
}
