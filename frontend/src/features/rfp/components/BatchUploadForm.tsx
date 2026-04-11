import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEventStream } from "@/hooks/useEventStream";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { ALLOWED_RFP_EXTENSIONS } from "@/lib/constants";
import {
  FileSpreadsheet,
  Download,
  CheckCircle2,
  Trash2,
  History,
} from "lucide-react";
import { fetchBatchHistory, fetchBatchRun, deleteBatchRun } from "@/lib/api";
import type {
  SSENodeEvent,
  SSEBatchStartEvent,
  SSEQuestionDoneEvent,
  SSEErrorEvent,
} from "@/types/api";

/* ── helpers ─────────────────────────────────────────────────────────────── */

function eventLabel(ev: SSENodeEvent): string {
  switch (ev.node) {
    case "retrieve":
      return "Retrieved context";
    case "draft":
      return `Draft #${ev.draft_count}`;
    case "verify":
      if (ev.agent_status === "NEEDS_REVISION") return "Revision needed";
      if (ev.agent_status === "APPROVED") return "Approved";
      return "Verified";
    case "finalize":
      return "Finalized";
    default:
      return ev.message;
  }
}

function nextNodeLabel(lastEvent: SSENodeEvent): string {
  switch (lastEvent.node) {
    case "retrieve":
      return "Drafting…";
    case "draft":
      return "Verifying…";
    case "verify":
      return lastEvent.agent_status === "NEEDS_REVISION"
        ? "Re-drafting…"
        : "Finalizing…";
    case "finalize":
      return "Wrapping up…";
    default:
      return "Processing…";
  }
}

interface BatchResultData {
  total: number;
  answers: Array<Record<string, unknown>>;
}

interface BatchState {
  meta: { total: number; column: string } | null;
  currentIndex: number;
  currentPreview: string;
  currentNodes: SSENodeEvent[];
  completedCount: number;
  answers: Array<Record<string, unknown>>;
  done: boolean;
  error: string | null;
}

const INITIAL_BATCH: BatchState = {
  meta: null,
  currentIndex: -1,
  currentPreview: "",
  currentNodes: [],
  completedCount: 0,
  answers: [],
  done: false,
  error: null,
};

function exportToCsv(data: BatchResultData) {
  const answers = data.answers;
  if (!answers.length) return;

  const keys = Array.from(new Set(answers.flatMap((a) => Object.keys(a))));

  const escape = (val: unknown): string => {
    const str =
      typeof val === "object" ? JSON.stringify(val) : String(val ?? "");
    return str.includes(",") || str.includes('"') || str.includes("\n")
      ? `"${str.replace(/"/g, '""')}"`
      : str;
  };

  const rows = [
    keys.join(","),
    ...answers.map((a) => keys.map((k) => escape(a[k])).join(",")),
  ];

  const blob = new Blob([rows.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `lumina-rfp-results-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/* ── component ───────────────────────────────────────────────────────────── */

export function BatchUploadForm() {
  const queryClient = useQueryClient();
  const [batch, setBatch] = useState<BatchState>(INITIAL_BATCH);
  const lastIndexRef = useRef(-1);
  const { streaming, start } = useEventStream();
  const [deleting, setDeleting] = useState<string | null>(null);

  // Fetch batch history from DB
  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ["batch-history"],
    queryFn: fetchBatchHistory,
  });

  const handleEvent = useCallback(
    (eventType: string, data: unknown) => {
      switch (eventType) {
        case "batch_start": {
          const d = data as SSEBatchStartEvent;
          setBatch((prev) => ({
            ...prev,
            meta: { total: d.total, column: d.column },
          }));
          break;
        }
        case "node": {
          const d = data as SSENodeEvent;
          const qi = d.question_index ?? 0;
          if (qi !== lastIndexRef.current) {
            lastIndexRef.current = qi;
            setBatch((prev) => ({
              ...prev,
              currentIndex: qi,
              currentPreview: d.question_preview ?? "",
              currentNodes: [d],
            }));
          } else {
            setBatch((prev) => ({
              ...prev,
              currentNodes: [...prev.currentNodes, d],
            }));
          }
          break;
        }
        case "question_done": {
          const d = data as SSEQuestionDoneEvent;
          setBatch((prev) => ({
            ...prev,
            completedCount: d.question_index + 1,
            answers: [...prev.answers, d.result],
            currentNodes: [],
          }));
          break;
        }
        case "done":
          setBatch((prev) => ({ ...prev, done: true }));
          queryClient.invalidateQueries({ queryKey: ["batch-history"] });
          break;
        case "error": {
          const d = data as SSEErrorEvent;
          setBatch((prev) => ({ ...prev, error: d.error }));
          break;
        }
      }
    },
    [queryClient],
  );

  const handleFile = (file: File) => {
    setBatch(INITIAL_BATCH);
    lastIndexRef.current = -1;
    const form = new FormData();
    form.append("file", file);
    start("/rfp/batch-stream", { method: "POST", body: form }, handleEvent);
  };

  // Warn user before closing/refreshing page during active batch processing
  useEffect(() => {
    if (!streaming) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [streaming]);

  const handleExportHistory = async (runId: string) => {
    try {
      const run = await fetchBatchRun(runId);
      exportToCsv({ total: run.answers.length, answers: run.answers });
    } catch {
      // silently fail
    }
  };

  const handleDeleteRun = async (runId: string) => {
    setDeleting(runId);
    try {
      await deleteBatchRun(runId);
      queryClient.invalidateQueries({ queryKey: ["batch-history"] });
    } catch {
      // silently fail
    } finally {
      setDeleting(null);
    }
  };

  const total = batch.meta?.total ?? 0;
  const pct = total > 0 ? Math.round((batch.completedCount / total) * 100) : 0;
  const lastNode =
    batch.currentNodes.length > 0
      ? batch.currentNodes[batch.currentNodes.length - 1]
      : null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-accent" />
            Batch Upload
          </CardTitle>
          <CardDescription>
            Upload an Excel (.xlsx) file with a &ldquo;Question&rdquo; column to
            process multiple RFP questions at once.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileDropzone
            accept={ALLOWED_RFP_EXTENSIONS.join(",")}
            onFile={handleFile}
            disabled={streaming}
          />

          {batch.error && <p className="text-sm text-red-500">{batch.error}</p>}

          {batch.meta && (
            <p className="text-sm text-muted-foreground">
              Detected{" "}
              <strong className="text-heading">{batch.meta.total}</strong>{" "}
              questions from column{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                {batch.meta.column}
              </code>
            </p>
          )}

          {/* Live progress panel */}
          {streaming && !batch.done && batch.meta && (
            <div className="rounded-lg border border-border p-4 space-y-3">
              {/* Overall progress */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-heading">
                    Question {Math.min(batch.currentIndex + 1, total)} of{" "}
                    {total}
                  </span>
                  <span className="text-muted-foreground">{pct}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {/* Current question preview */}
              {batch.currentPreview && (
                <p className="text-xs text-muted-foreground italic truncate">
                  &ldquo;{batch.currentPreview}&rdquo;
                </p>
              )}

              {/* Node pipeline for current question */}
              {batch.currentNodes.length > 0 ? (
                <div className="flex items-center gap-2 flex-wrap">
                  {batch.currentNodes.map((ev, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400"
                    >
                      <CheckCircle2 className="size-3" />
                      {eventLabel(ev)}
                    </span>
                  ))}
                  {lastNode && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                      <Spinner size="sm" />
                      {nextNodeLabel(lastNode)}
                    </span>
                  )}
                </div>
              ) : batch.completedCount < total ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Spinner size="sm" />
                  <span>Starting question {batch.completedCount + 1}…</span>
                </div>
              ) : null}

              {/* Completed count */}
              <p className="text-xs text-muted-foreground">
                {batch.completedCount} of {total} questions completed
              </p>
            </div>
          )}

          {/* Results */}
          {batch.done && batch.answers.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Batch Results — {batch.answers.length} answers
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    exportToCsv({
                      total: batch.answers.length,
                      answers: batch.answers,
                    })
                  }
                >
                  <Download className="size-3.5" />
                  Export CSV
                </Button>
              </div>
              <pre className="text-xs text-heading overflow-x-auto max-h-80 whitespace-pre-wrap">
                {JSON.stringify(batch.answers, null, 2)}
              </pre>

              <p className="text-xs text-muted-foreground">
                Head to the <strong>RLHF</strong> tab to review these answers.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Batch History Card ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-5 text-accent" />
            Batch History
          </CardTitle>
          <CardDescription>
            Previous batch runs are saved automatically. Export CSV or delete
            old runs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex items-center gap-2 py-4">
              <Spinner size="sm" />
              <span className="text-sm text-muted-foreground">
                Loading history…
              </span>
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No batch runs yet. Upload an Excel file above to get started.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {history.map((run) => (
                <div
                  key={run.id}
                  className="flex items-center justify-between py-3 gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-heading truncate">
                      {run.filename}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {run.answer_count} answers
                      {run.created_at &&
                        ` · ${new Date(run.created_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleExportHistory(run.id)}
                      title="Export CSV"
                    >
                      <Download className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteRun(run.id)}
                      disabled={deleting === run.id}
                      className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      title="Delete"
                    >
                      {deleting === run.id ? (
                        <Spinner size="sm" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
