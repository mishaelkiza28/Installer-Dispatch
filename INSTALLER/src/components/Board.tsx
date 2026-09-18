import { useMemo, useState } from "react";
import { Search, Send } from "lucide-react";
import type { Installer, WorkOrder, WorkOrderStatus } from "../types";
import type { Actions } from "../hooks/useActions";
import { isOverdue, ref } from "../lib/format";
import { STATUS_DOT } from "./StatusBadge";
import { WorkOrderCard } from "./WorkOrderCard";
import { Button, Input, Select } from "./ui";

const COLUMNS: { key: WorkOrderStatus; statuses: WorkOrderStatus[]; label: string; hint: string }[] = [
  { key: "unassigned", statuses: ["unassigned"], label: "Unassigned", hint: "Assign an installer, then email the job" },
  { key: "dispatched", statuses: ["dispatched"], label: "Emailed", hint: "Waiting for the installer to accept" },
  { key: "accepted", statuses: ["accepted", "on_site"], label: "Accepted / on site", hint: "Installer has the job" },
  { key: "completed", statuses: ["completed"], label: "Done", hint: "Check the work, then verify" },
  { key: "verified", statuses: ["verified"], label: "Verified", hint: "Closed" },
];

const VERIFIED_LIMIT = 25;

interface Props {
  workOrders: WorkOrder[];
  installers: Installer[];
  actions: Actions;
  onOpen: (id: string) => void;
}

export function Board({ workOrders, installers, actions, onOpen }: Props) {
  const [query, setQuery] = useState("");
  const [installerFilter, setInstallerFilter] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [showAllVerified, setShowAllVerified] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workOrders.filter((w) => {
      if (installerFilter && w.assigned_to !== installerFilter) return false;
      if (!q) return true;
      return [ref(w.ref_no), w.title, w.client_name, w.client_phone, w.site_address, w.district, w.job_type, w.assignee?.name]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q));
    });
  }, [workOrders, query, installerFilter]);

  const byStatus = useMemo(() => {
    const m = new Map<WorkOrderStatus, WorkOrder[]>();
    for (const w of filtered) {
      const list = m.get(w.status) ?? [];
      list.push(w);
      m.set(w.status, list);
    }
    // Most urgent first, then by scheduled date, then newest
    const prio = { urgent: 0, normal: 1, low: 2 };
    for (const [k, list] of m) {
      if (k === "verified" || k === "cancelled") {
        const at = k === "verified" ? "verified_at" : "cancelled_at";
        list.sort((a, b) => (b[at] ?? "").localeCompare(a[at] ?? ""));
        continue;
      }
      list.sort(
        (a, b) =>
          prio[a.priority] - prio[b.priority] ||
          (a.scheduled_for ?? "9999").localeCompare(b.scheduled_for ?? "9999") ||
          b.created_at.localeCompare(a.created_at),
      );
    }
    return m;
  }, [filtered]);

  const ready = (byStatus.get("unassigned") ?? []).filter((w) => w.assigned_to);
  const out = ["dispatched", "accepted", "on_site"].reduce((n, s) => n + (byStatus.get(s as WorkOrderStatus)?.length ?? 0), 0);
  const overdue = filtered.filter((w) => isOverdue(w.scheduled_for, w.status)).length;
  const cancelled = byStatus.get("cancelled") ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Unassigned" value={byStatus.get("unassigned")?.length ?? 0} />
        <Stat label="Out with installers" value={out} />
        <Stat label="Waiting for verification" value={byStatus.get("completed")?.length ?? 0} />
        <Stat label="Overdue" value={overdue} warn={overdue > 0} />
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input
            className="pl-8"
            placeholder="Search job, client, site, WO number…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select className="sm:w-56" value={installerFilter} onChange={(e) => setInstallerFilter(e.target.value)}>
          <option value="">All installers</option>
          {installers.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3 snap-x snap-mandatory -mx-4 px-4 md:mx-0 md:px-0">
        {COLUMNS.map((col) => {
          let items = col.statuses.flatMap((st) => byStatus.get(st) ?? []);
          const total = items.length;
          if (col.key === "verified" && !showAllVerified) items = items.slice(0, VERIFIED_LIMIT);
          return (
            <section key={col.key} className="w-[82vw] sm:w-[250px] lg:w-auto lg:flex-1 lg:min-w-[215px] shrink-0 snap-start space-y-2">
              <div className="flex items-center justify-between px-1 h-8">
                <h2 className="text-xs font-medium flex items-center gap-2" title={col.hint}>
                  <span className={`h-2 w-2 rounded-full ${STATUS_DOT[col.key]}`} />
                  {col.label}
                  <span className="text-muted font-normal">{total}</span>
                </h2>
                {col.key === "unassigned" && ready.length > 1 && (
                  <Button size="sm" variant="primary" onClick={() => actions.dispatch(ready)}>
                    <Send size={12} /> Email {ready.length} ready
                  </Button>
                )}
              </div>
              <div className="space-y-2 min-h-[4rem] rounded-lg bg-surface/60 border border-border/60 p-2">
                {items.map((wo) => (
                  <WorkOrderCard key={wo.id} wo={wo} installers={installers} actions={actions} onOpen={onOpen} />
                ))}
                {total === 0 && <p className="text-[11px] text-muted/70 px-1 py-3 text-center">{col.hint}</p>}
                {col.key === "verified" && total > VERIFIED_LIMIT && !showAllVerified && (
                  <button className="text-[11px] text-muted hover:text-ink w-full py-1" onClick={() => setShowAllVerified(true)}>
                    Show all {total}
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {cancelled.length > 0 && (
        <div className="pt-2">
          <button className="text-xs text-muted hover:text-ink" onClick={() => setShowCancelled((s) => !s)}>
            {showCancelled ? "Hide" : "Show"} cancelled ({cancelled.length})
          </button>
          {showCancelled && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 mt-2">
              {cancelled.map((wo) => (
                <WorkOrderCard key={wo.id} wo={wo} installers={installers} actions={actions} onOpen={onOpen} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-2">
      <div className={`font-display text-xl ${warn ? "text-[#e7877e]" : ""}`}>{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}
