import { useCallback, useEffect, useRef, useState } from "react";
import type { JobStatus } from "@/types/api";
import { POLLING_INTERVAL_MS } from "@/lib/constants";

type FetchStatusFn = (jobId: string) => Promise<{
  status: JobStatus;
  progress_percentage?: number;
  message?: string;
}>;

interface PollState {
  status: JobStatus;
  progress_percentage: number;
  message: string;
  error?: string;
}

/**
 * Lightweight hook that polls a job status endpoint until it reaches a
 * terminal state (COMPLETED | FAILED).
 */
export function useJobPolling(
  jobId: string | null,
  fetchStatus: FetchStatusFn,
) {
  const [state, setState] = useState<PollState | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const stop = useCallback(() => {
    clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    if (!jobId) {
      setState(null);
      return;
    }

    setState({ status: "PENDING", progress_percentage: 0, message: "Queued" });

    const poll = async () => {
      try {
        const data = await fetchStatus(jobId);
        setState({
          status: data.status,
          progress_percentage: data.progress_percentage ?? 0,
          message: data.message ?? "",
        });

        if (data.status === "COMPLETED" || data.status === "FAILED") {
          stop();
        }
      } catch {
        setState({ status: "FAILED", progress_percentage: 0, message: "Polling error", error: "Polling error" });
        stop();
      }
    };

    // Immediate first check, then interval
    poll();
    timerRef.current = setInterval(poll, POLLING_INTERVAL_MS);

    return stop;
  }, [jobId, fetchStatus, stop]);

  return state;
}
