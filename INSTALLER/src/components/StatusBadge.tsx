import type { WorkOrderStatus } from "../types";

const LABELS: Record<WorkOrderStatus, string> = {
  unassigned: "Unassigned",
  dispatched: "Dispatched",
  acknowledged: "Acknowledged",
  in_progress: "In progress",
  completed: "Completed",
  verified: "Verified",
  cancelled: "Cancelled",
};

const DOT: Record<WorkOrderStatus, string> = {
  unassigned: "bg-status-unassigned",
  dispatched: "bg-status-dispatched",
  acknowledged: "bg-status-acknowledged",
  in_progress: "bg-status-progress",
  completed: "bg-status-completed",
  verified: "bg-status-verified",
  cancelled: "bg-status-cancelled",
};

export function StatusBadge({ status }: { status: WorkOrderStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[status]}`} />
      {LABELS[status]}
    </span>
  );
}
