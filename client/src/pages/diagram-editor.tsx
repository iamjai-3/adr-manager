import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { Excalidraw, MainMenu } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Save,
  Plus,
  FolderOpen,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  LayoutGrid,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Adr, Project } from "@shared/schema";
import { cn } from "@/lib/utils";

interface SavedDiagram {
  id: number;
  adrId: number;
  name: string;
  diagramData: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

function elementCount(diagramData: string): number | null {
  try {
    const parsed = JSON.parse(diagramData);
    return Array.isArray(parsed.elements) ? parsed.elements.length : null;
  } catch {
    return null;
  }
}

export default function DiagramEditor() {
  const { projectId, adrId } = useParams<{
    projectId: string;
    adrId: string;
  }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [diagramName, setDiagramName] = useState("Architecture Diagram");
  const [currentDiagramId, setCurrentDiagramId] = useState<number | null>(
    null
  );
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null);
  const [isLoadDialogOpen, setIsLoadDialogOpen] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showNewConfirm, setShowNewConfirm] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Prevent the first onChange (fired on mount) from marking dirty
  const isInitialLoad = useRef(true);
  const hasAutoLoaded = useRef(false);

  // ── Data queries ────────────────────────────────────────────────────────────
  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const { data: adr } = useQuery<Adr>({
    queryKey: ["/api/projects", projectId, "adrs", adrId],
    enabled: !!projectId && !!adrId,
  });

  const { data: diagrams = [] } = useQuery<SavedDiagram[]>({
    queryKey: [`/api/projects/${projectId}/adrs/${adrId}/diagrams`],
  });

  // ── Auto-load most recent diagram ───────────────────────────────────────────
  useEffect(() => {
    if (hasAutoLoaded.current || !excalidrawAPI || diagrams.length === 0)
      return;
    hasAutoLoaded.current = true;
    isInitialLoad.current = true;

    const latest = diagrams[0];
    try {
      const data = JSON.parse(latest.diagramData);
      excalidrawAPI.updateScene({
        elements: data.elements ?? [],
        appState: data.appState ?? {},
      });
      if (data.files) {
        excalidrawAPI.addFiles(Object.values(data.files));
      }
      setDiagramName(latest.name);
      setCurrentDiagramId(latest.id);
    } catch {
      // silently ignore parse errors on auto-load
    }
    // Give Excalidraw a tick to settle before tracking dirty state
    setTimeout(() => {
      isInitialLoad.current = false;
    }, 500);
  }, [diagrams, excalidrawAPI]);

  // ── Ctrl+S / Cmd+S shortcut ─────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // ── Save mutation ────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      diagramData: string;
      id?: number;
    }) => {
      const url = data.id
        ? `/api/projects/${projectId}/adrs/${adrId}/diagrams/${data.id}`
        : `/api/projects/${projectId}/adrs/${adrId}/diagrams`;
      const method = data.id ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          diagramData: data.diagramData,
        }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (savedDiagram) => {
      queryClient.invalidateQueries({
        queryKey: [`/api/projects/${projectId}/adrs/${adrId}/diagrams`],
      });
      setCurrentDiagramId(savedDiagram.id);
      setIsDirty(false);
      setLastSavedAt(new Date());
      toast({ title: "Diagram saved" });
    },
    onError: (err: Error) => {
      toast({
        title: "Save failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // ── Action handlers ──────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    if (!excalidrawAPI) return;

    const elements = excalidrawAPI.getSceneElements();
    const appState = excalidrawAPI.getAppState();
    const files = excalidrawAPI.getFiles();

    const diagramData = JSON.stringify({
      elements,
      appState: {
        viewBackgroundColor: appState.viewBackgroundColor,
        currentItemFontFamily: appState.currentItemFontFamily,
        gridSize: appState.gridSize,
      },
      files,
    });

    saveMutation.mutate({
      name: diagramName,
      diagramData,
      id: currentDiagramId || undefined,
    });
  }, [excalidrawAPI, diagramName, currentDiagramId, saveMutation]);

  const doNewDiagram = () => {
    if (!excalidrawAPI) return;
    excalidrawAPI.resetScene();
    setDiagramName("Untitled Diagram");
    setCurrentDiagramId(null);
    setIsDirty(false);
    isInitialLoad.current = false;
  };

  const handleNewClick = () => {
    if (isDirty) {
      setShowNewConfirm(true);
    } else {
      doNewDiagram();
    }
  };

  const handleLoad = (diagram: SavedDiagram) => {
    if (!excalidrawAPI) return;
    isInitialLoad.current = true;
    try {
      const data = JSON.parse(diagram.diagramData);
      excalidrawAPI.updateScene({
        elements: data.elements,
        appState: data.appState,
      });
      if (data.files) {
        excalidrawAPI.addFiles(Object.values(data.files));
      }
      setDiagramName(diagram.name);
      setCurrentDiagramId(diagram.id);
      setIsDirty(false);
      setIsLoadDialogOpen(false);
      toast({ title: "Diagram loaded" });
    } catch {
      toast({
        title: "Failed to load diagram",
        variant: "destructive",
      });
    }
    setTimeout(() => {
      isInitialLoad.current = false;
    }, 500);
  };

  const projectKey = project?.key ?? "…";
  const adrTitle = adr?.title ?? "…";

  const lastSavedLabel = lastSavedAt
    ? `Saved ${lastSavedAt.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`
    : null;

  return (
    <TooltipProvider>
      <div style={{ height: "calc(100vh - 3rem)", width: "100%" }}>
        {/* ── Toolbar ──────────────────────────────────────────────── */}
        <div className="border-b px-3 py-2 flex items-center justify-between gap-3 bg-background">
          {/* Left: back + breadcrumb + diagram name */}
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() =>
                navigate(`/projects/${projectId}/adrs/${adrId}`)
              }
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>

            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
              <span
                className="cursor-pointer hover:text-foreground transition-colors shrink-0 font-mono text-xs"
                onClick={() => navigate(`/projects/${projectId}`)}
              >
                {projectKey}
              </span>
              <span className="text-muted-foreground/40 shrink-0">/</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="cursor-pointer hover:text-foreground transition-colors truncate max-w-[140px] text-xs"
                    onClick={() =>
                      navigate(`/projects/${projectId}/adrs/${adrId}`)
                    }
                  >
                    {adrTitle}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{adrTitle}</TooltipContent>
              </Tooltip>
              <span className="text-muted-foreground/40 shrink-0">/</span>
            </div>

            {/* Diagram name input */}
            <Input
              value={diagramName}
              onChange={(e) => {
                setDiagramName(e.target.value);
                setIsDirty(true);
              }}
              className="h-8 text-sm max-w-[180px]"
              placeholder="Diagram name"
            />

            {/* Dirty indicator */}
            {isDirty && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 shrink-0">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Unsaved
                  </span>
                </TooltipTrigger>
                <TooltipContent>You have unsaved changes</TooltipContent>
              </Tooltip>
            )}

            {/* Last saved label */}
            {!isDirty && lastSavedLabel && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {lastSavedLabel}
              </span>
            )}
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={handleNewClick}>
              <Plus className="w-4 h-4 mr-1.5" />
              New
            </Button>

            {/* Load dialog */}
            <Dialog open={isLoadDialogOpen} onOpenChange={setIsLoadDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <FolderOpen className="w-4 h-4 mr-1.5" />
                  Load
                  {diagrams.length > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-1.5 text-[10px] h-4 px-1"
                    >
                      {diagrams.length}
                    </Badge>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4" />
                    Saved Diagrams
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {diagrams.length === 0 ? (
                    <div className="text-center py-10 space-y-3">
                      <LayoutGrid className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                      <p className="text-sm text-muted-foreground">
                        No saved diagrams yet.
                      </p>
                      <p className="text-xs text-muted-foreground/70">
                        Draw something and hit Save to get started.
                      </p>
                    </div>
                  ) : (
                    diagrams.map((diagram) => {
                      const isCurrent = diagram.id === currentDiagramId;
                      const count = elementCount(diagram.diagramData);
                      return (
                        <div
                          key={diagram.id}
                          className={cn(
                            "p-3 border rounded-lg cursor-pointer transition-colors",
                            isCurrent
                              ? "border-primary/50 bg-primary/5"
                              : "hover:bg-muted/50"
                          )}
                          onClick={() => handleLoad(diagram)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium truncate">
                              {diagram.name}
                            </span>
                            {isCurrent && (
                              <Badge
                                variant="default"
                                className="text-[10px] shrink-0"
                              >
                                Current
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                            <span>by {diagram.createdBy}</span>
                            {count !== null && (
                              <span>
                                {count} element{count !== 1 ? "s" : ""}
                              </span>
                            )}
                            <span>
                              Updated{" "}
                              {new Date(diagram.updatedAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </DialogContent>
            </Dialog>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saveMutation.isPending}
                >
                  <Save className="w-4 h-4 mr-1.5" />
                  {saveMutation.isPending ? "Saving…" : "Save"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Save (Ctrl+S)</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* ── Canvas ───────────────────────────────────────────────── */}
        <div style={{ height: "calc(100% - 3.25rem)" }}>
          <Excalidraw
            excalidrawAPI={(api) => setExcalidrawAPI(api)}
            onChange={() => {
              if (!isInitialLoad.current) {
                setIsDirty(true);
              }
            }}
            initialData={{
              appState: {
                viewBackgroundColor: "#ffffff",
              },
            }}
          >
            <MainMenu>
              <MainMenu.DefaultItems.SaveAsImage />
              <MainMenu.DefaultItems.Export />
              <MainMenu.DefaultItems.ClearCanvas />
              <MainMenu.DefaultItems.ToggleTheme />
              <MainMenu.DefaultItems.ChangeCanvasBackground />
            </MainMenu>
          </Excalidraw>
        </div>
      </div>

      {/* ── Discard confirmation ─────────────────────────────────── */}
      <AlertDialog open={showNewConfirm} onOpenChange={setShowNewConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to <strong>{diagramName}</strong>.
              Starting a new diagram will discard them permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowNewConfirm(false);
                doNewDiagram();
              }}
            >
              Discard and start new
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
