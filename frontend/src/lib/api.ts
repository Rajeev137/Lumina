import { API_BASE_URL } from "./constants";
import { getAuthHeaders, clearToken } from "./auth";
import type {
  HealthResponse,
  JobStatusResponse,
  RfpProcessResponse,
  RfpDownloadResponse,
  BatchUploadResponse,
  KnowledgeUploadResponse,
  KnowledgeResultResponse,
  KnowledgeDocument,
  BatchRunSummary,
  BatchRunDetail,
  PendingBatchRun,
  GoldenAnswerItem,
} from "@/types/api";

async function request<T>(
  path: string,
  init?: RequestInit,
  baseOverride?: string,
): Promise<T> {
  const base = baseOverride ?? API_BASE_URL;
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...getAuthHeaders(),
      ...(!init?.body || init.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });

  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error("Session expired. Please log in again.");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Request failed with status ${res.status}`);
  }

  return res.json();
}

// ── Health ────────────────────────────────────────────────────────────────────

export function fetchHealth() {
  // Health endpoint is at root, not under /api/v1
  const base = API_BASE_URL.replace(/\/api\/v1$/, "");
  return request<HealthResponse>("", {}, base + "/health");
}

// ── RFP ───────────────────────────────────────────────────────────────────────

export function submitRfpQuestion(question: string) {
  return request<RfpProcessResponse>("/rfp/process", {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}

export function fetchRfpStatus(jobId: string) {
  return request<JobStatusResponse>(`/rfp/status/${encodeURIComponent(jobId)}`);
}

export function fetchRfpResult(jobId: string) {
  return request<RfpDownloadResponse>(
    `/rfp/download/${encodeURIComponent(jobId)}`,
  );
}

export function uploadRfpBatch(file: File) {
  const form = new FormData();
  form.append("file", file);
  return request<BatchUploadResponse>("/rfp/batch-upload", {
    method: "POST",
    body: form,
  });
}

// ── Knowledge ─────────────────────────────────────────────────────────────────

export function uploadKnowledgeDocument(file: File) {
  const form = new FormData();
  form.append("file", file);
  return request<KnowledgeUploadResponse>("/knowledge/upload", {
    method: "POST",
    body: form,
  });
}

export function fetchKnowledgeStatus(jobId: string) {
  return request<JobStatusResponse>(
    `/knowledge/status/${encodeURIComponent(jobId)}`,
  );
}

export function fetchKnowledgeResult(jobId: string) {
  return request<KnowledgeResultResponse>(
    `/knowledge/result/${encodeURIComponent(jobId)}`,
  );
}

export function fetchKnowledgeDocuments() {
  return request<KnowledgeDocument[]>("/knowledge/documents");
}

export function deleteKnowledgeDocument(documentId: string) {
  return request<{ deleted: boolean }>(
    `/knowledge/documents/${encodeURIComponent(documentId)}`,
    { method: "DELETE" },
  );
}

// ── Batch History ─────────────────────────────────────────────────────────────

export function fetchBatchHistory() {
  return request<BatchRunSummary[]>("/rfp/batch-history");
}

export function fetchBatchRun(runId: string) {
  return request<BatchRunDetail>(
    `/rfp/batch-history/${encodeURIComponent(runId)}`,
  );
}

export function deleteBatchRun(runId: string) {
  return request<{ deleted: boolean }>(
    `/rfp/batch-history/${encodeURIComponent(runId)}`,
    { method: "DELETE" },
  );
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_at: number;
}

export interface RegisterResponse {
  id: string;
  email: string;
  created_at: string;
}

export async function loginUser(email: string, password: string) {
  const form = new URLSearchParams();
  form.append("username", email);
  form.append("password", password);
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body: form,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
}

export function registerUser(email: string, password: string) {
  return request<RegisterResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

// ── RLHF ─────────────────────────────────────────────────────────────────────

export function submitFeedback(
  question: string,
  answer: string,
  status: "approved" | "rejected" | "neutral",
) {
  return request<{ message: string }>("/rlhf/feedback", {
    method: "POST",
    body: JSON.stringify({ question, answer, status }),
  });
}

// ── RLHF Review / Golden Answers ─────────────────────────────────────────────

export function fetchPendingReviews() {
  return request<PendingBatchRun[]>("/rlhf/pending");
}

export function fetchGoldenAnswers(search?: string) {
  const qs = search ? `?search=${encodeURIComponent(search)}` : "";
  return request<GoldenAnswerItem[]>(`/rlhf/golden${qs}`);
}

export function deleteGoldenAnswer(goldenId: string) {
  return request<{ deleted: boolean }>(
    `/rlhf/golden/${encodeURIComponent(goldenId)}`,
    { method: "DELETE" },
  );
}
