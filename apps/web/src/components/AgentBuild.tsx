import { Bot, Check, Copy } from "lucide-react";
import { useState } from "react";
import { Spinner } from "@/components/Loading";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { postJson } from "@/lib/api";
import { copyText } from "@/lib/copy";
import type { Template } from "@skeleton/tables/templates";

const rules = "Use each subject's own official pages. Copy every quote word for word, and make sure it states the value. Never get around a block or a login. When no acceptable source states a value, say where you looked, and don't guess.";

const buildPrompt = (at: string, subject: string) => `Use the Skeletable MCP server to build out my blank draft table ${at}, about ${subject || "[what you want to know]"}. Add its columns with add_columns, including a rule for each, and its rows with add_rows. Then find the source for each cell and save them with fill_cells, a few rows at a time. ${rules} When you're done, tell me what you couldn't find.`;

const fillPrompt = (at: string) => `Use the Skeletable MCP server to fill my draft table ${at}. Call get_table to see its columns and rows, then find the source for each cell and save them with fill_cells, a few rows at a time. Add columns or rows with add_columns and add_rows if it needs them. Leave the cells that already have proof alone. ${rules} When you're done, tell me what you couldn't find.`;

const datasetPrompt = (at: string, subject: string) => `Use the Skeletable MCP server to fill my table ${at}${subject ? `: ${subject}` : ""}. Call get_table to see its columns, add any it needs with add_columns (dates are a date column, and a status list is a text column with choices), then add rows with their values using add_rows, up to 500 at a time. Say truthfully where each value came from with \`origin\`: entered if I told you, imported with a \`note\` naming the file or email it came from, link with its \`source\` if it came from a page, or generated if you wrote it. Values don't need a web page behind them. When you're done, tell me how many rows you added and anything you weren't sure about.`;

const aiPrompt = (at: string) => `Use the Skeletable MCP server to fill the AI columns in my table ${at}. Call next_ai_cells to get the prompts, answer each one yourself, and send the answers back with fill_ai_cells, each with its row and basis and your model's name. Keep going until next_ai_cells says it's done, then tell me how many you filled and any you weren't sure about.`;

const editPrompt = (at: string) => `Use the Skeletable MCP server to check my table ${at}. Call get_table, then open each source and see whether its value still holds. Where a value is wrong, missing or out of date, suggest the fix with propose_change, with its source and exact quote. I'll review each one under Proposals. ${rules} When you're done, tell me what you changed and what you couldn't check.`;

function CopyBlock({ label, text, rows }: { label: string; text: string; rows: number }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!(await copyText(text))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <Button type="button" variant="outline" size="xs" onClick={() => void copy()}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy"}</Button>
      </div>
      <Textarea readOnly aria-label={label} rows={rows} value={text} className="resize-none font-mono text-xs" />
    </div>
  );
}

/** The one place to hand a table to the person's own agent. It does the reading, and a person keeps the final say. */
export function AgentBuildButton({ table, label = "Agent", size = "sm", template, defaultOpen = false }: { table: { owner: string; slug: string; draft?: boolean; proof?: "required" | "optional"; columns: { instruction?: string }[] }; label?: string; size?: "sm" | "default" | "lg"; template?: Template; defaultOpen?: boolean }) {
  const [token, setToken] = useState<string>();
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const [subject, setSubject] = useState("");
  const makeToken = async () => {
    if (sending) return;
    setSending(true);
    setError(undefined);
    try {
    const { ok, data } = await postJson<{ token: string }>("/api/tokens", { name: "Agent" });
    if (ok) setToken(data.token);
    else setError("That token didn't save. Try again.");
    } catch { setError("Couldn’t connect. Try again."); }
    finally { setSending(false); }
  };
  const at = `${table.owner}/${table.slug}`;
  const blank = table.draft && !table.columns.length;
  const dataset = table.proof === "optional";
  const hasAi = table.columns.some((column) => column.instruction);
  const prompt = template ? template.prompt(at, subject.trim()) : hasAi ? aiPrompt(at) : dataset ? datasetPrompt(at, subject) : blank ? buildPrompt(at, subject) : table.draft ? fillPrompt(at) : editPrompt(at);
  const command = `claude mcp add --transport http skeletable ${location.origin}/mcp --header "Authorization: Bearer ${token ?? "YOUR_TOKEN"}"`;
  return (
    <Dialog defaultOpen={defaultOpen}>
      <DialogTrigger asChild><Button type="button" variant="outline" size={size}><Bot />{label}</Button></DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogTitle>Edit this table with your agent</DialogTitle>
        <DialogDescription>{template ? `Your ${template.title.toLowerCase()} table is set up. Hand it to your own agent: it fills the rows, and this sheet fills in as it works. Each value says where it came from.` : hasAi ? "Your own agent answers each AI column's instruction, row by row, and this sheet fills in as it works. Anything a person typed stays as it is." : dataset ? "Your own agent adds rows and values, each marked with where it came from, and this sheet fills in as it works." : table.draft ? "Your own agent does the reading. Each value is tested before it's saved, and this sheet fills in as it works. Nothing goes public until you publish." : "Your own agent does the reading. Each change it finds comes to you under Proposals, with its proof already tested, and nothing changes until you accept it."}</DialogDescription>
        <div className="min-w-0 space-y-4">
          {!token && <Button type="button" variant="outline" size="sm" disabled={sending} aria-busy={sending} onClick={() => void makeToken()}>{sending && <Spinner label="Creating token" />}{sending ? "Creating token…" : "Make a token for this agent"}</Button>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {token && <p className="text-sm text-muted-foreground">The token is in the command below, and it's shown only once. You can remove it in Settings.</p>}
          <CopyBlock label="1. Connect it once" text={command} rows={3} />
          {template ? (
            <Input aria-label="Anything to add?" placeholder={template.id === "job-tracker" ? "Anything to add? Like: my applications.md file" : "Anything to add? Like what it's about"} value={subject} onChange={(event) => setSubject(event.target.value)} />
          ) : (blank || (dataset && !hasAi)) && <Input aria-label="What should this table cover?" placeholder="What should this table cover?" value={subject} onChange={(event) => setSubject(event.target.value)} />}
          <CopyBlock label="2. Ask it" text={prompt} rows={7} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
