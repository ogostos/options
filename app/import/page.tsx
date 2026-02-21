"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { ImportPreviewPanel } from "@/components/ImportPreview";
import { Card } from "@/components/ui/primitives";
import { DESIGN } from "@/lib/design";
import type { ImportPreview } from "@/lib/types";

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  const fileName = useMemo(() => file?.name ?? "Drop IB activity statement PDF here", [file]);

  async function runPreview() {
    if (!file) {
      setError("Select a PDF file first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("mode", "preview");
      formData.set("file", file);

      const resp = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });

      const data = (await resp.json()) as { preview?: ImportPreview; error?: string };
      if (!resp.ok || !data.preview) {
        throw new Error(data.error ?? "Failed to parse import file");
      }

      setPreview(data.preview);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Failed to parse import file");
    } finally {
      setLoading(false);
    }
  }

  async function commitImport() {
    if (!file) return;

    setSaving(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("mode", "commit");
      formData.set("file", file);

      const resp = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });

      const data = (await resp.json()) as { preview?: ImportPreview; error?: string };
      if (!resp.ok) {
        throw new Error(data.error ?? "Failed to save import");
      }

      if (data.preview) {
        setPreview(data.preview);
      }
    } catch (commitError) {
      setError(commitError instanceof Error ? commitError.message : "Failed to save import");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: DESIGN.bg, color: DESIGN.text, fontFamily: DESIGN.sans, padding: "20px" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h1 style={{ fontSize: "20px", color: DESIGN.bright, margin: 0 }}>Import Activity Statement</h1>
          <Link href="/" style={{ fontSize: "11px", color: DESIGN.blue }}>Back to Dashboard</Link>
        </div>

        <Card style={{ marginBottom: "12px" }}>
          <div
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              const dropped = event.dataTransfer.files?.[0];
              if (dropped) {
                setFile(dropped);
              }
            }}
            style={{
              border: `1px dashed ${dragActive ? `${DESIGN.blue}66` : DESIGN.cardBorder}`,
              background: dragActive ? `${DESIGN.blue}08` : "rgba(0,0,0,0.28)",
              borderRadius: "8px",
              padding: "24px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "12px", color: DESIGN.text, marginBottom: "8px" }}>{fileName}</div>
            <label
              htmlFor="pdf-file"
              style={{
                display: "inline-block",
                padding: "6px 14px",
                borderRadius: "6px",
                border: `1px solid ${DESIGN.purple}44`,
                color: DESIGN.purple,
                background: `${DESIGN.purple}12`,
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Click to Upload PDF
            </label>
            <input
              id="pdf-file"
              type="file"
              accept="application/pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              style={{ display: "none" }}
            />
          </div>

          <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
            <button
              onClick={runPreview}
              disabled={loading || !file}
              style={{
                padding: "8px 14px",
                borderRadius: "6px",
                border: `1px solid ${DESIGN.blue}44`,
                background: `${DESIGN.blue}18`,
                color: DESIGN.blue,
                fontWeight: 700,
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              {loading ? "Parsing..." : "Preview Import"}
            </button>

            <button
              onClick={commitImport}
              disabled={saving || !preview}
              style={{
                padding: "8px 14px",
                borderRadius: "6px",
                border: `1px solid ${DESIGN.green}44`,
                background: `${DESIGN.green}18`,
                color: DESIGN.green,
                fontWeight: 700,
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              {saving ? "Saving..." : "Confirm & Save"}
            </button>
          </div>

          {error && <div style={{ marginTop: "10px", fontSize: "12px", color: DESIGN.red }}>{error}</div>}
        </Card>

        {preview && <ImportPreviewPanel preview={preview} />}
      </div>
    </main>
  );
}
