import type { ResultCard } from "@closet/shared";
import { Link } from "react-router";
import { formatMoney } from "../lib/format";

/** A result in the photo grid: picture, price pill, and at most one small label. */
export function Tile({ card }: { card: ResultCard }) {
  const label =
    card.verdict.label === "good"
      ? { text: "Good price", dark: true }
      : card.best.condition === "refurb"
        ? { text: "Refurb", dark: false }
        : card.best.condition === "used"
          ? { text: "Used", dark: false }
          : null;

  return (
    <Link to={`/p/${card.productId}`} className="group mb-2 block break-inside-avoid">
      <div className="relative overflow-hidden rounded-xl bg-tile">
        {card.imageUrl ? (
          <img
            src={card.imageUrl}
            alt={card.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="block w-full transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex aspect-square items-center justify-center p-4 text-center text-sm text-neutral-600">{card.title}</div>
        )}
        <span className="absolute top-2 right-2 rounded-lg bg-white px-2 py-1 text-[15px] font-bold text-black">
          {formatMoney(card.best.priceCents, card.best.currency)}
        </span>
        {label && (
          <span
            className={`absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
              label.dark ? "bg-black text-white" : "bg-white text-black"
            }`}
          >
            {label.text}
          </span>
        )}
      </div>
      <div className="mt-1.5 line-clamp-1 px-0.5 text-[13px] text-muted">
        {card.storeCount > 1 ? `${card.storeCount} stores · ` : `${card.best.store.name} · `}
        {card.title}
      </div>
    </Link>
  );
}
