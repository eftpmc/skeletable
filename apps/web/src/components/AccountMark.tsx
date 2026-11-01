import { Logo } from "@/components/Chrome";

/** An account's picture: the logo for the official account, and for everyone else, their first letter. */
export const AccountMark = ({ handle, name, className = "size-12 text-xl" }: { handle: string; name: string; className?: string }) =>
  handle === "skeletable" ? (
    <Logo className={className} />
  ) : (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-lg bg-secondary font-semibold text-secondary-foreground ${className}`}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
