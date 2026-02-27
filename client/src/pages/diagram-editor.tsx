import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { Excalidraw, MainMenu, WelcomeScreen } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/dist/types/excalidraw/types";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Save, FileText, Plus, FolderOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SavedDiagram {
  id: number;
  adrId: number;
  name: string;
  diagramData: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export default function DiagramEditor() {
  const { projectId, adrId } = useParams<{ projectId: string; adrId: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [diagramName, setDiagramName] = useState("Architecture Diagram");
  const [currentDiagramId, setCurrentDiagramId] = useState<number | null>(null);
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isLoadDialogOpen, setIsLoadDialogOpen] = useState(false);
  const hasAutoLoaded = useRef(false);

  const { data: diagrams = [] } = useQuery<SavedDiagram[]>({
    queryKey: [`/api/projects/${projectId}/adrs/${adrId}/diagrams`],
  });

  // Auto-load the most recent diagram when editor and data are both ready
  useEffect(() => {
    if (hasAutoLoaded.current || !excalidrawAPI || diagrams.length === 0) return;
    hasAutoLoaded.current = true;

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
  }, [diagrams, excalidrawAPI]);

  const saveMutation = useMutation({
    mutationFn: async (data: { name: string; diagramData: string; id?: number }) => {
      const url = data.id
        ? `/api/projects/${projectId}/adrs/${adrId}/diagrams/${data.id}`
        : `/api/projects/${projectId}/adrs/${adrId}/diagrams`;
      const method = data.id ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name, diagramData: data.diagramData }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (savedDiagram) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/adrs/${adrId}/diagrams`] });
      setCurrentDiagramId(savedDiagram.id);
      toast({ title: "Diagram saved successfully" });
      setIsSaveDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
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
  };

  const handleLoad = (diagram: SavedDiagram) => {
    if (!excalidrawAPI) return;

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
      setIsLoadDialogOpen(false);
      toast({ title: "Diagram loaded successfully" });
    } catch (err) {
      toast({ title: "Error", description: "Failed to load diagram", variant: "destructive" });
    }
  };

  const handleNewDiagram = () => {
    if (!excalidrawAPI) return;
    excalidrawAPI.resetScene();
    setDiagramName("Untitled Diagram");
    setCurrentDiagramId(null);
  };

  return (
    <div style={{ height: "calc(100vh - 3rem)", width: "100%" }}>
      <div className="border-b p-3 flex items-center justify-between gap-4 bg-background">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-primary" />
          <Input
            value={diagramName}
            onChange={(e) => setDiagramName(e.target.value)}
            className="max-w-xs h-9"
            placeholder="Diagram name"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleNewDiagram}>
            <Plus className="w-4 h-4 mr-2" />
            New
          </Button>
          <Dialog open={isLoadDialogOpen} onOpenChange={setIsLoadDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <FolderOpen className="w-4 h-4 mr-2" />
                Load
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Load Diagram</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {diagrams.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No saved diagrams yet</p>
                ) : (
                  diagrams.map((diagram) => (
                    <div
                      key={diagram.id}
                      className="p-3 border rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => handleLoad(diagram)}
                    >
                      <div className="font-medium">{diagram.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Last updated: {new Date(diagram.updatedAt).toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>
          <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
            <Save className="w-4 h-4 mr-2" />
            {saveMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
      <div style={{ height: "calc(100% - 4rem)" }}>
        <Excalidraw
          excalidrawAPI={(api) => setExcalidrawAPI(api)}
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
  );
}
