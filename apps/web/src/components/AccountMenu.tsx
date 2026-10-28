import { ArrowUpRightIcon, Avatar, Badge, LogOutIcon, Menu, MenuHeader, MenuItem, MenuSeparator, SettingsIcon, cn, focusRing } from "@skeleton/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "react-router";
import { signOut } from "../lib/auth-client";
import { useMe } from "../lib/me";

const REPO = "https://github.com/eftpmc/skeleton";

type User = { name: string; email: string; image?: string | null };

/**
 * The account button: who you are, settings (server sections included for owners and admins), signing
 * out. Full width with your name at the foot of the phone menu; `compact`, just your picture, at the
 * top right of the wide-screen header.
 */
export function AccountMenu({ user, onNavigate, compact = false }: { user: User; onNavigate?: () => void; compact?: boolean }) {
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const role = useMe().data?.role;
  const label = user.name || user.email;
  // Drop everything cached for this account, so signed-out pages (and the next account) start clean.
  const leave = () => signOut().then(() => queryClient.clear());

  return (
    <Menu
      side={compact ? "bottom" : "top"}
      align={compact ? "end" : "start"}
      trigger={
        compact ? (
          <button
            type="button"
            aria-label={`Account: ${label}`}
            title={label}
            aria-current={pathname.startsWith("/settings") ? "page" : undefined}
            className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-surface data-[state=open]:bg-surface", focusRing)}
          >
            <Avatar name={label} image={user.image} size={32} />
          </button>
        ) : (
          <button
            type="button"
            aria-current={pathname.startsWith("/settings") ? "page" : undefined}
            className={cn(
              "flex h-[52px] w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-surface aria-[current=page]:bg-surface data-[state=open]:bg-surface",
              focusRing,
            )}
          >
            <Avatar name={label} image={user.image} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-callout font-semibold text-ink">{label}</span>
              <span className="block truncate text-footnote text-muted">{user.email}</span>
            </span>
          </button>
        )
      }
    >
      <MenuHeader>
        <div className="flex items-center gap-2">
          <span className="truncate text-callout font-semibold text-ink">{label}</span>
          {role && role !== "member" && <Badge tone="outline">{role === "owner" ? "Owner" : "Admin"}</Badge>}
        </div>
        <div className="truncate text-footnote text-muted">{user.email}</div>
      </MenuHeader>
      <MenuSeparator />
      <MenuItem asChild>
        <Link to="/settings" onClick={onNavigate}>
          <SettingsIcon size={18} />
          Settings
        </Link>
      </MenuItem>
      <MenuItem asChild tone="muted">
        <a href={REPO} target="_blank" rel="noopener noreferrer">
          <ArrowUpRightIcon size={18} />
          Help &amp; source code
        </a>
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={<LogOutIcon size={18} />} onSelect={() => void leave()}>
        Sign out
      </MenuItem>
    </Menu>
  );
}
