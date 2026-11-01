import { Bot, Check, Copy, Moon, Sun } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { accountLinks } from "@/lib/account";
import { useMe, type Me } from "@/lib/api";
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

/** The MCP command, ready to copy. */
function AgentCommand() {
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
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 rounded-md bg-muted px-2 py-1.5 font-mono text-xs break-all">{command}</code>
      <Button variant="outline" size="icon-sm" onClick={copy} aria-label={copied ? "Copied" : "Copy command"}>
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

/** Opens the MCP command. Shows a label when there's room for one, or just the icon. */
export function AgentButton({ label }: { label?: string }) {
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
        <AgentCommand />
      </PopoverContent>
    </Popover>
  );
}

type User = NonNullable<Me["user"]>;

const Initial = ({ user }: { user: User }) => (
  <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground">
    {(user.name ?? user.email).charAt(0).toUpperCase()}
  </span>
);

const SignOutForm = ({ formRef, children }: { formRef?: React.Ref<HTMLFormElement>; children?: React.ReactNode }) => (
  <form ref={formRef} method="post" action="/auth/logout">{children}</form>
);

/** On a phone there's no room for a menu inside the menu, so this just says who you are. */
export function PhoneAccount({ user }: { user: User }) {
  return (
    <div className="flex items-center gap-2.5 px-2.5 pb-1">
      <Initial user={user} />
      <div className="min-w-0 flex-1 text-sm">
        {user.name && <p className="truncate font-medium">{user.name}</p>}
        <p className="truncate text-muted-foreground">{user.email}</p>
      </div>
      <SignOutForm><Button type="submit" variant="outline" size="sm">Sign out</Button></SignOutForm>
    </div>
  );
}

/** Sign in, or the menu for everything of yours. Shows nothing until sign-in is really available. */
export function AccountButton() {
  const { canSignIn, user } = useMe();
  const { dark, toggle } = useTheme();
  const [agent, setAgent] = useState(false);
  const signOut = useRef<HTMLFormElement>(null);
  if (!canSignIn) return null;
  if (!user) {
    return (
      <Button variant="outline" size="sm" asChild>
        <a href="/auth/google">Sign in</a>
      </Button>
    );
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label="Your account"><Initial user={user} /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="font-normal">
            {user.name && <p className="truncate font-medium text-foreground">{user.name}</p>}
            <p className="truncate">{user.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {accountLinks(user.handle, user.teams, user.invites).map(({ href, label }) => (
              <DropdownMenuItem key={href} asChild><Link href={href}>{label}</Link></DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => setAgent(true)}>Connect an agent</DropdownMenuItem>
            {/* Stays open, so you see the change and can flip it back. */}
            <DropdownMenuItem onSelect={(event) => { event.preventDefault(); toggle(); }}>{dark ? "Use light theme" : "Use dark theme"}</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => signOut.current?.requestSubmit()}>Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SignOutForm formRef={signOut} />
      <Dialog open={agent} onOpenChange={setAgent}>
        <DialogContent>
          <DialogTitle>Use these from an agent</DialogTitle>
          <DialogDescription>A read-only MCP server for public tables. To let an agent read your private tables or propose changes, make a token in Settings.</DialogDescription>
          <AgentCommand />
        </DialogContent>
      </Dialog>
    </>
  );
}
