import { useCallback, useState } from "react";
import { useEventStream } from "@/hooks/useEventStream";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { Send, CheckCircle2 } from "lucide-react";
import type {
  SSENodeEvent,
  SSEDoneEvent,
  SSEErrorEvent,
  RfpDownloadResponse,
} from "@/types/api";

function eventLabel(ev: SSENodeEvent): string {
  switch (ev.node) {
    case "retrieve":
      return "Retrieved context from knowledge base";
    case "draft":
      return `Draft #${ev.draft_count} written`;
    case "verify":
      if (ev.agent_status === "NEEDS_REVISION") return "Verification: revision needed";
      if (ev.agent_status === "APPROVED") return "Verification: approved";
      return "Verification complete";
    case "finalize":
      return "Response finalized";
    default:
      return ev.message;
  }
}

function nextStepLabel(lastEvent: SSENodeEvent): string {
  switch (lastEvent.node) {
    case "retrieve":
      return "Drafting response…";
    case "draft":
      return "Verifying answer…";
    case "verify":
      return lastEvent.agent_status === "NEEDS_REVISION"
        ? "Re-drafting response…"
        : "Finalizing…";
    case "finalize":
      return "Wrapping up…";
    default:
      return "Processing…";
  }
}

interface StreamState {
  nodes: SSENodeEvent[];
  result: RfpDownloadResponse | null;
  error: string | null;
}

export function SingleQuestionForm() {
  const [question, setQuestion] = useState("");
  const [stream, setStream] = useState<StreamState | null>(null);
  const { streaming, start } = useEventStream();

  const handleEvent = useCallback((eventType: string, data: unknown) => {
    setStream((prev) => {
      const s = prev ?? { nodes: [], result: null, error: null };
      switch (eventType) {
        case "node":
          return { ...s, nodes: [...s.nodes, data as SSENodeEvent] };
        case "done":
          return {
            ...s,
            result: (data as SSEDoneEvent).result as unknown as RfpDownloadResponse,
          };
        case "error":
          return { ...s, error: (data as SSEErrorEvent).error };
        default:
          return s;
      }
    });
  }, []);

  const handleSubmit = () => {
    if (!question.trim()) return;
    setStream({ nodes: [], result: null, error: null });
    start(
      "/rfp/stream",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      },
      handleEvent,
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Single Question</CardTitle>
        <CardDescription>
          Submit an RFP question and watch the agent think in real-time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          placeholder="e.g. Does your organization maintain a formal information security policy?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={4}
        />

        <Button
          onClick={handleSubmit}
          loading={streaming}
          disabled={!question.trim() || streaming}
          className="w-full sm:w-auto"
        >
          <Send className="size-4" />
          Submit Question
        </Button>

        {stream?.error && (
          <p className="text-sm text-red-500">{stream.error}</p>
        )}

        {stream && (streaming || stream.nodes.length > 0) && (
          <div className="rounded-lg border border-border p-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Agent Pipeline
            </p>
            <div className="space-y-1.5">
              {stream.nodes.map((ev, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <CheckCircle2 className="size-3.5 shrink-0 text-green-500" />
                  <span className="text-heading">{eventLabel(ev)}</span>
                </div>
              ))}
              {streaming && (
                <div className="flex items-center gap-2 text-xs">
                  <Spinner size="sm" />
                  <span className="text-accent font-medium">
                    {stream.nodes.length === 0
                      ? "Starting agent…"
                      : nextStepLabel(stream.nodes[stream.nodes.length - 1])}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {stream?.result && (
          <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Response
            </p>
            <p className="text-sm text-heading whitespace-pre-wrap leading-relaxed">
              {stream.result.answer ?? JSON.stringify(stream.result, null, 2)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
