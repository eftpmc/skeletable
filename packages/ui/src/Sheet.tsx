import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { cn } from "./cn";
import { XIcon } from "./icons";

export type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  className?: string;
};

/** Slides up from the bottom on phones, centered dialog on wider screens. Escape and the scrim close it. */
export function Sheet({ open, onOpenChange, title, children, className }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-scrim" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-xl bg-canvas pb-[env(safe-area-inset-bottom)] text-ink outline-none md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl",
            className,
          )}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between bg-canvas/95 px-5 pt-4 pb-3 backdrop-blur">
            <Dialog.Title className="text-title-3">{title}</Dialog.Title>
            <Dialog.Close aria-label="Close" className="flex size-9 items-center justify-center rounded-full text-muted outline-none hover:bg-surface hover:text-ink focus-visible:ring-2 focus-visible:ring-focus">
              <XIcon size={18} />
            </Dialog.Close>
          </div>
          <div className="px-5 pb-6">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
