import { CircleAlert, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { signInHref } from "@/lib/account";

const widths = { narrow: "max-w-2xl", wide: "max-w-5xl", full: "max-w-6xl" };

/** Every page's main column, so pages line up with each other and with the footer. */
export const Content = ({ size = "wide", children }: { size?: keyof typeof widths; children: ReactNode }) => (
  <main className={`mx-auto w-full ${widths[size]} px-4 pt-8 pb-16 sm:px-6`}>{children}</main>
);

/** A page's title, what it's for, and its main actions. */
export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {description && <p className="mt-1 max-w-2xl text-muted-foreground">{description}</p>}
    </header>
  );
}

/** One part of a page. Parts are divided by a line, so the first has none. */
export const Section = ({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) => (
  <section className="space-y-3 border-t pt-5 first:border-t-0 first:pt-0">
    <div>
      <h2 className="font-medium">{title}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
    {children}
  </section>
);

/** A labelled form control. The label wraps it, so clicking the words focuses it. */
export const Field = ({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) => (
  <label className="block space-y-1.5">
    <span className="block text-sm font-medium">{label}</span>
    {children}
    {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
  </label>
);

export const FormError = ({ error }: { error?: string }) => (error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null);

/** Nothing here yet: says why, with a way forward. */
export const EmptyState = ({ icon: Icon, title, body, action }: { icon?: LucideIcon; title: string; body?: string; action?: ReactNode }) => (
  <div className="rounded-xl border px-4 py-12 text-center">
    {Icon && <Icon className="mx-auto mb-3 size-6 text-muted-foreground" />}
    <p className="font-medium">{title}</p>
    {body && <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>}
    {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
  </div>
);

/** Couldn't load, which isn't the same as nothing being there. */
export const LoadFailed = ({ what, retry }: { what: string; retry?: () => void }) => (
  <div className="rounded-xl border px-4 py-12 text-center">
    <CircleAlert className="mx-auto mb-3 size-6 text-muted-foreground" />
    <p className="font-medium">{what} didn't load</p>
    {retry && <Button variant="outline" size="sm" className="mt-4" onClick={retry}>Try again</Button>}
  </div>
);

export const LoadingList = ({ rows = 3, label }: { rows?: number; label: string }) => (
  <div className="divide-y overflow-hidden rounded-xl border" aria-label={label}>
    {Array.from({ length: rows }, (_, index) => <Skeleton key={index} className="h-14 rounded-none" />)}
  </div>
);

/** Compact rows with dividers in a gently rounded container. */
export const List = ({ children, label }: { children: ReactNode; label?: string }) => <ul aria-label={label} className="divide-y overflow-hidden rounded-xl border text-sm">{children}</ul>;

/** Asks once more, in place, before something that can't be undone. */
export function ConfirmButton({ label, confirm, onConfirm }: { label: string; confirm: string; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <Button variant="outline" onClick={() => setAsking(true)}>{label}</Button>;
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="destructive" onClick={onConfirm}>{confirm}</Button>
      <Button variant="ghost" onClick={() => setAsking(false)}>Cancel</Button>
    </div>
  );
}

export const SignInLink = ({ label = "Sign in" }: { label?: string }) => (
  <Button variant="outline" size="sm" asChild><a href={signInHref()}>{label}</a></Button>
);
