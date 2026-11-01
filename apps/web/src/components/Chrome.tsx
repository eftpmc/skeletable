import { Bot, Check, Copy, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMe } from "@/lib/api";
import { useTheme } from "@/lib/theme";

/** The product's mark: a skull built from a sheet's cells, on its own tile so it reads on any background. */
export const Logo = ({ className = "size-8" }: { className?: string }) => <img src="/logo.svg" alt="" className={className} />;

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
  const { canSignIn, user } = useMe();
  if (!canSignIn) return null;
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
