import type { BrandFit, Item, LinkPreview, MediaRef } from "@closet/shared";
import { strFromU8, unzipSync } from "fflate";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bytes, html, startFixtureServer } from "./helpers/fixture-server.js";
import { signUp, useTestApp } from "./helpers/setup.js";

const { setup } = useTestApp();

const navyPhoto = () =>
  sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#fff"/><rect x="100" y="100" width="400" height="600" fill="#1e2a46"/></svg>`,
    ),
  )
    .jpeg()
    .toBuffer();

let store: Awaited<ReturnType<typeof startFixtureServer>>;

beforeAll(async () => {
  const jacketImage = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#fff"/><rect x="100" y="100" width="400" height="600" fill="#6c4426"/></svg>`,
    ),
  )
    .png()
    .toBuffer();
  store = await startFixtureServer({
    "/products/detroit": html(`<html><head>
      <script type="application/ld+json">{"@type":"Product","name":"Detroit Jacket","brand":"Carhartt WIP",
      "image":"/images/detroit.png","offers":{"price":"198.00","priceCurrency":"USD"}}</script></head></html>`),
    "/images/detroit.png": bytes(jacketImage, "image/png"),
  });
});

afterAll(() => store.close());

describe("closet items", () => {
  it("requires a session", async () => {
    const app = setup();
    expect((await app.request("/api/items")).status).toBe(401);
    expect((await app.request("/api/export")).status).toBe(401);
  });

  it("creates an item from an uploaded photo and detects its color", async () => {
    const user = await signUp(setup());
    const upload = await user.upload(await navyPhoto());
    expect(upload.status).toBe(201);
    const mediaRef = (await upload.json()) as MediaRef;

    const created = await user.post("/api/items", {
      title: "Oxford Shirt",
      brand: "Uniqlo",
      category: "tops",
      size: "M",
      priceCents: 3990,
      currency: "usd",
      source: "photo",
      mediaIds: [mediaRef.id],
    });
    expect(created.status).toBe(201);
    const item = (await created.json()) as Item;
    expect(item).toMatchObject({
      title: "Oxford Shirt",
      brand: "Uniqlo",
      colors: ["navy"],
      currency: "USD",
      media: [{ id: mediaRef.id }],
    });

    const image = await user.get(item.media[0]!.thumbUrl);
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/webp");
  });

  it("imports a product link and downloads its images", async () => {
    const app = setup({ ALLOW_PRIVATE_FETCH: "true" });
    const user = await signUp(app);

    const preview = (await (await user.post("/api/import/preview", { url: store.url("/products/detroit") })).json()) as LinkPreview;
    expect(preview).toMatchObject({ title: "Detroit Jacket", brand: "Carhartt WIP", priceCents: 19800, category: "outerwear" });

    const created = await user.post("/api/items", {
      title: preview.title,
      brand: preview.brand,
      category: preview.category,
      priceCents: preview.priceCents,
      currency: preview.currency,
      sourceUrl: preview.url,
      source: "link",
      imageUrls: preview.images,
    });
    const item = (await created.json()) as Item;
    expect(item.media).toHaveLength(1);
    expect(item.colors).toEqual(["brown"]);
  });

  it("refuses to import from private addresses by default", async () => {
    const user = await signUp(setup());
    const response = await user.post("/api/import/preview", { url: store.url("/products/detroit") });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: "blocked" });
  });

  it("filters by category, color and search text", async () => {
    const user = await signUp(setup());
    await user.post("/api/items", { title: "Detroit Jacket", brand: "Carhartt WIP", category: "outerwear", colors: ["brown"] });
    await user.post("/api/items", { title: "Pocket Tee", brand: "Camber", category: "tops", colors: ["white"] });
    await user.post("/api/items", { title: "501 Jeans", brand: "Levi's", category: "bottoms", colors: ["blue"] });

    const titles = async (query: string) =>
      ((await (await user.get(`/api/items${query}`)).json()) as Item[]).map((item) => item.title);

    expect(await titles("")).toHaveLength(3);
    expect(await titles("?category=tops")).toEqual(["Pocket Tee"]);
    expect(await titles("?color=brown")).toEqual(["Detroit Jacket"]);
    expect(await titles("?q=carhartt")).toEqual(["Detroit Jacket"]);
    expect(await titles("?q=jean")).toEqual(["501 Jeans"]);
    expect((await user.get("/api/items?category=hats")).status).toBe(400);
  });

  it("validates input", async () => {
    const user = await signUp(setup());
    const response = await user.post("/api/items", { title: "", category: "tops" });
    expect(response.status).toBe(400);
  });

  it("updates, reorders photos and deletes items", async () => {
    const user = await signUp(setup());
    const first = (await (await user.upload(await navyPhoto())).json()) as MediaRef;
    const second = (await (await user.upload(await navyPhoto())).json()) as MediaRef;
    const item = (await (
      await user.post("/api/items", { title: "Tee", category: "tops", mediaIds: [first.id, second.id] })
    ).json()) as Item;

    const updated = (await (
      await user.patch(`/api/items/${item.id}`, { title: "Pocket Tee", brand: "Camber", mediaIds: [second.id] })
    ).json()) as Item;
    expect(updated).toMatchObject({ title: "Pocket Tee", brand: "Camber" });
    expect(updated.media.map((entry) => entry.id)).toEqual([second.id]);
    expect((await user.get(first.url)).status).toBe(404);

    expect((await user.delete(`/api/items/${item.id}`)).status).toBe(204);
    expect((await user.get(`/api/items/${item.id}`)).status).toBe(404);
    expect((await user.get(second.url)).status).toBe(404);
  });

  it("keeps each user's closet private", async () => {
    const app = setup();
    const alice = await signUp(app, "alice@example.com");
    const bob = await signUp(app, "bob@example.com");

    const photo = (await (await alice.upload(await navyPhoto())).json()) as MediaRef;
    const item = (await (
      await alice.post("/api/items", { title: "Secret Jacket", category: "outerwear", mediaIds: [photo.id] })
    ).json()) as Item;

    expect(await (await bob.get("/api/items")).json()).toEqual([]);
    expect((await bob.get(`/api/items/${item.id}`)).status).toBe(404);
    expect((await bob.get(photo.thumbUrl)).status).toBe(404);
    expect((await bob.patch(`/api/items/${item.id}`, { title: "Mine now" })).status).toBe(404);
    expect((await bob.delete(`/api/items/${item.id}`)).status).toBe(404);
    expect((await bob.post(`/api/items/${item.id}/wears`, {})).status).toBe(404);

    // Bob can't claim Alice's upload for his own item.
    const stolen = (await (
      await bob.post("/api/items", { title: "Mine", category: "tops", mediaIds: [photo.id] })
    ).json()) as Item;
    expect(stolen.media).toEqual([]);
  });
});

describe("wear logging", () => {
  it("counts wears once per day and computes cost per wear", async () => {
    const user = await signUp(setup());
    const item = (await (await user.post("/api/items", { title: "Boots", category: "shoes", priceCents: 30000 })).json()) as Item;
    expect(item.wear).toEqual({ count: 0, lastWornOn: null, costPerWearCents: null });

    await user.post(`/api/items/${item.id}/wears`, { date: "2026-10-20" });
    await user.post(`/api/items/${item.id}/wears`, { date: "2026-10-20" });
    const worn = (await (await user.post(`/api/items/${item.id}/wears`, { date: "2026-10-24" })).json()) as Item;
    expect(worn.wear).toEqual({ count: 2, lastWornOn: "2026-10-24", costPerWearCents: 15000 });

    expect(await (await user.get(`/api/items/${item.id}/wears`)).json()).toEqual(["2026-10-24", "2026-10-20"]);

    const undone = (await (await user.delete(`/api/items/${item.id}/wears/2026-10-24`)).json()) as Item;
    expect(undone.wear.count).toBe(1);
  });
});

describe("brand fits", () => {
  it("saves sizes per brand and lists the user's brands", async () => {
    const user = await signUp(setup());
    await user.put("/api/brand-fits", { brand: "Carhartt WIP", size: "S", note: "Runs big" });
    await user.put("/api/brand-fits", { brand: "Levi's", size: "31x30" });
    const fits = (await (await user.put("/api/brand-fits", { brand: "carhartt wip", size: "M", note: "" })).json()) as BrandFit[];
    expect(fits).toEqual([
      { brand: "Carhartt WIP", size: "M", note: null },
      { brand: "Levi's", size: "31x30", note: null },
    ]);

    await user.post("/api/items", { title: "Tee", brand: "Camber", category: "tops" });
    expect(await (await user.get("/api/brands")).json()).toEqual(["Camber", "Carhartt WIP", "Levi's"]);

    const remaining = (await (await user.delete("/api/brand-fits/Levi's")).json()) as BrandFit[];
    expect(remaining.map((fit) => fit.brand)).toEqual(["Carhartt WIP"]);
  });

  it("doesn't show other users' brands", async () => {
    const app = setup();
    const alice = await signUp(app, "alice@example.com");
    const bob = await signUp(app, "bob@example.com");
    await alice.put("/api/brand-fits", { brand: "Alice Only Brand", size: "M" });
    expect(await (await bob.get("/api/brands")).json()).toEqual([]);
  });
});

describe("export", () => {
  it("returns a zip with closet.json and images", async () => {
    const user = await signUp(setup());
    const photo = (await (await user.upload(await navyPhoto())).json()) as MediaRef;
    const item = (await (
      await user.post("/api/items", { title: "Oxford Shirt", category: "tops", mediaIds: [photo.id] })
    ).json()) as Item;
    await user.post(`/api/items/${item.id}/wears`, { date: "2026-10-01" });
    await user.put("/api/brand-fits", { brand: "Uniqlo", size: "M" });

    const response = await user.get("/api/export");
    expect(response.headers.get("content-type")).toBe("application/zip");
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    const closet = JSON.parse(strFromU8(files["closet.json"]!));
    expect(closet).toMatchObject({
      format: "closet-export",
      version: 1,
      brandFits: [{ brand: "Uniqlo", size: "M" }],
      items: [{ title: "Oxford Shirt", wornOn: ["2026-10-01"], images: [`media/${photo.id}.webp`] }],
    });
    expect(files[`media/${photo.id}.webp`]?.length).toBeGreaterThan(0);
  });
});
