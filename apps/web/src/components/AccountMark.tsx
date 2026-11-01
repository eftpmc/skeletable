import { Logo } from "@/components/Chrome";

/** An account's picture: the logo for Skeletable and a clear people/team fallback until custom images exist. */
export const AccountMark = ({ handle, name, kind = "team", className = "size-12 text-xl" }: { handle: string; name: string; kind?: "person" | "team"; className?: string }) =>
  handle === "skeletable" ? (
    <Logo className={className} />
  ) : (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center ${kind === "person" ? "rounded-full" : "rounded-lg"} bg-secondary font-semibold text-secondary-foreground ${className}`}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
