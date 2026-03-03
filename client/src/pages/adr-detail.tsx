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
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  statusLabels,
  statusTransitionMap,
  projectRolePermissions,
} from "@shared/schema";
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
  ChevronDown,
  MoreHorizontal,
  CheckCircle2,
  Circle,
  Keyboard,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { sanitize } from "@/lib/sanitize";
import { AIReviewPanel } from "@/components/ai-review-panel";
import { cn } from "@/lib/utils";

// ─── Utility helpers ────────────────────────────────────────────────────────

function relativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

function avatarColorClass(name: string): string {
  const palette = [
    "bg-blue-500",
    "bg-emerald-500",
    "bg-violet-500",
    "bg-amber-500",
    "bg-rose-500",
    "bg-teal-500",
    "bg-indigo-500",
    "bg-pink-500",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0x7fffffff;
  }
  return palette[hash % palette.length];
}

// ─── Status workflow stepper ────────────────────────────────────────────────

const MAIN_WORKFLOW = ["draft", "proposed", "in_review", "accepted"] as const;

function StatusWorkflow({ current }: { current: string }) {
  const isTerminal = current === "deprecated" || current === "superseded";
  const currentIndex = MAIN_WORKFLOW.indexOf(current as (typeof MAIN_WORKFLOW)[number]);

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {MAIN_WORKFLOW.map((step, idx) => {
        const isActive = step === current;
        const isPast = !isTerminal && currentIndex > idx;
        const isFuture = isTerminal || currentIndex < idx;

        return (
          <div key={step} className="flex items-center gap-1">
            <div
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all",
                isActive &&
                  "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30",
                isPast &&
                  "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                isFuture &&
                  "bg-muted/60 text-muted-foreground/60"
              )}
            >
              {isPast ? (
                <CheckCircle2 className="w-3 h-3 shrink-0" />
              ) : (
                <Circle className="w-3 h-3 shrink-0" />
              )}
              {statusLabels[step]}
            </div>
            {idx < MAIN_WORKFLOW.length - 1 && (
              <div
                className={cn(
                  "w-4 h-px",
                  isPast || isActive ? "bg-primary/40" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}

      {isTerminal && (
        <div className="flex items-center gap-1 ml-1">
          <div className="w-4 h-px bg-border" />
          <div
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium",
              current === "deprecated" &&
                "bg-red-500 text-white shadow-sm ring-2 ring-red-500/30",
              current === "superseded" &&
                "bg-violet-500 text-white shadow-sm ring-2 ring-violet-500/30"
            )}
          >
            <Circle className="w-3 h-3 shrink-0" />
            {statusLabels[current]}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Numbered collapsible section ───────────────────────────────────────────

interface ContentSectionProps {
  readonly id: string;
  readonly num: string;
  readonly title: string;
  readonly children: React.ReactNode;
  readonly defaultOpen?: boolean;
}

function ContentSection({
  id,
  num,
  title,
  children,
  defaultOpen = true,
}: ContentSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section id={id} className="scroll-mt-24">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div
          className={cn(
            "rounded-xl border bg-card transition-all",
            open ? "shadow-sm" : "shadow-none"
          )}
        >
          <CollapsibleTrigger asChild>
            <button
              className="w-full flex items-center gap-3 px-6 py-4 text-left hover:bg-muted/30 transition-colors rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              type="button"
            >
              <span className="text-xl font-light text-muted-foreground/60 select-none min-w-[1.5rem]">
                {num}
              </span>
              <h2 className="text-base font-semibold tracking-tight flex-1">
                {title}
              </h2>
              <ChevronDown
                className={cn(
                  "w-4 h-4 text-muted-foreground transition-transform duration-200",
                  !open && "-rotate-90"
                )}
              />
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="px-6 pb-6 pt-1 border-t border-border/50">
              <div className="pl-8 prose prose-sm dark:prose-invert max-w-none mt-3">
                {children}
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </section>
  );
}

// ─── Metadata item ──────────────────────────────────────────────────────────

function MetaItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-0.5">
        {label}
      </div>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

// ─── Avatar ─────────────────────────────────────────────────────────────────

function AuthorAvatar({
  name,
  size = "sm",
}: {
  name: string;
  size?: "sm" | "md";
}) {
  const colorClass = avatarColorClass(name);
  const sizeClass = size === "sm" ? "w-6 h-6 text-[10px]" : "w-8 h-8 text-xs";
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-semibold text-white shrink-0",
        colorClass,
        sizeClass
      )}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Animation variants ─────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: {
    transition: { staggerChildren: 0.07 },
  },
};

// ─── Loading skeleton ───────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <Skeleton className="h-5 w-64" />
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
        <Skeleton className="h-8 w-3/4" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
        <Skeleton className="h-8 w-full max-w-md rounded-full" />
      </div>
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-40 rounded-xl" />
      ))}
      <div className="grid grid-cols-2 gap-5">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  );
}

// ─── Section nav pill ───────────────────────────────────────────────────────

function SectionNavPill({
  id,
  label,
  show,
}: {
  id: string;
  label: string;
  show: boolean;
}) {
  if (!show) return null;
  return (
    <a
      href={`#${id}`}
      onClick={(e) => {
        e.preventDefault();
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
      }}
      className="px-3 py-1 rounded-full text-xs font-medium bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
    >
      {label}
    </a>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

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
  const [scrolled, setScrolled] = useState(false);
  const [statusChanged, setStatusChanged] = useState(false);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 110);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const { data: members } = useQuery<ProjectMemberWithUser[]>({
    queryKey: ["/api/projects", projectId, "members"],
    enabled: !!projectId,
  });

  const myProjectRole =
    user?.role === "admin"
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
      await apiRequest(
        "PATCH",
        `/api/projects/${projectId}/adrs/${adrId}/status`,
        { status: newStatus, reason: statusReason }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", projectId, "adrs", adrId],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", projectId, "adrs", adrId, "versions"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", projectId, "adrs"],
      });
      setShowStatusDialog(false);
      setStatusReason("");
      setStatusChanged(true);
      setTimeout(() => setStatusChanged(false), 2000);
      toast({ title: "Status updated successfully" });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to update status",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const commentMutation = useMutation({
    mutationFn: async () => {
      await apiRequest(
        "POST",
        `/api/projects/${projectId}/adrs/${adrId}/comments`,
        { content: commentText }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", projectId, "adrs", adrId, "comments"],
      });
      setCommentText("");
      toast({ title: "Comment added" });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to add comment",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest(
        "PATCH",
        `/api/projects/${projectId}/adrs/${adrId}/archive`,
        { reason: archiveReason }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", projectId, "adrs"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", projectId, "adrs", adrId],
      });
      setShowArchiveDialog(false);
      toast({ title: "ADR archived" });
      navigate(`/projects/${projectId}`);
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to archive",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) return <LoadingSkeleton />;

  if (!adr) {
    return (
      <div className="p-6 max-w-5xl mx-auto text-center py-24">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
          <FileText className="w-7 h-7 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold mb-2">ADR Not Found</h2>
        <p className="text-muted-foreground mb-6 text-sm">
          This decision record doesn't exist or may have been removed.
        </p>
        <Button
          onClick={() => navigate(`/projects/${projectId}`)}
          data-testid="button-back-to-list"
        >
          Back to Project
        </Button>
      </div>
    );
  }

  const allowedTransitions = statusTransitionMap[adr.status] || [];
  const projectKey = project?.key ?? "ADR";
  const adrRef = `${projectKey}-${String(adr.adrNumber).padStart(3, "0")}`;

  return (
    <TooltipProvider>
      {/* ── Sticky mini-header ─────────────────────────────────────── */}
      <AnimatePresence>
        {scrolled && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-b shadow-sm print:hidden"
          >
            <div className="max-w-5xl mx-auto px-6 py-2.5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => navigate(`/projects/${projectId}`)}
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs font-mono font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded shrink-0">
                  {adrRef}
                </span>
                <span className="text-sm font-medium truncate text-foreground/90">
                  {adr.title}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge status={adr.status} />
                {permissions.canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      navigate(`/projects/${projectId}/adrs/${adrId}/edit`)
                    }
                  >
                    <Edit2 className="w-3.5 h-3.5 mr-1" />
                    Edit
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Page content ──────────────────────────────────────────── */}
      <motion.div
        className="p-6 max-w-5xl mx-auto space-y-6 pb-16"
        initial="hidden"
        animate="visible"
        variants={stagger}
      >
        {/* ── Breadcrumbs ──────────────────────────────────────────── */}
        <motion.div variants={fadeUp} transition={{ duration: 0.25 }}>
          <div className="flex items-center justify-between gap-2">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink
                    onClick={() => navigate("/projects")}
                    className="cursor-pointer text-xs"
                  >
                    Projects
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink
                    onClick={() => navigate(`/projects/${projectId}`)}
                    className="cursor-pointer text-xs"
                  >
                    {project?.name ?? "Project"}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink
                    onClick={() => navigate(`/projects/${projectId}`)}
                    className="cursor-pointer text-xs font-mono"
                  >
                    {adrRef}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="text-xs max-w-[200px] truncate">
                    {adr.title}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground h-7 text-xs print:hidden"
              onClick={() => navigate(`/projects/${projectId}`)}
              data-testid="button-back"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
              Back
            </Button>
          </div>
        </motion.div>

        {/* ── Hero card ────────────────────────────────────────────── */}
        <motion.div variants={fadeUp} transition={{ duration: 0.28 }}>
          <Card className="overflow-hidden">
            {/* Archived banner */}
            {adr.archived && (
              <div className="flex items-center gap-2 px-6 py-2.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-300 text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  <strong>Archived</strong> — {adr.archiveReason || "No reason specified"}
                </span>
              </div>
            )}

            <CardContent className="pt-6 pb-5 space-y-5">
              {/* ADR ref + status + version row */}
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-sm font-mono font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-md">
                  {adrRef}
                </span>
                <motion.span
                  key={adr.status}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{
                    scale: statusChanged ? [1, 1.15, 1] : 1,
                    opacity: 1,
                  }}
                  transition={{ duration: 0.3 }}
                >
                  <StatusBadge status={adr.status} />
                </motion.span>
                <span className="text-xs font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5">
                  v{adr.version}
                </span>
              </div>

              {/* Title */}
              <h1
                className="text-2xl font-bold tracking-tight leading-snug"
                data-testid="text-adr-title"
              >
                {adr.title}
              </h1>

              {/* Metadata grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
                <MetaItem label="Author" value={adr.author} />
                {adr.team && <MetaItem label="Team" value={adr.team} />}
                <MetaItem
                  label="Created"
                  value={new Date(adr.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                />
                <MetaItem
                  label="Last Updated"
                  value={new Date(adr.updatedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                />
              </div>

              {/* Tags */}
              {(adr.tags || []).length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {(adr.tags || []).map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              <Separator />

              {/* Status workflow stepper */}
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  Status Workflow
                </p>
                <StatusWorkflow current={adr.status} />
              </div>

              <Separator />

              {/* Action bar */}
              <div className="flex items-center gap-2 flex-wrap print:hidden">
                {/* Primary: Change Status */}
                {permissions.canChangeStatus && allowedTransitions.length > 0 && (
                  <Select
                    onValueChange={(val) => {
                      setNewStatus(val);
                      setShowStatusDialog(true);
                    }}
                  >
                    <SelectTrigger
                      className="w-[152px] h-9 text-sm"
                      data-testid="select-status-transition"
                    >
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

                {/* Primary: Edit */}
                {permissions.canEdit && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() =>
                      navigate(`/projects/${projectId}/adrs/${adrId}/edit`)
                    }
                    data-testid="button-edit"
                  >
                    <Edit2 className="w-4 h-4 mr-1.5" />
                    Edit
                  </Button>
                )}

                {/* Secondary: AI Review */}
                <AIReviewPanel
                  adrId={Number(adrId)}
                  projectId={projectId ?? ""}
                  onPostComment={(text) => {
                    apiRequest(
                      "POST",
                      `/api/projects/${projectId}/adrs/${adrId}/comments`,
                      { content: text }
                    ).then(() => {
                      queryClient.invalidateQueries({
                        queryKey: [
                          "/api/projects",
                          projectId,
                          "adrs",
                          adrId,
                          "comments",
                        ],
                      });
                    });
                  }}
                />

                {/* Secondary: More actions dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <MoreHorizontal className="w-4 h-4 mr-1.5" />
                      More
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                      onClick={() =>
                        navigate(
                          `/projects/${projectId}/adrs/${adrId}/view`
                        )
                      }
                      data-testid="button-view-document"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      View Document
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        navigate(
                          `/projects/${projectId}/adrs/${adrId}/diagram`
                        )
                      }
                      data-testid="button-diagram"
                    >
                      <PenTool className="w-4 h-4 mr-2" />
                      Diagram
                    </DropdownMenuItem>
                    {permissions.canArchive && !adr.archived && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setShowArchiveDialog(true)}
                          data-testid="button-archive"
                        >
                          <Archive className="w-4 h-4 mr-2" />
                          Archive ADR
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Section navigation pills ──────────────────────────── */}
        <motion.div
          variants={fadeUp}
          transition={{ duration: 0.28 }}
          className="flex items-center gap-2 flex-wrap print:hidden"
        >
          <span className="text-xs text-muted-foreground font-medium shrink-0">
            Jump to:
          </span>
          <SectionNavPill id="section-context" label="Context" show={true} />
          <SectionNavPill id="section-decision" label="Decision" show={true} />
          <SectionNavPill
            id="section-consequences"
            label="Consequences"
            show={true}
          />
          <SectionNavPill
            id="section-alternatives"
            label="Alternatives"
            show={!!adr.alternatives}
          />
          <SectionNavPill
            id="section-history"
            label="History"
            show={!!versions?.length}
          />
          <SectionNavPill
            id="section-comments"
            label={`Comments${comments?.length ? ` (${comments.length})` : ""}`}
            show={true}
          />
        </motion.div>

        {/* ── Content sections ──────────────────────────────────── */}
        <motion.div
          variants={stagger}
          className="space-y-3"
        >
          <motion.div variants={fadeUp} transition={{ duration: 0.25 }}>
            <ContentSection id="section-context" num="1" title="Context">
              <div
                data-testid="text-context"
                dangerouslySetInnerHTML={{ __html: sanitize(adr.context) }}
              />
            </ContentSection>
          </motion.div>

          <motion.div variants={fadeUp} transition={{ duration: 0.25 }}>
            <ContentSection id="section-decision" num="2" title="Decision">
              <div
                data-testid="text-decision"
                dangerouslySetInnerHTML={{ __html: sanitize(adr.decision) }}
              />
            </ContentSection>
          </motion.div>

          <motion.div variants={fadeUp} transition={{ duration: 0.25 }}>
            <ContentSection
              id="section-consequences"
              num="3"
              title="Consequences"
            >
              <div
                data-testid="text-consequences"
                dangerouslySetInnerHTML={{ __html: sanitize(adr.consequences) }}
              />
            </ContentSection>
          </motion.div>

          {adr.alternatives && (
            <motion.div variants={fadeUp} transition={{ duration: 0.25 }}>
              <ContentSection
                id="section-alternatives"
                num="4"
                title="Alternatives Considered"
                defaultOpen={false}
              >
                <div
                  data-testid="text-alternatives"
                  dangerouslySetInnerHTML={{
                    __html: sanitize(adr.alternatives ?? ""),
                  }}
                />
              </ContentSection>
            </motion.div>
          )}
        </motion.div>

        {/* ── Version history + Comments grid ───────────────────── */}
        <motion.div
          variants={fadeUp}
          transition={{ duration: 0.3 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-5"
          id="section-history"
        >
          {/* Version history */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-3 pt-5 px-5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <History className="w-4 h-4 text-muted-foreground" />
                Version History
                {versions && versions.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] ml-auto">
                    {versions.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {!versions || versions.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  No version history yet.
                </p>
              ) : (
                <div className="space-y-0">
                  {versions.map((v, idx) => (
                    <div key={v.id} className="flex gap-3">
                      {/* Timeline connector */}
                      <div className="flex flex-col items-center">
                        <div
                          className={cn(
                            "w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ring-2 ring-background",
                            idx === 0
                              ? "bg-primary"
                              : "bg-muted-foreground/30"
                          )}
                        />
                        {idx < versions.length - 1 && (
                          <div className="w-px flex-1 bg-border mt-1 mb-1 min-h-[16px]" />
                        )}
                      </div>

                      {/* Content */}
                      <div
                        className={cn(
                          "flex-1 min-w-0 pb-4",
                          idx === versions.length - 1 && "pb-0"
                        )}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono font-semibold">
                            v{v.version}
                          </span>
                          <StatusBadge status={v.status} />
                          {idx === 0 && (
                            <span className="text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5 font-medium">
                              Current
                            </span>
                          )}
                        </div>
                        {v.changeReason && (
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                            {v.changeReason}
                          </p>
                        )}
                        <div className="flex items-center gap-1 mt-1">
                          <AuthorAvatar name={v.changedBy} size="sm" />
                          <span className="text-[11px] text-muted-foreground">
                            {v.changedBy}
                          </span>
                          <span className="text-muted-foreground/40 text-[11px]">
                            ·
                          </span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-[11px] text-muted-foreground cursor-default">
                                {relativeTime(v.createdAt)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              {new Date(v.createdAt).toLocaleString()}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Comments */}
          <Card className="overflow-hidden" id="section-comments">
            <CardHeader className="pb-3 pt-5 px-5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-muted-foreground" />
                Discussion
                {comments && comments.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] ml-auto">
                    {comments.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-4">
              {/* Comment list */}
              <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                {(!comments || comments.length === 0) && (
                  <p className="text-sm text-muted-foreground italic py-2">
                    No comments yet. Start the discussion below.
                  </p>
                )}
                <AnimatePresence initial={false}>
                  {comments?.map((c, idx) => (
                    <motion.div
                      key={c.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.04, duration: 0.22 }}
                      className="group rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors p-3"
                      data-testid={`comment-${c.id}`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <AuthorAvatar name={c.author} size="sm" />
                        <span className="text-xs font-semibold">
                          {c.author}
                        </span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-[11px] text-muted-foreground ml-auto cursor-default">
                              {relativeTime(c.createdAt)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            {new Date(c.createdAt).toLocaleString()}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <p className="text-sm leading-relaxed text-foreground/90 pl-8">
                        {c.content}
                      </p>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Comment input */}
              {permissions.canComment && (
                <div className="space-y-2 pt-1 border-t border-border/50">
                  <div className="flex gap-2.5 items-start">
                    {user && <AuthorAvatar name={user.displayName ?? user.username ?? "?"} size="sm" />}
                    <div className="flex-1 space-y-1.5">
                      <Textarea
                        ref={commentInputRef}
                        placeholder="Add a comment..."
                        className="min-h-[68px] text-sm resize-none"
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            if (commentText.trim() && !commentMutation.isPending) {
                              commentMutation.mutate();
                            }
                          }
                        }}
                        data-testid="input-comment"
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Keyboard className="w-3 h-3" />
                          Ctrl+Enter to send
                        </span>
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1.5"
                          onClick={() => commentMutation.mutate()}
                          disabled={
                            !commentText.trim() || commentMutation.isPending
                          }
                          data-testid="button-send-comment"
                        >
                          <Send className="w-3.5 h-3.5" />
                          {commentMutation.isPending ? "Sending..." : "Send"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* ── Status change dialog ──────────────────────────────── */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Change Status to{" "}
              <span className="font-semibold">{statusLabels[newStatus]}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              Please provide a reason for this status change to maintain a clear
              audit trail.
            </p>
            <Input
              placeholder="e.g. Approved by architecture review board"
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  statusReason.trim() &&
                  !statusMutation.isPending
                ) {
                  statusMutation.mutate();
                }
              }}
              data-testid="input-status-reason"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowStatusDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => statusMutation.mutate()}
              disabled={!statusReason.trim() || statusMutation.isPending}
              data-testid="button-confirm-status"
            >
              {statusMutation.isPending ? "Updating..." : "Confirm Change"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Archive dialog ────────────────────────────────────── */}
      <Dialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="w-4 h-4 text-destructive" />
              Archive ADR
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              This ADR will be hidden from the default project view. You can
              restore it later if needed. Please provide a reason.
            </p>
            <Input
              placeholder="e.g. Superseded by a newer decision"
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              data-testid="input-archive-reason"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowArchiveDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => archiveMutation.mutate()}
              disabled={!archiveReason.trim() || archiveMutation.isPending}
              data-testid="button-confirm-archive"
            >
              {archiveMutation.isPending ? "Archiving..." : "Archive ADR"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
