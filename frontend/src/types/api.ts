// ── Shared ────────────────────────────────────────────────────────────────────

export type JobStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "PARSING"
  | "CHUNKING"
  | "EMBEDDING"
  | "STORING"
  | "COMPLETED"
  | "FAILED";

export interface JobStatusResponse {
  job_id: string;
  status: JobStatus;
  progress_percentage?: number;
  message?: string;
  error?: Record<string, unknown>;
}

// ── Health ────────────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  generation_model: string;
  embedding_model: string;
}

// ── RFP ───────────────────────────────────────────────────────────────────────

export interface RfpProcessResponse {
  job_id: string;
  message: string;
}

export interface RfpDownloadResponse {
  question: string;
  answer: string;
  [key: string]: unknown;
}

export interface BatchUploadResponse {
  job_id: string;
  questions_detected: number;
  column_used: string;
  concurrency: number;
  message: string;
}

export interface BatchResult {
  total: number;
  answers: Array<Record<string, unknown>>;
}

// ── Knowledge ─────────────────────────────────────────────────────────────────

export interface KnowledgeUploadResponse {
  job_id: string;
  filename: string;
  message: string;
}

export interface KnowledgeResultResponse {
  job_id: string;
  document_id: string;
  filename: string;
}

export interface KnowledgeDocument {
  id: string;
  filename: string;
  uploaded_at: string | null;
  chunk_count: number;
}

// ── Batch History ─────────────────────────────────────────────────────────────

export interface BatchRunSummary {
  id: string;
  filename: string;
  question_count: number;
  created_at: string | null;
  answer_count: number;
}

export interface BatchRunDetail {
  id: string;
  filename: string;
  question_count: number;
  created_at: string | null;
  answers: Array<Record<string, unknown>>;
}

// ── SSE Streaming Events ────────────────────────────────────────────────────────

export interface SSENodeEvent {
  node: string;
  message: string;
  draft_count: number;
  agent_status?: string;
  question_index?: number;
  total?: number;
  question_preview?: string;
}

export interface SSEBatchStartEvent {
  total: number;
  column: string;
}

export interface SSEQuestionDoneEvent {
  question_index: number;
  total: number;
  result: Record<string, unknown>;
}

export interface SSEDoneEvent {
  result?: Record<string, unknown>;
  total?: number;
  answers?: Array<Record<string, unknown>>;
}

export interface SSEErrorEvent {
  error: string;
}

export interface PendingBatchRun {
  id: string;
  filename: string;
  question_count: number;
  created_at: string | null;
  answer_count: number;
  answers: Array<Record<string, unknown>>;
}

export interface GoldenAnswerItem {
  id: string;
  question: string;
  answer: string;
  created_at: string | null;
}
