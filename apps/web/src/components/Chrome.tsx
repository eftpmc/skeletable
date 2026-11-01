import { Bot, Check, Copy, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useJson, type Me } from "@/lib/api";
import { useTheme } from "@/lib/theme";

/** The product's mark: a green sheet with one cell left open. */
export const Logo = ({ className = "size-8" }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
    <rect width="32" height="32" rx="8" fill="#16a34a" />
    <rect x="7" y="7" width="8" height="8" rx="2" fill="#fff" />
    <rect x="17" y="7" width="8" height="8" rx="2" fill="#fff" />
    <rect x="7" y="17" width="8" height="8" rx="2" fill="#fff" />
    <rect x="18" y="18" width="6" height="6" rx="1.5" fill="none" stroke="#fff" strokeWidth="2" />
  </svg>
);

export function ThemeButton() {
  const { dark, toggle } = useTheme();
  return (
    <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={dark ? "Use light theme" : "Use dark theme"}>
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}

/** Opens the MCP command. Shows a label when there's room for one, or just the icon. */
export function AgentButton({ label }: { label?: string }) {
  const command = `claude mcp add --transport http skeletable ${location.origin}/mcp`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      // The browser refused; the command is still on screen to select.
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        {label ? (
          <Button variant="outline" size="lg"><Bot />{label}</Button>
        ) : (
          <Button variant="ghost" size="icon-sm" aria-label="Use from an agent"><Bot /></Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] gap-2 p-3">
        <p className="font-medium">Use these from an agent</p>
        <p className="text-muted-foreground">A read-only MCP server. No account needed.</p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 rounded-md bg-muted px-2 py-1.5 font-mono text-xs break-all">{command}</code>
          <Button variant="outline" size="icon-sm" onClick={copy} aria-label={copied ? "Copied" : "Copy command"}>
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Sign in, or who you are and a way out. Shows nothing until sign-in is really available. */
export function AccountButton() {
  const { data } = useJson<Me>("/api/me");
  if (!data?.canSignIn) return null;
  const { user } = data;
  if (!user) {
    return (
      <Button variant="outline" size="sm" asChild>
        <a href="/auth/google">Sign in</a>
      </Button>
    );
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="icon-sm" className="rounded-full" aria-label="Your account">
          {(user.name ?? user.email).charAt(0).toUpperCase()}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-2 p-3">
        {user.name && <p className="truncate font-medium">{user.name}</p>}
        <p className="truncate text-muted-foreground">{user.email}</p>
        <form method="post" action="/auth/logout">
          <Button type="submit" variant="outline" size="sm" className="w-full">Sign out</Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** The bar across every page except a sheet. */
export function SiteHeader() {
  return (
    <header className="flex items-center gap-4 border-b px-4 py-2.5">
      <Link href="/" className="flex items-center gap-2 font-medium tracking-tight">
        <Logo className="size-7" />
        Skeletable
      </Link>
      <Link href="/explore" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Browse tables</Link>
      <div className="ml-auto flex items-center gap-1">
        <AgentButton />
        <ThemeButton />
        <AccountButton />
      </div>
    </header>
  );
}
