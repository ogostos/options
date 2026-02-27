export const DESIGN = {
  bg: "#06090d",
  card: "rgba(255,255,255,0.042)",
  cardBorder: "rgba(255,255,255,0.10)",
  text: "#e7eefb",
  bright: "#f8fafc",
  muted: "#8b9cb5",
  green: "#4ade80",
  red: "#f87171",
  yellow: "#fbbf24",
  blue: "#818cf8",
  purple: "#c084fc",
  mono: "var(--font-jetbrains-mono), 'JetBrains Mono', 'SF Mono', monospace",
  sans: "var(--font-dm-sans), 'DM Sans', -apple-system, sans-serif",
} as const;

export function formatMoney(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return `$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatSigned(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${formatMoney(Math.abs(value))}`;
}

export function formatPct(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function computeDTE(expiryDate: string | null | undefined) {
  if (!expiryDate) return 0;
  const exp = new Date(`${expiryDate}T16:00:00-05:00`);
  const now = new Date();
  const ms = exp.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86400000));
}
