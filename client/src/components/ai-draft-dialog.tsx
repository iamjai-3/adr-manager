import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AIDraftResult {
  context: string;
  decision: string;
  consequences: string;
  alternatives: string;
}

interface Props {
  readonly projectId: string;
  readonly currentTitle: string;
  readonly onApply: (draft: AIDraftResult) => void;
}

export function AIDraftDialog({ projectId, currentTitle, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const { toast } = useToast();

  const { data: aiStatus } = useQuery<{ enabled: boolean; provider: string }>({
    queryKey: ["/api/ai/status"],
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/generate-draft", {
        projectId: Number(projectId),
        title: currentTitle,
        description,
      });
      return res.json() as Promise<AIDraftResult>;
    },
    onSuccess: (draft) => {
      onApply(draft);
      setOpen(false);
      setDescription("");
      toast({ title: "Draft generated", description: "AI-generated content has been applied. Review and edit before saving." });
    },
    onError: (err: Error) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

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
                onClick={() => setOpen(true)}
                className="gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                AI Generate
              </Button>
            </span>
          </TooltipTrigger>
          {!isEnabled && (
            <TooltipContent>AI provider is not configured</TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-500" />
              Generate ADR Draft with AI
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-medium">ADR Title</Label>
              <p className="mt-1 text-sm text-muted-foreground border rounded-md px-3 py-2 bg-muted">
                {currentTitle || <span className="italic">Enter a title first</span>}
              </p>
            </div>

            <div>
              <Label htmlFor="ai-description" className="text-sm font-medium">
                Brief Description <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="ai-description"
                className="mt-1"
                rows={4}
                placeholder="Describe the problem or decision in 1-3 sentences. e.g. 'We need to choose a caching strategy for our API to meet the NFR of sub-100ms response times under high load.'"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                AI will use existing project ADRs and requirements as context.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={!currentTitle.trim() || !description.trim() || generateMutation.isPending}
              className="gap-1.5"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  AI is thinking…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
