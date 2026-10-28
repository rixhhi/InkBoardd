import { useId, useState } from "react";
import { toast } from "sonner";
import { Button, Dialog, Input } from "@/components/ui";
import { logManualStudy, undoLast } from "@inkboard/shared/planner/storage";

/** Manual study entry for lectures watched elsewhere. Counts toward the daily mark like any other session. */
export function LogStudyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [start, setStart] = useState("");
  const [minutes, setMinutes] = useState(45);
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const id = useId();
  const formId = `${id}-form`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const iso = start ? new Date(start).toISOString() : new Date().toISOString();
    const result = logManualStudy({ startIso: iso, durationMin: minutes, subject, notes });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success("Logged a session", { action: { label: "Undo", onClick: () => undoLast() } });
    setError("");
    onClose();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Log study"
      kicker="Study log"
      description="For lectures you watched somewhere else. Counts toward the mark."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId}>Save</Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-fg">Start</span>
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            <span className="text-xs text-fg-muted">Blank means now.</span>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-fg">Minutes</span>
            <Input type="number" min={1} max={720} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} required />
          </label>
        </div>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-fg">Subject</span>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Physics, Maths…" />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-fg">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-md bg-surface px-3 py-2 text-base text-fg shadow-1 placeholder:text-fg-faint focus:outline-none focus:shadow-[0_0_0_2px_var(--color-ring)]"
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
