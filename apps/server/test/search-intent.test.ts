import { describe, expect, it, vi } from "vitest";
import { keywordIntent, intentFromParam, intentKey, searchIntentSchema, type IntentProposal } from "@skeleton/shared";
import type { Db } from "@skeleton/db";
import { SearchService } from "../src/search/service.js";
import { SearchInterpreter, interpreterFromConfig, openAIIntentProvider, validateProposal } from "../src/search/interpreter.js";
import { loadConfig } from "../src/config.js";
import { preferenceScore, satisfiesIntent } from "../src/search/intent-ranking.js";
import type { RawOffer } from "../src/search/sources/types.js";

const query = "find me Sony XM5, preferably used, around $200";
const proposal: IntentProposal = {
  text: "Sony XM5", condition: { values: ["used"], strength: "preferred", evidence: "preferably used" },
  budget: { amountCents: 20000, currency: "USD", comparison: "around", strength: "preferred", evidence: "around $200" },
  attributes: [], uncertainties: ["Assuming USD."],
};
const offer: RawOffer = { source: "test", title: "Sony XM5", brand: "Sony", store: { name: "Test", domain: "test.example" }, url: "https://test.example/1", priceCents: 20000, currency: "USD", condition: "new", imageUrl: null, gtin: null, mpn: null, inStock: true };

describe("intent validation and ranking (fixture proposals, not model accuracy)", () => {
  it("preserves preferences without filtering eligible offers", () => {
    const intent = validateProposal(query, proposal);
    expect(satisfiesIntent(offer, intent)).toBe(true);
    expect(satisfiesIntent({ ...offer, priceCents: 30000 }, intent)).toBe(true);
    expect(preferenceScore({ ...offer, condition: "used" }, intent)).toBeGreaterThan(preferenceScore(offer, intent));
  });
  it("enforces exact cents, strict versus inclusive limits and currency", () => {
    const intent = validateProposal("Sony XM5 under $200", { ...proposal, condition: null, budget: { ...proposal.budget!, comparison: "lt", strength: "required", evidence: "under $200" } });
    expect(satisfiesIntent(offer, intent)).toBe(false);
    expect(satisfiesIntent({ ...offer, priceCents: 19999 }, intent)).toBe(true);
    expect(satisfiesIntent({ ...offer, priceCents: 10000, currency: "EUR" }, intent)).toBe(false);
    intent.budget!.comparison = "lte";
    expect(satisfiesIntent(offer, intent)).toBe(true);
  });
  it("allows multiple required conditions", () => {
    const intent = keywordIntent("headphones");
    intent.condition = { values: ["new", "refurb"], strength: "required", evidence: "not used" };
    expect(satisfiesIntent(offer, intent)).toBe(true);
    expect(satisfiesIntent({ ...offer, condition: "used" }, intent)).toBe(false);
  });
  it("rejects unsupported fields, ungrounded constraints, and approximate hard limits", () => {
    expect(() => validateProposal(query, { ...proposal, hiddenFilter: true })).toThrow();
    expect(() => validateProposal("headphones", proposal)).toThrow();
    expect(() => validateProposal(query, { ...proposal, budget: { ...proposal.budget!, strength: "required" } })).toThrow();
  });
  it("round-trips edited intent without restoring removed filters", () => {
    const intent = { ...validateProposal(query, proposal), condition: null, mode: "edited" as const };
    expect(intentFromParam(JSON.stringify(intent))).toEqual(intent);
    expect(intentFromParam('{"version":2}')).toBeUndefined();
    expect(intentKey(intent)).toBe(intentKey({ ...intent, mode: "model" }));
  });
});

describe("interpreter routing and failure handling", () => {
  it("is off by default even when an API key is present", async () => {
    const config = loadConfig({ DATABASE_URL: "postgres://localhost/test", PUBLIC_URL: "http://localhost:3000", AUTH_SECRET: "x".repeat(32), OPENAI_API_KEY: "not-a-real-key" });
    expect(config.SEARCH_INTENT_ENABLED).toBe(false);
    expect(await interpreterFromConfig(config).interpret(query, "assisted")).toEqual(keywordIntent(query));
  });
  it("skips provider calls for simple queries and keyword mode", async () => {
    const provider = vi.fn(async () => proposal);
    const interpreter = new SearchInterpreter(provider);
    expect(await interpreter.interpret("Sony XM5")).toEqual(keywordIntent("Sony XM5"));
    expect(await interpreter.interpret(query, "keyword")).toEqual(keywordIntent(query));
    expect(provider).not.toHaveBeenCalled();
  });
  it("reuses in-flight and cached interpretations without sharing mutable objects", async () => {
    const provider = vi.fn(async () => proposal);
    const interpreter = new SearchInterpreter(provider);
    const [a, b] = await Promise.all([interpreter.interpret(query), interpreter.interpret(query)]);
    a.condition = null;
    expect(b.condition).not.toBeNull();
    expect((await interpreter.interpret(query)).condition).not.toBeNull();
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it("keeps literal words when no provider, malformed output, or provider failure", async () => {
    for (const interpreter of [new SearchInterpreter(), new SearchInterpreter(async () => ({})), new SearchInterpreter(async () => { throw new Error("down"); })]) {
      expect(await interpreter.interpret(query)).toEqual(keywordIntent(query));
    }
  });
  it("aborts timeouts and respects the daily limit", async () => {
    let signal: AbortSignal | undefined;
    const provider = vi.fn((_q: string, s: AbortSignal) => { signal = s; return new Promise(() => {}); });
    const interpreter = new SearchInterpreter(provider, 5, 1);
    expect(await interpreter.interpret(query)).toEqual(keywordIntent(query));
    expect(signal?.aborted).toBe(true);
    await interpreter.interpret("find me another jacket");
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it("bounds simultaneous requests", async () => {
    let release!: (value: unknown) => void;
    const value = new Promise((resolve) => { release = resolve; });
    const provider = vi.fn(async () => value);
    const interpreter = new SearchInterpreter(provider);
    const requests = [1, 2, 3, 4].map((n) => interpreter.interpret(`${query} ${n}`));
    expect(await interpreter.interpret(`${query} 5`)).toEqual(keywordIntent(`${query} 5`));
    release(proposal);
    await Promise.all(requests);
    expect(provider).toHaveBeenCalledTimes(4);
  });
  it("uses frozen intent for saved searches without another model call", async () => {
    const provider = vi.fn(async () => proposal);
    const source = vi.fn(async () => []);
    const service = new SearchService({} as Db, [{ id: "empty", label: "Empty", search: source }], {}, new SearchInterpreter(provider));
    const first = await service.search(query);
    const edited = searchIntentSchema.parse({ ...first.intent, condition: null, mode: "edited" });
    const second = await service.search(query, { intent: edited, fresh: true });
    expect(second.intent.condition).toBeNull();
    expect(source.mock.calls.length).toBe(2);
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it("explicit filters override model proposals", async () => {
    const service = new SearchService({} as Db, [], {}, new SearchInterpreter(async () => proposal));
    const result = await service.search(query, { condition: "new", maxPriceCents: 15000 });
    expect(result.intent.condition?.values).toEqual(["new"]);
    expect(result.intent.budget).toMatchObject({ amountCents: 15000, comparison: "lte", strength: "required" });
  });
});

describe("Responses transport", () => {
  it("requests strict output with no storage and reads the message output", async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(proposal) }] }] })));
    const value = await openAIIntentProvider("test-key", "test-model", request)(query, new AbortController().signal);
    expect(value).toEqual(proposal);
    const body = JSON.parse(request.mock.calls[0]![1]!.body as string);
    expect(body).toMatchObject({ store: false, reasoning: { effort: "none" }, text: { format: { strict: true, type: "json_schema" } } });
    expect(body.text.format.schema.additionalProperties).toBe(false);
  });
  it.each([
    { status: "incomplete", output: [] },
    { status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] },
  ])("falls back on refused/incomplete output", async (body) => {
    const provider = openAIIntentProvider("test", "test", async () => new Response(JSON.stringify(body)));
    expect(await new SearchInterpreter(provider).interpret(query)).toEqual(keywordIntent(query));
  });
});
