import { useState } from "react";
import type { Technician, WorkOrder, WorkOrderStatus } from "../types";
import { StatusBadge } from "./StatusBadge";
import { supabase } from "../lib/supabaseClient";

const PRIORITY_STYLE: Record<WorkOrder["priority"], string> = {
  urgent: "bg-accent text-accent-ink",
  normal: "bg-raised text-muted border border-border",
  low: "bg-transparent text-muted border border-border",
};

const STATUS_BORDER: Record<WorkOrderStatus, string> = {
  unassigned: "border-l-status-unassigned",
  dispatched: "border-l-status-dispatched",
  acknowledged: "border-l-status-acknowledged",
  in_progress: "border-l-status-progress",
  completed: "border-l-status-completed",
  verified: "border-l-status-verified",
  cancelled: "border-l-status-cancelled",
};

const CANCELLABLE: WorkOrderStatus[] = ["unassigned", "dispatched", "acknowledged", "in_progress"];

interface Props {
  workOrder: WorkOrder;
  technicians: Technician[];
  onOpenTimeline: (workOrderId: string) => void;
  onChanged: () => void;
}

export function WorkOrderCard({ workOrder, technicians, onOpenTimeline, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function assignTechnician(technicianId: string) {
    await supabase
      .from("work_orders")
      .update({ assigned_to: technicianId || null })
      .eq("id", workOrder.id);
    onChanged();
  }

  async function advance(newStatus: WorkOrderStatus) {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("advance_work_order", {
      p_work_order_id: workOrder.id,
      p_new_status: newStatus,
    });
    if (error) setError(error.message);
    setBusy(false);
    onChanged();
  }

  async function dispatch() {
    setBusy(true);
    setError(null);
    const { data: sessionData } = await supabase.auth.getSession();
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dispatch-work-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session?.access_token}`,
        },
        body: JSON.stringify({ work_order_id: workOrder.id }),
      });
      const json = await res.json();
      if (!json.ok) setError(json.error ?? "Dispatch failed");
    } catch {
      setError("Could not reach the dispatch function");
    }
    setBusy(false);
    onChanged();
  }

  return (
    <div
      className={`rounded-md border-l-4 ${STATUS_BORDER[workOrder.status]} bg-raised border border-border p-3 space-y-2 cursor-pointer hover:border-accent/40 transition-colors`}
      onClick={() => onOpenTimeline(workOrder.id)}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-sm font-medium leading-snug">{workOrder.title}</h3>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${PRIORITY_STYLE[workOrder.priority]}`}>
          {workOrder.priority}
        </span>
      </div>

      {workOrder.site_address && <p className="text-xs text-muted">{workOrder.site_address}</p>}

      <div className="flex items-center justify-between pt-1" onClick={(e) => e.stopPropagation()}>
        <select
          className="bg-surface border border-border rounded text-xs px-1.5 py-1 text-ink disabled:opacity-60"
          value={workOrder.assigned_to ?? ""}
          onChange={(e) => assignTechnician(e.target.value)}
          disabled={workOrder.status !== "unassigned"}
        >
          <option value="">Assign…</option>
          {technicians.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <StatusBadge status={workOrder.status} />
      </div>

      {workOrder.status === "unassigned" && workOrder.assigned_to && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            dispatch();
          }}
          disabled={busy}
          className="w-full rounded bg-accent text-accent-ink text-xs font-medium py-1.5 disabled:opacity-50"
        >
          {busy ? "Dispatching…" : "Dispatch"}
        </button>
      )}

      {workOrder.status === "completed" && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            advance("verified");
          }}
          disabled={busy}
          className="w-full rounded bg-status-verified/15 text-status-verified border border-status-verified/40 text-xs font-medium py-1.5 disabled:opacity-50"
        >
          Mark verified
        </button>
      )}

      {CANCELLABLE.includes(workOrder.status) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            advance("cancelled");
          }}
          className="text-[11px] text-muted"
        >
          Cancel
        </button>
      )}

      {error && <p className="text-[11px] text-status-cancelled">{error}</p>}
    </div>
  );
}
