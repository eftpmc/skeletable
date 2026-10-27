import * as Dialog from "@radix-ui/react-dialog";
import { type PointerEvent, type ReactNode, useRef, useState } from "react";

/**
 * A tall sheet from the bottom for phones, over a scrim. Pull it down by its top (the grab handle and
 * `header`) to close it; a short pull springs back. Escape and the scrim close it too.
 */
export function DragSheet({
  open,
  onOpenChange,
  label,
  header,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  header?: ReactNode;
  children: ReactNode;
}) {
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);

  function onPointerDown(event: PointerEvent) {
    // Buttons and links in the header still get their taps.
    if ((event.target as HTMLElement).closest("button, a")) return;
    start.current = event.clientY;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: PointerEvent) {
    if (start.current !== null) setDrag(Math.max(0, event.clientY - start.current));
  }
  function onPointerUp() {
    if (start.current === null) return;
    start.current = null;
    if (drag > 120) onOpenChange(false);
    setDrag(0);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ui-fade-in fixed inset-0 z-50 bg-scrim" style={{ opacity: drag ? Math.max(0.2, 1 - drag / 400) : undefined }} />
        <Dialog.Content
          aria-describedby={undefined}
          className="ui-slide-up fixed inset-x-0 bottom-0 z-50 flex h-[92dvh] flex-col overflow-hidden rounded-t-xl bg-canvas pb-[env(safe-area-inset-bottom)] text-ink outline-none"
          style={{ transform: drag ? `translateY(${drag}px)` : undefined, transition: drag ? "none" : "transform 200ms ease-out" }}
        >
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          <div className="shrink-0 touch-none select-none" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
            <div aria-hidden="true" className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line" />
            {header}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
