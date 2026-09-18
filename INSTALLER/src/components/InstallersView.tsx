import { useMemo, useState } from "react";
import { Mail, Pencil, Phone } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import type { Installer, WorkOrder } from "../types";
import { Button, Field, Input, Modal, Textarea, useToast } from "./ui";

interface Props {
  installers: Installer[];
  workOrders: WorkOrder[];
  onChanged: () => void;
}

type Draft = Pick<Installer, "name" | "email" | "phone" | "area" | "notes">;
const empty: Draft = { name: "", email: "", phone: "", area: "", notes: "" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InstallersView({ installers, workOrders, onChanged }: Props) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(empty);
  const [editing, setEditing] = useState<Installer | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useMemo(() => {
    const m = new Map<string, { open: number; done30: number }>();
    const cutoff = Date.now() - 30 * 86400e3;
    for (const w of workOrders) {
      if (!w.assigned_to) continue;
      const s = m.get(w.assigned_to) ?? { open: 0, done30: 0 };
      if (["dispatched", "accepted", "on_site"].includes(w.status)) s.open++;
      if (["completed", "verified"].includes(w.status) && w.completed_at && new Date(w.completed_at).getTime() > cutoff)
        s.done30++;
      m.set(w.assigned_to, s);
    }
    return m;
  }, [workOrders]);

  function clean(d: Draft): Draft | string {
    const name = d.name.trim();
    const email = d.email.trim().toLowerCase();
    if (!name) return "Name is required.";
    if (!EMAIL_RE.test(email)) return "Enter a valid email address — jobs are sent there.";
    return {
      name,
      email,
      phone: d.phone?.trim() || null,
      area: d.area?.trim() || null,
      notes: d.notes?.trim() || null,
    };
  }

  function friendly(msg: string) {
    return /installers_email_key|duplicate/i.test(msg) ? "An installer with that email already exists." : msg;
  }

  async function add() {
    const c = clean(draft);
    if (typeof c === "string") return setError(c);
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("installers").insert(c);
    setSaving(false);
    if (error) return setError(friendly(error.message));
    toast("success", `${c.name} added`);
    setDraft(empty);
    onChanged();
  }

  async function toggleActive(i: Installer) {
    const { error } = await supabase.from("installers").update({ active: !i.active }).eq("id", i.id);
    if (error) toast("error", error.message);
    onChanged();
  }

  const active = installers.filter((i) => i.active);
  const inactive = installers.filter((i) => !i.active);

  return (
    <div className="grid lg:grid-cols-[360px_1fr] gap-6 items-start">
      <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
        <h2 className="font-display text-sm">Add an installer</h2>
        <p className="text-xs text-muted">Installers don't log in. They get each job by email, with buttons to accept, decline and report progress.</p>
        <Field label="Name *">
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Okello James" />
        </Field>
        <Field label="Email *">
          <Input
            type="email"
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            placeholder="james@example.com"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <Input
              value={draft.phone ?? ""}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              placeholder="+2567…"
              inputMode="tel"
            />
          </Field>
          <Field label="Area covered">
            <Input value={draft.area ?? ""} onChange={(e) => setDraft({ ...draft, area: e.target.value })} placeholder="Wakiso" />
          </Field>
        </div>
        {error && <p className="text-xs text-[#e7877e]">{error}</p>}
        <Button variant="primary" onClick={add} disabled={saving} className="w-full">
          {saving ? "Adding…" : "Add installer"}
        </Button>
      </div>

      <div className="space-y-4">
        <List title={`Active (${active.length})`} items={active} load={load} onEdit={setEditing} onToggle={toggleActive} />
        {inactive.length > 0 && (
          <List title={`Inactive (${inactive.length})`} items={inactive} load={load} onEdit={setEditing} onToggle={toggleActive} />
        )}
        {installers.length === 0 && <p className="text-sm text-muted">No installers yet — add the first one.</p>}
      </div>

      {editing && (
        <EditInstaller
          installer={editing}
          onClose={() => setEditing(null)}
          onSave={async (d) => {
            const c = clean(d);
            if (typeof c === "string") return c;
            const { error } = await supabase.from("installers").update(c).eq("id", editing.id);
            if (error) return friendly(error.message);
            toast("success", `${c.name} updated`);
            setEditing(null);
            onChanged();
            return null;
          }}
        />
      )}
    </div>
  );
}

function List({
  title,
  items,
  load,
  onEdit,
  onToggle,
}: {
  title: string;
  items: Installer[];
  load: Map<string, { open: number; done30: number }>;
  onEdit: (i: Installer) => void;
  onToggle: (i: Installer) => void;
}) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-xs text-muted mb-2">{title}</h3>
      <div className="bg-surface border border-border rounded-lg divide-y divide-border">
        {items.map((i) => {
          const l = load.get(i.id);
          return (
            <div key={i.id} className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between px-4 py-3">
              <div className="min-w-0">
                <p className={`text-sm ${i.active ? "" : "text-muted"}`}>
                  {i.name}
                  {i.area && <span className="text-xs text-muted"> · {i.area}</span>}
                </p>
                <p className="text-xs text-muted flex flex-wrap gap-x-3">
                  <span className="inline-flex items-center gap-1">
                    <Mail size={11} /> {i.email}
                  </span>
                  {i.phone && (
                    <a href={`tel:${i.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 hover:text-ink">
                      <Phone size={11} /> {i.phone}
                    </a>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-[11px] text-muted whitespace-nowrap">
                  {l?.open ?? 0} open · {l?.done30 ?? 0} done (30d)
                </span>
                <Button size="sm" onClick={() => onEdit(i)} aria-label={`Edit ${i.name}`}>
                  <Pencil size={12} />
                </Button>
                <Button size="sm" variant={i.active ? "secondary" : "success"} onClick={() => onToggle(i)}>
                  {i.active ? "Deactivate" : "Reactivate"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EditInstaller({
  installer,
  onClose,
  onSave,
}: {
  installer: Installer;
  onClose: () => void;
  onSave: (d: Draft) => Promise<string | null>;
}) {
  const [d, setD] = useState<Draft>({
    name: installer.name,
    email: installer.email,
    phone: installer.phone ?? "",
    area: installer.area ?? "",
    notes: installer.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={`Edit ${installer.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(await onSave(d));
              setBusy(false);
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name *">
          <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </Field>
        <Field label="Email *" hint="Jobs already emailed keep working — their links don't depend on the address.">
          <Input type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <Input value={d.phone ?? ""} onChange={(e) => setD({ ...d, phone: e.target.value })} />
          </Field>
          <Field label="Area covered">
            <Input value={d.area ?? ""} onChange={(e) => setD({ ...d, area: e.target.value })} />
          </Field>
        </div>
        <Field label="Office notes (not sent to the installer)">
          <Textarea rows={2} value={d.notes ?? ""} onChange={(e) => setD({ ...d, notes: e.target.value })} />
        </Field>
        {error && <p className="text-xs text-[#e7877e]">{error}</p>}
      </div>
    </Modal>
  );
}
