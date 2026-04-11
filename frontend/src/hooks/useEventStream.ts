import { useCallback, useRef, useState } from "react";
import { API_BASE_URL } from "@/lib/constants";
import { getAuthHeaders } from "@/lib/auth";

export type SSEHandler = (eventType: string, data: unknown) => void;

/**
 * Hook that opens a fetch-based SSE connection (supports POST + body).
 * Returns `streaming` state and `start`/`stop` controls.
 */
export function useEventStream() {
  const abortRef = useRef<AbortController | null>(null);
  const [streaming, setStreaming] = useState(false);

  const start = useCallback(
    async (path: string, init: RequestInit, onEvent: SSEHandler) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);

      try {
        const res = await fetch(`${API_BASE_URL}${path}`, {
          ...init,
          headers: {
            ...getAuthHeaders(),
            ...init.headers,
          },
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(
            body?.detail ?? `Request failed with status ${res.status}`,
          );
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop()!;

          for (const part of parts) {
            if (!part.trim()) continue;
            let eventType = "message";
            const dataLines: string[] = [];
            for (const line of part.split("\n")) {
              if (line.startsWith("event: ")) eventType = line.slice(7).trim();
              else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
              else if (line.startsWith("data:")) dataLines.push(line.slice(5));
            }
            const dataStr = dataLines.join("\n");
            if (dataStr) {
              try {
                onEvent(eventType, JSON.parse(dataStr));
              } catch {
                /* non-JSON event, skip */
              }
            }
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          onEvent("error", { error: (e as Error).message });
        }
      } finally {
        setStreaming(false);
      }
    },
    [],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, []);

  return { streaming, start, stop };
}
