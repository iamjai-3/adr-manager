import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
  Plus,
} from "lucide-react";
import type { Adr, Project } from "@shared/schema";
import { projectRolePermissions } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import type { ProjectMemberWithUser } from "@server/storage";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const PIE_COLORS = [
  "hsl(var(--muted))",
  "hsl(217, 91%, 60%)",
  "hsl(38, 92%, 50%)",
  "hsl(142, 76%, 36%)",
  "hsl(0, 84%, 60%)",
  "hsl(280, 87%, 47%)",
];

interface StatCardProps {
  readonly title: string;
  readonly value: string | number;
  readonly icon: React.ElementType;
  readonly description: string;
  readonly testId: string;
}

function StatCard({ title, value, icon: Icon, description, testId }: StatCardProps) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid={`${testId}-value`}>{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const params = useParams<{ projectId: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const projectId = params.projectId;

  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const { data: adrs, isLoading: adrsLoading } = useQuery<Adr[]>({
    queryKey: ["/api/projects", projectId, "adrs"],
    enabled: !!projectId,
  });

  const { data: members } = useQuery<ProjectMemberWithUser[]>({
    queryKey: ["/api/projects", projectId, "members"],
    enabled: !!projectId,
  });

  // Resolve effective project role for permission gating
  const myProjectRole = user?.role === "admin"
    ? "admin"
    : (members?.find((m) => m.userId === user?.id)?.role ?? "viewer");
  const projectPermissions = projectRolePermissions[myProjectRole];

  if (projectLoading || adrsLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 text-center py-20">
        <h2 className="text-lg font-semibold mb-2">Project Not Found</h2>
        <Button onClick={() => navigate("/projects")}>Back to Projects</Button>
      </div>
    );
  }

  const allAdrs = adrs || [];
  const totalAdrs = allAdrs.length;
  const accepted = allAdrs.filter((a) => a.status === "accepted").length;
  const inReview = allAdrs.filter((a) => a.status === "in_review" || a.status === "proposed").length;
  const deprecated = allAdrs.filter((a) => a.status === "deprecated" || a.status === "superseded").length;

  const statusCounts: Record<string, number> = {};
  allAdrs.forEach((a) => {
    statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
  });

  const pieData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

  const tagCounts: Record<string, number> = {};
  allAdrs.forEach((a) => {
    (a.tags || []).forEach((tag) => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });
  const barData = Object.entries(tagCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const recentAdrs = [...allAdrs]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="font-mono text-xs">{project.key}</Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-dashboard-title">
            {project.name}
          </h1>
          {project.description && (
            <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
          )}
        </div>
        {projectPermissions.canCreate && (
          <Button asChild data-testid="button-new-adr">
            <Link href={`/projects/${projectId}/adrs/new`}>
              <Plus className="w-4 h-4 mr-2" />
              New ADR
            </Link>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total ADRs"
          value={totalAdrs}
          icon={FileText}
          description="All decisions in this project"
          testId="stat-total"
        />
        <StatCard
          title="Accepted"
          value={accepted}
          icon={CheckCircle2}
          description="Approved and in effect"
          testId="stat-accepted"
        />
        <StatCard
          title="In Review"
          value={inReview}
          icon={Clock}
          description="Proposed or under review"
          testId="stat-in-review"
        />
        <StatCard
          title="Deprecated"
          value={deprecated}
          icon={AlertTriangle}
          description="No longer active"
          testId="stat-deprecated"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              ADRs by Tag
            </CardTitle>
          </CardHeader>
          <CardContent>
            {barData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                No tagged ADRs yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={barData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                No ADRs yet
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={180}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px",
                        fontSize: "12px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 flex-1 min-w-0">
                  {pieData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-2 text-xs">
                      <div
                        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ background: PIE_COLORS[index % PIE_COLORS.length] }}
                      />
                      <span className="truncate text-muted-foreground capitalize">
                        {entry.name.replace("_", " ")}
                      </span>
                      <span className="ml-auto font-medium">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Recent ADRs</CardTitle>
            {totalAdrs > 5 && (
              <span className="text-xs text-muted-foreground">
                Showing 5 of {totalAdrs}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {recentAdrs.length === 0 ? (
            <div className="text-center py-10">
              <FileText className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-3">No ADRs in this project yet</p>
              {projectPermissions.canCreate && (
                <Button asChild size="sm">
                  <Link href={`/projects/${projectId}/adrs/new`}>
                    <Plus className="w-4 h-4 mr-1" />
                    Create First ADR
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {recentAdrs.map((adr) => (
                <Link
                  key={adr.id}
                  href={`/projects/${projectId}/adrs/${adr.id}`}
                  data-testid={`adr-row-${adr.id}`}
                >
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-muted/50 transition-colors cursor-pointer">
                    <span className="text-xs font-mono text-muted-foreground w-16 flex-shrink-0">
                      {project.key}-{String(adr.adrNumber).padStart(3, "0")}
                    </span>
                    <span className="text-sm font-medium truncate flex-1">{adr.title}</span>
                    <StatusBadge status={adr.status} />
                    <span className="text-xs text-muted-foreground flex-shrink-0 hidden sm:block">
                      {new Date(adr.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
