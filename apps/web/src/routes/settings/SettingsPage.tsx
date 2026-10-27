import { type Me, isAdmin } from "@closet/shared";
import {
  BellIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  GaugeIcon,
  PaletteIcon,
  RulerIcon,
  ShopIcon,
  Skeleton,
  UserIcon,
  UsersIcon,
  cn,
  focusRing,
} from "@closet/ui";
import type { ComponentType, ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router";
import { useMe } from "../../lib/me";
import { useWide } from "../../lib/media";
import { Account, Appearance, Notifications, SizesAndFit, YourData } from "./personal";
import { Members, Overview, Stores } from "./server";

type Section = {
  id: string;
  label: string;
  /** One line under the title: what this section is for. */
  description: string;
  icon: ComponentType<{ size?: number }>;
  group: "you" | "server";
  render: (me: Me) => ReactNode;
};

/**
 * Every settings section, in order. Adding one is adding an entry here: it gets a place in the list,
 * a URL (/settings/<id>) and the page frame. Server sections only show to owners and admins.
 */
const sections: Section[] = [
  { id: "account", label: "Account", description: "Your name, password and sign-in.", icon: UserIcon, group: "you", render: (me) => <Account me={me} /> },
  {
    id: "notifications",
    label: "Notifications",
    description: "New matches and price drops, without opening the app.",
    icon: BellIcon,
    group: "you",
    render: () => <Notifications />,
  },
  { id: "appearance", label: "Appearance", description: "How the app looks on this device.", icon: PaletteIcon, group: "you", render: () => <Appearance /> },
  {
    id: "sizes",
    label: "Sizes & fit",
    description: "Your size in each brand, so you never have to guess again.",
    icon: RulerIcon,
    group: "you",
    render: () => <SizesAndFit />,
  },
  { id: "data", label: "Your data", description: "Take everything with you.", icon: DownloadIcon, group: "you", render: () => <YourData /> },
  { id: "overview", label: "Overview", description: "This server at a glance.", icon: GaugeIcon, group: "server", render: () => <Overview /> },
  { id: "stores", label: "Stores", description: "What search looks through, for everyone on this server.", icon: ShopIcon, group: "server", render: () => <Stores /> },
  { id: "members", label: "Members", description: "Everyone with an account, and who helps run it.", icon: UsersIcon, group: "server", render: (me) => <Members me={me} /> },
];

const groups = [
  { id: "you", label: "You" },
  { id: "server", label: "Server" },
] as const;

/**
 * Settings. Wide screens: the section list on the left, the section on the right. Phones: the list at
 * /settings, each section on its own page with a way back.
 */
export function SettingsPage() {
  const { section: id } = useParams();
  const { data: me } = useMe();
  const wide = useWide();

  if (!me) return <Skeleton className="mx-auto mt-4 h-96 max-w-3xl" />;
  const visible = sections.filter((s) => s.group === "you" || isAdmin(me.role));
  const current = visible.find((s) => s.id === id);

  if (id && !current) return <Navigate to="/settings" replace />;
  // Wide screens always show a section; the list is beside it.
  if (!current && wide) return <Navigate to="/settings/account" replace />;

  return (
    <div className="mx-auto max-w-5xl lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
      <nav aria-label="Settings" className={cn(current && "hidden lg:block")}>
        <h1 className="pt-4 text-title-1 text-ink lg:pt-0">Settings</h1>
        {groups.map((group) => {
          const items = visible.filter((s) => s.group === group.id);
          if (!items.length) return null;
          return (
            <div key={group.id} className="mt-6">
              <h2 className="px-1 text-section-label text-muted uppercase lg:px-3">{group.label}</h2>
              {/* Phones: a grouped list with chevrons. Wide screens: a quiet sidebar list. */}
              <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl bg-surface lg:divide-y-0 lg:rounded-none lg:bg-transparent">
                {items.map((s) => (
                  <li key={s.id}>
                    <Link
                      to={`/settings/${s.id}`}
                      aria-current={s.id === current?.id ? "page" : undefined}
                      className={cn(
                        "flex min-h-[52px] items-center gap-3 px-4 text-body text-ink lg:min-h-10 lg:rounded-lg lg:px-3 lg:text-callout lg:hover:bg-surface lg:aria-[current=page]:bg-surface lg:aria-[current=page]:font-semibold",
                        focusRing,
                      )}
                    >
                      <s.icon size={20} />
                      <span className="flex-1">{s.label}</span>
                      <ChevronRightIcon size={18} className="text-muted lg:hidden" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      {current && (
        <section aria-labelledby="settings-title" className="min-w-0">
          <Link
            to="/settings"
            className={cn("-ml-2 inline-flex h-11 items-center gap-1 rounded-full pr-3 pl-1 text-callout font-normal text-muted hover:text-ink lg:hidden", focusRing)}
          >
            <ChevronLeftIcon size={20} />
            Settings
          </Link>
          <header className="border-b border-line pb-5 lg:pb-6">
            <h1 id="settings-title" className="text-title-1 text-ink">
              {current.label}
            </h1>
            <p className="mt-1 text-callout font-normal text-muted">{current.description}</p>
          </header>
          <div className="max-w-2xl pt-6 lg:pt-8">{current.render(me)}</div>
        </section>
      )}
    </div>
  );
}
