import { useQuery } from "@tanstack/react-query";
import { Link, useOutletContext } from "react-router";
import { AccountMenu } from "../components/AppShell";
import { SearchBar } from "../components/SearchBar";
import { api } from "../lib/api";

const shortcuts = [
  { label: "Sneakers", q: "sneakers" },
  { label: "Headphones", q: "headphones" },
  { label: "Tech", q: "laptop" },
  { label: "Home", q: "sofa" },
  { label: "Used & refurb", q: "iphone", condition: "used" },
];

export function SearchHome() {
  const { user } = useOutletContext<{ user: { name: string; email: string } }>();
  const { data: sources = [] } = useQuery({ queryKey: ["sources"], queryFn: api.sources });
  const noSources = sources.length > 0 && !sources.some((s) => s.enabled);

  return (
    <section className="mx-auto max-w-2xl md:pt-10">
      <div className="flex items-start justify-between gap-4 pt-8 md:pt-0">
        <h1 className="text-[34px] leading-[1.05] font-extrabold tracking-tight md:text-5xl">
          Find anything,
          <br />
          from every store.
        </h1>
        <div className="md:hidden">
          <AccountMenu user={user} />
        </div>
      </div>

      <div className="mt-6">
        <SearchBar autoFocus />
      </div>

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {shortcuts.map((s) => (
          <Link
            key={s.label}
            to={`/search?q=${encodeURIComponent(s.q)}${s.condition ? `&condition=${s.condition}` : ""}`}
            className="flex h-[38px] shrink-0 items-center rounded-full bg-ink px-4 text-[15px] font-medium text-canvas"
          >
            {s.label}
          </Link>
        ))}
      </div>

      {noSources && (
        <div className="mt-8 rounded-2xl bg-surface p-5">
          <p className="font-semibold">No stores connected yet</p>
          <p className="mt-1 text-sm text-muted">
            Pasting a product link works now. To search by name, add Shopify stores or free eBay and Best Buy keys.
          </p>
          <Link to="/profile" className="mt-3 inline-block text-sm font-medium underline-offset-4 hover:underline">
            Connect stores
          </Link>
        </div>
      )}

      <div className="mt-10">
        <h2 className="text-[22px] font-bold tracking-tight">New for your alerts</h2>
        <p className="mt-2 text-sm text-muted">Save a search and new matches show up here.</p>
      </div>
    </section>
  );
}
