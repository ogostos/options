import Link from "next/link";

import { DESIGN } from "@/lib/design";

export default function NotFoundPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: DESIGN.bg,
        color: DESIGN.text,
        fontFamily: DESIGN.sans,
        display: "grid",
        placeItems: "center",
        padding: "20px",
      }}
    >
      <div
        style={{
          width: "min(460px, 100%)",
          background: DESIGN.card,
          border: `1px solid ${DESIGN.cardBorder}`,
          borderRadius: "8px",
          padding: "16px",
        }}
      >
        <div style={{ fontSize: "12px", color: DESIGN.muted, marginBottom: "6px", fontFamily: DESIGN.mono }}>404</div>
        <h1 style={{ fontSize: "18px", color: DESIGN.bright, margin: "0 0 8px" }}>Page not found</h1>
        <p style={{ fontSize: "12px", color: DESIGN.muted, marginBottom: "12px" }}>
          This route does not exist in your trading dashboard.
        </p>
        <Link href="/" style={{ fontSize: "12px", color: DESIGN.blue }}>
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
