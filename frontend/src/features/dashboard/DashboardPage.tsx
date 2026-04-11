import { useQuery } from "@tanstack/react-query";
import { fetchHealth } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { Activity, Cpu, Database, FileText, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export function DashboardPage() {
  const {
    data: health,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="space-y-2">
        <h2 className="text-3xl font-bold tracking-tight text-heading">
          Welcome to Lumina
        </h2>
        <p className="text-muted-foreground max-w-xl">
          AI-powered RFP response automation. Upload your knowledge base, submit
          RFP questions, and let intelligent agents draft production-ready
          answers.
        </p>
      </section>

      {/* Health status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-5 text-accent" />
            System Status
          </CardTitle>
          <CardDescription>Live backend health check</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-3 py-4">
              <Spinner size="sm" />
              <span className="text-sm text-muted-foreground">
                Connecting to API…
              </span>
            </div>
          ) : isError ? (
            <div className="flex items-center gap-2">
              <Badge variant="error">Offline</Badge>
              <span className="text-sm text-muted-foreground">
                Unable to reach the backend. Make sure it's running on port
                8000.
              </span>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <StatusTile
                icon={<Activity className="size-4" />}
                label="Status"
                value={health?.status ?? "—"}
                variant="success"
              />
              <StatusTile
                icon={<Cpu className="size-4" />}
                label="Generation Model"
                value={health?.generation_model ?? "—"}
              />
              <StatusTile
                icon={<Database className="size-4" />}
                label="Embedding Model"
                value={health?.embedding_model ?? "—"}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-2">
        <QuickActionCard
          to="/rfp"
          icon={<FileText className="size-5" />}
          title="Process RFP Questions"
          description="Submit individual questions or batch-upload an Excel template for automated responses."
        />
        <QuickActionCard
          to="/knowledge"
          icon={<Database className="size-5" />}
          title="Manage Knowledge Base"
          description="Upload PDF, DOCX, PPTX, XLSX, or HTML documents for ingestion into the vector store."
        />
      </div>
    </div>
  );
}

function StatusTile({
  icon,
  label,
  value,
  variant,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  variant?: "success";
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border p-4">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        {variant === "success" ? (
          <Badge variant="success" className="mt-1">
            {value}
          </Badge>
        ) : (
          <p className="mt-0.5 truncate text-sm font-medium text-heading">
            {value}
          </p>
        )}
      </div>
    </div>
  );
}

function QuickActionCard({
  to,
  icon,
  title,
  description,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link to={to} className="group block">
      <Card className="h-full transition-all group-hover:border-accent/40 group-hover:shadow-lg">
        <CardContent className="flex items-start gap-4 pt-6">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-heading group-hover:text-accent transition-colors">
              {title}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <ArrowRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
        </CardContent>
      </Card>
    </Link>
  );
}
