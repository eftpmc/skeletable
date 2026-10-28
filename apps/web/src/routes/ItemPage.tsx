import { type Item, categoryLabels } from "@skeleton/shared";
import { ArrowUpRightIcon, Button, CheckIcon, ChevronLeftIcon, EmptyState, Sheet, buttonClass } from "@skeleton/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Swatch } from "../components/ColorSwatches";
import { ItemForm, emptyValues } from "../components/ItemForm";
import { api } from "../lib/api";
import { formatMoney, formatRelativeDay, localToday } from "../lib/format";

export function ItemPage() {
  const { id = "" } = useParams();
  const { data: item, isPending, isError } = useQuery({ queryKey: ["items", id], queryFn: () => api.item(id) });

  if (isPending) return null;
  if (isError || !item) {
    return (
      <EmptyState
        className="mx-auto mt-10 max-w-xl"
        title="That isn't in your collection"
        body="It may have been removed."
        action={
          <Link to="/collection" className={buttonClass()}>
            Back to Collection
          </Link>
        }
      />
    );
  }
  return <ItemDetail item={item} />;
}

function ItemDetail({ item }: { item: Item }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeImage, setActiveImage] = useState(0);
  const [editing, setEditing] = useState(false);
  const today = localToday();

  const { data: wears = [] } = useQuery({ queryKey: ["items", item.id, "wears"], queryFn: () => api.wears(item.id) });
  const { data: fits = [] } = useQuery({ queryKey: ["brand-fits"], queryFn: api.brandFits });
  const fit = item.brand ? fits.find((entry) => entry.brand.toLowerCase() === item.brand!.toLowerCase()) : undefined;
  const woreToday = wears.includes(today);

  const refresh = (updated: Item) => {
    queryClient.setQueryData(["items", item.id], updated);
    void queryClient.invalidateQueries({ queryKey: ["items"] });
  };

  const wear = useMutation({
    mutationFn: () => (woreToday ? api.unlogWear(item.id, today) : api.logWear(item.id, today)),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: () => api.deleteItem(item.id),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ["items", item.id] });
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      navigate("/collection", { replace: true });
    },
  });

  const image = item.media[activeImage] ?? item.media[0];
  const price = formatMoney(item.priceCents, item.currency);
  const costPerWear = formatMoney(item.wear.costPerWearCents, item.currency);

  return (
    <article className="mx-auto max-w-5xl">
      <Button
        variant="quiet"
        className="mb-4 -ml-3"
        icon={<ChevronLeftIcon size={18} />}
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/collection"))}
      >
        Collection
      </Button>

      <div className="grid gap-8 md:grid-cols-2">
        <div>
          {image ? (
            <img
              src={image.url}
              alt={item.title}
              width={image.width}
              height={image.height}
              className="max-h-[75vh] w-full rounded-xl bg-tile object-contain"
            />
          ) : (
            <div className="flex aspect-[4/5] items-center justify-center rounded-xl bg-tile text-footnote text-muted">
              No photo
            </div>
          )}
          {item.media.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto p-0.5">
              {item.media.map((entry, index) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setActiveImage(index)}
                  className={`aspect-square w-16 shrink-0 overflow-hidden rounded-sm bg-tile ring-2 ${
                    index === activeImage ? "ring-ink" : "ring-transparent"
                  }`}
                >
                  <img src={entry.thumbUrl} alt="" className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="md:pt-4">
          {item.brand && <div className="text-callout font-normal text-muted">{item.brand}</div>}
          <h1 className="mt-0.5 text-title-2 text-ink">{item.title}</h1>
          {price && <div className="mt-1 text-price text-muted">{price}</div>}

          <Button
            className="mt-6"
            block
            variant={woreToday ? "secondary" : "primary"}
            icon={woreToday ? <CheckIcon size={18} /> : undefined}
            onClick={() => wear.mutate()}
            disabled={wear.isPending}
          >
            {woreToday ? "Worn today" : "Wore it today"}
          </Button>

          <dl className="mt-6 grid grid-cols-3 gap-3 text-center">
            <Stat label="Worn" value={`${item.wear.count}×`} />
            <Stat label="Last worn" value={item.wear.lastWornOn ? formatRelativeDay(item.wear.lastWornOn) : "—"} />
            <Stat label="Per wear" value={costPerWear ?? "—"} />
          </dl>

          <dl className="mt-6 divide-y divide-line overflow-hidden rounded-xl bg-surface px-4 text-body">
            <Row label="Category" value={categoryLabels[item.category]} />
            {item.size && <Row label="Size" value={item.size} />}
            {item.colors.length > 0 && (
              <Row
                label="Colors"
                value={
                  <span className="flex items-center justify-end gap-2">
                    {item.colors.map((color) => (
                      <span key={color} className="flex items-center gap-1.5">
                        <Swatch color={color} size={14} />
                        <span className="capitalize">{color}</span>
                      </span>
                    ))}
                  </span>
                }
              />
            )}
            {item.material && <Row label="Material" value={item.material} />}
            {item.purchasedOn && (
              <Row label="Bought" value={new Date(`${item.purchasedOn}T00:00:00`).toLocaleDateString()} />
            )}
            {fit && (fit.size || fit.note) && (
              <Row label={`Your ${fit.brand} fit`} value={[fit.size, fit.note].filter(Boolean).join(" · ")} />
            )}
          </dl>

          {item.notes && <p className="mt-6 text-callout font-normal whitespace-pre-line text-muted">{item.notes}</p>}

          <div className="mt-8 flex flex-wrap gap-2">
            {item.sourceUrl && (
              <a href={item.sourceUrl} target="_blank" rel="noreferrer" className={buttonClass({ variant: "secondary" })}>
                View in store
                <ArrowUpRightIcon size={16} />
              </a>
            )}
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button variant="quiet" onClick={() => window.confirm(`Remove "${item.title}" from your collection?`) && remove.mutate()}>
              Remove
            </Button>
          </div>
        </div>
      </div>

      <Sheet open={editing} onOpenChange={setEditing} title="Edit">
        <ItemForm
          submitLabel="Save changes"
          initialValues={{
            ...emptyValues,
            title: item.title,
            brand: item.brand ?? "",
            category: item.category,
            colors: item.colors,
            size: item.size ?? "",
            price: item.priceCents !== null ? (item.priceCents / 100).toFixed(2).replace(/\.00$/, "") : "",
            currency: item.currency,
            material: item.material ?? "",
            purchasedOn: item.purchasedOn ?? "",
            notes: item.notes ?? "",
          }}
          initialImages={item.media.map((entry) => ({ key: entry.id, src: entry.thumbUrl, mediaId: entry.id, selected: true }))}
          onSubmit={async ({ imageUrls: _imageUrls, ...patch }) => {
            refresh(await api.updateItem(item.id, patch));
            void queryClient.invalidateQueries({ queryKey: ["brands"] });
            setActiveImage(0);
            setEditing(false);
          }}
        />
      </Sheet>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface px-2 py-3">
      <dd className="text-price text-ink">{value}</dd>
      <dt className="mt-0.5 text-footnote text-muted">{label}</dt>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
