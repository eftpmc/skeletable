import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { schema } from "@skeleton/hub-db";
import { eq } from "drizzle-orm";
import { zipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { importLabBrands } from "../src/lab/brands.js";
import { importLab, LAB_PHOTO_MODEL } from "../src/lab/import.js";
import { resolveSources } from "../src/resolve.js";
import { npyRow, npyStrings, readNpz } from "../src/lab/npz.js";
import { useHubDb } from "./helpers/db.js";

const db = useHubDb();
const { embedding, listing, reading, source, sourceValue } = schema;

/** An .npy file as NumPy writes it (format 1.0). */
function npy(descr: string, shape: number[], data: Uint8Array): Uint8Array {
  let header = `{'descr': '${descr}', 'fortran_order': False, 'shape': (${shape.join(", ")}${shape.length === 1 ? "," : ""}), }`;
  header += " ".repeat(63 - ((10 + header.length) % 64)) + "\n";
  const out = new Uint8Array(10 + header.length + data.length);
  out.set([0x93, ...Buffer.from("NUMPY"), 1, 0, header.length & 0xff, header.length >> 8]);
  out.set(Buffer.from(header, "latin1"), 10);
  out.set(data, 10 + header.length);
  return out;
}

const keysArray = (keys: string[], width: number) => {
  const data = new Uint8Array(keys.length * width * 4);
  const view = new DataView(data.buffer);
  keys.forEach((key, i) => [...key].forEach((ch, j) => view.setUint32((i * width + j) * 4, ch.codePointAt(0)!, true)));
  return npy(`<U${width}`, [keys.length], data);
};

// float16: 1.0 = 0x3c00, -2.0 = 0xc000, 0.5 = 0x3800, 0 = 0x0000.
const halves = (rows: number[][]) => {
  const data = new Uint8Array(rows.length * rows[0]!.length * 2);
  const view = new DataView(data.buffer);
  rows.flat().forEach((bits, i) => view.setUint16(i * 2, bits, true));
  return npy("<f2", [rows.length, rows[0]!.length], data);
};

const photoKey = (url: string) => createHash("sha1").update(url).digest("hex").slice(0, 20);

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("the lab's brand details", () => {
  it("become annotations on the matching sources, once", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hub-brands-"));
    dirs.push(dir);
    const brand = { kind: "store", name: "Maker & Co", site: "https://www.maker.example", country: "PT", city: "Porto", description: "Wool coats.", quality: 0.7 };
    const pack = join(dir, "pack.jsonl.gz");
    await writeFile(pack, gzipSync([brand, { ...brand, site: "https://unknown.example" }, { ...brand, kind: "name", site: null }].map((b) => JSON.stringify(b)).join("\n")));
    const [site] = await db.insert(source).values({ domain: "maker.example" }).returning({ id: source.id });

    expect(await importLabBrands(db, pack)).toEqual({ matched: 1, unmatched: 1, annotations: 5 });
    expect(await importLabBrands(db, pack)).toMatchObject({ annotations: 0 });
    await resolveSources(db);
    const values = Object.fromEntries((await db.select().from(sourceValue).where(eq(sourceValue.sourceId, site!.id))).map((v) => [v.field, v.value]));
    expect(values).toEqual({ name: "Maker & Co", country: "PT", city: "Porto", summary: "Wool coats.", quality: 0.7 });
  });
});

describe(".npz vectors", () => {
  it("reads unicode keys and float16 rows", () => {
    const npz = readNpz(zipSync({ "keys.npy": keysArray(["ab", "c"], 4), "vecs.npy": halves([[0x3c00, 0xc000], [0x3800, 0x0000]]) }));
    expect(npyStrings(npz.keys!)).toEqual(["ab", "c"]);
    expect(npyRow(npz.vecs!, 0)).toEqual([1, -2]);
    expect(npyRow(npz.vecs!, 1)).toEqual([0.5, 0]);
  });
});

describe("importing the lab", () => {
  it("brings in each store as an approved Shopify source, its readings and matching photo vectors", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hub-lab-"));
    dirs.push(dir);
    const products = [1, 2].map((id) => ({
      id, title: `Piece ${id}`, handle: `piece-${id}`, vendor: "Maker", tags: [],
      variants: [{ id: id * 10, title: "S", price: "50.00", available: true }],
      images: [{ src: `https://cdn.example/${id}.jpg`, width: 600, height: 800 }],
    }));
    await writeFile(join(dir, "a.json"), JSON.stringify({ status: "ok", host: "www.maker.example", pages: 1, products }));
    await writeFile(join(dir, "b.json"), JSON.stringify({ status: "failed", host: "gone.example" }));
    const vectorsFile = join(dir, "vectors.npz");
    await writeFile(vectorsFile, zipSync({ "keys.npy": keysArray([photoKey("https://cdn.example/1.jpg")], 20), "vecs.npy": halves([[0x3c00, 0x3800]]) }));

    const result = await importLab(db, dir, vectorsFile);
    expect(result).toEqual({ stores: 1, skipped: 1, listings: 2, added: 2, vectors: 1 });

    const [site] = await db.select().from(source);
    expect(site).toMatchObject({ domain: "maker.example", status: "approved", readerId: "shopify", readerEvidence: { from: "lab import" } });
    const stored = await db.select({ data: reading.data }).from(reading);
    expect(stored).toHaveLength(2);
    expect((stored[0]!.data as { price?: unknown }).price).toBeUndefined();
    const [vector] = await db.select().from(embedding).innerJoin(listing, eq(listing.id, embedding.listingId));
    expect(vector).toMatchObject({ embedding: { model: LAB_PHOTO_MODEL, kind: "photo", vector: [1, 0.5] }, listing: { externalId: "1" } });

    // Importing again changes nothing.
    expect(await importLab(db, dir, vectorsFile)).toMatchObject({ added: 0, listings: 2 });
    expect(await db.select().from(reading)).toHaveLength(2);
  });
});
