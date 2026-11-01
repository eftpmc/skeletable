import { LoaderCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function Spinner({ label = "Loading", className = "" }: { label?: string; className?: string }) {
  return <span role="status" className={`inline-flex items-center gap-1.5 ${className}`}><LoaderCircle aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" /><span className="sr-only">{label}</span></span>;
}

export function ListSkeleton({ label, rows = 4, compact = false }: { label: string; rows?: number; compact?: boolean }) {
  return <div role="status" aria-label={label} className="divide-y border-y">
    <span className="sr-only">{label}</span>
    {Array.from({ length: rows }, (_, index) => <div key={index} aria-hidden="true" className={`space-y-3 px-3 ${compact ? "py-4" : "py-6"}`}>
      {!compact && <Skeleton className="h-3 w-20" />}<Skeleton className={`h-5 ${index % 2 ? "w-2/3" : "w-1/2"}`} /><Skeleton className="h-3 w-5/6" /><Skeleton className="h-3 w-1/3" />
    </div>)}
  </div>;
}

export function SheetSkeleton() {
  return <div role="status" aria-label="Loading table" className="min-h-0 flex-1 overflow-hidden">
    <span className="sr-only">Loading table</span>
    <div aria-hidden="true" className="flex gap-3 border-b px-3 py-2"><Skeleton className="h-8 w-56" /><Skeleton className="h-8 w-16" /><Skeleton className="h-8 w-24" /></div>
    <div aria-hidden="true" className="min-w-[40rem]">
      {Array.from({ length: 9 }, (_, row) => <div key={row} className={`grid grid-cols-[2.5rem_2fr_repeat(4,1fr)] border-b ${row === 0 ? "bg-muted/50" : ""}`}>
        {Array.from({ length: 6 }, (_, column) => <div key={column} className="border-r px-3 py-3"><Skeleton className={`h-3 ${column === 1 ? "w-3/4" : "w-full"}`} /></div>)}
      </div>)}
    </div>
  </div>;
}
