import { templates, type Template } from "@skeleton/tables/templates";
import { BookOpen, Briefcase, FilePlus, NotebookPen, Tags, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Spinner } from "@/components/Loading";
import { postJson, useMe } from "@/lib/api";

const icons: Record<string, LucideIcon> = { "job-tracker": Briefcase, "text-dataset": Tags, "reading-list": BookOpen, "research-notes": NotebookPen };

/** Where someone goes after picking a template: its sheet, with the agent's prompt open, in the view that suits it. */
export const templateSheet = (table: { owner: string; slug: string }, template: Template) =>
  `/${table.owner}/${table.slug}/sheet?agent=${template.id}${template.view !== "sheet" ? `&view=${template.view}` : ""}`;

/** Starts a table from a template, or asks the person to sign in first and comes back to it. */
export function useStartTemplate() {
  const { user } = useMe();
  const [, navigate] = useLocation();
  const [starting, setStarting] = useState<string>();
  const start = async (template: Template) => {
    if (!user) {
      location.href = `/auth/google?next=${encodeURIComponent(`/new?template=${template.id}`)}`;
      return;
    }
    setStarting(template.id);
    const { ok, data } = await postJson<{ owner: string; slug: string; error?: string }>("/api/tables/template", { template: template.id });
    setStarting(undefined);
    if (!ok) return void toast.error(data.error ?? "That table didn't start. Try again.");
    navigate(templateSheet(data, template));
  };
  return { start, starting };
}

const card = "group flex h-full w-full flex-col items-start gap-2 rounded-xl border bg-card p-4 text-left transition-colors hover:border-brand/60 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-60";

/** The templates as cards, and a blank table first when asked. */
export function TemplateCards({ blank, onBlank }: { blank?: boolean; onBlank?: () => void }) {
  const { start, starting } = useStartTemplate();
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {blank && (
        <li>
          <button type="button" className={card} onClick={onBlank}>
            <FilePlus className="size-5 text-muted-foreground" />
            <span className="font-medium">Blank table</span>
            <span className="text-sm text-muted-foreground">Name your own columns and rows, or let your agent set them up.</span>
          </button>
        </li>
      )}
      {templates.map((template) => {
        const Icon = icons[template.id] ?? FilePlus;
        return (
          <li key={template.id}>
            <button type="button" className={card} disabled={!!starting} aria-busy={starting === template.id} onClick={() => void start(template)}>
              {starting === template.id ? <Spinner label={`Starting ${template.title}`} /> : <Icon className="size-5 text-brand" />}
              <span className="font-medium">{template.title}</span>
              <span className="text-sm text-muted-foreground">{template.summary}</span>
              <span className="mt-auto pt-1 text-xs text-muted-foreground">{[template.rowsAre, ...template.columns.map((column) => column.label)].join(" · ")}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
