import { useState, type ReactNode } from "react";
import { supabase } from "../lib/supabaseClient";
import { officeAction } from "../lib/api";
import { ref } from "../lib/format";
import type { WorkOrder } from "../types";
import { Confirm, useToast } from "../components/ui";

interface ConfirmSpec {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  variant?: "primary" | "danger" | "success";
  inputLabel?: string;
  inputPlaceholder?: string;
  run: (text: string) => Promise<void>;
}

const BATCH = 25;

/** Every office action on a work order, with confirmations and toasts. */
export function useActions(onChanged: () => void) {
  const toast = useToast();
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const mark = (ids: string[], on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  async function dispatchNow(wos: WorkOrder[]) {
    const ids = wos.map((w) => w.id);
    mark(ids, true);
    let sent = 0;
    const failures: string[] = [];
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH);
      const res = await officeAction<{ results?: { ok: boolean; ref: string; error?: string }[] }>({
        action: "dispatch",
        ids: chunk,
      });
      const results = res.data?.results;
      if (results) {
        sent += results.filter((r) => r.ok).length;
        results.filter((r) => !r.ok).forEach((r) => failures.push(`${r.ref}: ${r.error}`));
      } else if (!res.ok) {
        failures.push(res.error ?? "Dispatch failed");
      }
    }
    mark(ids, false);
    if (sent) {
      toast(
        "success",
        wos.length === 1
          ? `${ref(wos[0].ref_no)} emailed to ${wos[0].assignee?.name ?? "the installer"}`
          : `${sent} job email${sent === 1 ? "" : "s"} sent`,
      );
    }
    if (failures.length) toast("error", failures.slice(0, 6).join("\n") + (failures.length > 6 ? "\n…" : ""));
    onChanged();
  }

  function dispatch(wos: WorkOrder[]) {
    const ready = wos.filter((w) => w.status === "unassigned" && w.assigned_to);
    if (!ready.length) return;
    if (ready.length === 1) return dispatchNow(ready);
    setConfirm({
      title: `Email ${ready.length} jobs?`,
      body: `Each assigned installer gets an email with their job details and Accept / Decline buttons.`,
      confirmLabel: `Send ${ready.length} emails`,
      run: async () => {
        setConfirm(null);
        await dispatchNow(ready);
      },
    });
  }

  async function resend(wo: WorkOrder) {
    mark([wo.id], true);
    const res = await officeAction({ action: "resend", id: wo.id });
    mark([wo.id], false);
    toast(res.ok ? "success" : "error", res.ok ? `Reminder emailed to ${wo.assignee?.name}` : res.error ?? "Failed");
    onChanged();
  }

  function recall(wo: WorkOrder) {
    setConfirm({
      title: `Recall ${ref(wo.ref_no)}?`,
      body: `${wo.assignee?.name ?? "The installer"} gets an email saying the job is withdrawn, and their links stop working. The job goes back to Unassigned so you can give it to someone else.`,
      confirmLabel: "Recall job",
      variant: "danger",
      inputLabel: "Message to the installer (optional)",
      inputPlaceholder: "Rescheduling with the client",
      run: async (reason) => {
        const res = await officeAction({ action: "recall", id: wo.id, reason });
        setConfirm(null);
        if (!res.ok) toast("error", res.error ?? "Recall failed");
        else toast(res.warning ? "info" : "success", res.warning ?? `${ref(wo.ref_no)} recalled`);
        onChanged();
      },
    });
  }

  function cancel(wo: WorkOrder) {
    const out = ["dispatched", "accepted", "on_site"].includes(wo.status);
    setConfirm({
      title: `Cancel ${ref(wo.ref_no)}?`,
      body: out
        ? `${wo.assignee?.name ?? "The installer"} will get an email saying the job is cancelled. You can reopen it later.`
        : "The job moves to Cancelled. You can reopen it later.",
      confirmLabel: "Cancel job",
      variant: "danger",
      inputLabel: out ? "Message to the installer (optional)" : "Reason (optional)",
      run: async (reason) => {
        const res = await officeAction({ action: "cancel", id: wo.id, reason });
        setConfirm(null);
        if (!res.ok) toast("error", res.error ?? "Cancel failed");
        else toast(res.warning ? "info" : "success", res.warning ?? `${ref(wo.ref_no)} cancelled`);
        onChanged();
      },
    });
  }

  async function setStatus(wo: WorkOrder, to: "verified" | "unassigned", okText: string) {
    mark([wo.id], true);
    const { error } = await supabase.rpc("office_set_status", { p_id: wo.id, p_to: to });
    mark([wo.id], false);
    toast(error ? "error" : "success", error ? error.message : okText);
    onChanged();
  }

  const verify = (wo: WorkOrder) => setStatus(wo, "verified", `${ref(wo.ref_no)} verified`);
  const reopen = (wo: WorkOrder) => setStatus(wo, "unassigned", `${ref(wo.ref_no)} reopened`);

  function remove(wo: WorkOrder, after?: () => void) {
    setConfirm({
      title: `Delete ${ref(wo.ref_no)}?`,
      body: "This removes the job and its history for good. Cancelling keeps a record instead.",
      confirmLabel: "Delete",
      variant: "danger",
      run: async () => {
        const { error } = await supabase.from("work_orders").delete().eq("id", wo.id);
        setConfirm(null);
        toast(error ? "error" : "success", error ? error.message : `${ref(wo.ref_no)} deleted`);
        onChanged();
        if (!error) after?.();
      },
    });
  }

  async function assign(wo: WorkOrder, installerId: string | null) {
    const { error } = await supabase.from("work_orders").update({ assigned_to: installerId }).eq("id", wo.id);
    if (error) toast("error", error.message);
    onChanged();
  }

  const node = confirm ? (
    <Confirm
      title={confirm.title}
      body={confirm.body}
      confirmLabel={confirm.confirmLabel}
      variant={confirm.variant}
      inputLabel={confirm.inputLabel}
      inputPlaceholder={confirm.inputPlaceholder}
      onConfirm={confirm.run}
      onClose={() => setConfirm(null)}
    />
  ) : null;

  return { dispatch, resend, recall, cancel, verify, reopen, remove, assign, busy, node };
}

export type Actions = ReturnType<typeof useActions>;
