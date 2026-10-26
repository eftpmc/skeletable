import { type Category, categories, categoryLabels } from "@closet/shared";
import { Button, Chip, ChipRow, EmptyState, PlusIcon, ScreenTitle, Skeleton, TextField } from "@closet/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { useAddItem } from "../components/AddItem";
import { ItemCard } from "../components/ItemCard";
import { api } from "../lib/api";

export function ClosetPage() {
  const openAdd = useAddItem();
  return (
    <section>
      <ScreenTitle
        className="pt-4 md:pt-0"
        trailing={
          <Chip icon={<PlusIcon size={16} />} onClick={() => openAdd()}>
            Add
          </Chip>
        }
      >
        Collection
      </ScreenTitle>
      <Items />
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
      <EmptyState
        className="mt-10"
        title="Nothing here yet"
        body="Add things you own to keep sizes, receipts and resale value in one place."
        action={<Button onClick={() => openAdd()}>Add something you own</Button>}
      />
    );
  }

  const present = categories.filter((entry) => everything.some((item) => item.category === entry));

  return (
    <>
      <div className="mt-5 space-y-3">
        <TextField
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={`Search ${everything.length} ${everything.length === 1 ? "thing" : "things"}`}
          aria-label="Search what you own"
          className="h-11 rounded-full px-5"
        />
        {present.length > 1 && (
          <ChipRow>
            <Chip selected={category === null} onClick={() => setCategory(null)}>
              All
            </Chip>
            {present.map((entry) => (
              <Chip key={entry} selected={category === entry} onClick={() => setCategory(category === entry ? null : entry)}>
                {categoryLabels[entry]}
              </Chip>
            ))}
          </ChipRow>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-16 text-center text-callout font-normal text-muted">Nothing matches.</p>
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

function GridSkeleton() {
  return (
    <div className="mt-20 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton key={index} className="aspect-[4/5]" />
      ))}
    </div>
  );
}
