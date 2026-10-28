import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { digest, recipeSchema, type Recipe } from "./recipes.js";
import { validateRecipe, type Fixture } from "./repair.js";

const proposalSchema = z.object({
  id: z.string(), recipe: recipeSchema, baseHash: z.string(), fixtureHash: z.string(),
  status: z.enum(["rejected", "pending", "approved"]), createdAt: z.string(),
  validation: z.unknown(), reviewedBy: z.string().optional(),
});
const stateSchema = z.object({
  schemaVersion: z.literal(1), active: recipeSchema,
  versions: z.array(recipeSchema), proposals: z.array(proposalSchema),
  history: z.array(z.object({ action: z.string(), recipeHash: z.string(), at: z.string(), reviewer: z.string() })),
});
type State = z.infer<typeof stateSchema>;

/** One recipe family per registry. Atomic replacement and an exclusive writer lock. */
export class RecipeStore {
  constructor(readonly file: string) {}
  async read(): Promise<State> { return stateSchema.parse(JSON.parse(await readFile(this.file, "utf8"))); }
  private async write<T>(fn: (state: State | null) => { state: State; result: T }): Promise<T> {
    await mkdir(dirname(this.file), { recursive: true });
    const lock = await open(`${this.file}.lock`, "wx");
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      let state: State | null;
      try { state = await this.read(); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; state = null; }
      const change = fn(state);
      await writeFile(temporary, JSON.stringify(change.state, null, 2), { flag: "wx" });
      await rename(temporary, this.file);
      return change.result;
    } finally {
      await rm(temporary, { force: true });
      await lock.close();
      await rm(`${this.file}.lock`, { force: true });
    }
  }
  async initialize(input: Recipe, fixtures: Fixture[], reviewer: string) {
    const recipe = recipeSchema.parse(input);
    const report = validateRecipe(recipe, fixtures);
    if (!report.passed || !reviewer.trim()) throw new Error("Initial recipe needs passing fixtures and a reviewer");
    return this.write((state) => {
      if (state) throw new Error("Registry already exists");
      return { state: { schemaVersion: 1, active: recipe, versions: [recipe], proposals: [], history: [{ action: "initialize", recipeHash: digest(recipe), at: new Date().toISOString(), reviewer }] }, result: report };
    });
  }
  async propose(input: Recipe, fixtures: Fixture[]) {
    const recipe = recipeSchema.parse(input);
    return this.write((state) => {
      if (!state) throw new Error("Initialize registry first");
      if (recipe.id !== state.active.id || recipe.origin !== state.active.origin || recipe.pathPrefix !== state.active.pathPrefix ||
        recipe.version <= Math.max(...state.versions.map((r) => r.version))) throw new Error("Repair must preserve scope and use a new version");
      const validation = validateRecipe(recipe, fixtures);
      const proposal = { id: randomUUID(), recipe, baseHash: digest(state.active), fixtureHash: validation.fixtureHash,
        status: validation.passed ? "pending" as const : "rejected" as const, createdAt: new Date().toISOString(), validation };
      state.proposals.push(proposal);
      return { state, result: proposal };
    });
  }
  async approve(id: string, fixtures: Fixture[], reviewer: string) {
    if (!reviewer.trim()) throw new Error("Reviewer required");
    return this.write((state) => {
      const proposal = state?.proposals.find((p) => p.id === id);
      if (!state || !proposal || proposal.status !== "pending") throw new Error("No pending proposal");
      if (proposal.baseHash !== digest(state.active)) throw new Error("Active recipe changed; propose again");
      const validation = validateRecipe(proposal.recipe, fixtures);
      if (!validation.passed || validation.fixtureHash !== proposal.fixtureHash) throw new Error("Fixtures changed or validation failed");
      state.active = proposal.recipe;
      state.versions.push(proposal.recipe);
      proposal.status = "approved"; proposal.reviewedBy = reviewer;
      state.history.push({ action: "approve", recipeHash: digest(state.active), at: new Date().toISOString(), reviewer });
      return { state, result: state.active };
    });
  }
  async rollback(version: number, reviewer: string) {
    if (!reviewer.trim()) throw new Error("Reviewer required");
    return this.write((state) => {
      const recipe = state?.versions.find((r) => r.version === version);
      if (!state || !recipe) throw new Error("Unknown previously approved version");
      state.active = recipe;
      state.history.push({ action: "rollback", recipeHash: digest(recipe), at: new Date().toISOString(), reviewer });
      return { state, result: recipe };
    });
  }
}
