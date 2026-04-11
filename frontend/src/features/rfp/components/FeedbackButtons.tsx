import { useState } from "react";
import { submitFeedback } from "@/lib/api";
import { ThumbsUp, ThumbsDown, Minus } from "lucide-react";

type FeedbackStatus = "approved" | "rejected" | "neutral";

interface Props {
  question: string;
  answer: string;
}

export function FeedbackButtons({ question, answer }: Props) {
  const [status, setStatus] = useState<FeedbackStatus | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(newStatus: FeedbackStatus) {
    if (loading) return;
    setLoading(true);
    try {
      await submitFeedback(question, answer, newStatus);
      setStatus(newStatus);
    } catch {
      // silently fail — don't block the user
    } finally {
      setLoading(false);
    }
  }

  if (status) {
    const labels: Record<FeedbackStatus, string> = {
      approved: "Approved",
      rejected: "Rejected",
      neutral: "Skipped",
    };
    const colors: Record<FeedbackStatus, string> = {
      approved: "text-green-600 bg-green-500/10",
      rejected: "text-red-500 bg-red-500/10",
      neutral: "text-muted-foreground bg-muted",
    };
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${colors[status]}`}
      >
        {labels[status]}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => submit("approved")}
        disabled={loading}
        className="rounded p-1 text-muted-foreground hover:text-green-600 hover:bg-green-500/10 transition-colors disabled:opacity-50"
        title="Approve — add to Golden Q&A Bank"
      >
        <ThumbsUp className="size-3.5" />
      </button>
      <button
        onClick={() => submit("rejected")}
        disabled={loading}
        className="rounded p-1 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
        title="Reject — penalize this answer"
      >
        <ThumbsDown className="size-3.5" />
      </button>
      <button
        onClick={() => submit("neutral")}
        disabled={loading}
        className="rounded p-1 text-muted-foreground hover:text-heading hover:bg-muted transition-colors disabled:opacity-50"
        title="Skip — no action"
      >
        <Minus className="size-3.5" />
      </button>
    </div>
  );
}
