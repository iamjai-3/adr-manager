import { statusLabels } from "@shared/schema";
import { cn } from "@/lib/utils";

const statusConfig: Record<string, { pill: string; dot: string }> = {
  draft: {
    pill: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/70 dark:text-zinc-400",
    dot: "bg-zinc-400 dark:bg-zinc-500",
  },
  proposed: {
    pill: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400",
    dot: "bg-blue-500",
  },
  in_review: {
    pill: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  accepted: {
    pill: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  deprecated: {
    pill: "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-400",
    dot: "bg-red-500",
  },
  superseded: {
    pill: "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-400",
    dot: "bg-violet-500",
  },
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? {
    pill: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/70 dark:text-zinc-400",
    dot: "bg-zinc-400",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
        config.pill
      )}
      data-testid={`badge-status-${status}`}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", config.dot)} />
      {statusLabels[status] || status}
    </span>
  );
}
