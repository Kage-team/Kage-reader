import type { LucideIcon } from "lucide-react";
import { Check, Circle, Clock3, Download, FileWarning, LoaderCircle, XCircle } from "lucide-react";

export type StatusBadgeKind = "unread" | "in-progress" | "completed" | "queued" | "importing" | "failed" | "cancelled" | "cached";

const STATUS_CONFIG: Record<StatusBadgeKind, { label: string; icon: LucideIcon }> = {
  unread: { label: "Unread", icon: Circle },
  "in-progress": { label: "In progress", icon: Clock3 },
  completed: { label: "Completed", icon: Check },
  queued: { label: "Queued", icon: Clock3 },
  importing: { label: "Importing", icon: LoaderCircle },
  failed: { label: "Failed", icon: FileWarning },
  cancelled: { label: "Cancelled", icon: XCircle },
  cached: { label: "Cached", icon: Download },
};

export function StatusBadge({ status, className = "" }: { status: StatusBadgeKind; className?: string }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <span className={`semanticStatusBadge semanticStatusBadge--${status} ${className}`.trim()}>
      <Icon aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
}
