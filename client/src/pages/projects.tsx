import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import type { Project } from "@shared/schema";
import { FolderKanban, Plus, ArrowUpRight } from "lucide-react";
import { useState } from "react";

const createProjectSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().optional(),
  key: z
    .string()
    .min(1, "Key is required")
    .max(10)
    .regex(/^[A-Z0-9]+$/, "Must be uppercase letters and numbers only"),
});

type CreateProjectForm = z.infer<typeof createProjectSchema>;

// Generate a stable accent color from a project key
const KEY_ACCENTS = [
  { bg: "bg-indigo-500", light: "bg-indigo-50 dark:bg-indigo-950/50", text: "text-indigo-700 dark:text-indigo-300" },
  { bg: "bg-violet-500", light: "bg-violet-50 dark:bg-violet-950/50", text: "text-violet-700 dark:text-violet-300" },
  { bg: "bg-blue-500", light: "bg-blue-50 dark:bg-blue-950/50", text: "text-blue-700 dark:text-blue-300" },
  { bg: "bg-emerald-500", light: "bg-emerald-50 dark:bg-emerald-950/50", text: "text-emerald-700 dark:text-emerald-300" },
  { bg: "bg-amber-500", light: "bg-amber-50 dark:bg-amber-950/50", text: "text-amber-700 dark:text-amber-300" },
  { bg: "bg-rose-500", light: "bg-rose-50 dark:bg-rose-950/50", text: "text-rose-700 dark:text-rose-300" },
  { bg: "bg-cyan-500", light: "bg-cyan-50 dark:bg-cyan-950/50", text: "text-cyan-700 dark:text-cyan-300" },
  { bg: "bg-teal-500", light: "bg-teal-50 dark:bg-teal-950/50", text: "text-teal-700 dark:text-teal-300" },
];

function getKeyAccent(key: string) {
  const hash = key.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return KEY_ACCENTS[hash % KEY_ACCENTS.length];
}

function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  const accent = getKeyAccent(project.key);
  const createdDate = new Date(project.createdAt).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });

  return (
    <Card
      className="cursor-pointer group hover:shadow-md transition-all duration-200 hover:-translate-y-px shadow-sm"
      onClick={onClick}
      data-testid={`card-project-${project.id}`}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className={`w-9 h-9 rounded-lg ${accent.bg} flex items-center justify-center shadow-sm flex-shrink-0`}>
            <span className="text-white text-xs font-bold tracking-tight">
              {project.key.slice(0, 2)}
            </span>
          </div>
          <ArrowUpRight className="w-4 h-4 text-muted-foreground/0 group-hover:text-muted-foreground transition-all flex-shrink-0 mt-0.5" />
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground leading-snug group-hover:text-primary transition-colors">
              {project.name}
            </h3>
          </div>
          <span className={`inline-block font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded ${accent.light} ${accent.text}`}>
            {project.key}
          </span>
        </div>

        {project.description ? (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-2.5 leading-relaxed">
            {project.description}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground/40 italic mt-2.5">No description</p>
        )}

        <div className="mt-4 pt-3 border-t border-border/60">
          <p className="text-[10px] text-muted-foreground/70 font-medium">
            Created {createdDate}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Projects() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const isAdmin = user?.role === "admin";

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const form = useForm<CreateProjectForm>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { name: "", description: "", key: "" },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateProjectForm) => {
      const res = await apiRequest("POST", "/api/projects", data);
      return res.json();
    },
    onSuccess: (project: Project) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project created" });
      setShowCreate(false);
      form.reset();
      navigate(`/projects/${project.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create project", description: err.message, variant: "destructive" });
    },
  });

  const handleKeyChange = (value: string) => {
    form.setValue("key", value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-5 max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight" data-testid="text-projects-title">
            Projects
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {projects?.length || 0} project{projects?.length !== 1 ? "s" : ""}
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setShowCreate(true)} data-testid="button-create-project">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Project
          </Button>
        )}
      </div>

      {!projects || projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <FolderKanban className="w-7 h-7 text-muted-foreground/50" />
          </div>
          <h3 className="text-base font-semibold mb-1">No projects yet</h3>
          <p className="text-sm text-muted-foreground mb-5 max-w-xs">
            {isAdmin
              ? "Create your first project to start managing ADRs"
              : "You haven't been added to any projects yet"}
          </p>
          {isAdmin && (
            <Button size="sm" onClick={() => setShowCreate(true)} data-testid="button-create-first-project">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Create Project
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => navigate(`/projects/${project.id}`)}
            />
          ))}
        </div>
      )}

      {/* Create Project Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Create New Project</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Platform Engineering" {...field} data-testid="input-project-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Key</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="PLAT"
                        {...field}
                        onChange={(e) => handleKeyChange(e.target.value)}
                        data-testid="input-project-key"
                        className="font-mono uppercase"
                        maxLength={10}
                      />
                    </FormControl>
                    <FormDescription>
                      Short identifier used to prefix ADR numbers (e.g. PLAT-001)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="What is this project for?"
                        className="min-h-[72px] resize-none"
                        {...field}
                        data-testid="input-project-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={createMutation.isPending} data-testid="button-submit-project">
                  {createMutation.isPending ? "Creating..." : "Create Project"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
