import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
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
import { GitBranch } from "lucide-react";
import { useState, useMemo } from "react";
import type { Adr } from "@shared/schema";

export default function Timeline() {
  const [teamFilter, setTeamFilter] = useState("all");
  const { data: adrs, isLoading } = useQuery<Adr[]>({
    queryKey: ["/api/adrs"],
  });

  const teams = useMemo(() => {
    if (!adrs) return [];
    const set = new Set(adrs.map((a) => a.team).filter(Boolean));
    return Array.from(set) as string[];
  }, [adrs]);

  const sortedAdrs = useMemo(() => {
    if (!adrs) return [];
    const filtered = teamFilter === "all"
      ? adrs
      : adrs.filter((a) => a.team === teamFilter);
    return [...filtered].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [adrs, teamFilter]);

  const grouped = useMemo(() => {
    const groups: Record<string, typeof sortedAdrs> = {};
    sortedAdrs.forEach((adr) => {
      const month = new Date(adr.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
      });
      if (!groups[month]) groups[month] = [];
      groups[month].push(adr);
    });
    return groups;
  }, [sortedAdrs]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-timeline-title">
            Decision Timeline
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Chronological history of architecture decisions
          </p>
        </div>
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-timeline-team">
            <SelectValue placeholder="All Teams" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Teams</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {sortedAdrs.length === 0 ? (
        <div className="text-center py-16">
          <GitBranch className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No decisions to show</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([month, monthAdrs]) => (
            <div key={month}>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {month}
              </h2>
              <div className="relative pl-6 space-y-4">
                <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
                {monthAdrs.map((adr) => (
                  <Link key={adr.id} href={`/adrs/${adr.id}`}>
                    <div
                      className="relative cursor-pointer"
                      data-testid={`timeline-adr-${adr.id}`}
                    >
                      <div className="absolute -left-4 top-3 w-2.5 h-2.5 rounded-full bg-primary border-2 border-background" />
                      <Card className="hover-elevate">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs font-mono text-muted-foreground">
                              ADR-{String(adr.adrNumber).padStart(3, "0")}
                            </span>
                            <StatusBadge status={adr.status} />
                            {adr.team && (
                              <Badge variant="secondary" className="text-xs">{adr.team}</Badge>
                            )}
                          </div>
                          <h3 className="font-semibold text-sm">{adr.title}</h3>
                          <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                            <span>{adr.author}</span>
                            <span>-</span>
                            <span>{new Date(adr.createdAt).toLocaleDateString()}</span>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
