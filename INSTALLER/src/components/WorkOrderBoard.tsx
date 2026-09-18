import type { Technician, WorkOrder, WorkOrderStatus } from "../types";
import { WorkOrderCard } from "./WorkOrderCard";

const COLUMNS: { key: WorkOrderStatus; label: string }[] = [
  { key: "unassigned", label: "Unassigned" },
  { key: "dispatched", label: "Dispatched" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
  { key: "verified", label: "Verified" },
];

interface Props {
  workOrders: WorkOrder[];
  technicians: Technician[];
  onOpenTimeline: (id: string) => void;
  onChanged: () => void;
}

export function WorkOrderBoard({ workOrders, technicians, onOpenTimeline, onChanged }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4">
      {COLUMNS.map((col) => {
        const items = workOrders.filter((w) => w.status === col.key);
        return (
          <div key={col.key} className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-medium text-muted">{col.label}</h2>
              <span className="text-[11px] text-muted">{items.length}</span>
            </div>
            <div className="space-y-2 min-h-[2rem]">
              {items.map((wo) => (
                <WorkOrderCard
                  key={wo.id}
                  workOrder={wo}
                  technicians={technicians}
                  onOpenTimeline={onOpenTimeline}
                  onChanged={onChanged}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
