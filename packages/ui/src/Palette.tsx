import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

/**
 * A command palette's frame: fullscreen on phones, a panel near the top of the screen on wider ones,
 * over a scrim. Escape and the scrim close it. Children bring the field and the list.
 */
export function PaletteDialog({ open, onOpenChange, label, children }: { open: boolean; onOpenChange: (open: boolean) => void; label: string; children: ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ui-fade-in fixed inset-0 z-50 hidden bg-scrim md:block" />
        <Dialog.Content
          aria-describedby={undefined}
          className="ui-rise-in ui-drop-in fixed inset-0 z-50 flex flex-col bg-canvas pt-[env(safe-area-inset-top)] text-ink outline-none md:inset-x-auto md:top-[10vh] md:bottom-auto md:left-1/2 md:max-h-[72vh] md:w-full md:max-w-[640px] md:-translate-x-1/2 md:overflow-hidden md:rounded-xl md:pt-0 md:shadow-field"
        >
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
