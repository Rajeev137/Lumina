import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchGoldenAnswers, deleteGoldenAnswer } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Trophy, Search, Trash2, AlertCircle } from "lucide-react";

export function GoldenAnswersPage({ visible = false }: { visible?: boolean }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Simple debounce on search
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const handleSearch = (val: string) => {
    setSearch(val);
    if (timer) clearTimeout(timer);
    const t = setTimeout(() => setDebouncedSearch(val), 400);
    setTimer(t);
  };

  const {
    data: goldenAnswers = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["golden-answers", debouncedSearch],
    queryFn: () => fetchGoldenAnswers(debouncedSearch || undefined),
    refetchInterval: visible ? 10_000 : false,
    refetchOnWindowFocus: true,
  });

  // Refetch immediately when tab becomes visible
  useEffect(() => {
    if (visible) refetch();
  }, [visible, refetch]);

  const handleRevoke = async (id: string) => {
    setDeleting(id);
    try {
      await deleteGoldenAnswer(id);
      queryClient.invalidateQueries({ queryKey: ["golden-answers"] });
    } catch {
      // silently fail
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-heading">
          Golden Answers
        </h2>
        <p className="text-muted-foreground">
          Approved Q&A pairs stored in the Golden Bank. These are used for
          instant semantic matching in future queries.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="size-5 text-amber-500" />
            Golden Q&A Bank
          </CardTitle>
          <CardDescription>
            Search by question or answer text. Revoke mistakenly approved
            entries to remove them from the bank.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search questions or answers…"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-background pl-10 pr-4 py-2.5 text-sm text-heading placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-colors"
            />
          </div>

          {/* Results */}
          {isLoading ? (
            <div className="flex items-center gap-2 py-8 justify-center">
              <Spinner size="sm" />
              <span className="text-sm text-muted-foreground">
                Loading golden answers…
              </span>
            </div>
          ) : goldenAnswers.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center space-y-2">
              <Trophy className="size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {debouncedSearch
                  ? `No golden answers matching "${debouncedSearch}".`
                  : "No golden answers yet. Approve answers during RLHF review to build this bank."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {goldenAnswers.length} golden answer
                {goldenAnswers.length !== 1 ? "s" : ""}
                {debouncedSearch && ` matching "${debouncedSearch}"`}
              </p>

              {goldenAnswers.map((ga) => (
                <div
                  key={ga.id}
                  className="rounded-lg border border-border bg-background p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div>
                        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Question
                        </label>
                        <p className="text-sm text-heading mt-0.5 whitespace-pre-wrap">
                          {ga.question}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Answer
                        </label>
                        <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap line-clamp-4">
                          {ga.answer}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <Badge variant="success">Approved</Badge>
                      {ga.created_at && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(ga.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Revoke action */}
                  {confirmDelete === ga.id ? (
                    <div className="flex items-center gap-2 rounded-lg bg-red-500/5 border border-red-500/20 p-3">
                      <AlertCircle className="size-4 text-red-500 shrink-0" />
                      <p className="text-xs text-red-600 dark:text-red-400 flex-1">
                        Remove this from the Golden Bank? This cannot be undone.
                      </p>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleRevoke(ga.id)}
                        disabled={deleting === ga.id}
                      >
                        {deleting === ga.id ? <Spinner size="sm" /> : "Confirm"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDelete(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(ga.id)}
                      className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="size-3.5" />
                      Revoke Approval
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
