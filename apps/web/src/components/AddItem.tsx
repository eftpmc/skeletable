import type { Item } from "@closet/shared";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, createContext, useCallback, useContext, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../lib/api";
import { type FormImage, ItemForm, type ItemFormValues, emptyValues } from "./ItemForm";
import { Sheet } from "./Sheet";

type Draft = {
  values: ItemFormValues;
  images: FormImage[];
  source: Item["source"];
  sourceUrl: string | null;
};

const AddItemContext = createContext<() => void>(() => {});

export const useAddItem = () => useContext(AddItemContext);

export function AddItemProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const openSheet = useCallback(() => {
    setDraft(null);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  return (
    <AddItemContext.Provider value={openSheet}>
      {children}
      <Sheet open={open} onClose={close} title={draft ? "Add to closet" : "Add something"}>
        {draft ? (
          <ItemForm
            initialValues={draft.values}
            initialImages={draft.images}
            submitLabel="Save to closet"
            onSubmit={async (result) => {
              const item = await api.createItem({ ...result, source: draft.source, sourceUrl: draft.sourceUrl });
              await queryClient.invalidateQueries({ queryKey: ["items"] });
              void queryClient.invalidateQueries({ queryKey: ["brands"] });
              setOpen(false);
              navigate(`/closet/${item.id}`);
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
        <p className="text-sm text-muted">Paste a link from any store and we'll fill in the details.</p>
        <input
          type="url"
          inputMode="url"
          autoFocus
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://store.com/products/…"
          aria-label="Store link"
          className="h-12 w-full rounded-2xl border border-line bg-canvas px-4 text-sm outline-none placeholder:text-muted/70 focus:border-ink"
        />
        <button
          type="submit"
          disabled={!url.trim() || busy !== null}
          className="h-12 w-full rounded-full bg-ink text-sm font-medium text-canvas transition-opacity disabled:opacity-40"
        >
          {busy === "link" ? "Reading page…" : "Continue"}
        </button>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>

      <button
        type="button"
        disabled={busy !== null}
        onClick={() => fileInput.current?.click()}
        className="h-12 w-full rounded-full text-sm font-medium ring-1 ring-line transition-colors hover:ring-ink disabled:opacity-40"
      >
        {busy === "photo" ? "Uploading…" : "Upload photos"}
      </button>
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
        <div className="rounded-2xl bg-canvas p-4 text-sm">
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
