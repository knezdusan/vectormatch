// Subscription Health Skeleton — loading fallback
// src/components/admin/SubscriptionHealthSkeleton.tsx

const SKELETON_ROWS = ["row-0", "row-1", "row-2", "row-3", "row-4"] as const;

export function SubscriptionHealthSkeleton() {
  return (
    <div className="space-y-3">
      <div className="divide-y divide-border rounded-lg border border-border">
        {SKELETON_ROWS.map((key) => (
          <div
            key={key}
            className="flex flex-col gap-2 px-4 py-3 animate-pulse"
          >
            <div className="flex items-center gap-2">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-5 w-16 rounded-full bg-muted" />
              <div className="h-5 w-20 rounded-md bg-muted" />
            </div>
            <div className="h-3 w-64 rounded bg-muted" />
            <div className="flex items-center gap-3">
              <div className="h-3 w-24 rounded bg-muted" />
              <div className="h-3 w-20 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
