import { Check, Copy, Globe, Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** A link to the live table, as you're looking at it. */
export function ShareButton({ title, path, size = "lg" }: { title: string; path: string; size?: "lg" | "sm" }) {
  const url = `${location.origin}${path}`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // The browser refused; the link is still on screen to select.
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size={size}><Share2 />Share</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Share {title}</DialogTitle>
        <DialogDescription>This link opens the live table with your current sort and filters.</DialogDescription>
        <div className="flex items-center gap-2">
          <Input aria-label="Link to this table" readOnly value={url} onFocus={(event) => event.target.select()} />
          <Button variant="outline" onClick={copy}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy link"}</Button>
        </div>
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Globe className="size-4 shrink-0" />Public: anyone with the link can view.</p>
      </DialogContent>
    </Dialog>
  );
}
