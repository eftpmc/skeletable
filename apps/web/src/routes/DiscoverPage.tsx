import { type CategoryCount, type CategoryGroupId, type CategoryId, type ShopFor, catalogCategorySchema, categoriesIn, categoryGroupSchema, categoryGroups, categoryLabel } from "@closet/shared";
import { Button, ChevronDownIcon, Chip, ChipRow, EmptyState, Menu, MenuChoices, ProductTile, ScreenTitle, Skeleton, TileGrid, cn } from "@closet/ui";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { ItemPeek, ItemSheet, usd } from "../components/ItemPeek";
import { api } from "../lib/api";
import { useWide } from "../lib/media";
import { usePreferences, useSetPreferences } from "../lib/preferences";

// One shuffle per visit: the feed keeps its order while you browse, and changes next time you come.
const SEED = Math.random().toString(36).slice(2, 10);

/** The one question Discover asks, once: which side of the catalog to show. Settings has it after. */
function ShopForPrompt() {
  const set = useSetPreferences();
  const choices: { value: ShopFor; label: string }[] = [
    { value: "women", label: "Womenswear" },
    { value: "men", label: "Menswear" },
    { value: "all", label: "Everything" },
  ];
  return (
    <div className="mt-6 flex flex-col gap-3 rounded-xl border border-line bg-canvas p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold text-ink">What do you shop for?</p>
        <p className="text-footnote text-muted">Unisex pieces show either way. You can change it in Settings.</p>
      </div>
      <div className="flex gap-2">
        {choices.map((c) => (
          <Button key={c.value} variant="secondary" className="h-11 flex-1 px-4 sm:flex-none" disabled={set.isPending} onClick={() => set.mutate({ shopFor: c.value })}>
            {c.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/**
 * Discover: products from small brands across the open web, as a feed to browse, all of it or one
 * category at a time. Open the ones you like the look of; what you spend time on (and save) shapes
 * what comes next. Items open beside the feed on wide screens and in a sheet on phones, so you never
 * lose your place.
 */
export function DiscoverPage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const wide = useWide();
  const open = params.get("item");
  const parsedCategory = catalogCategorySchema.safeParse(params.get("c"));
  const category: CategoryId | undefined = parsedCategory.success ? parsedCategory.data : undefined;
  const parsedGroup = categoryGroupSchema.safeParse(params.get("g"));
  const group: CategoryGroupId | undefined = !category && parsedGroup.success ? parsedGroup.data : undefined;
  const { data: prefs } = usePreferences();
  const { data: categories = [] } = useQuery({ queryKey: ["catalog", "categories"], queryFn: api.catalogCategories, staleTime: 5 * 60 * 1000 });
  // Opening an item adds a history entry, so Back (or the phone's back swipe) closes it.
  const openedHere = (location.state as { item?: boolean } | null)?.item === true;

  const feed = useInfiniteQuery({
    queryKey: ["catalog", "feed", SEED, category ?? group ?? "all"],
    queryFn: ({ pageParam }) => api.feed(pageParam, SEED, category, group),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next ?? undefined,
    staleTime: Infinity,
  });
  const items = (feed.data?.pages.flatMap((p) => p.items) ?? []).filter((item, i, all) => all.findIndex((x) => x.id === item.id) === i);

  // Load the next page as the end of the feed comes into view.
  const end = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;
  useEffect(() => {
    const node = end.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) void fetchNextPage();
    }, { rootMargin: "800px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const show = (id: string | undefined, push: boolean) => {
    const next = new URLSearchParams(params);
    if (id) next.set("item", id);
    else next.delete("item");
    setParams(next, push ? { state: { item: true } } : { replace: true, state: location.state });
  };
  const openItem = (id: string) => show(id, !open);
  // The chosen category's chip stays in view on phones, where the row scrolls sideways.
  const chips = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chips.current?.querySelector("[aria-pressed=true]")?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [category, categories.length]);
  const browse = (next: { category?: CategoryId; group?: CategoryGroupId }) => {
    const p = new URLSearchParams(params);
    p.delete("item");
    p.delete("c");
    p.delete("g");
    if (next.category) p.set("c", next.category);
    else if (next.group) p.set("g", next.group);
    setParams(p, { replace: true });
  };
  // The categories people have, under their groups: Clothing, Shoes, Bags, Accessories.
  const groups = categoryGroups
    .map((g) => ({ ...g, kinds: categories.filter((c) => categoriesIn(g.id).includes(c.id)) }))
    .filter((g) => g.kinds.length > 0);
  const close = () => (openedHere ? navigate(-1) : show(undefined, false));
  const index = open ? items.findIndex((i) => i.id === open) : -1;
  const step = (by: 1 | -1) => {
    if (!items.length) return;
    show(items[(Math.max(index, 0) + by + items.length) % items.length]!.id, false);
  };

  // With an item open beside the feed: arrows step through it, Escape closes it.
  useEffect(() => {
    if (!open || !wide) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (document.querySelector("[role=dialog], [role=menu]")) return;
      if (event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === "j") step(1);
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "k") step(-1);
      else if (event.key === "Escape") close();
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <section className="pt-4 lg:pt-0">
      <ScreenTitle className="lg:text-[40px] lg:leading-[44px]">Discover</ScreenTitle>
      <p className="mt-1 max-w-2xl text-callout font-normal text-muted">
        Pieces from small brands across the open web. Open what you like the look of; the feed learns from what you spend time on.
      </p>

      {prefs && prefs.shopFor === null && <ShopForPrompt />}

      {categories.length > 1 && (
        <div ref={chips}>
          <ChipRow className="mt-5 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
            <Chip selected={!category && !group} onClick={() => browse({})}>
              All
            </Chip>
            {groups.map((g) =>
              g.kinds.length === 1 ? (
                <Chip
                  key={g.id}
                  selected={category === g.kinds[0]!.id}
                  onClick={() => browse(category === g.kinds[0]!.id ? {} : { category: g.kinds[0]!.id })}
                >
                  {g.label}
                </Chip>
              ) : (
                <GroupPill key={g.id} label={g.label} kinds={g.kinds} category={category} whole={group === g.id} onPick={(kind) => browse(kind ? { category: kind } : { group: g.id })} />
              ),
            )}
          </ChipRow>
        </div>
      )}

      <div className="mt-6 lg:flex lg:items-start lg:gap-8">
        <div className="min-w-0 flex-1">
          {feed.isPending ? (
            <TileGrid>
              {[260, 200, 300, 220, 280, 240, 200, 260].map((h, i) => (
                <Skeleton key={i} className="mb-2 md:mb-5" style={{ height: h }} />
              ))}
            </TileGrid>
          ) : feed.isError ? (
            <EmptyState title="Discover isn't loading right now" body="Try again in a moment." />
          ) : items.length === 0 ? (
            category || group ? (
              <EmptyState
                title={`No ${(category ? categoryLabel(category) : categoryGroups.find((g) => g.id === group)!.label).toLowerCase()} right now`}
                body="Try another category, or all of them."
              />
            ) : (
              <EmptyState title="The catalog is empty" body="Pieces appear here once the catalog has been imported." />
            )
          ) : (
            <>
              <TileGrid>
                {items.map((item) => (
                  <ProductTile
                    key={item.id}
                    as={Link}
                    to={`/discover?${new URLSearchParams({ ...(category ? { c: category } : group ? { g: group } : {}), item: item.id })}`}
                    onClick={(event: React.MouseEvent) => {
                      event.preventDefault();
                      openItem(item.id);
                    }}
                    aria-current={item.id === open ? "true" : undefined}
                    className={cn(item.id === open && "ring-2 ring-ink ring-offset-4 ring-offset-canvas")}
                    image={item.imageUrl}
                    alt={item.title ?? item.brandName}
                    price={usd(item.priceUsd) ?? ""}
                    title={item.title ?? undefined}
                    caption={item.brandName}
                  />
                ))}
              </TileGrid>
              <div ref={end} className="flex h-24 items-center justify-center text-footnote text-muted">
                {isFetchingNextPage ? "Finding more…" : hasNextPage ? "" : "That's everything for now."}
              </div>
            </>
          )}
        </div>

        {open && wide && (
          <div className="sticky top-[96px] hidden h-[calc(100dvh-136px)] w-[420px] shrink-0 lg:block xl:w-[460px]">
            <ItemPeek key={open} id={open} onClose={close} onStep={step} onOpen={(id) => show(id, false)} />
          </div>
        )}
        <ItemSheet open={Boolean(open) && !wide} id={open ?? ""} onClose={close} onStep={step} onOpen={(id) => show(id, false)} />
      </div>
    </section>
  );
}

/**
 * A group with several kinds (Clothing): a pill that opens them, with the whole group first. It names
 * the kind picked ("Dresses & jumpsuits") and fills with ink while the group or one of its kinds is on.
 */
function GroupPill({
  label,
  kinds,
  category,
  whole,
  onPick,
}: {
  label: string;
  kinds: CategoryCount[];
  category: CategoryId | undefined;
  whole: boolean;
  onPick: (kind: CategoryId | undefined) => void;
}) {
  const picked = kinds.find((k) => k.id === category);
  const on = whole || Boolean(picked);
  return (
    <Menu
      side="bottom"
      align="start"
      className="min-w-[220px]"
      trigger={
        <Chip selected={on} aria-pressed={undefined} className="pr-3">
          {picked ? categoryLabel(picked.id) : label}
          <ChevronDownIcon size={16} className={on ? "" : "text-muted"} />
        </Chip>
      }
    >
      <MenuChoices
        value={picked?.id ?? (whole ? "all" : "")}
        onValueChange={(value) => onPick(value === "all" ? undefined : (value as CategoryId))}
        options={[{ value: "all", label: `All ${label.toLowerCase()}` }, ...kinds.map((k) => ({ value: k.id, label: categoryLabel(k.id) }))]}
      />
    </Menu>
  );
}
