import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Excalidraw } from "@excalidraw/excalidraw";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { statusLabels, projectRolePermissions } from "@shared/schema";
import type { Adr, AdrComment, AdrVersion, Project, ProjectRequirement } from "@shared/schema";
import {
  ArrowLeft,
  Edit2,
  Printer,
  PenTool,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import type { ProjectMemberWithUser } from "@server/storage";

interface SavedDiagram {
  id: number;
  adrId: number;
  name: string;
  diagramData: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const requirementStatusIcons: Record<string, React.ReactNode> = {
  open: <Clock className="w-3.5 h-3.5 text-blue-500" />,
  in_progress: <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />,
  implemented: <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />,
  deferred: <XCircle className="w-3.5 h-3.5 text-muted-foreground" />,
};

const priorityColors: Record<string, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

function Section({ num, title, children }: Readonly<{ num: string; title: string; children: React.ReactNode }>) {
  return (
    <section className="space-y-3 print:break-inside-avoid">
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-light text-muted-foreground select-none">{num}</span>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="pl-9">{children}</div>
    </section>
  );
}

export default function AdrView() {
  const params = useParams<{ projectId: string; id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { projectId, id: adrId } = params;

  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const { data: members } = useQuery<ProjectMemberWithUser[]>({
    queryKey: ["/api/projects", projectId, "members"],
    enabled: !!projectId,
  });

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

  const { data: requirements = [] } = useQuery<ProjectRequirement[]>({
    queryKey: [`/api/projects/${projectId}/requirements`],
    enabled: !!projectId,
  });

  const { data: diagrams = [] } = useQuery<SavedDiagram[]>({
    queryKey: [`/api/projects/${projectId}/adrs/${adrId}/diagrams`],
    enabled: !!projectId && !!adrId,
  });

  if (isLoading) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!adr) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center py-20">
        <h2 className="text-lg font-semibold mb-2">ADR Not Found</h2>
        <Button onClick={() => navigate(`/projects/${projectId}`)}>Back to Project</Button>
      </div>
    );
  }

  const projectKey = project?.key ?? "ADR";
  const adrRef = `${projectKey}-${String(adr.adrNumber).padStart(3, "0")}`;
  const latestDiagram = diagrams[0];

  let diagramScene: any = null;
  if (latestDiagram) {
    try {
      diagramScene = JSON.parse(latestDiagram.diagramData);
    } catch {}
  }

  const frReqs = requirements.filter((r) => r.type === "functional");
  const nfrReqs = requirements.filter((r) => r.type === "non_functional");

  return (
    <div className="min-h-screen bg-muted/30 print:bg-white">
      {/* Toolbar - hidden when printing */}
      <div className="print:hidden sticky top-0 z-40 bg-background border-b px-6 py-2 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/projects/${projectId}/adrs/${adrId}`)}
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Detail
        </Button>
        <div className="flex items-center gap-2">
          {permissions.canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/projects/${projectId}/adrs/${adrId}/edit`)}
            >
              <Edit2 className="w-4 h-4 mr-1" />
              Edit
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/projects/${projectId}/adrs/${adrId}/diagram`)}
          >
            <PenTool className="w-4 h-4 mr-1" />
            Edit Diagram
          </Button>
          <Button size="sm" onClick={() => globalThis.print()}>
            <Printer className="w-4 h-4 mr-1" />
            Print / Export PDF
          </Button>
        </div>
      </div>

      {/* Document body */}
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-10 bg-background shadow-sm print:shadow-none print:px-0 print:py-4">

        {/* Document header */}
        <header className="space-y-4 pb-6 border-b-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-mono font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
              {adrRef}
            </span>
            <StatusBadge status={adr.status} />
            <span className="text-xs font-mono text-muted-foreground border rounded px-1.5 py-0.5">
              v{adr.version}
            </span>
            {adr.archived && (
              <span className="text-xs font-medium text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 rounded px-2 py-0.5">
                ARCHIVED
              </span>
            )}
          </div>

          <h1 className="text-3xl font-bold tracking-tight leading-tight">{adr.title}</h1>

          {/* Metadata table */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-sm mt-4">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Author</div>
              <div className="font-medium">{adr.author}</div>
            </div>
            {adr.team && (
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Team</div>
                <div className="font-medium">{adr.team}</div>
              </div>
            )}
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Created</div>
              <div className="font-medium">{new Date(adr.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Updated</div>
              <div className="font-medium">{new Date(adr.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
            </div>
            {project && (
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Project</div>
                <div className="font-medium">{project.name}</div>
              </div>
            )}
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Status</div>
              <div className="font-medium capitalize">{statusLabels[adr.status]}</div>
            </div>
          </div>

          {(adr.tags || []).length > 0 && (
            <div className="flex gap-1.5 flex-wrap mt-2">
              {(adr.tags || []).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {adr.archived && (
            <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-800 dark:text-amber-300">
              <strong>Note:</strong> This ADR has been archived. Reason: {adr.archiveReason || "Not specified"}
            </div>
          )}
        </header>

        {/* Sections */}
        <div className="space-y-10">

          <Section num="1" title="Context">
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">{adr.context}</p>
          </Section>

          <Separator />

          <Section num="2" title="Decision">
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">{adr.decision}</p>
          </Section>

          <Separator />

          <Section num="3" title="Consequences">
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">{adr.consequences}</p>
          </Section>

          {adr.alternatives && (
            <>
              <Separator />
              <Section num="4" title="Alternatives Considered">
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">{adr.alternatives}</p>
              </Section>
            </>
          )}

          {/* Architecture Diagram */}
          {diagramScene && (
            <>
              <Separator />
              <Section num={adr.alternatives ? "5" : "4"} title="Architecture Diagram">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">{latestDiagram.name}</p>
                  <div
                    className="border rounded-lg overflow-hidden"
                    style={{ height: "480px" }}
                  >
                    <Excalidraw
                      initialData={{
                        elements: diagramScene.elements ?? [],
                        appState: {
                          viewBackgroundColor: diagramScene.appState?.viewBackgroundColor ?? "#ffffff",
                        },
                        files: diagramScene.files ?? null,
                      }}
                      viewModeEnabled={true}
                      zenModeEnabled={false}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Last updated: {new Date(latestDiagram.updatedAt).toLocaleString()}
                    {diagrams.length > 1 && ` · ${diagrams.length} diagram(s) total`}
                  </p>
                </div>
              </Section>
            </>
          )}

          {/* Requirements */}
          {(frReqs.length > 0 || nfrReqs.length > 0) && (
            <>
              <Separator />
              <Section
                num={(() => {
                  let n = adr.alternatives ? 5 : 4;
                  if (diagramScene) n++;
                  return String(n);
                })()}
                title="Requirements"
              >
                <div className="space-y-5">
                  {frReqs.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                        Functional Requirements
                      </h3>
                      <div className="space-y-2">
                        {frReqs.map((req, i) => (
                          <div key={req.id} className="flex items-start gap-3 p-3 rounded-md border bg-muted/30">
                            <span className="text-xs font-mono text-muted-foreground mt-0.5 min-w-[2.5rem]">
                              FR-{String(i + 1).padStart(2, "0")}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium">{req.title}</span>
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${priorityColors[req.priority] ?? ""}`}>
                                  {req.priority}
                                </span>
                                <span className="flex items-center gap-1 text-xs text-muted-foreground capitalize">
                                  {requirementStatusIcons[req.status]}
                                  {req.status.replace("_", " ")}
                                </span>
                              </div>
                              {req.description && (
                                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{req.description}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {nfrReqs.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                        Non-Functional Requirements
                      </h3>
                      <div className="space-y-2">
                        {nfrReqs.map((req, i) => (
                          <div key={req.id} className="flex items-start gap-3 p-3 rounded-md border bg-muted/30">
                            <span className="text-xs font-mono text-muted-foreground mt-0.5 min-w-[2.5rem]">
                              NFR-{String(i + 1).padStart(2, "0")}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium">{req.title}</span>
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${priorityColors[req.priority] ?? ""}`}>
                                  {req.priority}
                                </span>
                                <span className="flex items-center gap-1 text-xs text-muted-foreground capitalize">
                                  {requirementStatusIcons[req.status]}
                                  {req.status.replace("_", " ")}
                                </span>
                              </div>
                              {req.description && (
                                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{req.description}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Section>
            </>
          )}

          {/* Version History */}
          {versions && versions.length > 0 && (
            <>
              <Separator />
              <Section
                num="—"
                title="Version History"
              >
                <div className="space-y-0">
                  {versions.map((v, idx) => (
                    <div key={v.id} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${idx === 0 ? "bg-primary" : "bg-border"}`} />
                        {idx < versions.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                      </div>
                      <div className="pb-4 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono font-semibold">v{v.version}</span>
                          <StatusBadge status={v.status} />
                          <span className="text-[11px] text-muted-foreground">
                            {v.changedBy} · {new Date(v.createdAt).toLocaleString()}
                          </span>
                        </div>
                        {v.changeReason && (
                          <p className="text-xs text-muted-foreground mt-0.5">{v.changeReason}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            </>
          )}

          {/* Comments */}
          {comments && comments.length > 0 && (
            <>
              <Separator />
              <Section num="—" title={`Discussion (${comments.length})`}>
                <div className="space-y-3">
                  {comments.map((c) => (
                    <div key={c.id} className="bg-muted/40 rounded-lg p-4">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
                            {c.author.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium">{c.author}</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(c.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed pl-8">{c.content}</p>
                    </div>
                  ))}
                </div>
              </Section>
            </>
          )}

        </div>

        {/* Document footer */}
        <footer className="pt-8 border-t text-xs text-muted-foreground flex items-center justify-between flex-wrap gap-2">
          <span>{adrRef} · {project?.name}</span>
          <span>Generated {new Date().toLocaleDateString()}</span>
        </footer>
      </div>
    </div>
  );
}
