import { type BrandCard as Brand, type BrandMatch, departmentLabel } from "@skeleton/shared";
import { HeartIcon, IconButton, cn, focusRing } from "@skeleton/ui";
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

/** "London, GB · Womenswear · $80–$200 · Shopify", or for brands we know by name, where we've seen them. */
export function brandMeta(b: Brand) {
  if (b.kind === "name") return `Seen at ${b.seenAt ?? "a few"} stores`;
  const price =
    b.priceLowUsd && b.priceHighUsd ? (b.priceLowUsd === b.priceHighUsd ? `$${b.priceLowUsd}` : `$${b.priceLowUsd}–$${b.priceHighUsd}`) : null;
  const side = b.department ? departmentLabel[b.department] : null;
  return [b.where, side, price, b.platform ? (platforms[b.platform] ?? "Own site") : null].filter(Boolean).join(" · ");
}

/** The heart on a brand: likes it, or takes the like back. The strongest taste signal, but optional. */
export function HeartButton({ brand, context, className }: { brand: Brand; context?: string; className?: string }) {
  const { vote } = useVote();
  const liked = brand.myVote === "like";
  return (
    <IconButton
      label={liked ? `Unlike ${brand.name}` : `Like ${brand.name}`}
      aria-pressed={liked}
      tone="floating"
      className={className}
      onClick={(event) => {
        // The card around it is a link; the heart shouldn't open the brand.
        event.preventDefault();
        event.stopPropagation();
        vote(brand.id, brand.myVote, "like", context);
      }}
    >
      <HeartIcon size={18} fill={liked ? "currentColor" : "none"} className={liked ? "text-accent" : undefined} />
    </IconButton>
  );
}

/**
 * A brand as a small printed spread: one big photo and three small, its name and where it's from,
 * and a heart. The whole card opens the brand; opening it and looking around is what teaches
 * Discover your taste, so there's nothing else to press.
 */
export function BrandCard({ brand, context }: { brand: Brand | BrandMatch; context?: string }) {
  const match = "match" in brand ? brand : null;
  const [hero, ...rest] = brand.photos;
  const dim = brand.myVote === "skip" || brand.myVote === "flag";
  return (
    <Link to={`/brands/${brand.id}`} className={cn("group flex min-w-0 flex-col gap-2.5 rounded-xl transition-opacity", dim && "opacity-55", focusRing)}>
      <div className="relative grid grid-cols-3 gap-1 overflow-hidden rounded-xl">
        <div className="col-span-3 overflow-hidden bg-tile">
          {hero ? (
            <img src={hero} alt="" loading="lazy" referrerPolicy="no-referrer" className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
          ) : (
            <div className="aspect-[4/3]" />
          )}
        </div>
        {[0, 1, 2].map((i) =>
          rest[i] ? (
            <img key={i} src={rest[i]} alt="" loading="lazy" referrerPolicy="no-referrer" className="aspect-square w-full bg-tile object-cover" />
          ) : (
            <div key={i} className="aspect-square bg-tile" />
          ),
        )}
        {brand.kind === "store" && <HeartButton brand={brand} context={context} className="absolute top-2.5 right-2.5" />}
      </div>
      <div className="px-0.5">
        <div className="line-clamp-1 text-callout font-semibold text-ink">{brand.name}</div>
        <div className="line-clamp-1 text-footnote text-muted">
          {match?.because ? `Close to ${match.because.name}` : brandMeta(brand)}
        </div>
      </div>
    </Link>
  );
}

/** Cards in a responsive grid: two columns on phones, up to four on wide screens. */
export function BrandGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 lg:gap-x-5 lg:gap-y-8 xl:grid-cols-4", className)}>{children}</div>;
}
