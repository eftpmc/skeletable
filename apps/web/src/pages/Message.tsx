import type { ReactNode } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

/** The page's place when there's nothing to show: a short message and a way on. */
export function Message({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <p className="text-muted-foreground">{title}</p>
      {action ?? (
        <Button variant="outline" size="sm" asChild>
          <Link href="/">See all tables</Link>
        </Button>
      )}
    </div>
  );
}
