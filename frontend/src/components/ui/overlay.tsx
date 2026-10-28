import { useEffect, useState, type ReactNode } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Drawer } from "vaul";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, IconButton, type ButtonVariant } from "./button";

const OVERLAY = "fixed inset-0 z-[var(--z-dialog)] bg-overlay backdrop-blur-[2px] data-[state=open]:[animation:ui-fade-in_var(--dur-fast)_var(--ease-out)]";

/** Modal dialog. Controlled: pass `open` and `onOpenChange`. Escape/scrim close by default. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  kicker,
  children,
  footer,
  size = "md",
  dismissable = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  kicker?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  dismissable?: boolean;
}) {
  const width = size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-lg";
  return (
    <RadixDialog.Root open={open} onOpenChange={dismissable ? onOpenChange : undefined}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={OVERLAY} />
        <RadixDialog.Content
          aria-busy={!dismissable || undefined}
          className={cn(
            "fixed top-1/2 left-1/2 z-[var(--z-dialog)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-surface p-5 shadow-3 outline-none",
            "data-[state=open]:[animation:ui-fade-in_var(--dur-base)_var(--ease-out)]",
            width,
          )}
        >
          {kicker ? <p className="text-xs font-semibold tracking-wide text-fg-muted uppercase">{kicker}</p> : null}
          <RadixDialog.Title className="font-serif text-xl text-fg">{title}</RadixDialog.Title>
          {description ? <RadixDialog.Description className="mt-1 text-sm text-fg-muted">{description}</RadixDialog.Description> : null}
          {children ? <div className="mt-4">{children}</div> : null}
          {footer ? <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div> : null}
          {dismissable ? (
            <RadixDialog.Close asChild>
              <IconButton label="Close" icon={X} size="sm" className="absolute top-3 right-3" />
            </RadixDialog.Close>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** Confirm a destructive or irreversible action. Focus lands on Cancel. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  busy = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ButtonVariant;
  onConfirm: () => void | Promise<void>;
  busy?: boolean;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={busy ? undefined : onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={OVERLAY} />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-[var(--z-dialog)] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg bg-surface p-5 shadow-3 outline-none data-[state=open]:[animation:ui-fade-in_var(--dur-base)_var(--ease-out)]">
          <AlertDialog.Title className="font-serif text-xl text-fg">{title}</AlertDialog.Title>
          {body ? <AlertDialog.Description className="mt-1 text-sm text-fg-muted">{body}</AlertDialog.Description> : null}
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={busy}>
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant={variant} loading={busy} onClick={() => void onConfirm()}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/** True below 768px (phone). SSR-safe: false until mounted. */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setPhone(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return phone;
}

/**
 * One panel component: a bottom drawer on phones, a right-side panel at ≥768px.
 * Same props either way; callers never branch on viewport.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  side = "right",
  width = "w-[22rem]",
  hideTitle = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  side?: "right" | "left";
  width?: string;
  hideTitle?: boolean;
}) {
  const phone = useIsPhone();
  if (phone) {
    return (
      <Drawer.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-[var(--z-sheet)] bg-overlay" />
          <Drawer.Content
            aria-label={title}
            className="fixed inset-x-0 bottom-0 z-[var(--z-sheet)] flex max-h-[88dvh] flex-col rounded-t-lg bg-surface shadow-3 outline-none"
          >
            <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong" />
            <Drawer.Title className={cn("px-4 pt-3 pb-2 text-base font-semibold text-fg", hideTitle && "sr-only")}>{title}</Drawer.Title>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-[var(--z-sheet)] bg-overlay/60" />
        <RadixDialog.Content
          className={cn(
            "fixed inset-y-0 z-[var(--z-sheet)] flex max-w-[calc(100%-3rem)] flex-col bg-surface shadow-3 outline-none",
            side === "right" ? "right-0" : "left-0",
            width,
          )}
        >
          <div className="flex h-[var(--header-h)] shrink-0 items-center justify-between border-b border-line px-4">
            <RadixDialog.Title className={cn("text-base font-semibold text-fg", hideTitle && "sr-only")}>{title}</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <IconButton label="Close" icon={X} size="sm" />
            </RadixDialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
