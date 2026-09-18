import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { officeAction } from "../lib/api";
import { JOB_TYPES, ref } from "../lib/format";
import type { Installer, Priority, WorkOrder, WorkOrderInput } from "../types";
import { Button, Field, Input, Modal, Select, Textarea, useToast } from "./ui";

interface Props {
  existing?: WorkOrder | null;
  installers: Installer[];
  onClose: () => void;
  onSaved: () => void;
}

const blank: WorkOrderInput = {
  title: "",
  job_type: null,
  client_name: null,
  client_phone: null,
  site_address: null,
  district: null,
  scheduled_for: null,
  priority: "normal",
  description: null,
  assigned_to: null,
};

export function WorkOrderForm({ existing, installers, onClose, onSaved }: Props) {
  const toast = useToast();
  const [form, setForm] = useState<WorkOrderInput>(() =>
    existing
      ? {
          title: existing.title,
          job_type: existing.job_type,
          client_name: existing.client_name,
          client_phone: existing.client_phone,
          site_address: existing.site_address,
          district: existing.district,
          scheduled_for: existing.scheduled_for,
          priority: existing.priority,
          description: existing.description,
          assigned_to: existing.assigned_to,
        }
      : blank,
  );
  const [busy, setBusy] = useState<null | "save" | "dispatch">(null);
  const [error, setError] = useState<string | null>(null);

  const canAssign = !existing || existing.status === "unassigned";
  const activeInstallers = installers.filter((i) => i.active || i.id === form.assigned_to);

  function set<K extends keyof WorkOrderInput>(key: K, value: WorkOrderInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  const text = (key: keyof WorkOrderInput) => ({
    value: (form[key] as string | null) ?? "",
    onChange: (e: { target: { value: string } }) => set(key, (e.target.value || null) as never),
  });

  async function save(andDispatch: boolean) {
    if (!form.title.trim()) {
      setError("Give the job a title.");
      return;
    }
    setBusy(andDispatch ? "dispatch" : "save");
    setError(null);

    const payload: Partial<WorkOrderInput> = {
      ...form,
      title: form.title.trim(),
      client_name: form.client_name?.trim() || null,
      client_phone: form.client_phone?.trim() || null,
      site_address: form.site_address?.trim() || null,
      district: form.district?.trim() || null,
      job_type: form.job_type?.trim() || null,
      description: form.description?.trim() || null,
    };
    if (!canAssign) delete payload.assigned_to;

    let id = existing?.id;
    let refNo = existing?.ref_no;
    if (existing) {
      const { error } = await supabase.from("work_orders").update(payload).eq("id", existing.id);
      if (error) {
        setError(error.message);
        setBusy(null);
        return;
      }
    } else {
      const { data, error } = await supabase.from("work_orders").insert(payload).select("id, ref_no").single();
      if (error || !data) {
        setError(error?.message ?? "Could not create the work order");
        setBusy(null);
        return;
      }
      id = data.id;
      refNo = data.ref_no;
    }

    if (andDispatch && id) {
      const res = await officeAction({ action: "dispatch", ids: [id] });
      if (!res.ok) {
        toast("error", `${ref(refNo)} saved, but not dispatched:\n${res.error}`);
      } else {
        const who = installers.find((i) => i.id === form.assigned_to);
        toast("success", `${ref(refNo)} emailed to ${who?.name ?? "the installer"}`);
      }
    } else {
      toast("success", existing ? `${ref(refNo)} updated` : `${ref(refNo)} created`);
    }
    setBusy(null);
    onSaved();
    onClose();
  }

  return (
    <Modal
      title={existing ? `Edit ${ref(existing.ref_no)}` : "New work order"}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={!!busy}>
            Cancel
          </Button>
          <Button onClick={() => save(false)} disabled={!!busy} variant={existing ? "primary" : "secondary"}>
            {busy === "save" ? "Saving…" : existing ? "Save changes" : "Save"}
          </Button>
          {!existing && (
            <Button
              variant="primary"
              onClick={() => save(true)}
              disabled={!!busy || !form.assigned_to}
              title={form.assigned_to ? "" : "Pick an installer first"}
            >
              {busy === "dispatch" ? "Sending…" : "Save & email installer"}
            </Button>
          )}
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Title *" className="sm:col-span-2">
          <Input autoFocus {...text("title")} placeholder="Install 200W plug-and-play kit" />
        </Field>
        <Field label="Job type">
          <Input list="job-types" {...text("job_type")} placeholder="Installation" />
          <datalist id="job-types">
            {JOB_TYPES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field label="Priority">
          <Select value={form.priority} onChange={(e) => set("priority", e.target.value as Priority)}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
          </Select>
        </Field>
        <Field label="Client name">
          <Input {...text("client_name")} placeholder="Brenda Nakato" />
        </Field>
        <Field label="Client phone">
          <Input {...text("client_phone")} placeholder="+256 7xx xxx xxx" inputMode="tel" />
        </Field>
        <Field label="Site / address">
          <Input {...text("site_address")} placeholder="Plot 14, Ntinda Road" />
        </Field>
        <Field label="District / area">
          <Input {...text("district")} placeholder="Kampala" />
        </Field>
        <Field label="Scheduled date">
          <Input type="date" {...text("scheduled_for")} />
        </Field>
        <Field
          label="Installer"
          hint={canAssign ? undefined : "Recall the job first to hand it to someone else."}
        >
          <Select
            value={form.assigned_to ?? ""}
            disabled={!canAssign}
            onChange={(e) => set("assigned_to", e.target.value || null)}
          >
            <option value="">— Not assigned yet —</option>
            {activeInstallers.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
                {i.area ? ` · ${i.area}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes for the installer" className="sm:col-span-2">
          <Textarea rows={3} {...text("description")} placeholder="Kit serial, access instructions, what to bring…" />
        </Field>
      </div>
      {installers.length === 0 && (
        <p className="text-xs text-muted mt-3">Add installers on the Installers page to be able to assign this job.</p>
      )}
      {error && <p className="text-xs text-[#e7877e] mt-3">{error}</p>}
    </Modal>
  );
}
