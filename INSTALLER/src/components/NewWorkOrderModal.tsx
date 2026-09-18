import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { WorkOrderPriority } from "../types";

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export function NewWorkOrderModal({ onClose, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<WorkOrderPriority>("normal");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    await supabase.from("work_orders").insert({
      title: title.trim(),
      site_address: siteAddress.trim() || null,
      description: description.trim() || null,
      priority,
    });
    setSaving(false);
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-surface border border-border rounded-lg w-full max-w-md p-5 space-y-4">
        <h2 className="font-display text-lg">New work order</h2>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted block mb-1">Title</label>
            <input
              className="w-full bg-raised border border-border rounded px-3 py-2 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Replace failing inverter"
            />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Site / address</label>
            <input
              className="w-full bg-raised border border-border rounded px-3 py-2 text-sm"
              value={siteAddress}
              onChange={(e) => setSiteAddress(e.target.value)}
              placeholder="Plot 14, Ntinda"
            />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Notes</label>
            <textarea
              className="w-full bg-raised border border-border rounded px-3 py-2 text-sm"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Priority</label>
            <select
              className="w-full bg-raised border border-border rounded px-3 py-2 text-sm"
              value={priority}
              onChange={(e) => setPriority(e.target.value as WorkOrderPriority)}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="text-sm text-muted px-3 py-1.5">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !title.trim()}
            className="text-sm bg-accent text-accent-ink rounded px-3 py-1.5 font-medium disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create work order"}
          </button>
        </div>
      </div>
    </div>
  );
}
