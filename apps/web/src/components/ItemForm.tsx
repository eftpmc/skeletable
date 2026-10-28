import { type Category, type ColorName, type ItemInput, categories, categoryLabels } from "@skeleton/shared";
import { Button, CheckIcon, Chip, Field, TextArea, TextField } from "@skeleton/ui";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, type InputHTMLAttributes, useRef, useState } from "react";
import { api } from "../lib/api";
import { parseMoneyToCents } from "../lib/format";
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
  clothing: "piece",
  shoes: "shoes",
  accessories: "accessory",
  tech: "gadget",
  gaming: "game gear",
  home: "home item",
  outdoors: "gear",
  beauty: "beauty item",
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
            className={`relative aspect-[4/5] w-28 shrink-0 overflow-hidden rounded-lg bg-tile ring-2 transition ${
              image.selected ? "ring-ink" : "opacity-40 ring-transparent"
            }`}
          >
            <img src={image.src} alt="" className="size-full object-cover" />
            {image.selected && (
              <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-ink text-on-ink">
                <CheckIcon size={12} strokeWidth={3} />
              </span>
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex aspect-[4/5] w-28 shrink-0 flex-col items-center justify-center gap-1 rounded-lg bg-surface text-footnote text-muted hover:text-ink"
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
            <Chip key={category} selected={values.category === category} onClick={() => set("category", category)}>
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
          className="-mt-3 text-left text-footnote text-muted hover:text-ink"
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
            <TextArea aria-label="Notes" value={values.notes} onChange={(event) => set("notes", event.target.value)} />
          </Field>
        </>
      ) : (
        <Button variant="quiet" className="-ml-3" onClick={() => setShowMore(true)}>
          Add material, date, notes
        </Button>
      )}

      {error && <p className="text-callout font-normal text-ink">{error}</p>}

      <Button type="submit" block disabled={saving || uploading > 0}>
        {saving ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}

function Input({
  value,
  onChange,
  ...props
}: { value: string; onChange: (value: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <TextField {...props} value={value} onChange={(event) => onChange(event.target.value)} />;
}
