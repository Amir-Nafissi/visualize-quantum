import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names, resolving Tailwind conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format a probability (0..1) as a percentage string with precision that scales
 * to the magnitude, so small values don't collapse to "0%":
 *   0.31 -> "31%", 0.031 -> "3.1%", 0.0079 -> "0.79%", 0 -> "0%".
 */
export function formatPercent(fraction: number): string {
  const p = fraction * 100;
  if (!Number.isFinite(p) || p <= 0) return "0%";
  if (p < 1) return `${p.toFixed(2)}%`;
  if (p < 10) return `${p.toFixed(1)}%`;
  return `${Math.round(p)}%`;
}
