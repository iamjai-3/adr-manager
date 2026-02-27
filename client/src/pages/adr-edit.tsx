import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { tagOptions, teamOptions } from "@shared/schema";
import type { Adr } from "@shared/schema";
import { ArrowLeft, X } from "lucide-react";
import { useEffect } from "react";

const editAdrSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  context: z.string().min(1, "Context is required"),
  decision: z.string().min(1, "Decision is required"),
  consequences: z.string().min(1, "Consequences are required"),
  alternatives: z.string().optional(),
  tags: z.array(z.string()).default([]),
  team: z.string().optional(),
  changeReason: z.string().min(1, "Change reason is required"),
});

type EditAdrForm = z.infer<typeof editAdrSchema>;

export default function AdrEdit() {
  const params = useParams<{ projectId: string; id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { projectId, id: adrId } = params;

  const { data: adr, isLoading } = useQuery<Adr>({
    queryKey: ["/api/projects", projectId, "adrs", adrId],
    enabled: !!projectId && !!adrId,
  });

  const form = useForm<EditAdrForm>({
    resolver: zodResolver(editAdrSchema),
    defaultValues: {
      title: "",
      context: "",
      decision: "",
      consequences: "",
      alternatives: "",
      tags: [],
      team: "",
      changeReason: "",
    },
  });

  useEffect(() => {
    if (adr) {
      form.reset({
        title: adr.title,
        context: adr.context,
        decision: adr.decision,
        consequences: adr.consequences,
        alternatives: adr.alternatives || "",
        tags: adr.tags || [],
        team: adr.team || "",
        changeReason: "",
      });
    }
  }, [adr, form]);

  const mutation = useMutation({
    mutationFn: async (data: EditAdrForm) => {
      await apiRequest("PATCH", `/api/projects/${projectId}/adrs/${adrId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "adrs", adrId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "adrs", adrId, "versions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "adrs"] });
      toast({ title: "ADR updated" });
      navigate(`/projects/${projectId}/adrs/${adrId}`);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  const selectedTags = form.watch("tags");
  const toggleTag = (tag: string) => {
    const current = form.getValues("tags");
    if (current.includes(tag)) {
      form.setValue("tags", current.filter((t) => t !== tag));
    } else {
      form.setValue("tags", [...current, tag]);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!adr) {
    return (
      <div className="p-6 text-center py-20">
        <h2 className="text-lg font-semibold mb-2">ADR Not Found</h2>
        <Button onClick={() => navigate(`/projects/${projectId}`)} data-testid="button-back-to-list">
          Back to Project
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(`/projects/${projectId}/adrs/${adrId}`)}
        className="mb-4"
        data-testid="button-back"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to ADR
      </Button>

      <Card>
        <CardHeader>
          <CardTitle data-testid="text-edit-title">
            Edit ADR-{String(adr.adrNumber).padStart(3, "0")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-5">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="team"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Team / Domain</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-team">
                          <SelectValue placeholder="Select team" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {teamOptions.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="context"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Context</FormLabel>
                    <FormControl>
                      <Textarea className="min-h-[100px]" {...field} data-testid="input-context" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="decision"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Decision</FormLabel>
                    <FormControl>
                      <Textarea className="min-h-[100px]" {...field} data-testid="input-decision" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="consequences"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Consequences</FormLabel>
                    <FormControl>
                      <Textarea className="min-h-[80px]" {...field} data-testid="input-consequences" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="alternatives"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Alternatives (optional)</FormLabel>
                    <FormControl>
                      <Textarea className="min-h-[80px]" {...field} data-testid="input-alternatives" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div>
                <FormLabel className="mb-2 block">Tags</FormLabel>
                <div className="flex flex-wrap gap-2">
                  {tagOptions.map((tag) => (
                    <Badge
                      key={tag}
                      variant={selectedTags.includes(tag) ? "default" : "outline"}
                      className="cursor-pointer select-none"
                      onClick={() => toggleTag(tag)}
                      data-testid={`tag-${tag}`}
                    >
                      {tag}
                      {selectedTags.includes(tag) && <X className="w-3 h-3 ml-1" />}
                    </Badge>
                  ))}
                </div>
              </div>

              <FormField
                control={form.control}
                name="changeReason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Change Reason</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Why are you making this change?"
                        {...field}
                        data-testid="input-change-reason"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={mutation.isPending} data-testid="button-save">
                  {mutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(`/projects/${projectId}/adrs/${adrId}`)}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
