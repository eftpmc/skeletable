import type { ReadingInput } from "@skeleton/formats";
import { schema } from "@skeleton/hub-db";
import { describe, expect, it } from "vitest";
import { storeReadings } from "../src/engine/store.js";
import { decodeVector, loadPhotoVectors, PHOTO_DIMENSIONS, PHOTO_MODEL, photosToEmbed } from "../src/photos.js";
import { useHubDb } from "./helpers/db.js";

const db = useHubDb();
const { embedding, source } = schema;

const item = (externalId: string, photo = true): ReadingInput => ({
  externalId,
  url: `https://maker.example/products/${externalId}`,
  title: `Piece ${externalId}`,
  images: photo ? [{ url: `https://cdn.example/${externalId}.jpg` }] : [],
});

const encode = (values: number[]) => {
  const bytes = Buffer.alloc(values.length * 4);
  values.forEach((v, i) => bytes.writeFloatLE(v, i * 4));
  return bytes.toString("base64");
};

describe("photo vectors", () => {
  it("lists approved listings with a photo and no vector, and stores what the embedder writes", async () => {
    const [site] = await db.insert(source).values({ domain: "maker.example", status: "approved", readerId: "shopify" }).returning({ id: source.id });
    const [held] = await db.insert(source).values({ domain: "held.example", status: "candidate", readerId: "shopify" }).returning({ id: source.id });
    await storeReadings(db, site!.id, [item("1"), item("2"), item("3", false)], { crawlId: null, readAt: new Date() });
    await storeReadings(db, held!.id, [item("9")], { crawlId: null, readAt: new Date() });

    const todo = await photosToEmbed(db, 10);
    expect(todo.map((t) => t.image).sort()).toEqual(["https://cdn.example/1.jpg", "https://cdn.example/2.jpg"]);

    const vector = Array.from({ length: PHOTO_DIMENSIONS }, (_, i) => i / PHOTO_DIMENSIONS);
    expect(decodeVector(encode(vector))[5]).toBeCloseTo(5 / PHOTO_DIMENSIONS);
    const lines = [
      JSON.stringify({ ...todo[0], vector: encode(vector) }),
      JSON.stringify({ ...todo[1], vector: encode([1, 2]) }),
      "not json",
      "",
    ];
    expect(await loadPhotoVectors(db, lines)).toEqual({ stored: 1, skipped: 2 });
    const [row] = await db.select().from(embedding);
    expect(row).toMatchObject({ listingId: todo[0]!.listingId, model: PHOTO_MODEL, kind: "photo" });
    expect(await photosToEmbed(db, 10)).toHaveLength(1);
  });
});
