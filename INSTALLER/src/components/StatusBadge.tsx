import type { WorkOrderStatus } from "../types";
import { STATUS_LABEL } from "../lib/format";

export const STATUS_DOT: Record<WorkOrderStatus, string> = {
  unassigned: "bg-status-unassigned",
  dispatched: "bg-status-dispatched",
  accepted: "bg-status-accepted",
  on_site: "bg-status-onsite",
  completed: "bg-status-completed",
  verified: "bg-status-verified",
  cancelled: "bg-status-cancelled",
};

export const STATUS_BORDER: Record<WorkOrderStatus, string> = {
  unassigned: "border-l-status-unassigned",
  dispatched: "border-l-status-dispatched",
  accepted: "border-l-status-accepted",
  on_site: "border-l-status-onsite",
  completed: "border-l-status-completed",
  verified: "border-l-status-verified",
  cancelled: "border-l-status-cancelled",
};

export function StatusBadge({ status }: { status: WorkOrderStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted whitespace-nowrap">
      <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}
