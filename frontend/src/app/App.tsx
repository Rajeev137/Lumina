import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Providers } from "./providers";
import { useTheme } from "@/hooks/useTheme";
import { fetchHealth } from "@/lib/api";
import { getToken, clearToken } from "@/lib/auth";
import { LoginPage } from "@/features/auth/LoginPage";

import { KnowledgePage } from "@/features/knowledge/KnowledgePage";
import { SingleQuestionForm } from "@/features/rfp/components/SingleQuestionForm";
import { BatchUploadForm } from "@/features/rfp/components/BatchUploadForm";
import { RlhfPage } from "@/features/rlhf/RlhfPage";
import { GoldenAnswersPage } from "@/features/golden/GoldenAnswersPage";

import { Badge } from "@/components/ui/Badge";
import {
  Sparkles,
  Sun,
  Moon,
  Monitor,
  Database,
  MessageSquare,
  FileSpreadsheet,
  ClipboardCheck,
  Trophy,
  LogOut,
} from "lucide-react";

type Tab = "question" | "batch" | "knowledge" | "rlhf" | "golden";

const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

function AppShell() {
  const { theme, toggle } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>("question");

  const ThemeIcon = THEME_ICONS[theme];

  const handleLogout = useCallback(() => {
    clearToken();
    window.location.reload();
  }, []);

  const { data: health, isError } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-accent text-white">
              <Sparkles className="size-4" />
            </div>
            <span className="text-lg font-bold tracking-tight text-heading">
              Lumina
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Health indicator */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="relative flex size-1.5">
                <span
                  className={`absolute inline-flex size-full rounded-full opacity-75 ${
                    isError ? "bg-red-400" : "bg-emerald-400 animate-ping"
                  }`}
                />
                <span
                  className={`relative inline-flex size-1.5 rounded-full ${
                    isError ? "bg-red-500" : "bg-emerald-500"
                  }`}
                />
              </span>
              <span className="hidden sm:inline">
                {isError ? "Offline" : (health?.status ?? "…")}
              </span>
            </div>

            {/* Theme toggle */}
            <button
              onClick={toggle}
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-heading transition-colors"
              aria-label={`Theme: ${theme}`}
              title={`Theme: ${theme}`}
            >
              <ThemeIcon className="size-4" />
            </button>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-red-500 transition-colors"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        {/* Heading */}
        <section>
          <h1 className="text-2xl font-bold tracking-tight text-heading">
            RFP Response Automator
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload knowledge documents, then submit RFP questions for
            AI-generated responses.
          </p>
        </section>

        {/* ── Tab bar ──────────────────────────────────────────────────── */}
        <nav className="flex gap-1 rounded-lg bg-muted p-1">
          <TabButton
            active={activeTab === "question"}
            onClick={() => setActiveTab("question")}
            icon={<MessageSquare className="size-3.5" />}
            label="Ask Question"
          />
          <TabButton
            active={activeTab === "batch"}
            onClick={() => setActiveTab("batch")}
            icon={<FileSpreadsheet className="size-3.5" />}
            label="Batch Upload"
          />
          <TabButton
            active={activeTab === "knowledge"}
            onClick={() => setActiveTab("knowledge")}
            icon={<Database className="size-3.5" />}
            label="Knowledge Base"
          />
          <TabButton
            active={activeTab === "rlhf"}
            onClick={() => setActiveTab("rlhf")}
            icon={<ClipboardCheck className="size-3.5" />}
            label="RLHF"
          />
          <TabButton
            active={activeTab === "golden"}
            onClick={() => setActiveTab("golden")}
            icon={<Trophy className="size-3.5" />}
            label="Golden Answers"
          />
        </nav>

        {/* ── Active panel (always mounted, hidden when inactive to preserve state) */}
        <div className={activeTab === "question" ? "" : "hidden"}>
          <SingleQuestionForm />
        </div>
        <div className={activeTab === "batch" ? "" : "hidden"}>
          <BatchUploadForm />
        </div>
        <div className={activeTab === "knowledge" ? "" : "hidden"}>
          <KnowledgePage />
        </div>
        <div className={activeTab === "rlhf" ? "" : "hidden"}>
          <RlhfPage visible={activeTab === "rlhf"} />
        </div>
        <div className={activeTab === "golden" ? "" : "hidden"}>
          <GoldenAnswersPage visible={activeTab === "golden"} />
        </div>

        {/* Footer model info */}
        {health && (
          <footer className="flex flex-wrap items-center justify-center gap-2 pt-4 text-xs text-muted-foreground">
            <Badge variant="default">LLM: {health.generation_model}</Badge>
            <Badge variant="default">
              Embeddings: {health.embedding_model}
            </Badge>
          </footer>
        )}
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-all ${
        active
          ? "bg-surface text-heading shadow-sm"
          : "text-muted-foreground hover:text-heading"
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(() => !!getToken());

  if (!authed) {
    return (
      <Providers>
        <LoginPage onLogin={() => setAuthed(true)} />
      </Providers>
    );
  }

  return (
    <Providers>
      <AppShell />
    </Providers>
  );
}
