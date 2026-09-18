import { useEffect, useState, type ReactNode } from "react";
import { Copy, ExternalLink, Pencil, Phone, X } from "lucide-react";
import type { Installer, WorkOrder, WorkOrderEvent } from "../types";
import type { Actions } from "../hooks/useActions";
import { useEvents } from "../hooks/useData";
import { appUrl } from "../lib/api";
import { fmtDate, fmtDateTime, isOverdue, isUrl, mapsUrl, PRIORITY_LABEL, ref, siteText, telHref } from "../lib/format";
import { StatusBadge } from "./StatusBadge";
import { WorkOrderForm } from "./WorkOrderForm";
import { Button, useToast } from "./ui";

interface Props {
  wo: WorkOrder;
  installers: Installer[];
  actions: Actions;
  onClose: () => void;
  onChanged: () => void;
}

const EVENT_LABEL: Record<string, string> = {
  created: "Created",
  imported: "Imported",
  edited: "Edited",
  assigned: "Assigned",
  unassigned: "Unassigned",
  dispatched: "Job emailed",
  email_sent: "Email sent",
  email_failed: "Email failed",
  accepted: "Accepted",
  declined: "Declined",
  on_site: "On site",
  completed: "Marked done",
  verified: "Verified",
  recalled: "Recalled",
  cancelled: "Cancelled",
  reopened: "Reopened",
};

export function WorkOrderDrawer({ wo, installers, actions, onClose, onChanged }: Props) {
  const toast = useToast();
  const { events } = useEvents(wo.id);
  const [editing, setEditing] = useState(false);
  const busy = actions.busy.has(wo.id);
  const out = ["dispatched", "accepted", "on_site"].includes(wo.status);
  const maps = mapsUrl(wo.site_address, wo.district);
  const tel = telHref(wo.client_phone);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !editing && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, editing]);

  async function copyLink() {
    if (!wo.installer_token) return;
    const link = `${appUrl()}#/job/${wo.installer_token}`;
    try {
      await navigator.clipboard.writeText(link);
      toast("success", "Installer link copied — you can paste it into WhatsApp or SMS.");
    } catch {
      window.prompt("Copy the installer link:", link);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex justify-end z-40" onMouseDown={onClose}>
      <aside
        className="h-full w-full sm:max-w-md bg-surface border-l border-border flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
        aria-label={`Work order ${ref(wo.ref_no)}`}
      >
        <header className="px-5 pt-4 pb-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-muted">{ref(wo.ref_no)}</span>
              <StatusBadge status={wo.status} />
              {wo.priority !== "normal" && (
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                    wo.priority === "urgent" ? "bg-accent text-accent-ink" : "border border-border text-muted"
                  }`}
                >
                  {PRIORITY_LABEL[wo.priority]}
                </span>
              )}
            </div>
            <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <h2 className="font-display text-lg leading-snug">{wo.title}</h2>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
            <Row label="Job type">{wo.job_type}</Row>
            <Row label="Client">{wo.client_name}</Row>
            <Row label="Phone">
              {wo.client_phone && (
                <a href={tel ?? undefined} className="inline-flex items-center gap-1 text-accent hover:underline">
                  <Phone size={12} /> {wo.client_phone}
                </a>
              )}
            </Row>
            <Row label="Site">
              {(wo.site_address || wo.district) && (
                <span>
                  {siteText(wo.site_address, wo.district)}{" "}
                  {maps && (
                    <a href={maps} target="_blank" rel="noreferrer" className="text-accent inline-flex items-center gap-0.5 text-xs">
                      {isUrl(wo.site_address) ? "pinned location" : "map"} <ExternalLink size={10} />
                    </a>
                  )}
                </span>
              )}
            </Row>
            <Row label="Scheduled">
              {wo.scheduled_for && (
                <span className={isOverdue(wo.scheduled_for, wo.status) ? "text-[#e7877e]" : ""}>
                  {fmtDate(wo.scheduled_for)}
                  {isOverdue(wo.scheduled_for, wo.status) ? " · overdue" : ""}
                </span>
              )}
            </Row>
            <Row label="Installer">
              {wo.assignee ? (
                <span>
                  {wo.assignee.name} <span className="text-muted text-xs">{wo.assignee.email}</span>
                </span>
              ) : (
                <span className="text-muted">Not assigned</span>
              )}
            </Row>
            <Row label="Created">
              {fmtDateTime(wo.created_at)}
              {wo.source === "import" ? " · imported" : ""}
            </Row>
          </dl>

          {wo.description && (
            <div>
              <p className="text-xs text-muted mb-1">Notes for the installer</p>
              <p className="text-sm whitespace-pre-wrap bg-raised border border-border rounded-md px-3 py-2">{wo.description}</p>
            </div>
          )}

          {wo.completion_note && (
            <div>
              <p className="text-xs text-muted mb-1">Installer's completion note</p>
              <p className="text-sm whitespace-pre-wrap bg-status-completed/10 border border-status-completed/30 rounded-md px-3 py-2">
                {wo.completion_note}
              </p>
            </div>
          )}

          {wo.status === "unassigned" && wo.last_declined_by && (
            <p className="text-sm bg-accent/10 border border-accent/30 rounded-md px-3 py-2">
              Declined by <b>{wo.decliner?.name ?? "installer"}</b>
              {wo.last_decline_reason ? `: “${wo.last_decline_reason}”` : ""}. Pick someone else and email it again.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {wo.status === "unassigned" && wo.assigned_to && (
              <Button variant="primary" disabled={busy} onClick={() => actions.dispatch([wo])}>
                {busy ? "Sending…" : `Email job to ${wo.assignee?.name ?? "installer"}`}
              </Button>
            )}
            {wo.status === "completed" && (
              <Button variant="success" disabled={busy} onClick={() => actions.verify(wo)}>
                Mark verified
              </Button>
            )}
            {out && (
              <>
                <Button disabled={busy} onClick={() => actions.resend(wo)}>
                  Re-send email
                </Button>
                <Button onClick={copyLink}>
                  <Copy size={13} /> Copy installer link
                </Button>
                <Button variant="danger" onClick={() => actions.recall(wo)}>
                  Recall
                </Button>
              </>
            )}
            {wo.status === "cancelled" && (
              <Button disabled={busy} onClick={() => actions.reopen(wo)}>
                Reopen
              </Button>
            )}
            {!["verified", "cancelled"].includes(wo.status) && (
              <Button onClick={() => setEditing(true)}>
                <Pencil size={13} /> Edit
              </Button>
            )}
            {["unassigned", "dispatched", "accepted", "on_site"].includes(wo.status) && (
              <Button variant="ghost" onClick={() => actions.cancel(wo)}>
                Cancel job
              </Button>
            )}
            {["unassigned", "cancelled"].includes(wo.status) && (
              <Button variant="ghost" onClick={() => actions.remove(wo, onClose)}>
                Delete
              </Button>
            )}
          </div>

          <div>
            <h3 className="text-xs text-muted mb-2">History</h3>
            <ol className="space-y-3">
              {events.map((e) => (
                <EventItem key={e.id} e={e} />
              ))}
              {events.length === 0 && <li className="text-xs text-muted">Loading…</li>}
            </ol>
          </div>
        </div>
      </aside>

      {editing && (
        <div onMouseDown={(e) => e.stopPropagation()}>
          <WorkOrderForm existing={wo} installers={installers} onClose={() => setEditing(false)} onSaved={onChanged} />
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted text-xs pt-0.5">{label}</dt>
      <dd>{children || <span className="text-muted/60">—</span>}</dd>
    </>
  );
}

function EventItem({ e }: { e: WorkOrderEvent }) {
  const color =
    e.kind === "email_failed" || e.kind === "declined" || e.kind === "cancelled"
      ? "border-status-cancelled"
      : e.actor === "installer"
      ? "border-status-accepted"
      : "border-border";
  return (
    <li className={`border-l-2 ${color} pl-3`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm">
          {EVENT_LABEL[e.kind] ?? e.kind}
          {e.actor_name && <span className="text-muted text-xs"> · {e.actor_name}</span>}
        </span>
        <span className="text-[11px] text-muted font-mono whitespace-nowrap">{fmtDateTime(e.created_at)}</span>
      </div>
      {e.message && <p className="text-xs text-muted whitespace-pre-wrap mt-0.5">{e.message}</p>}
    </li>
  );
}
