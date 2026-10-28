import type { BrandVerdict } from "@skeleton/shared";
import {
  ArrowUpRightIcon,
  Button,
  ChevronLeftIcon,
  EmptyState,
  HeartIcon,
  IconButton,
  Menu,
  MenuItem,
  MoreIcon,
  SectionHeader,
  Skeleton,
  buttonClass,
  cn,
  focusRing,
} from "@skeleton/ui";
import { useNavigate, useParams } from "react-router";
import { HeaderBack } from "../components/HeaderSlot";
import { BrandCard, BrandGrid, brandMeta } from "../components/BrandCard";
import { useBrand, useDwell, useVote } from "../lib/catalog";

/** One brand: its photos, where it's from, a heart, and the closest brands to it. Time spent here counts toward your taste. */
export function BrandPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: brand, isPending, isError } = useBrand(id);
  const { vote } = useVote();
  // How long this page is on screen is Discover's quiet signal of taste.
  useDwell(brand ? `/api/catalog/brands/${brand.id}/seen` : undefined);

  if (isPending) {
    return (
      <div className="grid gap-8 pt-4 lg:grid-cols-2">
        <Skeleton className="aspect-square rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }
  if (isError || !brand) {
    return (
      <EmptyState
        className="mx-auto mt-10 max-w-xl"
        title="We can't find that brand"
        body="It may have left the catalog. Try finding it by name."
        action={<Button onClick={() => navigate("/discover")}>Back to Discover</Button>}
      />
    );
  }

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/discover"));
  const cast = (verdict: BrandVerdict) => vote(brand.id, brand.myVote, verdict, `brand:${brand.id}`);
  const liked = brand.myVote === "like";

  return (
    <article className="pt-2 lg:pt-0">
      <HeaderBack onBack={back} title={brand.name} />
      <IconButton label="Back" onClick={back} className="-ml-2 lg:hidden">
        <ChevronLeftIcon size={24} />
      </IconButton>

      <div className="mt-2 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
        <div className="grid grid-cols-4 gap-2 lg:grid-cols-2 xl:grid-cols-4">
          {brand.photoDetails.slice(0, 8).map((p, i) => {
            const photo = (
              <img src={p.imageUrl} alt={p.title ?? `${brand.name} product`} loading={i < 4 ? "eager" : "lazy"} referrerPolicy="no-referrer" className="aspect-square w-full rounded-lg bg-tile object-cover" />
            );
            return p.productUrl ? (
              <a key={i} href={p.productUrl} target="_blank" rel="noopener noreferrer" className={cn("group block rounded-lg", focusRing)} title={p.title ?? undefined}>
                {photo}
                {p.priceUsd !== null && <span className="mt-1 block text-footnote text-muted tabular-nums">${Math.round(p.priceUsd)}</span>}
              </a>
            ) : (
              <div key={i}>{photo}</div>
            );
          })}
        </div>

        {/* On phones the name and votes come first; on wide screens the photos sit on the left. */}
        <div className="order-first lg:sticky lg:top-6 lg:order-none lg:self-start">
          {brand.kind === "name" && <p className="text-section-label text-muted">A brand we know by name</p>}
          <h1 className="mt-1 text-title-1 break-words text-ink lg:text-[40px] lg:leading-[44px]">{brand.name}</h1>
          <p className="mt-2 text-callout text-muted">{brandMeta(brand)}</p>
          {brand.description && <p className="mt-4 max-w-prose text-body text-ink">{brand.description}</p>}
          {brand.kind === "name" && (
            <p className="mt-4 max-w-prose text-callout text-muted">
              We don't read its own site: its look comes from the {brand.seenAt} stores that sell or resell it. It's a place to
              start from, so it's never offered as a find itself.
            </p>
          )}

          {/* Looking around is what counts; the heart says it outright. "Not for me" lives in the menu. */}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {brand.kind === "store" && (
              <Button
                variant={liked ? "primary" : "secondary"}
                icon={<HeartIcon size={20} fill={liked ? "currentColor" : "none"} />}
                onClick={() => cast("like")}
                aria-pressed={liked}
              >
                {liked ? "Liked" : "Like"}
              </Button>
            )}
            {brand.site && (
              <a href={brand.site} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "secondary" })}>
                {brand.kind === "store" ? "Visit their store" : "Visit their site"} <ArrowUpRightIcon size={18} />
              </a>
            )}
            {brand.kind === "store" && (
              <Menu
                side="bottom"
                align="end"
                trigger={
                  <IconButton label="More" tone="surface" size="lg">
                    <MoreIcon size={20} />
                  </IconButton>
                }
              >
                <MenuItem onSelect={() => cast("skip")}>{brand.myVote === "skip" ? "Undo “Not for me”" : "Not for me"}</MenuItem>
                <MenuItem onSelect={() => cast("flag")}>
                  {brand.myVote === "flag" ? "Undo “Not a real brand”" : "Not a real brand (resale, dropshipping, merch)"}
                </MenuItem>
              </Menu>
            )}
          </div>
          {(brand.myVote === "skip" || brand.myVote === "flag") && (
            <p className="mt-3 text-footnote text-muted">
              {brand.myVote === "skip" ? "Marked not for you: Discover steers away from this look." : "Marked not a real brand."} Undo it from the menu.
            </p>
          )}
          {brand.likes > 0 && (
            <p className="mt-4 text-footnote text-muted">
              {brand.likes} {brand.likes === 1 ? "person likes" : "people like"} this brand
            </p>
          )}
        </div>
      </div>

      <section aria-labelledby="neighbors" className="mt-14">
        <SectionHeader title={<span id="neighbors">Brands like {brand.name}</span>} />
        <p className="mt-1 text-callout font-normal text-muted">
          {brand.personal ? "Closest by look and price, ordered with your taste." : "Closest by look and price."}
        </p>
        {brand.neighbors.length ? (
          <BrandGrid className="mt-5">
            {brand.neighbors.map((b) => (
              <BrandCard key={b.id} brand={b} context={`brand:${brand.id}`} />
            ))}
          </BrandGrid>
        ) : (
          <EmptyState className="mt-4" title="No neighbors yet" body="As the catalog grows, brands that look like this one show up here." />
        )}
      </section>
    </article>
  );
}
