import { jobKinds, type JobKind } from "@skeleton/formats";
import { catalogCategories } from "@skeleton/shared";
import { z } from "zod";

/**
 * A contributor's worker: takes jobs from a hub, answers them with a local model through Ollama,
 * and sends the answers back. The model is held to each job kind's answer format (Ollama's
 * structured outputs), and the hub checks every answer again before it counts.
 */
export const WORKER_PROMPT_VERSION = "extract-facts-2";

const categoryGuide = catalogCategories.map((c) => `${c.id} (${c.label})`).join(", ");

const INSTRUCTIONS: Partial<Record<JobKind, string>> = {
  "extract-facts": [
    "You read one product listing from an online shop, in any language, and state plain facts about the product.",
    "Use only what the listing says or plainly shows. Use null, or an empty list, for anything it doesn't say. Never guess.",
    "area: clothing for anything worn (clothes, shoes, bags, accessories, jewelry); home for homeware, decor, towels and furniture;",
    "tech for electronics; null for anything else (art, beauty, toys, tools, food, gift cards, samples).",
    `category: only when area is clothing, one of: ${categoryGuide}. Otherwise null.`,
    "department: women, men or unisex, only when the listing says who it is for.",
    "materials and colours: lowercase English words the listing states, such as \"wool\" or \"navy\".",
    "condition: new unless the listing says used, vintage or refurbished.",
    "origin: where it was made, as a two-letter country code, only when the listing says.",
    "confidence: 0.9 when the listing names the item plainly, 0.6 when you had to read between the lines, 0.3 when unsure.",
  ].join(" "),
};

/** The system prompt a worker gives its model for a job kind; undefined for kinds it can't do. */
export const instructionsFor = (kind: JobKind) => INSTRUCTIONS[kind];

export type WorkerOptions = {
  hub: string;
  token: string;
  ollama: string;
  model: string;
  kinds?: JobKind[];
  // Stop after this many jobs (all of them when unset), or when the queue is empty.
  limit?: number;
  log?: (line: string) => void;
  fetch?: typeof fetch;
};

export async function runWorker(options: WorkerOptions): Promise<{ answered: number; rejected: number }> {
  const { hub, token, ollama, model, kinds = ["extract-facts"], limit = Infinity, log = () => {}, fetch: http = fetch } = options;
  const call = (path: string, body: unknown) =>
    http(new URL(path, hub), { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  let answered = 0;
  let rejected = 0;
  while (answered + rejected < limit) {
    const claim = await call("/api/jobs/claim", { kinds });
    if (claim.status === 204) break;
    if (!claim.ok) throw new Error(`claim failed: ${claim.status} ${await claim.text()}`);
    const job = (await claim.json()) as { assignmentId: string; kind: JobKind; input: unknown };
    const spec = jobKinds[job.kind];
    const instructions = instructionsFor(job.kind);
    if (!spec || !instructions) throw new Error(`this worker can't do ${job.kind} jobs`);

    const reply = await http(new URL("/api/chat", ollama), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        format: z.toJSONSchema(spec.answer),
        options: { temperature: 0 },
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: JSON.stringify(job.input) },
        ],
      }),
    });
    if (!reply.ok) throw new Error(`Ollama: ${reply.status} ${await reply.text()}`);
    const content = ((await reply.json()) as { message?: { content?: string } }).message?.content ?? "";
    let answer: unknown;
    try {
      answer = JSON.parse(content);
    } catch {
      answer = null;
    }
    const sent = await call(`/api/assignments/${job.assignmentId}/answer`, { answer, model, promptVersion: WORKER_PROMPT_VERSION });
    if (sent.ok) answered++;
    else {
      rejected++;
      log(`rejected: ${await sent.text()}`);
    }
    if ((answered + rejected) % 25 === 0) log(`${answered} answered, ${rejected} rejected`);
  }
  return { answered, rejected };
}
