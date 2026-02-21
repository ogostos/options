import type { CSSProperties, ReactNode } from "react";

import { DESIGN } from "@/lib/design";

export function Card({ children, style, className }: { children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <div
      className={className}
      style={{
        background: DESIGN.card,
        borderRadius: "8px",
        padding: "14px 16px",
        border: `1px solid ${DESIGN.cardBorder}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: "10px",
        color: DESIGN.muted,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        marginBottom: "5px",
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

export function Value({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <div
      style={{
        fontSize: "15px",
        fontWeight: 700,
        color: color ?? DESIGN.text,
        fontFamily: DESIGN.mono,
      }}
    >
      {children}
    </div>
  );
}

export function Pill({
  children,
  color,
  background,
}: {
  children: ReactNode;
  color: string;
  background: string;
}) {
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "10px",
        fontWeight: 700,
        background,
        color,
        border: `1px solid ${color}33`,
        letterSpacing: "0.3px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function Dots({ level, max = 5 }: { level: number | null; max?: number }) {
  const normalized = Math.max(0, Math.min(max, level ?? 0));
  const colors = ["#4ade80", "#a3e635", "#fbbf24", "#fb923c", "#ef4444"];
  return (
    <span style={{ display: "inline-flex", gap: "2px" }}>
      {Array.from({ length: max }, (_, index) => (
        <span
          key={index}
          style={{
            width: "5px",
            height: "5px",
            borderRadius: "50%",
            background:
              index < normalized
                ? colors[Math.min(Math.max(normalized - 1, 0), colors.length - 1)]
                : "rgba(255,255,255,0.08)",
            display: "inline-block",
          }}
        />
      ))}
    </span>
  );
}
