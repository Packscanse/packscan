import type { PackageStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/lib/status";
import { cn } from "@/lib/utils";

const STATUS_CLASSES: Record<PackageStatus, string> = {
  LOGGED: "bg-muted text-muted-foreground",
  AWAITING_PICKUP: "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200",
  PICKED_UP: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200",
  PENDING_HANDOFF: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  HANDED_OFF: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200",
  CANCELLED: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
};

export function PackageStatusBadge({ status }: { status: PackageStatus }) {
  return (
    <Badge variant="secondary" className={cn("border-transparent", STATUS_CLASSES[status])}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
