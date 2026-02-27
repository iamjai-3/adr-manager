import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";

interface ADRSuggestion {
  title: string;
  description: string;
  addressesRequirements: string[];
  priority: "high" | "medium" | "low";
  rationale: string;
}

interface Props {
  readonly projectId: string;
}

const priorityColors = {
  high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

export function AISuggestions({ projectId }: Props) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<ADRSuggestion[]>([]);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: aiStatus } = useQuery<{ enabled: boolean; provider: string }>({
    queryKey: ["/api/ai/status"],
  });

  const suggestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/suggest-adrs", {
        projectId: Number(projectId),
      });
      return res.json() as Promise<{ suggestions: ADRSuggestion[] }>;
    },
    onSuccess: (data) => {
      setSuggestions(data.suggestions);
    },
    onError: (err: Error) => {
      toast({ title: "Suggestion failed", description: err.message, variant: "destructive" });
    },
  });

  const handleOpen = () => {
    setOpen(true);
    if (suggestions.length === 0) suggestMutation.mutate();
  };

  const handleCreateAdr = (suggestion: ADRSuggestion) => {
    const params = new URLSearchParams({
      title: suggestion.title,
      description: suggestion.description,
    });
    navigate(`/projects/${projectId}/adrs/create?${params.toString()}`);
    setOpen(false);
  };

  const isEnabled = aiStatus?.enabled ?? false;

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!isEnabled}
                onClick={handleOpen}
                className="gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                AI Suggest ADRs
              </Button>
            </span>
          </TooltipTrigger>
          {!isEnabled && (
            <TooltipContent>AI provider is not configured</TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-500" />
              AI-Suggested ADRs from Requirements
            </DialogTitle>
          </DialogHeader>

          {suggestMutation.isPending && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
              <p className="text-sm">Analyzing requirements and existing ADRs…</p>
            </div>
          )}

          {!suggestMutation.isPending && suggestions.length === 0 && suggestMutation.isSuccess && (
            <div className="text-center py-12 text-muted-foreground">
              <p>No suggestions found. Add more requirements to get started.</p>
            </div>
          )}

          {suggestions.length > 0 && (
            <div className="space-y-4 mt-2">
              <p className="text-sm text-muted-foreground">
                AI found {suggestions.length} architectural decision{suggestions.length !== 1 ? "s" : ""} not yet documented. Click "Create ADR" to pre-fill the creation form.
              </p>

              {suggestions.map((s) => (
                <div key={s.title} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium text-sm">{s.title}</h3>
                        <Badge
                          className={`text-xs ${priorityColors[s.priority as keyof typeof priorityColors] || priorityColors.medium}`}
                          variant="secondary"
                        >
                          {s.priority} priority
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{s.description}</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleCreateAdr(s)}
                      className="shrink-0 gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Create ADR
                    </Button>
                  </div>

                  {s.addressesRequirements.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">Addresses:</span>
                      {s.addressesRequirements.map((req) => (
                        <Badge key={req} variant="outline" className="text-xs">
                          {req}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground border-t pt-2">
                    <span className="font-medium">Rationale:</span> {s.rationale}
                  </p>
                </div>
              ))}

              <Separator />

              <div className="flex justify-between items-center">
                <Badge variant="outline" className="text-xs">
                  Powered by {aiStatus?.provider ?? "AI"}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setSuggestions([]); suggestMutation.mutate(); }}
                  disabled={suggestMutation.isPending}
                  className="gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Regenerate
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
