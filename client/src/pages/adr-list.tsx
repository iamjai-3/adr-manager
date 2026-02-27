import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, FileText, Search, ArrowUpRight } from "lucide-react";
import { useState, useMemo } from "react";
import type { Adr } from "@shared/schema";
import { statusLabels, rolePermissions } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";

export default function AdrList() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const permissions = rolePermissions[user?.role || "viewer"];
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");

  const { data: adrs, isLoading } = useQuery<Adr[]>({
    queryKey: ["/api/adrs"],
  });

  const filteredAdrs = useMemo(() => {
    if (!adrs) return [];
    return adrs.filter((adr) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matches =
          adr.title.toLowerCase().includes(q) ||
          adr.context.toLowerCase().includes(q) ||
          adr.decision.toLowerCase().includes(q) ||
          (adr.tags || []).some((t) => t.toLowerCase().includes(q));
        if (!matches) return false;
      }
      if (statusFilter !== "all" && adr.status !== statusFilter) return false;
      if (teamFilter !== "all" && adr.team !== teamFilter) return false;
      return true;
    });
  }, [adrs, searchQuery, statusFilter, teamFilter]);

  const teams = useMemo(() => {
    if (!adrs) return [];
    const set = new Set(adrs.map((a) => a.team).filter(Boolean));
    return Array.from(set) as string[];
  }, [adrs]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="flex gap-2.5 flex-wrap">
          <Skeleton className="h-9 w-60" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight" data-testid="text-adr-list-title">
            Architecture Decision Records
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {filteredAdrs.length} of {adrs?.length || 0} decisions
          </p>
        </div>
        {permissions.canCreate && (
          <Button size="sm" onClick={() => navigate("/adrs/new")} data-testid="button-create-adr">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New ADR
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2.5 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search decisions..."
            className="pl-9 h-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-9 text-sm" data-testid="select-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(statusLabels).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger className="w-[140px] h-9 text-sm" data-testid="select-team-filter">
            <SelectValue placeholder="Team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Teams</SelectItem>
            {teams.map((team) => (
              <SelectItem key={team} value={team}>
                {team}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredAdrs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <FileText className="w-7 h-7 text-muted-foreground/50" />
          </div>
          <h3 className="text-sm font-semibold mb-1">No decisions found</h3>
          <p className="text-sm text-muted-foreground mb-5">
            {searchQuery || statusFilter !== "all" || teamFilter !== "all"
              ? "Try adjusting your filters"
              : "Create your first architecture decision record"}
          </p>
          {permissions.canCreate && !searchQuery && statusFilter === "all" && teamFilter === "all" && (
            <Button size="sm" onClick={() => navigate("/adrs/new")} data-testid="button-create-first-adr">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Create First ADR
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredAdrs.map((adr) => (
            <Link key={adr.id} href={`/adrs/${adr.id}`}>
              <Card
                className="cursor-pointer hover:shadow-md transition-all duration-150 hover:-translate-y-px shadow-sm group"
                data-testid={`card-adr-${adr.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-[10px] font-mono text-muted-foreground font-semibold bg-muted px-1.5 py-0.5 rounded">
                          ADR-{String(adr.adrNumber).padStart(3, "0")}
                        </span>
                        <StatusBadge status={adr.status} />
                        {adr.team && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
                            {adr.team}
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-semibold text-sm mb-1.5 group-hover:text-primary transition-colors">
                        {adr.title}
                      </h3>
                      <p className="text-xs text-muted-foreground line-clamp-1 leading-relaxed">
                        {adr.context}
                      </p>
                      {(adr.tags || []).length > 0 && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {(adr.tags || []).slice(0, 4).map((tag) => (
                            <span
                              key={tag}
                              className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium"
                            >
                              {tag}
                            </span>
                          ))}
                          {(adr.tags || []).length > 4 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{(adr.tags || []).length - 4} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0 space-y-0.5">
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {new Date(adr.createdAt).toLocaleDateString()}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        by {adr.author}
                      </p>
                      <p className="text-[10px] font-mono text-muted-foreground/60">
                        v{adr.version}
                      </p>
                      <ArrowUpRight className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground transition-all ml-auto" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
