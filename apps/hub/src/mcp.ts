import { jobKinds, type JobKind } from "@skeleton/formats";
import { type HubDb, schema } from "@skeleton/hub-db";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { claimJob, JobError, submitAnswer } from "./jobs.js";
import { whoIs } from "./roles.js";
import { addSource, domainOf } from "./sources.js";
import type { CrawlOptions } from "./engine/crawl.js";
import { instructionsFor } from "./worker.js";

const { source } = schema;

// Sites one contributor may have waiting for review at once, so a runaway agent can't flood the list.
export const MAX_PROPOSED = 25;

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
const refuse = (message: string) => ({ ...text(message), isError: true });

/**
 * The hub as MCP tools, for a contributor's own agent: take a job with its instructions and answer
 * format, send the answer, propose a site. The agent calls in with the contributor's hub token, so
 * every answer is theirs, counted and ranked like any other.
 */
export function hubMcpServer(db: HubDb, contributorId: string, options: { crawl?: CrawlOptions } = {}) {
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
        "Propose an independent shop for the catalog: a maker or small seller with its own site, not a marketplace or a reseller. " +
        "The hub checks whether it can read the site; it then waits for a curator to approve it.",
      inputSchema: { url: z.string().max(500).describe("The shop's address") },
    },
    async ({ url }) => {
      let domain: string;
      try {
        domain = domainOf(url);
      } catch {
        return refuse("That isn't a web address.");
      }
      const [waiting] = await db
        .select({ n: count() })
        .from(source)
        .where(and(eq(source.addedById, contributorId), eq(source.status, "candidate")));
      if (waiting!.n >= MAX_PROPOSED) return refuse(`You have ${MAX_PROPOSED} sites waiting for review already.`);
      const added = await addSource(db, domain, contributorId, options.crawl);
      if (!added.created) return text({ domain, note: "The hub already knows this site." });
      return text({ domain, reader: added.readerId, note: added.readerId ? "Added; it waits for a curator." : "Added, but no reader recognises it yet; it waits for a curator." });
    },
  );

  return server;
}

/** Answer one MCP request statelessly: a fresh server and transport per request, as the hub keeps no sessions. */
export async function handleMcp(db: HubDb, contributorId: string, request: Request, options: { crawl?: CrawlOptions } = {}): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const server = hubMcpServer(db, contributorId, options);
  await server.connect(transport);
  return transport.handleRequest(request);
}
