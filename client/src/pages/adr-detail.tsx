import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { statusLabels, statusTransitionMap, projectRolePermissions } from "@shared/schema";
import type { Adr, AdrComment, AdrVersion, Project } from "@shared/schema";
import type { ProjectMemberWithUser } from "@server/storage";
import {
  ArrowLeft,
  Edit2,
  MessageSquare,
  History,
  Send,
  Archive,
  PenTool,
  FileText,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";

export default function AdrDetail() {
  const params = useParams<{ projectId: string; id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const { projectId, id: adrId } = params;

  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [statusReason, setStatusReason] = useState("");
  const [commentText, setCommentText] = useState("");
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");

  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const { data: members } = useQuery<ProjectMemberWithUser[]>({
    queryKey: ["/api/projects", projectId, "members"],
    enabled: !!projectId,
  });

  // Resolve effective project role: global admin → "admin", otherwise use membership role
  const myProjectRole = user?.role === "admin"
    ? "admin"
    : (members?.find((m) => m.userId === user?.id)?.role ?? "viewer");
  const permissions = projectRolePermissions[myProjectRole];

  const { data: adr, isLoading } = useQuery<Adr>({
    queryKey: ["/api/projects", projectId, "adrs", adrId],
    enabled: !!projectId && !!adrId,
  });

  const { data: comments } = useQuery<AdrComment[]>({
    queryKey: ["/api/projects", projectId, "adrs", adrId, "comments"],
    enabled: !!projectId && !!adrId,
  });

  const { data: versions } = useQuery<AdrVersion[]>({
    queryKey: ["/api/projects", projectId, "adrs", adrId, "versions"],
    enabled: !!projectId && !!adrId,
  });

  const statusMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/projects/${projectId}/adrs/${adrId}/status`, {
        status: newStatus,
        reason: statusReason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "adrs", adrId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "adrs", adrId, "versions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "adrs"] });
      setShowStatusDialog(false);
      setStatusReason("");
      toast({ title: "Status updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update status", description: err.message, variant: "destructive" });
    },
  });

  const commentMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/projects/${projectId}/adrs/${adrId}/comments`, {
        content: commentText,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "adrs", adrId, "comments"] });
      setCommentText("");
      toast({ title: "Comment added" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add comment", description: err.message, variant: "destructive" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/projects/${projectId}/adrs/${adrId}/archive`, { reason: archiveReason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "adrs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "adrs", adrId] });
      setShowArchiveDialog(false);
      toast({ title: "ADR archived" });
      navigate(`/projects/${projectId}`);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to archive", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!adr) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center py-20">
        <h2 className="text-lg font-semibold mb-2">ADR Not Found</h2>
        <p className="text-muted-foreground mb-4">This decision record doesn't exist.</p>
        <Button onClick={() => navigate(`/projects/${projectId}`)} data-testid="button-back-to-list">
          Back to Project
        </Button>
      </div>
    );
  }

  const allowedTransitions = statusTransitionMap[adr.status] || [];
  const projectKey = project?.key ?? "ADR";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/projects/${projectId}`)}
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-sm font-mono text-muted-foreground font-medium">
              {projectKey}-{String(adr.adrNumber).padStart(3, "0")}
            </span>
            <StatusBadge status={adr.status} />
            <span className="text-xs font-mono text-muted-foreground">v{adr.version}</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight" data-testid="text-adr-title">
            {adr.title}
          </h1>
          <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground flex-wrap">
            <span>by {adr.author}</span>
            {adr.team && <span>| {adr.team}</span>}
            <span>| {new Date(adr.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {permissions.canChangeStatus && allowedTransitions.length > 0 && (
            <Select
              onValueChange={(val) => {
                setNewStatus(val);
                setShowStatusDialog(true);
              }}
            >
              <SelectTrigger className="w-[160px]" data-testid="select-status-transition">
                <SelectValue placeholder="Change Status" />
              </SelectTrigger>
              <SelectContent>
                {allowedTransitions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabels[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {permissions.canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/projects/${projectId}/adrs/${adrId}/edit`)}
              data-testid="button-edit"
            >
              <Edit2 className="w-4 h-4 mr-1" />
              Edit
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/projects/${projectId}/adrs/${adrId}/view`)}
            data-testid="button-view-document"
          >
            <FileText className="w-4 h-4 mr-1" />
            View Document
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/projects/${projectId}/adrs/${adrId}/diagram`)}
            data-testid="button-diagram"
          >
            <PenTool className="w-4 h-4 mr-1" />
            Diagram
          </Button>
          {permissions.canArchive && !adr.archived && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowArchiveDialog(true)}
              data-testid="button-archive"
            >
              <Archive className="w-4 h-4 mr-1" />
              Archive
            </Button>
          )}
        </div>
      </div>

      {adr.archived && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-800 dark:text-amber-300">
          This ADR has been archived. Reason: {adr.archiveReason || "Not specified"}
        </div>
      )}

      {(adr.tags || []).length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {(adr.tags || []).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      <div className="grid gap-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Context
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed whitespace-pre-wrap" data-testid="text-context">
              {adr.context}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Decision
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed whitespace-pre-wrap" data-testid="text-decision">
              {adr.decision}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Consequences
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed whitespace-pre-wrap" data-testid="text-consequences">
              {adr.consequences}
            </p>
          </CardContent>
        </Card>

        {adr.alternatives && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Alternatives Considered
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed whitespace-pre-wrap" data-testid="text-alternatives">
                {adr.alternatives}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <Separator />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <History className="w-4 h-4" />
              Version History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!versions || versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No version history yet.</p>
            ) : (
              <div className="space-y-3">
                {versions.map((v) => (
                  <div key={v.id} className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-medium">v{v.version}</span>
                        <StatusBadge status={v.status} />
                      </div>
                      {v.changeReason && (
                        <p className="text-xs text-muted-foreground mt-0.5">{v.changeReason}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {v.changedBy} - {new Date(v.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Comments ({comments?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 mb-4">
              {(!comments || comments.length === 0) && (
                <p className="text-sm text-muted-foreground">No comments yet.</p>
              )}
              {comments?.map((c) => (
                <div
                  key={c.id}
                  className="bg-muted/50 rounded-md p-3"
                  data-testid={`comment-${c.id}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-medium">{c.author}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(c.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm">{c.content}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Textarea
                placeholder="Add a comment..."
                className="min-h-[60px] flex-1"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                data-testid="input-comment"
              />
              <Button
                size="icon"
                onClick={() => commentMutation.mutate()}
                disabled={!commentText.trim() || commentMutation.isPending}
                data-testid="button-send-comment"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Change Status to {statusLabels[newStatus]}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Please provide a reason for this status change.
            </p>
            <Input
              placeholder="Reason for status change..."
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              data-testid="input-status-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStatusDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => statusMutation.mutate()}
              disabled={!statusReason.trim() || statusMutation.isPending}
              data-testid="button-confirm-status"
            >
              {statusMutation.isPending ? "Updating..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive ADR</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This ADR will be hidden from default view. Please provide a reason.
            </p>
            <Input
              placeholder="Reason for archiving..."
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              data-testid="input-archive-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowArchiveDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => archiveMutation.mutate()}
              disabled={!archiveReason.trim() || archiveMutation.isPending}
              data-testid="button-confirm-archive"
            >
              {archiveMutation.isPending ? "Archiving..." : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
