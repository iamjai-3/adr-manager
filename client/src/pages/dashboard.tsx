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
  ArrowRight,
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
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--muted))",
];

interface StatCardProps {
  readonly title: string;
  readonly value: string | number;
  readonly icon: React.ElementType;
  readonly description: string;
  readonly testId: string;
  readonly accent: "indigo" | "emerald" | "amber" | "red";
}

const accentStyles = {
  indigo: {
    border: "border-t-indigo-500",
    iconBg: "bg-indigo-50 dark:bg-indigo-950/40",
    icon: "text-indigo-600 dark:text-indigo-400",
    value: "text-foreground",
  },
  emerald: {
    border: "border-t-emerald-500",
    iconBg: "bg-emerald-50 dark:bg-emerald-950/40",
    icon: "text-emerald-600 dark:text-emerald-400",
    value: "text-foreground",
  },
  amber: {
    border: "border-t-amber-500",
    iconBg: "bg-amber-50 dark:bg-amber-950/40",
    icon: "text-amber-600 dark:text-amber-400",
    value: "text-foreground",
  },
  red: {
    border: "border-t-red-500",
    iconBg: "bg-red-50 dark:bg-red-950/40",
    icon: "text-red-600 dark:text-red-400",
    value: "text-foreground",
  },
};

function StatCard({ title, value, icon: Icon, description, testId, accent }: StatCardProps) {
  const style = accentStyles[accent];
  return (
    <Card className={`border-t-2 ${style.border} shadow-sm`} data-testid={testId}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2 pt-4 px-5">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {title}
        </CardTitle>
        <div className={`w-7 h-7 rounded-md ${style.iconBg} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`h-3.5 w-3.5 ${style.icon}`} />
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className={`text-3xl font-bold tracking-tight ${style.value}`} data-testid={`${testId}-value`}>
          {value}
        </div>
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

  const myProjectRole =
    user?.role === "admin"
      ? "admin"
      : (members?.find((m) => m.userId === user?.id)?.role ?? "viewer");
  const projectPermissions = projectRolePermissions[myProjectRole];

  if (projectLoading || adrsLoading) {
    return (
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div>
          <Skeleton className="h-7 w-56 mb-2" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 text-center py-20">
        <h2 className="text-base font-semibold mb-2">Project Not Found</h2>
        <Button size="sm" onClick={() => navigate("/projects")}>
          Back to Projects
        </Button>
      </div>
    );
  }

  const allAdrs = adrs || [];
  const totalAdrs = allAdrs.length;
  const accepted = allAdrs.filter((a) => a.status === "accepted").length;
  const inReview = allAdrs.filter(
    (a) => a.status === "in_review" || a.status === "proposed"
  ).length;
  const deprecated = allAdrs.filter(
    (a) => a.status === "deprecated" || a.status === "superseded"
  ).length;

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
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-mono text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
              {project.key}
            </span>
          </div>
          <h1
            className="text-xl font-bold tracking-tight"
            data-testid="text-dashboard-title"
          >
            {project.name}
          </h1>
          {project.description && (
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">{project.description}</p>
          )}
        </div>
        {projectPermissions.canCreate && (
          <Button asChild size="sm" data-testid="button-new-adr">
            <Link href={`/projects/${projectId}/adrs/new`}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New ADR
            </Link>
          </Button>
        )}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total ADRs"
          value={totalAdrs}
          icon={FileText}
          description="All decisions in this project"
          testId="stat-total"
          accent="indigo"
        />
        <StatCard
          title="Accepted"
          value={accepted}
          icon={CheckCircle2}
          description="Approved and in effect"
          testId="stat-accepted"
          accent="emerald"
        />
        <StatCard
          title="In Review"
          value={inReview}
          icon={Clock}
          description="Proposed or under review"
          testId="stat-in-review"
          accent="amber"
        />
        <StatCard
          title="Deprecated"
          value={deprecated}
          icon={AlertTriangle}
          description="No longer active"
          testId="stat-deprecated"
          accent="red"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5" />
              ADRs by Tag
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {barData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                No tagged ADRs yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={barData} margin={{ top: 4, right: 0, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                      boxShadow: "var(--shadow-md)",
                    }}
                    cursor={{ fill: "hsl(var(--muted))" }}
                  />
                  <Bar
                    dataKey="count"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <FileText className="w-3.5 h-3.5" />
              Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {pieData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                No ADRs yet
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="45%" height={180}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={72}
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
                        borderRadius: "8px",
                        fontSize: "12px",
                        boxShadow: "var(--shadow-md)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 flex-1 min-w-0">
                  {pieData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-2 text-xs">
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: PIE_COLORS[index % PIE_COLORS.length] }}
                      />
                      <span className="truncate text-muted-foreground capitalize">
                        {entry.name.replace("_", " ")}
                      </span>
                      <span className="ml-auto font-semibold tabular-nums">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent ADRs */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Recent ADRs
            </CardTitle>
            {totalAdrs > 5 && (
              <span className="text-xs text-muted-foreground">
                {totalAdrs - 5} more
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {recentAdrs.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                <FileText className="w-5 h-5 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium mb-1">No ADRs yet</p>
              <p className="text-xs text-muted-foreground mb-4">
                Start documenting architecture decisions
              </p>
              {projectPermissions.canCreate && (
                <Button asChild size="sm">
                  <Link href={`/projects/${projectId}/adrs/new`}>
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Create First ADR
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {recentAdrs.map((adr) => (
                <Link
                  key={adr.id}
                  href={`/projects/${projectId}/adrs/${adr.id}`}
                  data-testid={`adr-row-${adr.id}`}
                >
                  <div className="flex items-center gap-3 py-2.5 hover:bg-muted/40 -mx-1 px-1 rounded-md transition-colors cursor-pointer group">
                    <span className="text-[11px] font-mono text-muted-foreground w-16 flex-shrink-0 font-medium">
                      {project.key}-{String(adr.adrNumber).padStart(3, "0")}
                    </span>
                    <span className="text-sm font-medium truncate flex-1 group-hover:text-primary transition-colors">
                      {adr.title}
                    </span>
                    <StatusBadge status={adr.status} />
                    <span className="text-xs text-muted-foreground flex-shrink-0 hidden sm:block tabular-nums">
                      {new Date(adr.createdAt).toLocaleDateString()}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/0 group-hover:text-muted-foreground transition-all flex-shrink-0" />
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
