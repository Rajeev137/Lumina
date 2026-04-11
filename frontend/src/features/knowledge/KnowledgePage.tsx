import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  uploadKnowledgeDocument,
  fetchKnowledgeStatus,
  fetchKnowledgeResult,
  fetchKnowledgeDocuments,
  deleteKnowledgeDocument,
} from "@/lib/api";
import { useJobPolling } from "@/hooks/useJobPolling";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { ALLOWED_KNOWLEDGE_EXTENSIONS } from "@/lib/constants";
import { Database, CheckCircle2, Trash2, FileText } from "lucide-react";
import type { KnowledgeResultResponse } from "@/types/api";

export function KnowledgePage() {
  const queryClient = useQueryClient();
  // Restore active upload job from localStorage (survives page refresh)
  const [jobId, setJobId] = useState<string | null>(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("kb-active-job") ?? "null")?.jobId ??
        null
      );
    } catch {
      return null;
    }
  });
  const [filename, setFilename] = useState<string | null>(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("kb-active-job") ?? "null")?.filename ??
        null
      );
    } catch {
      return null;
    }
  });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KnowledgeResultResponse | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const pollState = useJobPolling(jobId, fetchKnowledgeStatus);

  // Fetch list of ingested documents from the DB
  const { data: documents = [], isLoading: docsLoading } = useQuery({
    queryKey: ["knowledge-documents"],
    queryFn: fetchKnowledgeDocuments,
    refetchInterval:
      pollState &&
      pollState.status !== "COMPLETED" &&
      pollState.status !== "FAILED"
        ? 5000
        : false,
  });

  const fetchResultCb = useCallback(
    async (id: string) => {
      try {
        const data = await fetchKnowledgeResult(id);
        setResult(data);
        queryClient.invalidateQueries({ queryKey: ["knowledge-documents"] });
      } catch {
        setError("Failed to fetch ingestion result");
      }
    },
    [queryClient],
  );

  // Fetch result when job completes
  useEffect(() => {
    if (pollState?.status === "COMPLETED" && !result && !error && jobId) {
      fetchResultCb(jobId);
    }
  }, [pollState?.status, result, error, jobId, fetchResultCb]);

  // Clear localStorage when job finishes
  useEffect(() => {
    if (pollState?.status === "COMPLETED" || pollState?.status === "FAILED") {
      localStorage.removeItem("kb-active-job");
    }
  }, [pollState?.status]);

  const handleFile = async (file: File) => {
    setUploading(true);
    setError(null);
    setResult(null);
    setFilename(file.name);
    try {
      const data = await uploadKnowledgeDocument(file);
      setJobId(data.job_id);
      localStorage.setItem(
        "kb-active-job",
        JSON.stringify({ jobId: data.job_id, filename: file.name }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    setDeleting(docId);
    try {
      await deleteKnowledgeDocument(docId);
      queryClient.invalidateQueries({ queryKey: ["knowledge-documents"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const isProcessing =
    pollState &&
    pollState.status !== "COMPLETED" &&
    pollState.status !== "FAILED";

  return (
    <div className="space-y-8">
      <section className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-heading">
          Knowledge Base
        </h2>
        <p className="text-muted-foreground">
          Upload documents to power the AI retrieval-augmented generation
          pipeline.
        </p>
      </section>

      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="size-5 text-accent" />
            Upload Document
          </CardTitle>
          <CardDescription>
            Supports PDF, DOCX, PPTX, XLSX, and HTML. Documents are parsed,
            chunked, embedded, and stored in the vector database.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileDropzone
            accept={ALLOWED_KNOWLEDGE_EXTENSIONS.join(",")}
            onFile={handleFile}
            disabled={uploading || !!isProcessing}
          />

          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* Upload progress */}
          {jobId && pollState && (
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-heading truncate">
                    {filename}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Job{" "}
                    <code className="bg-muted px-1 rounded">
                      {jobId.slice(0, 8)}…
                    </code>
                  </p>
                </div>

                {pollState.status === "COMPLETED" ? (
                  <Badge variant="success">
                    <CheckCircle2 className="mr-1 size-3" />
                    Ingested
                  </Badge>
                ) : pollState.status === "FAILED" ? (
                  <Badge variant="error">Failed</Badge>
                ) : (
                  <div className="flex items-center gap-2">
                    <Spinner size="sm" />
                    <span className="text-xs text-muted-foreground">
                      {pollState.message ||
                        (pollState.status === "PENDING"
                          ? "Queued"
                          : "Processing…")}
                    </span>
                  </div>
                )}
              </div>

              {/* Progress bar */}
              {pollState.status !== "COMPLETED" &&
                pollState.status !== "FAILED" && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{pollState.message}</span>
                      <span>{pollState.progress_percentage}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent transition-all duration-300"
                        style={{ width: `${pollState.progress_percentage}%` }}
                      />
                    </div>
                  </div>
                )}

              {result && (
                <div className="rounded-md bg-muted/50 p-3 text-sm text-heading">
                  Document ID:{" "}
                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                    {result.document_id}
                  </code>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ingested Documents List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-5 text-accent" />
            Ingested Documents
          </CardTitle>
          <CardDescription>
            Documents already parsed, embedded, and stored in the vector
            database. Delete to free up space.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {docsLoading ? (
            <div className="flex items-center gap-2 py-4">
              <Spinner size="sm" />
              <span className="text-sm text-muted-foreground">
                Loading documents…
              </span>
            </div>
          ) : documents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No documents ingested yet. Upload a file above to get started.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between py-3 gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-heading truncate">
                      {doc.filename}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {doc.chunk_count} chunks
                      {doc.uploaded_at &&
                        ` · ${new Date(doc.uploaded_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(doc.id)}
                    disabled={deleting === doc.id}
                    className="text-red-500 hover:text-red-600 hover:bg-red-500/10 shrink-0"
                  >
                    {deleting === doc.id ? (
                      <Spinner size="sm" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
