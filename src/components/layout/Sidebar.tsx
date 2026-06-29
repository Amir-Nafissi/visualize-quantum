"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Atom, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { algorithmModules } from "@/modules/registry";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card/40 md:flex">
      <Link
        href="/"
        className="flex h-14 items-center gap-2 border-b border-border px-5"
      >
        <span className="flex size-7 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Atom className="size-4" />
        </span>
        <span className="font-semibold tracking-tight">VisualizeQuantum</span>
      </Link>

      <nav className="flex-1 space-y-1 p-3">
        <NavItem
          href="/"
          active={pathname === "/"}
          icon={<LayoutDashboard className="size-4" />}
          label="Dashboard"
        />

        <p className="px-3 pb-1 pt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
          Algorithms
        </p>

        {algorithmModules.map((m) => {
          const href = `/visualize/${m.id}`;
          const Icon = m.icon;
          return (
            <NavItem
              key={m.id}
              href={href}
              active={pathname === href}
              icon={<Icon className="size-4" />}
              label={m.name}
              disabled={!m.enabled}
            />
          );
        })}
      </nav>

      <div className="border-t border-border p-4 text-xs text-muted-foreground/60">
        Milestone 1 · QAOA
      </div>
    </aside>
  );
}

function NavItem({
  href,
  active,
  icon,
  label,
  disabled,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-accent font-medium text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      )}
    >
      <span className="flex items-center gap-2.5">
        {icon}
        {label}
      </span>
      {disabled && (
        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground/70">
          soon
        </span>
      )}
    </Link>
  );
}
