import { useState, useEffect, useCallback } from "react";
import { submitFeedback } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  ArrowLeft,
  ThumbsUp,
  ThumbsDown,
  Minus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { PendingBatchRun } from "@/types/api";

const REVIEW_STORAGE_KEY = "lumina_review_state";

type ReviewVerdict = "approved" | "rejected" | "neutral";
type ReviewState = Record<string, Record<number, ReviewVerdict>>;

function getReviewState(): ReviewState {
  try {
    return JSON.parse(localStorage.getItem(REVIEW_STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function setReviewState(state: ReviewState) {
  localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(state));
}

interface Props {
  run: PendingBatchRun;
  onComplete: () => void;
  onBack: () => void;
}

export function ReviewSession({ run, onComplete, onBack }: Props) {
  const answers = run.answers ?? [];
  const [reviewed, setReviewed] = useState<Record<number, ReviewVerdict>>(
    () => {
      return getReviewState()[run.id] ?? {};
    },
  );
  const [loading, setLoading] = useState(false);

  // Find first unreviewed index
  const unreviewedIndices = answers
    .map((_, i) => i)
    .filter((i) => !(i in reviewed));

  const [currentIdx, setCurrentIdx] = useState(() =>
    unreviewedIndices.length > 0 ? unreviewedIndices[0] : 0,
  );

  // Persist to localStorage whenever reviewed changes
  useEffect(() => {
    const state = getReviewState();
    state[run.id] = reviewed;
    setReviewState(state);
  }, [reviewed, run.id]);

  // Check if all done
  const allReviewed = unreviewedIndices.length === 0;

  useEffect(() => {
    if (allReviewed) {
      const timer = setTimeout(onComplete, 800);
      return () => clearTimeout(timer);
    }
  }, [allReviewed, onComplete]);

  const handleVerdict = useCallback(
    async (verdict: ReviewVerdict) => {
      if (loading) return;
      const answer = answers[currentIdx];
      setLoading(true);
      try {
        await submitFeedback(
          String(answer.question ?? ""),
          String(answer.answer ?? ""),
          verdict,
        );
        const next = { ...reviewed, [currentIdx]: verdict };
        setReviewed(next);

        // Move to next unreviewed
        const remaining = answers.map((_, i) => i).filter((i) => !(i in next));
        if (remaining.length > 0) {
          setCurrentIdx(remaining[0]);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    },
    [loading, currentIdx, answers, reviewed],
  );

  if (allReviewed) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="flex size-16 items-center justify-center rounded-full bg-emerald-500/10">
          <ThumbsUp className="size-8 text-emerald-500" />
        </div>
        <h2 className="text-xl font-bold text-heading">All Reviewed!</h2>
        <p className="text-sm text-muted-foreground">
          All {answers.length} answers in <strong>{run.filename}</strong> have
          been reviewed.
        </p>
        <p className="text-xs text-muted-foreground">Redirecting back…</p>
      </div>
    );
  }

  const current = answers[currentIdx];
  const reviewedCount = Object.keys(reviewed).length;
  const pct = Math.round((reviewedCount / answers.length) * 100);
  const currentVerdict = reviewed[currentIdx];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-heading truncate">
            {run.filename}
          </p>
          <p className="text-xs text-muted-foreground">
            {reviewedCount} of {answers.length} reviewed ({pct}%)
          </p>
        </div>
        <Badge variant={unreviewedIndices.length > 0 ? "warning" : "success"}>
          {unreviewedIndices.length} left
        </Badge>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Q&A Card */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Question {currentIdx + 1} of {answers.length}
            </span>
            {currentVerdict && (
              <Badge
                variant={
                  currentVerdict === "approved"
                    ? "success"
                    : currentVerdict === "rejected"
                      ? "error"
                      : "default"
                }
              >
                {currentVerdict === "approved"
                  ? "Approved"
                  : currentVerdict === "rejected"
                    ? "Rejected"
                    : "Skipped"}
              </Badge>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Question
            </label>
            <div className="rounded-lg border border-border bg-muted/50 p-4">
              <p className="text-sm text-heading whitespace-pre-wrap leading-relaxed">
                {String(current?.question ?? "")}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Answer
            </label>
            <div className="rounded-lg border border-border bg-background p-4 max-h-80 overflow-y-auto">
              <p className="text-sm text-heading whitespace-pre-wrap leading-relaxed">
                {String(current?.answer ?? current?.error ?? "")}
              </p>
            </div>
          </div>

          {/* Verdict buttons */}
          {!currentVerdict ? (
            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="primary"
                onClick={() => handleVerdict("approved")}
                disabled={loading}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              >
                <ThumbsUp className="size-4" />
                Approve
              </Button>
              <Button
                variant="danger"
                onClick={() => handleVerdict("rejected")}
                disabled={loading}
                className="flex-1"
              >
                <ThumbsDown className="size-4" />
                Reject
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleVerdict("neutral")}
                disabled={loading}
                className="flex-1"
              >
                <Minus className="size-4" />
                Skip
              </Button>
            </div>
          ) : (
            <p className="text-xs text-center text-muted-foreground pt-2">
              Already reviewed — use navigation to browse or go back.
            </p>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))}
              disabled={currentIdx === 0}
            >
              <ChevronLeft className="size-4" />
              Prev
            </Button>
            <span className="text-xs text-muted-foreground">
              {currentIdx + 1} / {answers.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setCurrentIdx(Math.min(answers.length - 1, currentIdx + 1))
              }
              disabled={currentIdx === answers.length - 1}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
