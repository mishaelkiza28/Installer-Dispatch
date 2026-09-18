import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Technician } from "../types";

export function TechnicianManager() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState(true);

  async function load() {
    const { data } = await supabase.from("technicians").select("*").order("name");
    if (data) setTechnicians(data as Technician[]);
  }

  useEffect(() => {
    load();
  }, []);

  async function addTechnician() {
    if (!name.trim() || !phone.trim()) return;
    await supabase.from("technicians").insert({
      name: name.trim(),
      phone_e164: phone.trim(),
      email: email.trim() || null,
      whatsapp_opt_in: whatsapp,
    });
    setName("");
    setPhone("");
    setEmail("");
    load();
  }

  async function toggleActive(t: Technician) {
    await supabase.from("technicians").update({ active: !t.active }).eq("id", t.id);
    load();
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
        <h2 className="font-display text-sm">Add a technician</h2>
        <input
          className="w-full bg-raised border border-border rounded px-3 py-2 text-sm"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="w-full bg-raised border border-border rounded px-3 py-2 text-sm font-mono"
          placeholder="+2567xxxxxxxx"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <input
          className="w-full bg-raised border border-border rounded px-3 py-2 text-sm"
          placeholder="Email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} />
          Reachable on WhatsApp
        </label>
        <button onClick={addTechnician} className="text-sm bg-accent text-accent-ink rounded px-3 py-1.5 font-medium">
          Add technician
        </button>
      </div>

      <div className="space-y-2">
        {technicians.map((t) => (
          <div key={t.id} className="flex items-center justify-between bg-surface border border-border rounded-lg px-3 py-2">
            <div>
              <p className="text-sm">{t.name}</p>
              <p className="text-xs text-muted font-mono">{t.phone_e164}</p>
            </div>
            <button
              onClick={() => toggleActive(t)}
              className={`text-xs rounded px-2 py-1 border border-border ${t.active ? "text-status-completed" : "text-muted"}`}
            >
              {t.active ? "Active" : "Inactive"}
            </button>
          </div>
        ))}
        {technicians.length === 0 && <p className="text-xs text-muted">No technicians yet — add the first one above.</p>}
      </div>
    </div>
  );
}
