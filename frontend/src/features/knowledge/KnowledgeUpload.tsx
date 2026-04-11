import { useCallback, useState } from "react";
import {
  uploadKnowledgeDocument,
  fetchKnowledgeStatus,
  fetchKnowledgeResult,
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
import { Spinner } from "@/components/ui/Spinner";
import { ALLOWED_KNOWLEDGE_EXTENSIONS } from "@/lib/constants";
import { Database, CheckCircle2 } from "lucide-react";
import type { KnowledgeResultResponse } from "@/types/api";

export function KnowledgeUpload() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KnowledgeResultResponse | null>(null);

  const pollState = useJobPolling(jobId, fetchKnowledgeStatus);

  const fetchResult = useCallback(async (id: string) => {
    try {
      const data = await fetchKnowledgeResult(id);
      setResult(data);
    } catch {
      setError("Failed to fetch ingestion result");
    }
  }, []);

  if (pollState?.status === "COMPLETED" && !result && !error) {
    fetchResult(jobId!);
  }

  const handleFile = async (file: File) => {
    setUploading(true);
    setError(null);
    setResult(null);
    setFilename(file.name);
    try {
      const data = await uploadKnowledgeDocument(file);
      setJobId(data.job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="size-5 text-accent" />
          Upload Document
        </CardTitle>
        <CardDescription>
          PDF, DOCX, PPTX, XLSX, or HTML — parsed, chunked, embedded, and stored
          in the vector database.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FileDropzone
          accept={ALLOWED_KNOWLEDGE_EXTENSIONS.join(",")}
          onFile={handleFile}
          disabled={uploading}
        />

        {error && <p className="text-sm text-red-500">{error}</p>}

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
                    {pollState.message || (pollState.status === "PENDING" ? "Queued" : "Processing…")}
                  </span>
                </div>
              )}
            </div>

            {/* Progress bar — visible while processing */}
            {pollState.status !== "COMPLETED" && pollState.status !== "FAILED" && (
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
  );
}
