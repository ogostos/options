"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { ImportPreviewPanel } from "@/components/ImportPreview";
import { Card } from "@/components/ui/primitives";
import { DESIGN } from "@/lib/design";
import type { ImportPreview } from "@/lib/types";

type ConflictResolutionAction = "ignore" | "create_new" | "update_existing";

type ConflictResolution = {
  action: ConflictResolutionAction;
  tradeId: number | null;
};

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [resolutionMode, setResolutionMode] = useState<"ignore" | "solve">("ignore");
  const [conflictResolutions, setConflictResolutions] = useState<Record<string, ConflictResolution>>({});

  const fileName = useMemo(() => file?.name ?? "Drop IB activity statement PDF here", [file]);

  const conflicts = useMemo(
    () => preview?.trades.filter((item) => item.matchStatus === "conflict") ?? [],
    [preview],
  );

  useEffect(() => {
    if (!preview) {
      setConflictResolutions({});
      return;
    }

    const defaults: Record<string, ConflictResolution> = {};
    for (const conflict of conflicts) {
      defaults[conflict.preview_id] = {
        action: "ignore",
        tradeId: conflict.conflict_candidates[0] ?? null,
      };
    }
    setConflictResolutions(defaults);
    setResolutionMode("ignore");
  }, [preview, conflicts]);

  async function runPreview() {
    if (!file) {
      setError("Select a PDF file first.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

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

  async function commitImport(params?: {
    conflictMode?: "ignore" | "resolve";
    conflictResolutionsPayload?: Record<string, ConflictResolution>;
  }) {
    if (!file) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.set("mode", "commit");
      formData.set("file", file);

      if (params?.conflictMode) {
        formData.set("conflictMode", params.conflictMode);
      }

      if (params?.conflictMode === "resolve" && params.conflictResolutionsPayload) {
        formData.set("conflictResolutions", JSON.stringify(params.conflictResolutionsPayload));
      }

      const resp = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });

      const data = (await resp.json()) as {
        preview?: ImportPreview;
        error?: string;
        unchangedCount?: number;
        ignoredCount?: number;
        unresolvedConflicts?: Array<{ preview_id: string; ticker: string; reason: string }>;
      };

      if (!resp.ok) {
        if (data.preview) {
          setPreview(data.preview);
        }
        const stillHasConflicts = data.preview?.trades.some((item) => item.matchStatus === "conflict") ?? false;
        if (resp.status === 409 || stillHasConflicts) {
          setShowConflictDialog(true);
        }
        throw new Error(data.error ?? "Failed to save import");
      }

      if (data.preview) {
        setPreview(data.preview);
      }

      setShowConflictDialog(false);
      setMessage(
        `Import finished.${
          (data.unchangedCount ?? 0) > 0 || (data.ignoredCount ?? 0) > 0
            ? ` Unchanged: ${data.unchangedCount ?? 0}, Ignored: ${data.ignoredCount ?? 0}.`
            : ""
        }`,
      );
    } catch (commitError) {
      setError(commitError instanceof Error ? commitError.message : "Failed to save import");
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmSave() {
    if (!preview) return;

    if (conflicts.length > 0) {
      setShowConflictDialog(true);
      return;
    }

    await commitImport();
  }

  function updateResolution(previewId: string, next: Partial<ConflictResolution>) {
    setConflictResolutions((current) => {
      const existing = current[previewId] ?? { action: "ignore", tradeId: null };
      return {
        ...current,
        [previewId]: {
          ...existing,
          ...next,
        },
      };
    });
  }

  async function resolveAndFinish() {
    const unresolved = conflicts.filter((conflict) => {
      const resolution = conflictResolutions[conflict.preview_id];
      if (!resolution) return true;
      if (resolution.action !== "update_existing") return false;
      return !resolution.tradeId;
    });

    if (unresolved.length > 0) {
      setError("Select target trade IDs for all 'Replace existing trade' conflict resolutions.");
      return;
    }

    await commitImport({
      conflictMode: "resolve",
      conflictResolutionsPayload: conflictResolutions,
    });
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
              onClick={handleConfirmSave}
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
          {message && <div style={{ marginTop: "10px", fontSize: "12px", color: DESIGN.green }}>{message}</div>}
        </Card>

        {preview && <ImportPreviewPanel preview={preview} />}
      </div>

      {showConflictDialog && preview && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
            padding: "20px",
          }}
        >
          <div
            style={{
              width: "min(980px, 100%)",
              maxHeight: "85vh",
              overflow: "auto",
              background: "#06080d",
              border: `1px solid ${DESIGN.cardBorder}`,
              borderRadius: "10px",
              padding: "14px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <div style={{ fontSize: "15px", fontWeight: 700, color: DESIGN.bright }}>
                Conflict Review Required ({conflicts.length})
              </div>
              <button
                onClick={() => {
                  setShowConflictDialog(false);
                  setError(null);
                }}
                style={{
                  border: `1px solid ${DESIGN.cardBorder}`,
                  background: "transparent",
                  color: DESIGN.muted,
                  borderRadius: "6px",
                  padding: "6px 10px",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            <div style={{ fontSize: "12px", color: DESIGN.muted, marginBottom: "10px", lineHeight: 1.5 }}>
              The import found ambiguous matches. Choose either Ignore conflicts (do nothing for them) or Solve each one manually.
            </div>
            {error && (
              <div
                style={{
                  marginBottom: "10px",
                  borderRadius: "6px",
                  border: `1px solid ${DESIGN.red}33`,
                  background: `${DESIGN.red}10`,
                  color: DESIGN.red,
                  fontSize: "11px",
                  padding: "8px 10px",
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
              <button
                onClick={() => setResolutionMode("ignore")}
                style={{
                  padding: "7px 12px",
                  borderRadius: "6px",
                  border: `1px solid ${resolutionMode === "ignore" ? `${DESIGN.yellow}66` : DESIGN.cardBorder}`,
                  background: resolutionMode === "ignore" ? `${DESIGN.yellow}15` : "transparent",
                  color: resolutionMode === "ignore" ? DESIGN.yellow : DESIGN.muted,
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Ignore Conflicts
              </button>

              <button
                onClick={() => setResolutionMode("solve")}
                style={{
                  padding: "7px 12px",
                  borderRadius: "6px",
                  border: `1px solid ${resolutionMode === "solve" ? `${DESIGN.blue}66` : DESIGN.cardBorder}`,
                  background: resolutionMode === "solve" ? `${DESIGN.blue}15` : "transparent",
                  color: resolutionMode === "solve" ? DESIGN.blue : DESIGN.muted,
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Solve Conflicts Manually
              </button>
            </div>

            {resolutionMode === "solve" && (
              <div style={{ display: "grid", gap: "8px", marginBottom: "12px" }}>
                {conflicts.map((conflict) => {
                  const resolution = conflictResolutions[conflict.preview_id] ?? {
                    action: "ignore" as ConflictResolutionAction,
                    tradeId: conflict.conflict_candidates[0] ?? null,
                  };

                  return (
                    <div
                      key={conflict.preview_id}
                      style={{
                        padding: "10px",
                        borderRadius: "8px",
                        border: `1px solid ${DESIGN.cardBorder}`,
                        background: "rgba(255,255,255,0.02)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", marginBottom: "6px" }}>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: DESIGN.bright }}>
                          {conflict.trade.ticker} · {conflict.trade.entry_date}
                        </div>
                        <div style={{ fontSize: "11px", color: DESIGN.muted }}>Candidates: {conflict.conflict_candidates.join(", ") || "—"}</div>
                      </div>

                      <div style={{ fontSize: "11px", color: DESIGN.muted, marginBottom: "8px" }}>{conflict.reason}</div>

                      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "8px" }}>
                        <select
                          value={resolution.action}
                          onChange={(event) =>
                            updateResolution(conflict.preview_id, {
                              action: event.target.value as ConflictResolutionAction,
                            })
                          }
                          style={{
                            width: "100%",
                            background: "rgba(0,0,0,0.45)",
                            color: DESIGN.text,
                            border: `1px solid ${DESIGN.cardBorder}`,
                            borderRadius: "6px",
                            padding: "7px 10px",
                            fontSize: "12px",
                          }}
                        >
                          <option value="ignore">Ignore (do nothing)</option>
                          <option value="create_new">Create as new trade</option>
                          <option value="update_existing">Replace existing trade</option>
                        </select>

                        {resolution.action === "update_existing" ? (
                          <select
                            value={resolution.tradeId ?? ""}
                            onChange={(event) =>
                              updateResolution(conflict.preview_id, {
                                tradeId: event.target.value ? Number(event.target.value) : null,
                              })
                            }
                            style={{
                              width: "100%",
                              background: "rgba(0,0,0,0.45)",
                              color: DESIGN.text,
                              border: `1px solid ${DESIGN.cardBorder}`,
                              borderRadius: "6px",
                              padding: "7px 10px",
                              fontSize: "12px",
                            }}
                          >
                            <option value="">Select target trade ID</option>
                            {conflict.conflict_candidates.map((candidateId) => (
                              <option key={candidateId} value={candidateId}>
                                Trade #{candidateId}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div style={{ fontSize: "11px", color: DESIGN.muted, alignSelf: "center" }}>
                            {resolution.action === "create_new"
                              ? "A new trade will be inserted for this row."
                              : "This conflicting row will be ignored."}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                onClick={() => {
                  setShowConflictDialog(false);
                  setError(null);
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: `1px solid ${DESIGN.cardBorder}`,
                  background: "transparent",
                  color: DESIGN.muted,
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>

              {resolutionMode === "ignore" ? (
                <button
                  onClick={() => void commitImport({ conflictMode: "ignore" })}
                  disabled={saving}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: `1px solid ${DESIGN.yellow}44`,
                    background: `${DESIGN.yellow}18`,
                    color: DESIGN.yellow,
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {saving ? "Importing..." : "Ignore Conflicts & Finish"}
                </button>
              ) : (
                <button
                  onClick={() => void resolveAndFinish()}
                  disabled={saving}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: `1px solid ${DESIGN.blue}44`,
                    background: `${DESIGN.blue}18`,
                    color: DESIGN.blue,
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {saving ? "Importing..." : "Apply Resolutions & Finish"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
