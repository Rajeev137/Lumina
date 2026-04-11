import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchPendingReviews } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { ClipboardCheck, Eye, CheckCircle2 } from "lucide-react";
import { ReviewSession } from "./ReviewSession";
import type { PendingBatchRun } from "@/types/api";

const REVIEW_STORAGE_KEY = "lumina_review_state";

type ReviewState = Record<
  string,
  Record<number, "approved" | "rejected" | "neutral">
>;

function getReviewState(): ReviewState {
  try {
    return JSON.parse(localStorage.getItem(REVIEW_STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function getUnreviewedCount(run: PendingBatchRun): number {
  const state = getReviewState();
  const reviewed = state[run.id] ?? {};
  return run.answer_count - Object.keys(reviewed).length;
}

export function RlhfPage({ visible = false }: { visible?: boolean }) {
  const [reviewingRun, setReviewingRun] = useState<PendingBatchRun | null>(
    null,
  );

  const {
    data: runs = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["rlhf-pending"],
    queryFn: fetchPendingReviews,
    refetchInterval: visible ? 5_000 : false,
    refetchOnWindowFocus: true,
  });

  // Refetch immediately when tab becomes visible
  useEffect(() => {
    if (visible) refetch();
  }, [visible, refetch]);

  // Filter to only show runs that still have unreviewed answers
  const pendingRuns = runs.filter((r) => getUnreviewedCount(r) > 0);
  const completedRuns = runs.filter((r) => getUnreviewedCount(r) <= 0);

  if (reviewingRun) {
    return (
      <ReviewSession
        run={reviewingRun}
        onComplete={() => {
          setReviewingRun(null);
          refetch();
        }}
        onBack={() => {
          setReviewingRun(null);
          refetch();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-heading">
          RLHF Review
        </h2>
        <p className="text-muted-foreground">
          Review AI-generated answers. Approved answers get saved to the Golden
          Q&A Bank for future use.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="size-5 text-accent" />
            Pending Reviews
          </CardTitle>
          <CardDescription>
            Batch results awaiting human review. Click Review to start.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-4">
              <Spinner size="sm" />
              <span className="text-sm text-muted-foreground">Loading…</span>
            </div>
          ) : pendingRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No batch results pending review. Run a batch upload first.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {pendingRuns.map((run) => {
                const unreviewed = getUnreviewedCount(run);
                return (
                  <button
                    key={run.id}
                    onClick={() => setReviewingRun(run)}
                    className="group text-left rounded-xl border border-border bg-background p-4 space-y-3 hover:border-accent/40 hover:shadow-md transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-heading truncate group-hover:text-accent transition-colors">
                          {run.filename}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {run.answer_count} answers
                          {run.created_at &&
                            ` · ${new Date(run.created_at).toLocaleDateString()}`}
                        </p>
                      </div>
                      <Badge variant="warning">{unreviewed} left</Badge>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent transition-all"
                          style={{
                            width: `${Math.round(((run.answer_count - unreviewed) / run.answer_count) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {Math.round(
                          ((run.answer_count - unreviewed) / run.answer_count) *
                            100,
                        )}
                        %
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs font-medium text-accent">
                      <Eye className="size-3.5" />
                      Review
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {completedRuns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-500" />
              Completed Reviews
            </CardTitle>
            <CardDescription>
              Batch runs where all answers have been reviewed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {completedRuns.map((run) => (
                <div
                  key={run.id}
                  className="flex items-center justify-between py-3 gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-heading truncate">
                      {run.filename}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {run.answer_count} answers reviewed
                      {run.created_at &&
                        ` · ${new Date(run.created_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <Badge variant="success">Done</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
