import { type Category, categories, categoryLabels } from "@closet/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { useAddItem } from "../components/AddItem";
import { Chip, ChipRow } from "../components/Chips";
import { ItemCard } from "../components/ItemCard";
import { api } from "../lib/api";

export function ClosetPage() {
  const [view, setView] = useState<"items" | "outfits">("items");

  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Closet</h1>
        <div className="flex rounded-full bg-surface p-1 ring-1 ring-line">
          {(["items", "outfits"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setView(option)}
              className={`rounded-full px-4 py-1.5 text-sm capitalize transition-colors ${
                view === option ? "bg-ink text-canvas" : "text-muted hover:text-ink"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
      {view === "items" ? <Items /> : <OutfitsSoon />}
    </section>
  );
}

function Items() {
  const openAdd = useAddItem();
  const [category, setCategory] = useState<Category | null>(null);
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());

  const all = useQuery({ queryKey: ["items"], queryFn: () => api.items() });
  const filtered = useQuery({
    queryKey: ["items", { category, q }],
    queryFn: () => api.items({ category: category ?? undefined, q: q || undefined }),
    enabled: Boolean(category || q),
    placeholderData: keepPreviousData,
  });

  if (all.isPending) return <GridSkeleton />;
  const everything = all.data ?? [];
  const items = category || q ? (filtered.data ?? []) : everything;

  if (everything.length === 0) {
    return (
      <div className="mt-10 flex flex-col items-center rounded-3xl border border-dashed border-line px-6 py-16 text-center">
        <p className="text-lg font-medium">Your closet is empty</p>
        <p className="mt-1 max-w-xs text-sm text-muted">Paste a link from a store or snap a photo to add your first piece.</p>
        <button
          type="button"
          onClick={openAdd}
          className="mt-6 h-11 rounded-full bg-ink px-6 text-sm font-medium text-canvas"
        >
          Add your first piece
        </button>
      </div>
    );
  }

  const present = categories.filter((entry) => everything.some((item) => item.category === entry));

  return (
    <>
      <div className="mt-5 space-y-3">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={`Search ${everything.length} ${everything.length === 1 ? "piece" : "pieces"}`}
          aria-label="Search closet"
          className="h-11 w-full rounded-full border border-line bg-surface px-5 text-sm outline-none placeholder:text-muted focus:border-ink"
        />
        {present.length > 1 && (
          <ChipRow>
            <Chip active={category === null} onClick={() => setCategory(null)}>
              All
            </Chip>
            {present.map((entry) => (
              <Chip key={entry} active={category === entry} onClick={() => setCategory(category === entry ? null : entry)}>
                {categoryLabels[entry]}
              </Chip>
            ))}
          </ChipRow>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-16 text-center text-sm text-muted">Nothing matches.</p>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </>
  );
}

function OutfitsSoon() {
  return (
    <div className="mt-10 rounded-3xl border border-dashed border-line px-6 py-16 text-center">
      <p className="font-medium">Outfits are coming next</p>
      <p className="mt-1 text-sm text-muted">Put pieces together, save looks and log what you wear.</p>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="mt-20 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="aspect-[4/5] animate-pulse rounded-2xl bg-surface" />
      ))}
    </div>
  );
}
