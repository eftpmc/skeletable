import type { BrandCard as Brand, BrandMatch, BrandVerdict } from "@closet/shared";
import { Badge, Chip, cn, focusRing } from "@closet/ui";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { useVote } from "../lib/catalog";

const platforms: Record<string, string> = {
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  squarespace: "Squarespace",
  bigcartel: "Big Cartel",
  wix: "Wix",
  bigcommerce: "BigCommerce",
  shopline: "Shopline",
  salesforce: "Salesforce",
};

/** "London, GB · $80–$200 · Shopify", or for brands we know by name, where we've seen them. */
export function brandMeta(b: Brand) {
  if (b.kind === "name") return `Seen at ${b.seenAt ?? "a few"} stores`;
  const price =
    b.priceLowUsd && b.priceHighUsd ? (b.priceLowUsd === b.priceHighUsd ? `$${b.priceLowUsd}` : `$${b.priceLowUsd}–$${b.priceHighUsd}`) : null;
  return [b.where, price, b.platform ? (platforms[b.platform] ?? "Own site") : null].filter(Boolean).join(" · ");
}

/** Like / Not for me / Not a brand (a real one). Pressing the active one clears it. */
export function VoteChips({ brand, context, className }: { brand: Brand; context?: string; className?: string }) {
  const { vote } = useVote();
  const chip = (verdict: BrandVerdict, label: string, title?: string) => (
    <Chip selected={brand.myVote === verdict} title={title} onClick={() => vote(brand.id, brand.myVote, verdict, context)}>
      {label}
    </Chip>
  );
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {chip("like", brand.myVote === "like" ? "Liked" : "Like")}
      {chip("skip", "Not for me", "Moves your picks away from this look")}
      {chip("flag", "Not a brand", "Not a real brand: resale, dropshipping, wholesale stock, uniforms or merch")}
    </div>
  );
}

/** A brand with four photos, where it's from, and votes. Neighbors and picks also show a match bar. */
export function BrandCard({ brand, context, rank }: { brand: Brand | BrandMatch; context?: string; rank?: number }) {
  const match = "match" in brand ? brand : null;
  const dim = brand.myVote === "skip" || brand.myVote === "flag";
  return (
    <article className={cn("flex min-w-0 flex-col gap-3 rounded-xl border border-line p-3 transition-opacity", dim && "opacity-55")}>
      <div className="flex items-baseline justify-between gap-3">
        <Link to={`/brands/${brand.id}`} className={cn("min-w-0 rounded-sm text-title-3 text-ink hover:underline", focusRing)}>
          <span className="line-clamp-1 break-all">{brand.name}</span>
        </Link>
        {rank !== undefined && <span className="shrink-0 text-footnote text-muted tabular-nums">#{rank}</span>}
      </div>
      {match?.explore && (
        <Badge tone="outline" className="self-start">
          New to everyone
        </Badge>
      )}
      <p className="-mt-1 line-clamp-1 text-footnote text-muted">{brandMeta(brand)}</p>
      <Link to={`/brands/${brand.id}`} tabIndex={-1} aria-hidden="true" className="grid grid-cols-4 gap-1 overflow-hidden rounded-lg">
        {[0, 1, 2, 3].map((i) =>
          brand.photos[i] ? (
            <img key={i} src={brand.photos[i]} alt="" loading="lazy" referrerPolicy="no-referrer" className="aspect-square w-full bg-tile object-cover" />
          ) : (
            <div key={i} className="aspect-square bg-tile" />
          ),
        )}
      </Link>
      {match && (
        <div className="h-1 overflow-hidden rounded-full bg-line" title="How close a match">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(match.match * 100)}%` }} />
        </div>
      )}
      {match?.because && (
        <p className="text-footnote text-muted">
          Close to{" "}
          <Link to={`/brands/${match.because.id}`} className={cn("rounded-sm text-ink hover:underline", focusRing)}>
            {match.because.name}
          </Link>
          , which you liked
        </p>
      )}
      <div className="mt-auto flex flex-col gap-2">
        <VoteChips brand={brand} context={context} />
        <Link to={`/brands/${brand.id}`} className={cn("self-start rounded-full text-callout text-muted hover:text-ink", focusRing)}>
          Brands like this →
        </Link>
      </div>
    </article>
  );
}

/** Cards in a responsive grid: one column on phones, up to three on wide screens. */
export function BrandGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3", className)}>{children}</div>;
}
