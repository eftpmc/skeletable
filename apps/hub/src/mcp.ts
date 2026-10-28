import { jobKinds, type JobKind } from "@skeleton/formats";
import type { HubDb } from "@skeleton/hub-db";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { claimJob, JobError, submitAnswer } from "./jobs.js";
import { canCurate, whoIs } from "./roles.js";
import { catalogRecipeSchema } from "./readers/recipe.js";
import { decideProposal, pendingProposals, ProposalError, proposalsBy, proposeSite, type SampleReport, SAMPLE_PAGES } from "./proposals.js";
import type { CrawlOptions } from "./engine/crawl.js";
import { instructionsFor } from "./worker.js";

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
const refuse = (message: string) => ({ ...text(message), isError: true });

/**
 * The hub as MCP tools, for a contributor's own agent: take a job with its instructions and answer
 * format, send the answer, propose a site. The agent calls in with the contributor's hub token, so
 * every answer is theirs, counted and ranked like any other.
 */
export function hubMcpServer(db: HubDb, contributorId: string, options: { crawl?: CrawlOptions; curator?: boolean } = {}) {
  const server = new McpServer({ name: "skeleton-hub", version: "1.0.0" });

  server.registerTool(
    "whoami",
    { description: "Your handle, kind, role and trust on the hub." },
    async () => text(await whoIs(db, contributorId)),
  );

  server.registerTool(
    "claim_job",
    {
      description:
        "Take the next open job. Returns its input, the instructions to follow and the JSON Schema the answer must match. " +
        "You have 10 minutes to answer with submit_answer. Returns a note when there is nothing to do.",
      inputSchema: { kinds: z.array(z.enum(Object.keys(jobKinds) as [JobKind, ...JobKind[]])).optional().describe("Only these job kinds") },
    },
    async ({ kinds }) => {
      // Only kinds there are written instructions for can be answered well by an agent that starts cold.
      const answerable = (kinds ?? (Object.keys(jobKinds) as JobKind[])).filter((k) => instructionsFor(k));
      if (!answerable.length) return text("No job of those kinds can be taken yet.");
      const claimed = await claimJob(db, contributorId, { kinds: answerable });
      if (!claimed) return text("No open jobs right now.");
      const spec = jobKinds[claimed.kind as JobKind];
      return text({ ...claimed, instructions: instructionsFor(claimed.kind as JobKind), answerSchema: z.toJSONSchema(spec.answer) });
    },
  );

  server.registerTool(
    "submit_answer",
    {
      description: "Answer a job you claimed. The answer must match the job's answerSchema; one that doesn't is refused with the reason.",
      inputSchema: {
        assignmentId: z.string().describe("From claim_job"),
        answer: z.record(z.string(), z.unknown()).describe("The answer, matching answerSchema"),
        model: z.string().max(200).optional().describe("The model you are, for the record"),
      },
    },
    async ({ assignmentId, answer, model }) => {
      try {
        return text(await submitAnswer(db, assignmentId, contributorId, { answer, model, promptVersion: "mcp" }));
      } catch (error) {
        if (error instanceof JobError) return refuse(error.message);
        throw error;
      }
    },
  );

  server.registerTool(
    "propose_site",
    {
      description:
        "Propose an independent shop for the catalog: a maker or small seller with its own site, not a marketplace, reseller or drop-shipper. " +
        "Say why it belongs. If no platform reader recognises the site (the reply says so), send it again with a recipe: where its product pages are " +
        "(its sitemap, under pathPrefix) and the CSS selector of the one element holding each field (attribute: read that attribute, e.g. content or src, " +
        "instead of the text). Prefer stable selectors such as meta[property='og:title'] with attribute content. " +
        `The hub tries the site on ${SAMPLE_PAGES} of its own products before anyone sees it: a proposal that doesn't read comes back with each page's ` +
        "problems to fix. One that does waits for a curator; sending it again while it waits replaces it.",
      inputSchema: {
        url: z.string().max(500).describe("The shop's address"),
        why: z.string().trim().min(20).max(1000).describe("Why it belongs: who makes what, and why it is independent"),
        recipe: z.record(z.string(), z.unknown()).optional().describe(`Only for a site no platform reader covers: ${JSON.stringify(z.toJSONSchema(catalogRecipeSchema))}`),
      },
    },
    async ({ url, why, recipe }) => {
      try {
        const made = await proposeSite(db, contributorId, { url, note: why, recipe }, options.crawl);
        return text({ ...made, report: summary(made.report), note: made.replaced ? "Your waiting proposal was replaced." : "It waits for a curator." });
      } catch (error) {
        if (error instanceof ProposalError) return refuse(JSON.stringify({ error: error.message, ...(error.report ? { report: error.report } : {}) }, null, 2));
        throw error;
      }
    },
  );

  server.registerTool(
    "my_proposals",
    { description: "Your proposals and how each went: pending, approved or rejected." },
    async () => text(await proposalsBy(db, contributorId)),
  );

  if (options.curator) curatorTools(server, db, contributorId);
  return server;
}

/** The sample as an agent or curator reads it: each page's product, or what went wrong. */
const summary = (report: SampleReport) => ({
  read: report.read,
  of: report.pages.length,
  pages: report.pages.map((p) => (p.reading ? { url: p.url, title: p.reading.title, price: p.reading.price, image: p.reading.images?.[0]?.url } : { url: p.url, problems: p.issues })),
});

/**
 * What a curator decides on, as tools: the proposals waiting, and the one call on each. Only offered to
 * curators and the owner; everyone else's agents never see them.
 */
function curatorTools(server: McpServer, db: HubDb, curatorId: string) {
  server.registerTool(
    "review_queue",
    {
      description:
        "Proposals waiting for a curator: each site with who proposed it and why, how the hub will read it, and the sample products it read. " +
        "Check they are real products with the right title, price and photo. Approve only independent makers and small sellers with their own shop.",
    },
    async () => text((await pendingProposals(db)).map((p) => ({ proposalId: p.id, domain: p.domain, proposer: p.proposer, why: p.note, reader: p.reader, samples: summary(p.report as SampleReport) }))),
  );

  server.registerTool(
    "decide_proposal",
    {
      description: "Approve a proposal (its site is read the way it proposed from the next weekly crawl) or reject it (the site stays declined).",
      inputSchema: { proposalId: z.uuid().describe("From review_queue"), approve: z.boolean() },
    },
    async ({ proposalId, approve }) => {
      const decided = await decideProposal(db, curatorId, proposalId, approve);
      return decided ? text(decided) : refuse("No proposal with that id is waiting.");
    },
  );
}

/** Answer one MCP request statelessly: a fresh server and transport per request, as the hub keeps no sessions. */
export async function handleMcp(db: HubDb, contributorId: string, request: Request, options: { crawl?: CrawlOptions } = {}): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const server = hubMcpServer(db, contributorId, { ...options, curator: canCurate((await whoIs(db, contributorId))?.role) });
  await server.connect(transport);
  return transport.handleRequest(request);
}
