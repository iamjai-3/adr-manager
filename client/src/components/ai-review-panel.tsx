import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  Loader2,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface AIReview {
  overallScore: number;
  completeness: { score: number; feedback: string };
  clarity: { score: number; feedback: string };
  risks: string[];
  suggestions: string[];
  missingConsiderations: string[];
}

interface Props {
  readonly adrId: number;
  readonly projectId: string;
  readonly onPostComment: (text: string) => void;
}

interface ScoreBarProps {
  readonly label: string;
  readonly score: number;
  readonly feedback: string;
}

function ScoreBar({ label, score, feedback }: ScoreBarProps) {
  const pct = (score / 10) * 100;
  let color = "bg-red-500";
  if (score >= 7) color = "bg-green-500";
  else if (score >= 4) color = "bg-amber-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{score}/10</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">{feedback}</p>
    </div>
  );
}

export function AIReviewPanel({ adrId, projectId, onPostComment }: Props) {
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<AIReview | null>(null);
  const { toast } = useToast();

  const { data: aiStatus } = useQuery<{ enabled: boolean; provider: string }>({
    queryKey: ["/api/ai/status"],
  });

  const reviewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/review-adr", {
        adrId,
        projectId: Number(projectId),
      });
      return res.json() as Promise<AIReview>;
    },
    onSuccess: (data) => {
      setReview(data);
    },
    onError: (err: Error) => {
      toast({ title: "Review failed", description: err.message, variant: "destructive" });
    },
  });

  const handleOpen = () => {
    setOpen(true);
    if (!review) reviewMutation.mutate();
  };

  const isEnabled = aiStatus?.enabled ?? false;

  let overallColor = "text-red-600";
  if (review && review.overallScore >= 7) overallColor = "text-green-600";
  else if (review && review.overallScore >= 4) overallColor = "text-amber-600";

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
                AI Review
              </Button>
            </span>
          </TooltipTrigger>
          {!isEnabled && (
            <TooltipContent>AI provider is not configured</TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-500" />
              AI Architect Review
            </SheetTitle>
          </SheetHeader>

          {reviewMutation.isPending && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
              <p className="text-sm">AI is thinking…</p>
            </div>
          )}

          {review && (
            <div className="mt-6 space-y-6">
              {/* Overall score */}
              <div className="text-center">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Overall Score</p>
                <p className={`text-5xl font-bold ${overallColor}`}>{review.overallScore}<span className="text-xl text-muted-foreground">/10</span></p>
              </div>

              <Separator />

              {/* Dimension scores */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Quality Dimensions</h3>
                <ScoreBar label="Completeness" score={review.completeness.score} feedback={review.completeness.feedback} />
                <ScoreBar label="Clarity" score={review.clarity.score} feedback={review.clarity.feedback} />
              </div>

              {/* Risks */}
              {review.risks.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      Identified Risks
                    </h3>
                    <ul className="space-y-1.5">
                      {review.risks.map((risk) => (
                        <li key={risk.substring(0, 40)} className="text-sm flex gap-2">
                          <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                          <span>{risk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {/* Suggestions */}
              {review.suggestions.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5">
                      <Lightbulb className="w-4 h-4 text-yellow-500" />
                      Suggestions
                    </h3>
                    <ul className="space-y-2">
                      {review.suggestions.map((s) => (
                        <li key={s.substring(0, 40)} className="text-sm flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <span>{s}</span>
                            <div className="mt-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs px-2"
                                onClick={() => {
                                  onPostComment(`**AI Review Suggestion:** ${s}`);
                                  toast({ title: "Added as comment" });
                                }}
                              >
                                Add as comment
                              </Button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {/* Missing considerations */}
              {review.missingConsiderations.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Missing Considerations</h3>
                    <ul className="space-y-1.5">
                      {review.missingConsiderations.map((m) => (
                        <li key={m.substring(0, 40)} className="text-sm text-muted-foreground flex gap-2">
                          <span className="text-amber-500">•</span>
                          <span>{m}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              <Separator />
              <div className="flex justify-between items-center">
                <Badge variant="outline" className="text-xs">
                  Powered by {aiStatus?.provider ?? "AI"}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setReview(null); reviewMutation.mutate(); }}
                  disabled={reviewMutation.isPending}
                  className="gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Re-analyze
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
