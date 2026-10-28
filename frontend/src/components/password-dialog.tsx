import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, Dialog, Field, Input, toast } from "@/components/ui";
import { describeError } from "@/lib/api-client";
import { sendJson } from "@/lib/session";

/** Change your own password. Other sessions are signed out; this one is renewed. */
export function PasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => sendJson("/api/me/password", "POST", { current, next }),
    onSuccess: () => {
      toast.success("Password changed. Other devices were signed out.");
      close(false);
    },
    onError: (err) => setError(describeError(err).body),
  });

  function close(v: boolean) {
    onOpenChange(v);
    if (!v) {
      setCurrent("");
      setNext("");
      setConfirm("");
      setError(null);
    }
  }

  function submit() {
    if (next !== confirm) {
      setError("The two new passwords don't match.");
      return;
    }
    setError(null);
    save.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Change password"
      description="At least 10 characters, with letters and a number."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={!current || !next || !confirm} onClick={submit}>
            Change password
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Current password">{(p) => <Input {...p} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />}</Field>
        <Field label="New password">{(p) => <Input {...p} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}</Field>
        <Field label="Repeat new password" error={error ?? undefined}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
