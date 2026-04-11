import type { JobStatus } from "@/types/api";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { CheckCircle2, XCircle, Clock } from "lucide-react";

interface JobStatusCardProps {
  jobId: string;
  status: JobStatus;
  label?: string;
}

const statusConfig: Record<
  JobStatus,
  {
    icon: React.ReactNode;
    variant: "info" | "warning" | "success" | "error";
    text: string;
  }
> = {
  PENDING: {
    icon: <Clock className="size-4" />,
    variant: "info",
    text: "Queued",
  },
  IN_PROGRESS: {
    icon: <Spinner size="sm" />,
    variant: "warning",
    text: "Processing",
  },
  PARSING: {
    icon: <Spinner size="sm" />,
    variant: "warning",
    text: "Parsing",
  },
  CHUNKING: {
    icon: <Spinner size="sm" />,
    variant: "warning",
    text: "Chunking",
  },
  EMBEDDING: {
    icon: <Spinner size="sm" />,
    variant: "warning",
    text: "Embedding",
  },
  STORING: {
    icon: <Spinner size="sm" />,
    variant: "warning",
    text: "Storing",
  },
  COMPLETED: {
    icon: <CheckCircle2 className="size-4" />,
    variant: "success",
    text: "Completed",
  },
  FAILED: {
    icon: <XCircle className="size-4" />,
    variant: "error",
    text: "Failed",
  },
};

export function JobStatusCard({ jobId, status, label }: JobStatusCardProps) {
  const cfg = statusConfig[status];

  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-4">
        <div className="flex items-center gap-2">{cfg.icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-heading truncate">
            {label ?? "Job"}{" "}
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
              {jobId.slice(0, 8)}…
            </code>
          </p>
        </div>
        <Badge variant={cfg.variant}>{cfg.text}</Badge>
      </CardContent>
    </Card>
  );
}
