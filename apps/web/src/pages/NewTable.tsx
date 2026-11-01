import { ListPlus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { DraftGrid } from "@/components/DraftGrid";
import { Content, Field, FormError, PageHeader, SignInLink } from "@/components/Layout";
import { Page } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { postJson, useMe } from "@/lib/api";
import { blankDraft, draftBody, pasteInto, rowSets } from "@/lib/draft";
import { Message } from "@/pages/Message";

/** Start a table the way you'd start a sheet. It's a private draft until its details and proof are in, and then it's published. */
export function NewTable() {
  const { user } = useMe();
  const [, navigate] = useLocation();
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState(user?.handle ?? "");
  const [draft, setDraft] = useState(blankDraft);
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);

  useEffect(() => {
    document.title = "New table · Skeletable";
  }, []);

  if (!user) {
    return (
      <Page>
        <Content size="narrow"><Message title="Sign in to create a table" action={<SignInLink />} /></Content>
      </Page>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body = draftBody(draft);
    if ("error" in body) return setError(body.error);
    setSending(true);
    setError(undefined);
    const { ok, data } = await postJson<{ owner: string; slug: string; error?: string }>("/api/tables", { ...body, title, draft: true, ...(owner && { owner }) });
    setSending(false);
    if (ok) navigate(`/${data.owner}/${data.slug}/sheet`);
    else setError(data.error ?? "That didn't save. Try again.");
  };

  return (
    <Page crumbs={[{ label: "New table" }]}>
      <Content>
        <PageHeader title="New table" description="Type or paste it in. Everything starts as a private draft, and values stay marked until they have proof." />
        <form onSubmit={submit} className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            {user.teams.length > 0 && (
              <Field label="Owner">
                <NativeSelect value={owner} onChange={(event) => setOwner(event.target.value)}>
                  {user.handle && <option value={user.handle}>{user.name ?? user.handle}</option>}
                  {user.teams.map((team) => <option key={team.handle} value={team.handle}>{team.name}</option>)}
                </NativeSelect>
              </Field>
            )}
            <div className="min-w-60 flex-1"><Field label="Title"><Input required maxLength={120} placeholder="Mechanical keyboards" value={title} onChange={(event) => setTitle(event.target.value)} /></Field></div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button type="button" variant="outline"><ListPlus />Fill in rows</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {rowSets.map(({ label, rows }) => <DropdownMenuItem key={label} onSelect={() => setDraft(pasteInto(draft, rows.join("\n"), 1, 0))}>{label}</DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <DraftGrid draft={draft} onChange={setDraft} />
          <p className="text-sm text-muted-foreground">Paste a range from Excel or Google Sheets into any cell, and the first row becomes your headings.</p>
          <FormError error={error} />
          <Button type="submit" size="lg" disabled={sending}>{sending ? "Creating..." : "Create draft"}</Button>
        </form>
      </Content>
    </Page>
  );
}
