import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Search as SearchIcon, SlidersHorizontal, ChevronRight, Sparkles, Loader2 } from "lucide-react";
import { statusLabels, tagOptions, teamOptions } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

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

interface AISearchResult extends SearchResult {
  score: number;
  explanation: string;
}

export default function SearchPage() {
  const [, setLocation] = useLocation();
  const urlParams = new URLSearchParams(globalThis.location.search);

  const [query, setQuery] = useState(urlParams.get("q") || "");
  const [statusFilter, setStatusFilter] = useState(urlParams.get("status") || "all");
  const [teamFilter, setTeamFilter] = useState(urlParams.get("team") || "all");
  const [tagFilter, setTagFilter] = useState(urlParams.get("tag") || "all");
  const [sortBy, setSortBy] = useState(urlParams.get("sort") || "newest");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const [aiMode, setAiMode] = useState(false);
  const [aiResults, setAiResults] = useState<AISearchResult[]>([]);
  const limit = 20;

  const { data: aiStatus } = useQuery<{ enabled: boolean; provider: string }>({
    queryKey: ["/api/ai/status"],
  });

  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (teamFilter !== "all") params.set("team", teamFilter);
    if (tagFilter !== "all") params.set("tag", tagFilter);
    if (sortBy !== "newest") params.set("sort", sortBy);
    const newSearch = params.toString();
    setLocation(newSearch ? `/search?${newSearch}` : "/search", { replace: true });
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
    enabled: !aiMode,
  });

  const aiSearchMutation = useMutation({
    mutationFn: async (q: string) => {
      const res = await apiRequest("POST", "/api/ai/search", { query: q });
      const data = await res.json() as { results: AISearchResult[] };
      return data.results;
    },
    onSuccess: (data) => {
      setAiResults(data);
    },
  });

  const handleAiSearch = () => {
    if (query.trim()) {
      setAiResults([]);
      aiSearchMutation.mutate(query);
    }
  };

  const isAIEnabled = aiStatus?.enabled ?? false;

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
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder={aiMode ? "Ask a natural language question, e.g. 'which decisions affect authentication?'" : "Search by title, context, decision, tags, author..."}
              className="pl-11 h-11 text-base"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && aiMode) handleAiSearch();
              }}
              autoFocus
              data-testid="input-search"
            />
          </div>

          {aiMode && (
            <Button
              onClick={handleAiSearch}
              disabled={!query.trim() || aiSearchMutation.isPending}
              className="h-11 gap-1.5 shrink-0"
            >
              {aiSearchMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Search
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {!aiMode && (
              <button
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover-elevate rounded-md px-2 py-1"
                onClick={() => setShowFilters(!showFilters)}
                data-testid="button-toggle-filters"
              >
                <SlidersHorizontal className="w-4 h-4" />
                Filters
              </button>
            )}
            {!aiMode && (statusFilter !== "all" || teamFilter !== "all" || tagFilter !== "all") && (
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

            {/* AI Search toggle */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <button
                      className={`flex items-center gap-1.5 text-sm rounded-md px-2 py-1 transition-colors ${
                        aiMode
                          ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                          : "text-muted-foreground hover-elevate"
                      } ${isAIEnabled ? "" : "opacity-40 cursor-not-allowed"}`}
                      onClick={() => {
                        if (!isAIEnabled) return;
                        setAiMode(!aiMode);
                        setAiResults([]);
                      }}
                      disabled={!isAIEnabled}
                    >
                      <Sparkles className="w-4 h-4" />
                      AI Search
                      {aiMode && <Badge className="ml-1 text-[10px] px-1 py-0 bg-violet-500">ON</Badge>}
                    </button>
                  </span>
                </TooltipTrigger>
                {!isAIEnabled && (
                  <TooltipContent>AI provider is not configured</TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>

          {!aiMode && (
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
          )}
        </div>

        {!aiMode && showFilters && (
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

        {/* AI mode hint */}
        {aiMode && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-violet-50 dark:bg-violet-900/20 text-sm text-violet-700 dark:text-violet-300">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>AI Search uses natural language. Ask questions like "which decisions affect the database?" or "find ADRs about security".</span>
          </div>
        )}
      </div>

      {/* Regular search results */}
      {!aiMode && (
        isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {results.length} result{results.length === 1 ? "" : "s"}
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
                            {result.team && <Badge variant="secondary" className="text-xs">{result.team}</Badge>}
                            <Badge variant="outline" className="text-xs">{result.projectName}</Badge>
                          </div>
                          <h3 className="font-semibold text-sm mb-1">{result.title}</h3>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {result.context.slice(0, 200)}
                          </p>
                          {(result.tags || []).length > 0 && (
                            <div className="flex gap-1 mt-2 flex-wrap">
                              {(result.tags || []).slice(0, 5).map((tag) => (
                                <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">{tag}</Badge>
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
                      <Button variant="outline" onClick={() => setPage(page - 1)}>Previous</Button>
                    )}
                    <Button variant="outline" onClick={() => setPage(page + 1)}>
                      Next <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )
      )}

      {/* AI search results */}
      {aiMode && (
        <>
          {aiSearchMutation.isPending && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
            </div>
          )}

          {!aiSearchMutation.isPending && aiResults.length === 0 && aiSearchMutation.isSuccess && (
            <div className="text-center py-16">
              <SearchIcon className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No relevant ADRs found for your question.</p>
            </div>
          )}

          {!aiSearchMutation.isPending && !aiSearchMutation.isSuccess && !aiSearchMutation.isPending && (
            <div className="text-center py-16 text-muted-foreground">
              <Sparkles className="w-10 h-10 mx-auto opacity-30 mb-3" />
              <p className="text-sm">Ask a question and click Search to find relevant ADRs.</p>
            </div>
          )}

          {aiResults.length > 0 && (
            <>
              <p className="text-sm text-muted-foreground">
                {aiResults.length} AI-ranked result{aiResults.length === 1 ? "" : "s"} for &quot;{query}&quot;
              </p>
              <div className="space-y-3">
                {aiResults.map((result) => (
                  <Link key={result.id} href={`/projects/${result.projectId}/adrs/${result.id}`}>
                    <Card className="cursor-pointer hover-elevate">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <span className="text-xs font-mono text-muted-foreground">
                                {result.projectKey}-{String(result.adrNumber).padStart(3, "0")}
                              </span>
                              <StatusBadge status={result.status} />
                              {result.team && <Badge variant="secondary" className="text-xs">{result.team}</Badge>}
                              <Badge variant="outline" className="text-xs">{result.projectName}</Badge>
                            </div>
                            <h3 className="font-semibold text-sm mb-1">{result.title}</h3>
                            <p className="text-xs text-violet-600 dark:text-violet-400 italic">
                              {result.explanation}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-xs text-muted-foreground mb-0.5">Relevance</div>
                            <div className="text-sm font-bold text-violet-600 dark:text-violet-400">
                              {Math.round(result.score * 100)}%
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
              <div className="flex items-center justify-center gap-2 mt-2">
                <Badge variant="outline" className="text-xs">
                  Powered by {aiStatus?.provider ?? "AI"}
                </Badge>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
