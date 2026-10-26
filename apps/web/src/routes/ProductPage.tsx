import { type Condition, conditionLabels } from "@closet/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useAddItem } from "../components/AddItem";
import { ArrowUpRightIcon, BookmarkIcon, ChevronLeftIcon } from "../components/icons";
import { api } from "../lib/api";
import { formatMoney } from "../lib/format";

export function ProductPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const addItem = useAddItem();
  const { data: product, isPending, isError } = useQuery({ queryKey: ["product", id], queryFn: () => api.product(id) });
  const [picked, setPicked] = useState<Condition | null>(null);
  const [showAll, setShowAll] = useState(false);

  if (isPending) return <div className="mx-auto mt-4 aspect-square max-w-xl animate-pulse rounded-3xl bg-surface" />;
  if (isError || !product) {
    return (
      <div className="py-20 text-center">
        <p className="font-semibold">We can't find that product</p>
        <Link to="/" className="mt-3 inline-block text-sm text-muted underline-offset-4 hover:underline">
          Back to search
        </Link>
      </div>
    );
  }

  const available = product.conditions.filter((c) => c.best);
  const current =
    product.conditions.find((c) => c.condition === picked && c.best) ??
    product.conditions.find((c) => c.condition === "new" && c.best) ??
    available[0];
  const best = current?.best ?? null;

  return (
    <article className="mx-auto grid max-w-5xl gap-6 pb-24 md:grid-cols-2 md:gap-10 md:pb-0">
      <div className="relative -mx-4 md:mx-0">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.title}
            referrerPolicy="no-referrer"
            className="max-h-[70vh] w-full bg-tile object-contain md:rounded-3xl"
          />
        ) : (
          <div className="aspect-square bg-tile md:rounded-3xl" />
        )}
        <button
          type="button"
          aria-label="Back"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}
          className="absolute top-3 left-3 flex size-10 items-center justify-center rounded-full bg-white text-black shadow-md"
        >
          <ChevronLeftIcon size={20} />
        </button>
      </div>

      <div className="md:pt-4">
        {product.brand && <div className="text-[15px] text-muted">{product.brand}</div>}
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight">{product.title}</h1>

        {available.length > 1 && (
          <div role="group" aria-label="Condition" className="mt-4 grid grid-cols-3 gap-1 rounded-2xl bg-surface p-1">
            {product.conditions.map((c) => {
              const active = c.condition === current?.condition;
              return (
                <button
                  key={c.condition}
                  type="button"
                  disabled={!c.best}
                  aria-pressed={active}
                  onClick={() => setPicked(c.condition)}
                  className={`flex h-[52px] flex-col items-center justify-center rounded-xl transition disabled:opacity-35 ${
                    active ? "bg-canvas shadow-sm" : ""
                  }`}
                >
                  <span className="text-[13px] text-muted">{conditionLabels[c.condition]}</span>
                  <span className="text-base font-bold">{c.best ? formatMoney(c.best.priceCents, c.best.currency) : "—"}</span>
                </button>
              );
            })}
          </div>
        )}

        {best && current && (
          <>
            <div className="mt-5 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold tracking-tight">{formatMoney(best.priceCents, best.currency)}</span>
              <span className="text-muted">at {best.store.name}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[15px]">
              <span aria-hidden="true" className="size-2 rounded-full bg-ink" />
              {current.verdict.text}
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="mt-5 flex h-[52px] w-full items-center justify-between border-y border-line text-left"
        >
          Compare all {product.offers.length} {product.offers.length === 1 ? "offer" : "offers"}
          <span className="text-muted">{showAll ? "Hide" : "Show"}</span>
        </button>
        {showAll && (
          <ul className="divide-y divide-line">
            {product.offers.map((o) => (
              <li key={o.id}>
                <a href={o.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{o.store.name}</span>
                    <span className="block truncate text-[13px] text-muted">
                      {conditionLabels[o.condition]} · {o.title}
                    </span>
                  </span>
                  <span className="font-bold">{formatMoney(o.priceCents, o.currency)}</span>
                  <ArrowUpRightIcon size={16} className="text-muted" />
                </a>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() =>
            addItem({
              title: product.title,
              brand: product.brand,
              priceCents: best?.priceCents ?? null,
              currency: best?.currency ?? null,
              sourceUrl: best?.url ?? null,
              imageUrl: product.imageUrl,
            })
          }
          className="mt-4 text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          I already own this
        </button>

        {best && (
          <div className="fixed inset-x-0 bottom-14 z-10 flex gap-2 border-t border-line bg-canvas px-4 py-3 md:static md:mt-6 md:border-0 md:p-0">
            <Link
              to="/saved"
              aria-label="Track price"
              title="Price tracking comes next"
              className="flex size-[52px] shrink-0 items-center justify-center rounded-2xl bg-surface"
            >
              <BookmarkIcon size={20} />
            </Link>
            <a
              href={best.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-[52px] flex-1 items-center justify-center rounded-2xl bg-ink font-semibold text-canvas"
            >
              Buy at {best.store.name}
            </a>
          </div>
        )}
      </div>
    </article>
  );
}
