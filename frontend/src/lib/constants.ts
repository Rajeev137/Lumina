export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

export const POLLING_INTERVAL_MS = 2000;

export const ALLOWED_KNOWLEDGE_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".pptx",
  ".xlsx",
  ".html",
] as const;

export const ALLOWED_RFP_EXTENSIONS = [".xlsx"] as const;
