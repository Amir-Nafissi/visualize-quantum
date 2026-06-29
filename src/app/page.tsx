import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { algorithmModules } from "@/modules/registry";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  return (
    <>
      <Navbar />
      <main className="bg-grid flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <div className="mb-10">
            <span className="inline-flex items-center rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs text-muted-foreground">
              Milestone 1 · Live
            </span>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">
              Visualize Quantum Algorithms
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Build a graph, run real QAOA circuits on a simulator or IBM
              Quantum hardware, and watch the optimization converge. A modular
              playground designed to grow one algorithm at a time.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {algorithmModules.map((m) => {
              const Icon = m.icon;
              const card = (
                <div
                  className={cn(
                    "group relative h-full rounded-xl border border-border bg-card p-5 transition-colors",
                    m.enabled
                      ? "hover:border-primary/40 hover:bg-accent/40"
                      : "opacity-60"
                  )}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-5" />
                    </span>
                    {m.enabled ? (
                      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                    ) : (
                      <span className="rounded bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                        Coming soon
                      </span>
                    )}
                  </div>
                  <h2 className="font-semibold">{m.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {m.description}
                  </p>
                </div>
              );

              return m.enabled ? (
                <Link key={m.id} href={`/visualize/${m.id}`}>
                  {card}
                </Link>
              ) : (
                <div key={m.id}>{card}</div>
              );
            })}
          </div>
        </div>
      </main>
    </>
  );
}
