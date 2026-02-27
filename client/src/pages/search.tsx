import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search as SearchIcon, SlidersHorizontal, ChevronRight } from "lucide-react";
import { statusLabels, tagOptions, teamOptions } from "@shared/schema";

interface SearchResult {
  id: number;
  adrNumber: number;
  title: string;
  status: string;
  context: string;
  decision: string;
  consequences: string;
  team: string;
  tags: string[] | null;
  author: string;
  createdAt: Date;
  updatedAt: Date;
  projectId: number;
  projectKey: string;
  projectName: string;
}

export default function SearchPage() {
  const [location, setLocation] = useLocation();
  const urlParams = new URLSearchParams(window.location.search);
  
  const [query, setQuery] = useState(urlParams.get("q") || "");
  const [statusFilter, setStatusFilter] = useState(urlParams.get("status") || "all");
  const [teamFilter, setTeamFilter] = useState(urlParams.get("team") || "all");
  const [tagFilter, setTagFilter] = useState(urlParams.get("tag") || "all");
  const [sortBy, setSortBy] = useState(urlParams.get("sort") || "newest");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const limit = 20;

  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (teamFilter !== "all") params.set("team", teamFilter);
    if (tagFilter !== "all") params.set("tag", tagFilter);
    if (sortBy !== "newest") params.set("sort", sortBy);
    const newSearch = params.toString();
    if (newSearch) {
      setLocation(`/search?${newSearch}`, { replace: true });
    } else {
      setLocation("/search", { replace: true });
    }
  }, [query, statusFilter, teamFilter, tagFilter, sortBy, setLocation]);

  const searchParams = new URLSearchParams();
  if (query) searchParams.set("q", query);
  if (statusFilter !== "all") searchParams.set("status", statusFilter);
  if (teamFilter !== "all") searchParams.set("team", teamFilter);
  if (tagFilter !== "all") searchParams.set("tag", tagFilter);
  searchParams.set("sort", sortBy);
  searchParams.set("limit", String(limit));
  searchParams.set("offset", String(page * limit));

  const { data: results = [], isLoading } = useQuery<SearchResult[]>({
    queryKey: ["/api/search", searchParams.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/search?${searchParams.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-search-title">
          Search Decisions
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Find architecture decisions across your organization
        </p>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Search by title, context, decision, tags, author..."
            className="pl-11 h-11 text-base"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            data-testid="input-search"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover-elevate rounded-md px-2 py-1"
              onClick={() => setShowFilters(!showFilters)}
              data-testid="button-toggle-filters"
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filters
            </button>
            {(statusFilter !== "all" || teamFilter !== "all" || tagFilter !== "all") && (
              <button
                className="text-xs text-primary"
                onClick={() => {
                  setStatusFilter("all");
                  setTeamFilter("all");
                  setTagFilter("all");
                  setPage(0);
                }}
                data-testid="button-clear-filters"
              >
                Clear all
              </button>
            )}
          </div>
          <Select value={sortBy} onValueChange={(v) => { setSortBy(v); setPage(0); }}>
            <SelectTrigger className="w-[150px]" data-testid="select-sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="title">Title A-Z</SelectItem>
              <SelectItem value="relevance">Most Relevant</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {showFilters && (
          <div className="flex gap-3 flex-wrap p-3 bg-muted/50 rounded-md">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[150px]" data-testid="select-filter-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(statusLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={teamFilter} onValueChange={(v) => { setTeamFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[150px]" data-testid="select-filter-team">
                <SelectValue placeholder="Team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teams</SelectItem>
                {teamOptions.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={tagFilter} onValueChange={(v) => { setTagFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[150px]" data-testid="select-filter-tag">
                <SelectValue placeholder="Tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tags</SelectItem>
                {tagOptions.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {results.length} result{results.length !== 1 ? "s" : ""}
            {query && ` for "${query}"`}
          </p>
          {results.length === 0 ? (
            <div className="text-center py-16">
              <SearchIcon className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {query ? "No decisions match your search" : "Type something to start searching"}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {results.map((result) => (
                  <Link key={result.id} href={`/projects/${result.projectId}/adrs/${result.id}`}>
                    <Card className="cursor-pointer hover-elevate" data-testid={`result-adr-${result.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="text-xs font-mono text-muted-foreground">
                            {result.projectKey}-{String(result.adrNumber).padStart(3, "0")}
                          </span>
                          <StatusBadge status={result.status} />
                          {result.team && (
                            <Badge variant="secondary" className="text-xs">{result.team}</Badge>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {result.projectName}
                          </Badge>
                        </div>
                        <h3 className="font-semibold text-sm mb-1">{result.title}</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {result.context.slice(0, 200)}
                        </p>
                        {(result.tags || []).length > 0 && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {(result.tags || []).slice(0, 5).map((tag) => (
                              <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
              {results.length === limit && (
                <div className="flex justify-center gap-2 mt-4">
                  {page > 0 && (
                    <Button variant="outline" onClick={() => setPage(page - 1)}>
                      Previous
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setPage(page + 1)}>
                    Next <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
