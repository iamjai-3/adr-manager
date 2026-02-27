import { useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RichTextEditor } from "@/components/rich-text-editor";
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
import { ArrowLeft, X } from "lucide-react";

const createAdrSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Max 200 characters"),
  status: z.string().default("draft"),
  context: z.string().min(1, "Context is required"),
  decision: z.string().min(1, "Decision is required"),
  consequences: z.string().min(1, "Consequences are required"),
  alternatives: z.string().optional(),
  tags: z.array(z.string()).default([]),
  team: z.string().optional(),
});

type CreateAdrForm = z.infer<typeof createAdrSchema>;

export default function AdrCreate() {
  const params = useParams<{ projectId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const projectId = params.projectId;

  const form = useForm<CreateAdrForm>({
    resolver: zodResolver(createAdrSchema),
    defaultValues: {
      title: "",
      status: "draft",
      context: "",
      decision: "",
      consequences: "",
      alternatives: "",
      tags: [],
      team: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: CreateAdrForm) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/adrs`, data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "adrs"] });
      toast({ title: "ADR created successfully" });
      navigate(`/projects/${projectId}/adrs/${data.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create ADR", description: err.message, variant: "destructive" });
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

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(`/projects/${projectId}`)}
        className="mb-4"
        data-testid="button-back"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to Project
      </Button>

      <Card>
        <CardHeader>
          <CardTitle data-testid="text-create-title">Create New ADR</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Use PostgreSQL as primary data store"
                          {...field}
                          data-testid="input-title"
                        />
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
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="context"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Context</FormLabel>
                    <FormControl>
                      <RichTextEditor
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        placeholder="Why is this decision needed? What problem are we solving?"
                        minHeight="120px"
                      />
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
                      <RichTextEditor
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        placeholder="What was decided and why?"
                        minHeight="120px"
                      />
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
                      <RichTextEditor
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        placeholder="What are the outcomes and trade-offs?"
                        minHeight="100px"
                      />
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
                    <FormLabel>Alternatives Considered (optional)</FormLabel>
                    <FormControl>
                      <RichTextEditor
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        placeholder="What other options were evaluated?"
                        minHeight="100px"
                      />
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

              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={mutation.isPending} data-testid="button-submit">
                  {mutation.isPending ? "Creating..." : "Create ADR"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(`/projects/${projectId}`)}
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
