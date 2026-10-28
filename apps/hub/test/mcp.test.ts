import type { ReadingInput } from "@skeleton/formats";
import { schema } from "@skeleton/hub-db";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { hubApi, issueToken } from "../src/api.js";
import { storeReadings } from "../src/engine/store.js";
import { queueExtractFacts } from "../src/jobs.js";
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

    expect((await agent.listTools()).tools.map((t) => t.name).sort()).toEqual(["claim_job", "my_proposals", "propose_site", "submit_answer", "whoami"]);
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

  it("takes one proposal, reads it first, and offers only curators the queue and the call on it", async () => {
    const products = [1, 2, 3].map((id) => ({
      id,
      title: `Linen shirt ${id}`,
      handle: `shirt-${id}`,
      variants: [{ id: id * 10, price: "90.00", available: true }],
      images: [{ src: `https://cdn.example/${id}.jpg` }],
    }));
    const shop = await startFixtureServer({
      "/products.json": json({ products }),
      "/": (_req, res) => res.writeHead(200, { "content-type": "text/html" }).end('<script>Shopify.currency = {"active":"EUR"};</script>'),
      "/robots.txt": (_req, res) => res.writeHead(404).end(),
    });
    closers.push(shop.close);
    const crawl = { pauseMs: 0, fetch: { allowPrivate: true }, originOf: () => new URL(shop.url("/")) };
    const agent = await connect(await issueToken(db, "claude-of-ana", "agent"), hubApi(db, { crawl }));
    expect((await agent.listTools()).tools.map((t) => t.name)).not.toContain("review_queue");

    const why = "A small linen workshop in Vilnius that sews everything in house.";
    expect((await agent.callTool({ name: "propose_site", arguments: { url: "not a url", why } })).isError).toBe(true);
    const made = body(await agent.callTool({ name: "propose_site", arguments: { url: "https://linen.example/about", why } }));
    expect(made).toMatchObject({ domain: "linen.example", reader: "shopify", report: { read: 3, of: 3 } });
    expect(made.report.pages[0]).toMatchObject({ title: "Linen shirt 1", price: { amount: 9000, currency: "EUR" } });
    expect(body(await agent.callTool({ name: "my_proposals", arguments: {} }))).toMatchObject([{ domain: "linen.example", status: "pending" }]);

    const token = await issueToken(db, "zack", "person");
    await setRole(db, "zack", "owner");
    const curator = await connect(token);
    expect((await curator.listTools()).tools.map((t) => t.name)).toEqual(expect.arrayContaining(["review_queue", "decide_proposal"]));
    const [waiting] = body(await curator.callTool({ name: "review_queue", arguments: {} }));
    expect(waiting).toMatchObject({ domain: "linen.example", proposer: "claude-of-ana", why, reader: "shopify", samples: { read: 3 } });
    expect(body(await curator.callTool({ name: "decide_proposal", arguments: { proposalId: waiting.proposalId, approve: true } }))).toMatchObject({ status: "approved" });
    expect((await curator.callTool({ name: "decide_proposal", arguments: { proposalId: waiting.proposalId, approve: true } })).isError).toBe(true);
    const [site] = await db.select().from(source).where(eq(source.domain, "linen.example"));
    expect(site).toMatchObject({ status: "approved", readerId: "shopify", readerConfig: { currency: "EUR" } });
  });
});
