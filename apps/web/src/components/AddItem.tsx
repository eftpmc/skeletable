import type { Item } from "@closet/shared";
import { Button, Sheet } from "@closet/ui";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, createContext, useCallback, useContext, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../lib/api";
import { type FormImage, ItemForm, type ItemFormValues, emptyValues } from "./ItemForm";

type Draft = {
  values: ItemFormValues;
  images: FormImage[];
  source: Item["source"];
  sourceUrl: string | null;
};

/** Details to start the form with, e.g. from a product page's "I already own this". */
export type AddItemPrefill = {
  title: string;
  brand: string | null;
  priceCents: number | null;
  currency: string | null;
  sourceUrl: string | null;
  imageUrl: string | null;
};

const AddItemContext = createContext<(prefill?: AddItemPrefill) => void>(() => {});

export const useAddItem = () => useContext(AddItemContext);

export function AddItemProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const openSheet = useCallback((prefill?: AddItemPrefill) => {
    setDraft(
      prefill
        ? {
            source: "link",
            sourceUrl: prefill.sourceUrl,
            values: {
              ...emptyValues,
              title: prefill.title,
              brand: prefill.brand ?? "",
              price: prefill.priceCents !== null ? (prefill.priceCents / 100).toFixed(2).replace(/\.00$/, "") : "",
              currency: prefill.currency,
            },
            images: prefill.imageUrl ? [{ key: prefill.imageUrl, src: prefill.imageUrl, remoteUrl: prefill.imageUrl, selected: true }] : [],
          }
        : null,
    );
    setOpen(true);
  }, []);

  return (
    <AddItemContext.Provider value={openSheet}>
      {children}
      <Sheet open={open} onOpenChange={setOpen} title={draft ? "Add to your collection" : "Add something you own"}>
        {draft ? (
          <ItemForm
            initialValues={draft.values}
            initialImages={draft.images}
            submitLabel="Save to collection"
            onSubmit={async (result) => {
              const item = await api.createItem({ ...result, source: draft.source, sourceUrl: draft.sourceUrl });
              await queryClient.invalidateQueries({ queryKey: ["items"] });
              void queryClient.invalidateQueries({ queryKey: ["brands"] });
              setOpen(false);
              navigate(`/collection/${item.id}`);
            }}
          />
        ) : (
          <ChooseSource onDraft={setDraft} />
        )}
      </Sheet>
    </AddItemContext.Provider>
  );
}

function ChooseSource({ onDraft }: { onDraft: (draft: Draft) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"link" | "photo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function importLink(event: FormEvent) {
    event.preventDefault();
    if (!url.trim()) return;
    setBusy("link");
    setError(null);
    try {
      const preview = await api.preview(url.trim());
      onDraft({
        source: "link",
        sourceUrl: preview.url,
        values: {
          ...emptyValues,
          title: preview.title ?? "",
          brand: preview.brand ?? "",
          category: preview.category,
          colors: preview.colors,
          price: preview.priceCents !== null ? (preview.priceCents / 100).toFixed(2).replace(/\.00$/, "") : "",
          currency: preview.currency,
        },
        images: preview.images.map((src, index) => ({ key: src, src, remoteUrl: src, selected: index < 3 })),
      });
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Couldn't read that link");
      setBusy(null);
    }
  }

  async function uploadPhotos(files: FileList | null) {
    if (!files?.length) return;
    setBusy("photo");
    setError(null);
    try {
      const uploads = await Promise.all(Array.from(files).map((file) => api.upload(file)));
      onDraft({
        source: "photo",
        sourceUrl: null,
        values: { ...emptyValues, colors: uploads[0]?.colors ?? [] },
        images: uploads.map((upload) => ({ key: upload.id, src: upload.thumbUrl, mediaId: upload.id, selected: true })),
      });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={importLink} className="space-y-3">
        <p className="text-callout font-normal text-muted">Paste a link from any store and we'll fill in the details.</p>
        <input
          type="url"
          inputMode="url"
          autoFocus
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://store.com/products/…"
          aria-label="Store link"
          className="h-12 w-full rounded-xl bg-surface px-4 text-body outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-focus"
        />
        <Button type="submit" block disabled={!url.trim() || busy !== null}>
          {busy === "link" ? "Reading page…" : "Continue"}
        </Button>
      </form>

      <div className="flex items-center gap-3 text-footnote text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>

      <Button variant="secondary" block disabled={busy !== null} onClick={() => fileInput.current?.click()}>
        {busy === "photo" ? "Uploading…" : "Upload photos"}
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          void uploadPhotos(event.target.files);
          event.target.value = "";
        }}
      />

      {error && (
        <div className="rounded-xl bg-surface p-4 text-callout font-normal">
          <p>{error}</p>
          <button
            type="button"
            className="mt-2 font-medium underline-offset-4 hover:underline"
            onClick={() =>
              onDraft({ source: "manual", sourceUrl: null, values: emptyValues, images: [] })
            }
          >
            Add it manually
          </button>
        </div>
      )}
    </div>
  );
}
