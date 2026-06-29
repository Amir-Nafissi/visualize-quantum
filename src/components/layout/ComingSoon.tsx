import { Construction } from "lucide-react";

/** Placeholder surface for modules that are registered but not yet built. */
export function ComingSoon() {
  return (
    <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
      <div className="rounded-full border border-border bg-secondary/40 p-3">
        <Construction className="size-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium">Coming soon</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          This algorithm module is planned for a future milestone.
        </p>
      </div>
    </div>
  );
}
