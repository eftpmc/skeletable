import { draftChecklist } from "@skeleton/tables/share";
import { Check, Circle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { FormError } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/api";
import type { PublishedTable } from "@/lib/status";

/** What stands between a draft and being published, and the button that does it. */
export function PublishDraft({ table, onChanged }: { table: PublishedTable; onChanged: () => void }) {
  const { items, unproven } = draftChecklist(table);
  const ready = items.every((item) => item.done);
  const [isPrivate, setIsPrivate] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const publish = async () => {
    setSending(true);
    const { ok, data } = await postJson<{ error?: string }>(`/api/tables/${table.owner}/${table.slug}/publish`, { private: isPrivate });
    setSending(false);
    if (!ok) return setError(data.error ?? "That didn't publish. Try again.");
    toast.success("Published");
    onChanged();
  };
  return (
    <section className="overflow-hidden rounded-xl border">
      <h2 className="border-b bg-muted px-3 py-2 text-sm font-medium">Before you publish</h2>
      <div className="space-y-4 p-4">
        <ul className="space-y-1.5 text-sm">
          {items.map(({ label, done }) => (
            <li key={label} className={`flex items-center gap-2 ${done ? "text-muted-foreground" : ""}`}>
              {done ? <Check className="size-4 text-brand" aria-label="Done" /> : <Circle className="size-4 text-muted-foreground" aria-label="To do" />}
              {label}
            </li>
          ))}
        </ul>
        <p className="text-sm">
          <Link href={`/${table.owner}/${table.slug}/settings`} className="underline underline-offset-2">Open details and columns</Link>
        </p>
        {unproven > 0 && <p className="text-sm text-muted-foreground">{unproven} {unproven === 1 ? "value has" : "values have"} no proof yet and will be left out when you publish.</p>}
        <fieldset className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          <legend className="sr-only">Who can see it</legend>
          <label className="flex items-center gap-2"><input type="radio" name="publish-to" className="size-4 accent-green-600" checked={!isPrivate} onChange={() => setIsPrivate(false)} />Public, in Browse</label>
          <label className="flex items-center gap-2"><input type="radio" name="publish-to" className="size-4 accent-green-600" checked={isPrivate} onChange={() => setIsPrivate(true)} />Private, for people you add</label>
        </fieldset>
        <FormError error={error} />
        <Button disabled={!ready || sending} onClick={() => void publish()}>{sending ? "Publishing..." : "Publish"}</Button>
      </div>
    </section>
  );
}
