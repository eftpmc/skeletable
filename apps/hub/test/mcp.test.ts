import type { ReadingInput } from "@skeleton/formats";
import { schema } from "@skeleton/hub-db";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { hubApi, issueToken } from "../src/api.js";
import { storeReadings } from "../src/engine/store.js";
import { queueExtractFacts } from "../src/jobs.js";
import { MAX_PROPOSED } from "../src/mcp.js";
import { setRole } from "../src/roles.js";
import { useHubDb } from "./helpers/db.js";
import { json, startFixtureServer } from "./helpers/fixture-server.js";

const db = useHubDb();
const { listingAnnotation, source } = schema;

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

/** An MCP client talking to the hub's API in process, with a contributor's token. */
async function connect(token: string, api = hubApi(db)) {
  const client = new Client({ name: "test-agent", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("http://hub.test/mcp"), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
    fetch: async (input, init) => api.request(String(input), init as RequestInit),
  });
  await client.connect(transport);
  closers.push(() => client.close());
  return client;
}

const body = (result: Awaited<ReturnType<Client["callTool"]>>) => JSON.parse((result.content as { text: string }[])[0]!.text);

const item = (externalId: string): ReadingInput => ({ externalId, url: `https://maker.example/products/${externalId}`, title: "Waxed field coat", images: [] });

describe("the hub over MCP", () => {
  it("refuses an agent without a token", async () => {
    await expect(connect("nope")).rejects.toThrow();
  });

  it("lets an agent claim a job with its instructions and format, and answer it", async () => {
    const [site] = await db.insert(source).values({ domain: "maker.example", status: "approved", readerId: "shopify" }).returning({ id: source.id });
    await storeReadings(db, site!.id, [item("1")], { crawlId: null, readAt: new Date() });
    await queueExtractFacts(db);
    const agent = await connect(await issueToken(db, "claude-of-ana", "agent"));

    expect((await agent.listTools()).tools.map((t) => t.name).sort()).toEqual(["claim_job", "propose_site", "submit_answer", "submit_recipe", "whoami"]);
    expect(body(await agent.callTool({ name: "whoami", arguments: {} }))).toMatchObject({ handle: "claude-of-ana", kind: "agent", role: "contributor" });

    const job = body(await agent.callTool({ name: "claim_job", arguments: {} }));
    expect(job).toMatchObject({ kind: "extract-facts", input: { title: "Waxed field coat" }, instructions: expect.stringContaining("department"), answerSchema: { type: "object" } });

    const wrong = await agent.callTool({ name: "submit_answer", arguments: { assignmentId: job.assignmentId, answer: { area: "clothing" } } });
    expect(wrong.isError).toBe(true);
    const answer = { area: "clothing", category: "outerwear", department: null, materials: [], colours: [], condition: "new", origin: null, confidence: 0.9 };
    expect(body(await agent.callTool({ name: "submit_answer", arguments: { assignmentId: job.assignmentId, answer, model: "claude" } }))).toEqual({ settled: true });
    const notes = await db.select({ method: listingAnnotation.method }).from(listingAnnotation);
    expect(new Set(notes.map((n) => n.method))).toEqual(new Set(["agent"]));
    expect((await agent.callTool({ name: "claim_job", arguments: {} })).content).toEqual([{ type: "text", text: "No open jobs right now." }]);
  });

  it("takes a proposed site as a candidate, and caps how many wait", async () => {
    const shop = await startFixtureServer({ "/products.json": json({ products: [] }), "/robots.txt": (_req, res) => res.writeHead(404).end() });
    closers.push(shop.close);
    const crawl = { pauseMs: 0, fetch: { allowPrivate: true }, originOf: () => new URL(shop.url("/")) };
    const token = await issueToken(db, "claude-of-ana", "agent");
    const agent = await connect(token, hubApi(db, { crawl }));

    expect(body(await agent.callTool({ name: "propose_site", arguments: { url: "https://new-maker.example/about" } }))).toMatchObject({ domain: "new-maker.example", reader: "shopify" });
    const [added] = await db.select().from(source).where(eq(source.domain, "new-maker.example"));
    expect(added).toMatchObject({ status: "candidate", readerId: "shopify" });
    expect(body(await agent.callTool({ name: "propose_site", arguments: { url: "new-maker.example" } }))).toMatchObject({ note: "The hub already knows this site." });
    expect((await agent.callTool({ name: "propose_site", arguments: { url: "not a url" } })).isError).toBe(true);

    await db.insert(source).values(Array.from({ length: MAX_PROPOSED }, (_, i) => ({ domain: `filler-${i}.example`, addedById: added!.addedById })));
    expect((await agent.callTool({ name: "propose_site", arguments: { url: "one-more.example" } })).isError).toBe(true);
  });

  it("offers curators the review queue and the calls on it, and no one else", async () => {
    await db.insert(source).values({ domain: "maker.example" });
    const contributor = await connect(await issueToken(db, "claude-of-ana", "agent"));
    expect((await contributor.listTools()).tools.map((t) => t.name)).not.toContain("review_queue");

    const token = await issueToken(db, "zack", "person");
    await setRole(db, "zack", "owner");
    const curator = await connect(token);
    expect((await curator.listTools()).tools.map((t) => t.name)).toEqual(expect.arrayContaining(["review_queue", "decide_site", "decide_recipe"]));
    const queue = body(await curator.callTool({ name: "review_queue", arguments: {} }));
    expect(queue).toMatchObject({ sites: [{ domain: "maker.example" }], recipes: [] });
    expect(body(await curator.callTool({ name: "decide_site", arguments: { siteId: queue.sites[0].siteId, approve: true } }))).toMatchObject({ status: "approved" });
    expect((await curator.callTool({ name: "decide_site", arguments: { siteId: queue.sites[0].siteId, approve: true } })).isError).toBe(true);
  });
});
