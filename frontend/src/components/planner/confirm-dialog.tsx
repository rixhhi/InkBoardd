import type { ReactNode } from "react";
import { ConfirmDialog as KitConfirmDialog } from "@/components/ui";

/**
 * Thin adapter over the kit ConfirmDialog for callers that still speak `onClose` / `tone`.
 * New code should import ConfirmDialog from "@/components/ui" directly.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Delete",
  tone = "danger",
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <KitConfirmDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={title}
      body={
        children ? (
          <>
            {body}
            {children}
          </>
        ) : (
          body
        )
      }
      confirmLabel={confirmLabel}
      variant={tone === "danger" ? "danger" : "primary"}
      onConfirm={onConfirm}
    />
  );
}
