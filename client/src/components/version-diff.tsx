import { diffLines, Change } from "diff";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface VersionDiffProps {
  before: {
    version: string;
    title: string;
    context: string;
    decision: string;
    consequences: string;
    alternatives: string | null;
  };
  after: {
    version: string;
    title: string;
    context: string;
    decision: string;
    consequences: string;
    alternatives: string | null;
  };
}

function DiffSection({ label, before, after }: { label: string; before: string; after: string }) {
  const diff = diffLines(before, after);

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-muted-foreground">{label}</h4>
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Before</CardTitle>
          </CardHeader>
          <CardContent className="text-sm font-mono whitespace-pre-wrap">
            {diff.map((part: Change, idx: number) => {
              if (part.removed) {
                return (
                  <div key={idx} className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 -mx-3 px-3">
                    {part.value}
                  </div>
                );
              }
              if (!part.added) {
                return <span key={idx}>{part.value}</span>;
              }
              return null;
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">After</CardTitle>
          </CardHeader>
          <CardContent className="text-sm font-mono whitespace-pre-wrap">
            {diff.map((part: Change, idx: number) => {
              if (part.added) {
                return (
                  <div key={idx} className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 -mx-3 px-3">
                    {part.value}
                  </div>
                );
              }
              if (!part.removed) {
                return <span key={idx}>{part.value}</span>;
              }
              return null;
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function VersionDiff({ before, after }: VersionDiffProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Comparing <span className="font-mono font-semibold">{before.version}</span> → <span className="font-mono font-semibold">{after.version}</span>
        </div>
      </div>

      {before.title !== after.title && (
        <DiffSection label="Title" before={before.title} after={after.title} />
      )}

      {before.context !== after.context && (
        <DiffSection label="Context" before={before.context} after={after.context} />
      )}

      {before.decision !== after.decision && (
        <DiffSection label="Decision" before={before.decision} after={after.decision} />
      )}

      {before.consequences !== after.consequences && (
        <DiffSection label="Consequences" before={before.consequences} after={after.consequences} />
      )}

      {(before.alternatives || after.alternatives) && before.alternatives !== after.alternatives && (
        <DiffSection
          label="Alternatives"
          before={before.alternatives || "(none)"}
          after={after.alternatives || "(none)"}
        />
      )}

      {before.title === after.title &&
        before.context === after.context &&
        before.decision === after.decision &&
        before.consequences === after.consequences &&
        before.alternatives === after.alternatives && (
          <div className="text-center py-8 text-muted-foreground">
            No changes detected between these versions
          </div>
        )}
    </div>
  );
}
