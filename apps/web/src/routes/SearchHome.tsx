import { Button, Chip, ChipRow, EmptyState, SectionHeader } from "@closet/ui";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useOutletContext } from "react-router";
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
  const navigate = useNavigate();
  const { data: sources = [] } = useQuery({ queryKey: ["sources"], queryFn: api.sources });
  const noSources = sources.length > 0 && !sources.some((s) => s.enabled);

  return (
    <section className="mx-auto max-w-2xl md:pt-10">
      <div className="flex items-start justify-between gap-4 pt-8 md:pt-0">
        <h1 className="text-display text-ink md:text-5xl">
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

      <ChipRow className="mt-3">
        {shortcuts.map((s) => (
          <Chip
            key={s.label}
            variant="shortcut"
            onClick={() => navigate(`/search?q=${encodeURIComponent(s.q)}${s.condition ? `&condition=${s.condition}` : ""}`)}
          >
            {s.label}
          </Chip>
        ))}
      </ChipRow>

      {noSources && (
        <EmptyState
          className="mt-8"
          title="No stores connected yet"
          body="Pasting a product link works now. To search by name, add Shopify stores or free eBay and Best Buy keys."
          action={
            <Button onClick={() => navigate("/profile")}>
              Connect stores
            </Button>
          }
        />
      )}

      <SectionHeader className="mt-10" title="New for your alerts" action={{ label: "See all", as: Link, to: "/alerts" }} />
      <p className="mt-2 text-callout font-normal text-muted">Save a search and new matches show up here.</p>
    </section>
  );
}
