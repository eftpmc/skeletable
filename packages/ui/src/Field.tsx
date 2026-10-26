import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

const control =
  "w-full rounded-xl bg-surface px-4 text-body text-ink outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-40";

/** A text input: filled `surface`, no border, the focus ring shows where you're typing. */
export function TextField({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-12", className)} {...props} />;
}

export function TextArea({ className, rows = 3, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={cn(control, "py-3", className)} {...props} />;
}

/**
 * A label over one control or a group of them (chips, swatches). A div rather than a <label>, so
 * clicking the label text never presses the first chip; give the control its own aria-label.
 */
export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="group" aria-label={label} className={className}>
      <span className="mb-2 block text-footnote font-semibold text-muted">{label}</span>
      {children}
    </div>
  );
}
