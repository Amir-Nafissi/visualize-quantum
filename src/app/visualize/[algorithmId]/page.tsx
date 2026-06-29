import { notFound } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { algorithmModules, getModule } from "@/modules/registry";

interface PageProps {
  params: Promise<{ algorithmId: string }>;
}

/** Pre-render a static page per registered module. */
export function generateStaticParams() {
  return algorithmModules.map((m) => ({ algorithmId: m.id }));
}

export default async function VisualizePage({ params }: PageProps) {
  const { algorithmId } = await params;
  const mod = getModule(algorithmId);

  if (!mod) {
    notFound();
  }

  const { ConfigComponent, VisualizerComponent, name, description, icon: Icon } =
    mod;

  return (
    <>
      <Navbar title={name} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-5" />
            </span>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">{name}</h1>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
            {/* Inputs / configuration */}
            <section>
              <ConfigComponent />
            </section>

            {/* Results / visualization */}
            <section className="lg:sticky lg:top-6 lg:self-start">
              <VisualizerComponent />
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
