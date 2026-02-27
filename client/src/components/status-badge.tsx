import { Badge } from "@/components/ui/badge";
import { statusLabels } from "@shared/schema";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  proposed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  in_review: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  accepted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  deprecated: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  superseded: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={`${statusColors[status] || ""} border-transparent text-xs font-medium`}
      data-testid={`badge-status-${status}`}
    >
      {statusLabels[status] || status}
    </Badge>
  );
}
