import { type Category, type ColorName, type ItemInput, categories, categoryLabels } from "@closet/shared";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useRef, useState } from "react";
import { api } from "../lib/api";
import { parseMoneyToCents } from "../lib/format";
import { Chip } from "./Chips";
import { ColorPicker } from "./ColorSwatches";

export type FormImage = {
  key: string;
  src: string;
  /** Set for images already uploaded to the server. */
  mediaId?: string;
  /** Set for images from a store page that the server will download on save. */
  remoteUrl?: string;
  selected: boolean;
};

export type ItemFormValues = {
  title: string;
  brand: string;
  category: Category | null;
  colors: ColorName[];
  size: string;
  price: string;
  currency: string | null;
  material: string;
  purchasedOn: string;
  notes: string;
};

export const emptyValues: ItemFormValues = {
  title: "",
  brand: "",
  category: null,
  colors: [],
  size: "",
  price: "",
  currency: null,
  material: "",
  purchasedOn: "",
  notes: "",
};

const singular: Record<Category, string> = {
  tops: "top",
  bottoms: "bottoms",
  outerwear: "jacket",
  dresses: "dress",
  shoes: "shoes",
  bags: "bag",
  accessories: "accessory",
  other: "item",
};

export type ItemFormResult = Omit<ItemInput, "source"> & { mediaIds: string[]; imageUrls: string[] };

export function ItemForm({
  initialValues,
  initialImages,
  submitLabel,
  onSubmit,
}: {
  initialValues: ItemFormValues;
  initialImages: FormImage[];
  submitLabel: string;
  onSubmit: (result: ItemFormResult) => Promise<void>;
}) {
  const [values, setValues] = useState(initialValues);
  const [images, setImages] = useState(initialImages);
  const [uploading, setUploading] = useState(0);
  const [showMore, setShowMore] = useState(Boolean(initialValues.material || initialValues.notes || initialValues.purchasedOn));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const { data: brands = [] } = useQuery({ queryKey: ["brands"], queryFn: api.brands });
  const { data: fits = [] } = useQuery({ queryKey: ["brand-fits"], queryFn: api.brandFits });
  const fit = fits.find((entry) => entry.brand.toLowerCase() === values.brand.trim().toLowerCase());

  const set = <K extends keyof ItemFormValues>(key: K, value: ItemFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    for (const file of Array.from(files)) {
      setUploading((count) => count + 1);
      try {
        const uploaded = await api.upload(file);
        setImages((current) => [...current, { key: uploaded.id, src: uploaded.thumbUrl, mediaId: uploaded.id, selected: true }]);
        setValues((current) => (current.colors.length ? current : { ...current, colors: uploaded.colors }));
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
      } finally {
        setUploading((count) => count - 1);
      }
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!values.category) return setError("Pick a category.");
    const selected = images.filter((image) => image.selected);
    const title =
      values.title.trim() ||
      [values.colors[0], singular[values.category]].filter(Boolean).join(" ").replace(/^./, (c) => c.toUpperCase());

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        title,
        brand: values.brand.trim() || null,
        category: values.category,
        colors: values.colors,
        size: values.size.trim() || null,
        priceCents: values.price.trim() ? parseMoneyToCents(values.price) : null,
        currency: values.price.trim() ? (values.currency ?? "USD") : null,
        material: values.material.trim() || null,
        purchasedOn: values.purchasedOn || null,
        notes: values.notes.trim() || null,
        mediaIds: selected.flatMap((image) => (image.mediaId ? [image.mediaId] : [])),
        imageUrls: selected.flatMap((image) => (image.remoteUrl ? [image.remoteUrl] : [])),
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Couldn't save");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        {images.map((image) => (
          <button
            key={image.key}
            type="button"
            onClick={() =>
              setImages((current) =>
                current.map((entry) => (entry.key === image.key ? { ...entry, selected: !entry.selected } : entry)),
              )
            }
            aria-pressed={image.selected}
            className={`relative aspect-[4/5] w-28 shrink-0 overflow-hidden rounded-2xl bg-tile ring-2 transition ${
              image.selected ? "ring-ink" : "opacity-40 ring-transparent"
            }`}
          >
            <img src={image.src} alt="" className="size-full object-cover" />
            {image.selected && (
              <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-ink text-canvas">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="m5 12 5 5 9-10" />
                </svg>
              </span>
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex aspect-[4/5] w-28 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-line text-xs text-muted hover:border-ink hover:text-ink"
        >
          {uploading > 0 ? "Uploading…" : "Add photo"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            void addPhotos(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      <Field label="Category">
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <Chip key={category} active={values.category === category} onClick={() => set("category", category)}>
              {categoryLabels[category]}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Name">
        <Input aria-label="Name" value={values.title} onChange={(value) => set("title", value)} placeholder="Detroit Jacket" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Brand">
          <Input aria-label="Brand" value={values.brand} onChange={(value) => set("brand", value)} placeholder="Carhartt WIP" list="brand-options" />
          <datalist id="brand-options">
            {brands.map((brand) => (
              <option key={brand} value={brand} />
            ))}
          </datalist>
        </Field>
        <Field label="Size">
          <Input aria-label="Size" value={values.size} onChange={(value) => set("size", value)} placeholder="e.g. M" />
        </Field>
      </div>
      {fit?.size && fit.size !== values.size && (
        <button
          type="button"
          onClick={() => set("size", fit.size ?? "")}
          className="-mt-3 text-left text-xs text-muted hover:text-ink"
        >
          You usually wear <span className="font-medium text-ink">{fit.size}</span> in {fit.brand}
          {fit.note ? ` · ${fit.note}` : ""}. Use it
        </button>
      )}

      <Field label="Colors">
        <ColorPicker value={values.colors} onChange={(colors) => set("colors", colors)} />
      </Field>

      <Field label={`Price${values.currency && values.currency !== "USD" ? ` (${values.currency})` : ""}`}>
        <Input aria-label="Price" value={values.price} onChange={(value) => set("price", value)} placeholder="0.00" inputMode="decimal" />
      </Field>

      {showMore ? (
        <>
          <Field label="Material">
            <Input aria-label="Material" value={values.material} onChange={(value) => set("material", value)} placeholder="100% cotton canvas" />
          </Field>
          <Field label="Bought on">
            <Input aria-label="Bought on" type="date" value={values.purchasedOn} onChange={(value) => set("purchasedOn", value)} />
          </Field>
          <Field label="Notes">
            <textarea
              aria-label="Notes"
              value={values.notes}
              onChange={(event) => set("notes", event.target.value)}
              rows={3}
              className="w-full rounded-2xl border border-line bg-canvas px-4 py-3 text-sm outline-none focus:border-ink"
            />
          </Field>
        </>
      ) : (
        <button type="button" onClick={() => setShowMore(true)} className="text-sm text-muted hover:text-ink">
          + Material, date, notes
        </button>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={saving || uploading > 0}
        className="h-12 w-full rounded-full bg-ink text-sm font-medium text-canvas transition-opacity disabled:opacity-50"
      >
        {saving ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

// A div rather than a <label>: wrapping chip buttons in a label makes clicks on the
// label text press the first chip.
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <span className="mb-2 block text-xs font-medium text-muted">{label}</span>
      {children}
    </div>
  );
}

function Input({
  value,
  onChange,
  ...props
}: { value: string; onChange: (value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <input
      {...props}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 w-full rounded-2xl border border-line bg-canvas px-4 text-sm outline-none placeholder:text-muted/70 focus:border-ink"
    />
  );
}
