import { AlertTriangle, CalendarDays, MapPin, Send, User } from "lucide-react";
import type { Installer, WorkOrder } from "../types";
import type { Actions } from "../hooks/useActions";
import { fmtDate, isOverdue, ref, timeAgo } from "../lib/format";
import { STATUS_BORDER } from "./StatusBadge";
import { Button } from "./ui";

interface Props {
  wo: WorkOrder;
  installers: Installer[];
  actions: Actions;
  onOpen: (id: string) => void;
}

function sinceLabel(wo: WorkOrder): string | null {
  switch (wo.status) {
    case "dispatched":
      return `emailed ${timeAgo(wo.dispatched_at)}`;
    case "accepted":
      return `accepted ${timeAgo(wo.accepted_at)}`;
    case "on_site":
      return `on site ${timeAgo(wo.on_site_at)}`;
    case "completed":
      return `done ${timeAgo(wo.completed_at)}`;
    case "verified":
      return `verified ${timeAgo(wo.verified_at)}`;
    case "cancelled":
      return `cancelled ${timeAgo(wo.cancelled_at)}`;
    default:
      return null;
  }
}

export function WorkOrderCard({ wo, installers, actions, onOpen }: Props) {
  const busy = actions.busy.has(wo.id);
  const overdue = isOverdue(wo.scheduled_for, wo.status);
  const where = [wo.district, wo.site_address].filter(Boolean)[0];
  const stale = wo.status === "dispatched" && wo.dispatched_at && Date.now() - new Date(wo.dispatched_at).getTime() > 4 * 3600e3;

  return (
    <div
      className={`rounded-md border-l-4 ${STATUS_BORDER[wo.status]} bg-raised border border-border p-3 space-y-2 cursor-pointer hover:border-muted/60 transition-colors`}
      onClick={() => onOpen(wo.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen(wo.id)}
    >
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-mono text-muted">{ref(wo.ref_no)}</span>
        <span className="flex items-center gap-1">
          {overdue && <span className="rounded px-1.5 py-0.5 bg-status-cancelled/20 text-[#e7877e]">overdue</span>}
          {wo.priority !== "normal" && (
            <span
              className={`rounded px-1.5 py-0.5 font-medium ${
                wo.priority === "urgent" ? "bg-accent text-accent-ink" : "border border-border text-muted"
              }`}
            >
              {wo.priority}
            </span>
          )}
        </span>
      </div>

      <h3 className="font-display text-sm font-medium leading-snug">{wo.title}</h3>

      <div className="space-y-0.5 text-xs text-muted">
        {wo.client_name && (
          <p className="flex items-center gap-1.5 truncate">
            <User size={12} className="shrink-0" /> {wo.client_name}
          </p>
        )}
        {where && (
          <p className="flex items-center gap-1.5 truncate">
            <MapPin size={12} className="shrink-0" /> {where}
          </p>
        )}
        {wo.scheduled_for && (
          <p className={`flex items-center gap-1.5 ${overdue ? "text-[#e7877e]" : ""}`}>
            <CalendarDays size={12} className="shrink-0" /> {fmtDate(wo.scheduled_for)}
          </p>
        )}
      </div>

      {wo.status === "unassigned" && wo.last_declined_by && (
        <p className="flex items-start gap-1.5 text-[11px] text-[#e7b36e] bg-accent/10 rounded px-2 py-1">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <span>
            Declined by {wo.decliner?.name ?? "installer"}
            {wo.last_decline_reason ? `: “${wo.last_decline_reason}”` : ""}
          </span>
        </p>
      )}

      {wo.status === "unassigned" ? (
        <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
          <select
            className="flex-1 min-w-0 bg-surface border border-border rounded text-xs px-1.5 py-1.5 text-ink"
            value={wo.assigned_to ?? ""}
            onChange={(e) => actions.assign(wo, e.target.value || null)}
            aria-label="Assign installer"
          >
            <option value="">Assign…</option>
            {installers
              .filter((i) => i.active || i.id === wo.assigned_to)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
          </select>
          {wo.assigned_to && (
            <Button size="sm" variant="primary" disabled={busy} onClick={() => actions.dispatch([wo])}>
              <Send size={12} /> {busy ? "Sending" : "Email"}
            </Button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted pt-1">
          <span className="truncate text-ink/90">{wo.assignee?.name ?? "—"}</span>
          <span className={`whitespace-nowrap ${stale ? "text-[#e7b36e]" : ""}`} title={stale ? "No reply yet" : ""}>
            {sinceLabel(wo)}
          </span>
        </div>
      )}

      {wo.status === "completed" && (
        <div onClick={(e) => e.stopPropagation()} className="space-y-2">
          {wo.completion_note && <p className="text-[11px] text-muted italic line-clamp-2">“{wo.completion_note}”</p>}
          <Button size="sm" variant="success" className="w-full" disabled={busy} onClick={() => actions.verify(wo)}>
            Mark verified
          </Button>
        </div>
      )}
    </div>
  );
}
