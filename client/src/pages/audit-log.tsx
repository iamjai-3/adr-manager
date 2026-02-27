import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shield, Filter } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import type { AuditLog } from "@shared/schema";

const entityTypeLabels: Record<string, string> = {
  adr: "ADR",
  project: "Project",
  project_member: "Member",
  user: "User",
};

const actionLabels: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  deleted: "Deleted",
  status_changed: "Status Changed",
  archived: "Archived",
  added: "Added",
  removed: "Removed",
  role_updated: "Role Updated",
};

const actionColors: Record<string, string> = {
  created: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  updated: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  deleted: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  status_changed: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  archived: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  added: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  removed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  role_updated: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

export default function AuditLog() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  if (user?.role !== "admin") {
    navigate("/");
    return null;
  }

  const queryParams = new URLSearchParams();
  if (entityTypeFilter !== "all") queryParams.set("entityType", entityTypeFilter);
  if (actionFilter !== "all") queryParams.set("action", actionFilter);
  queryParams.set("limit", "100");

  const { data: logs, isLoading } = useQuery<AuditLog[]>({
    queryKey: ["/api/audit-logs", `?${queryParams.toString()}`],
  });

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
          <Shield className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold tracking-tight" data-testid="text-page-title">
              Audit Trail
            </h1>
            <p className="text-sm text-muted-foreground">
              System activity log - all actions are recorded immutably
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          data-testid="button-toggle-filters"
        >
          <Filter className="w-4 h-4 mr-2" />
          Filters
        </Button>
      </div>

      {showFilters && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-3 flex-wrap">
              <div className="space-y-2">
                <label className="text-sm font-medium">Entity Type</label>
                <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
                  <SelectTrigger className="w-[150px]" data-testid="select-entity-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="adr">ADR</SelectItem>
                    <SelectItem value="project">Project</SelectItem>
                    <SelectItem value="project_member">Member</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Action</label>
                <Select value={actionFilter} onValueChange={setActionFilter}>
                  <SelectTrigger className="w-[150px]" data-testid="select-action">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Actions</SelectItem>
                    <SelectItem value="created">Created</SelectItem>
                    <SelectItem value="updated">Updated</SelectItem>
                    <SelectItem value="deleted">Deleted</SelectItem>
                    <SelectItem value="status_changed">Status Changed</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                    <SelectItem value="added">Added</SelectItem>
                    <SelectItem value="removed">Removed</SelectItem>
                    <SelectItem value="role_updated">Role Updated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(entityTypeFilter !== "all" || actionFilter !== "all") && (
                <div className="flex items-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEntityTypeFilter("all");
                      setActionFilter("all");
                    }}
                    data-testid="button-clear-filters"
                  >
                    Clear
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            Activity Log ({logs?.length || 0} entries)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!logs || logs.length === 0 ? (
            <div className="text-center py-10">
              <Shield className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No audit logs found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-3 rounded-md border hover:bg-muted/50 transition-colors"
                  data-testid={`audit-log-${log.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge
                        variant="outline"
                        className="text-xs font-mono"
                      >
                        {entityTypeLabels[log.entityType] || log.entityType}
                      </Badge>
                      <Badge
                        className={`text-xs ${actionColors[log.action] || "bg-gray-100 text-gray-700"}`}
                      >
                        {actionLabels[log.action] || log.action}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-mono">
                        #{log.entityId}
                      </span>
                    </div>
                    <p className="text-sm">
                      <span className="font-medium">{log.performedBy}</span>
                      {" "}
                      {log.action === "created" && "created"}
                      {log.action === "updated" && "updated"}
                      {log.action === "deleted" && "deleted"}
                      {log.action === "status_changed" && "changed status of"}
                      {log.action === "archived" && "archived"}
                      {log.action === "added" && "added"}
                      {log.action === "removed" && "removed"}
                      {log.action === "role_updated" && "updated role of"}
                      {" "}
                      {log.entityType === "adr" && "an ADR"}
                      {log.entityType === "project" && "a project"}
                      {log.entityType === "project_member" && "a project member"}
                      {log.entityType === "user" && "a user"}
                    </p>
                    {log.changes && (
                      <pre className="text-xs text-muted-foreground mt-1 font-mono bg-muted/30 p-2 rounded overflow-x-auto">
                        {JSON.stringify(JSON.parse(log.changes), null, 2)}
                      </pre>
                    )}
                    {log.metadata && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {JSON.stringify(JSON.parse(log.metadata))}
                      </p>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(log.performedAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
