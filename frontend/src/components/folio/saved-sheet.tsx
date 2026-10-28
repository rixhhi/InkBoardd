import { Drawer } from "vaul";
import { LedgerBody } from "@/components/folio/ledger";
import type { FolioMode, LedgerFocus } from "@inkboard/shared/folio";

/** The saved-classes sheet. Loaded only after it opens, so the home script skips it. */
export function SavedSheet({
  mode,
  focus,
  onOpenChange,
}: {
  mode: FolioMode;
  focus: LedgerFocus;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Drawer.Root open onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-overlay" />
        <Drawer.Content className="folio-sheet flex flex-col outline-none" aria-label="Saved">
          <div className="folio-handle" />
          <Drawer.Title className="sr-only">Saved</Drawer.Title>
          <LedgerBody mode={mode} focus={focus} />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
