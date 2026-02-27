import { useState } from "react";
import type { InsertProjectRequirement } from "@shared/schema";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, FileText } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import type { ProjectRequirement, ProjectMemberWithUser } from "@server/storage";
import { projectRolePermissions } from "@shared/schema";

const priorityColors = {
  must: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  should: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  could: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  wont: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
};

const statusColors = {
  draft: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  approved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  deprecated: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
};

export default function ProjectRequirements() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingReq, setEditingReq] = useState<ProjectRequirement | null>(null);
  const [filterType, setFilterType] = useState<"all" | "FR" | "NFR">("all");

  const { data: requirements = [], isLoading } = useQuery<ProjectRequirement[]>({
    queryKey: [`/api/projects/${projectId}/requirements`],
  });

  const { data: members = [] } = useQuery<ProjectMemberWithUser[]>({
    queryKey: [`/api/projects/${projectId}/members`],
  });

  const myProjectRole =
    user?.role === "admin"
      ? "admin"
      : members.find((m) => m.userId === user?.id)?.role || "viewer";
  const permissions = projectRolePermissions[myProjectRole];

  const createMutation = useMutation({
    mutationFn: async (data: Omit<InsertProjectRequirement, "projectId" | "createdAt" | "updatedAt">) => {
      const res = await fetch(`/api/projects/${projectId}/requirements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/requirements`] });
      toast({ title: "Requirement created" });
      setIsCreateOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertProjectRequirement> }) => {
      const res = await fetch(`/api/projects/${projectId}/requirements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/requirements`] });
      toast({ title: "Requirement updated" });
      setEditingReq(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/projects/${projectId}/requirements/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/requirements`] });
      toast({ title: "Requirement deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      type: formData.get("type"),
      code: formData.get("code"),
      title: formData.get("title"),
      description: formData.get("description") || "",
      priority: formData.get("priority"),
      status: formData.get("status"),
    });
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingReq) return;
    const formData = new FormData(e.currentTarget);
    updateMutation.mutate({
      id: editingReq.id,
      data: {
        title: formData.get("title"),
        description: formData.get("description") || "",
        priority: formData.get("priority"),
        status: formData.get("status"),
      },
    });
  };

  const filteredRequirements =
    filterType === "all"
      ? requirements
      : requirements.filter((r) => r.type === filterType);

  if (isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold tracking-tight">Requirements</h1>
            <p className="text-sm text-muted-foreground">
              Functional and Non-Functional Requirements
            </p>
          </div>
        </div>
        {permissions.canEdit && (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-requirement">
                <Plus className="w-4 h-4 mr-2" />
                New Requirement
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Requirement</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="type">Type</Label>
                    <Select name="type" defaultValue="FR" required>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FR">Functional (FR)</SelectItem>
                        <SelectItem value="NFR">Non-Functional (NFR)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="code">Code</Label>
                    <Input
                      id="code"
                      name="code"
                      placeholder="FR-001"
                      required
                      maxLength={20}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    name="title"
                    placeholder="Brief description"
                    required
                    maxLength={200}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    name="description"
                    placeholder="Detailed description"
                    rows={4}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority (MoSCoW)</Label>
                    <Select name="priority" defaultValue="should" required>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="must">Must Have</SelectItem>
                        <SelectItem value="should">Should Have</SelectItem>
                        <SelectItem value="could">Could Have</SelectItem>
                        <SelectItem value="wont">Won't Have</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select name="status" defaultValue="draft" required>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="deprecated">Deprecated</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Create</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Tabs value={filterType} onValueChange={(v) => setFilterType(v as "all" | "FR" | "NFR")}>
        <TabsList>
          <TabsTrigger value="all">All ({requirements.length})</TabsTrigger>
          <TabsTrigger value="FR">
            FR ({requirements.filter((r) => r.type === "FR").length})
          </TabsTrigger>
          <TabsTrigger value="NFR">
            NFR ({requirements.filter((r) => r.type === "NFR").length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={filterType} className="mt-4">
          {filteredRequirements.length === 0 ? (
            <Card>
              <CardContent className="text-center py-10">
                <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No requirements yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredRequirements.map((req) => (
                <Card key={req.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge variant="outline" className="font-mono text-xs">
                            {req.code}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`text-xs ${priorityColors[req.priority as keyof typeof priorityColors]}`}
                          >
                            {req.priority.toUpperCase()}
                          </Badge>
                          <Badge
                            className={`text-xs ${statusColors[req.status as keyof typeof statusColors]}`}
                          >
                            {req.status}
                          </Badge>
                        </div>
                        <CardTitle className="text-base">{req.title}</CardTitle>
                        {req.description && (
                          <p className="text-sm text-muted-foreground mt-2">
                            {req.description}
                          </p>
                        )}
                      </div>
                      {permissions.canEdit && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingReq(req)}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          {myProjectRole === "admin" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                if (confirm("Delete this requirement?")) {
                                  deleteMutation.mutate(req.id);
                                }
                              }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {editingReq && (
        <Dialog open={!!editingReq} onOpenChange={() => setEditingReq(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Requirement</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="space-y-2">
                <Label>Code (read-only)</Label>
                <Input value={editingReq.code} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-title">Title</Label>
                <Input
                  id="edit-title"
                  name="title"
                  defaultValue={editingReq.title}
                  required
                  maxLength={200}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  name="description"
                  defaultValue={editingReq.description || ""}
                  rows={4}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-priority">Priority</Label>
                  <Select name="priority" defaultValue={editingReq.priority} required>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="must">Must Have</SelectItem>
                      <SelectItem value="should">Should Have</SelectItem>
                      <SelectItem value="could">Could Have</SelectItem>
                      <SelectItem value="wont">Won't Have</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-status">Status</Label>
                  <Select name="status" defaultValue={editingReq.status} required>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="deprecated">Deprecated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditingReq(null)}>
                  Cancel
                </Button>
                <Button type="submit">Save</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
