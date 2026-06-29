import Link from "next/link";
import { Code2 } from "lucide-react";

interface NavbarProps {
  /** Breadcrumb / page title shown on the left. */
  title?: string;
}

export function Navbar({ title }: NavbarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/40 px-5 backdrop-blur">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          VisualizeQuantum
        </Link>
        {title && (
          <>
            <span className="text-muted-foreground/40">/</span>
            <span className="font-medium">{title}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-xs text-muted-foreground sm:inline">
          QAOA · Qiskit
        </span>
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Source"
        >
          <Code2 className="size-4" />
        </a>
      </div>
    </header>
  );
}
