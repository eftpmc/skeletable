import { Bot, Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { postJson } from "@/lib/api";
import { copyText } from "@/lib/copy";

const rules = "Use each subject's own official pages. Copy every quote word for word, and make sure it states the value. Never get around a block or a login. When no acceptable source states a value, use `checked` to list where you looked, and don't guess. Work a few rows at a time.";

const fillPrompt = (at: string) => `Use the Skeletable MCP server to fill the draft table ${at}. Call get_table to see its columns and rows, then find the source for each cell and save them with fill_cells. Leave the cells that already have proof alone. ${rules} When you're done, tell me what you couldn't find.`;

const buildPrompt = (subject: string) => `Use the Skeletable MCP server to build a table about ${subject || "[what you want to know]"}. First call create_table with its columns and rows, including a question, a scope and a rule for each column, and give me the link it returns so I can watch. Then find the source for each cell and save them with fill_cells. ${rules} When you're done, tell me what you couldn't find.`;

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

/** Hands a draft to the person's own agent: it does the reading, and the proof lands in the sheet as it goes. */
export function AgentBuildButton({ table, subject = "" }: { table?: { owner: string; slug: string }; subject?: string }) {
  const [token, setToken] = useState<string>();
  const [error, setError] = useState<string>();
  const makeToken = async () => {
    const { ok, data } = await postJson<{ token: string }>("/api/tokens", { name: "Building tables" });
    if (ok) setToken(data.token);
    else setError("That token didn't save. Try again.");
  };
  const command = `claude mcp add --transport http skeletable ${location.origin}/mcp --header "Authorization: Bearer ${token ?? "YOUR_TOKEN"}"`;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size={table ? "sm" : "lg"}><Bot />{table ? "Fill with your agent" : "Build with your agent"}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogTitle>{table ? "Fill this draft with your agent" : "Build a table with your agent"}</DialogTitle>
        <DialogDescription>Your own agent does the reading. Each value is tested before it's saved, nothing goes public until you publish, and {table ? "this sheet fills in as it works." : "you can watch the sheet fill in."}</DialogDescription>
        <div className="min-w-0 space-y-4">
          {!token && <Button type="button" variant="outline" size="sm" onClick={() => void makeToken()}>Make a token for this agent</Button>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {token && <p className="text-sm text-muted-foreground">The token is in the command below, and it's shown only once. You can remove it in Settings.</p>}
          <CopyBlock label="1. Connect it once" text={command} rows={3} />
          <CopyBlock label="2. Ask it" text={table ? fillPrompt(`${table.owner}/${table.slug}`) : buildPrompt(subject)} rows={7} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
