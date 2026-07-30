import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a market value like 4820 → "4,820". */
export function formatValue(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** Format an MDI z-score with explicit sign, e.g. "+1.24". */
export function formatMdi(mdi: number): string {
  return `${mdi >= 0 ? "+" : ""}${mdi.toFixed(2)}`;
}

/** Format a probability as a percentage, e.g. 0.734 → "73%". */
export function formatPct(p: number, digits = 0): string {
  return `${(p * 100).toFixed(digits)}%`;
}
