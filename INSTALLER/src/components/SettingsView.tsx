import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { officeAction } from "../lib/api";
import type { AppSettings } from "../types";
import { Button, Field, Input, Textarea, useToast } from "./ui";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  settings: AppSettings | null;
  myEmail: string;
  onChanged: () => void;
}

export function SettingsView({ settings, myEmail, onChanged }: Props) {
  const toast = useToast();
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [office, setOffice] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const [dispatchers, setDispatchers] = useState<{ email: string }[]>([]);
  const [newDispatcher, setNewDispatcher] = useState("");

  useEffect(() => {
    if (!settings) return;
    setCompany(settings.company_name);
    setPhone(settings.office_phone ?? "");
    setOffice(settings.office_emails.join("\n"));
  }, [settings]);

  async function loadDispatchers() {
    const { data } = await supabase.from("dispatchers").select("email").order("email");
    setDispatchers(data ?? []);
  }
  useEffect(() => {
    loadDispatchers();
  }, []);

  async function save() {
    const emails = office
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const bad = emails.filter((e) => !EMAIL_RE.test(e));
    if (bad.length) return toast("error", `Not a valid email: ${bad.join(", ")}`);
    if (!company.trim()) return toast("error", "Company name can't be empty");
    setSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .update({ company_name: company.trim(), office_phone: phone.trim() || null, office_emails: emails })
      .eq("id", true);
    setSaving(false);
    toast(error ? "error" : "success", error ? error.message : "Settings saved");
    onChanged();
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    const res = await officeAction<{ sent_to?: string[]; from?: string }>({ action: "test_email" });
    setTesting(false);
    setTestResult(
      res.ok
        ? { ok: true, text: `Sent from ${res.data?.from} to ${res.data?.sent_to?.join(", ")}. Check the inbox (and spam folder).` }
        : { ok: false, text: res.error ?? "Failed" },
    );
  }

  async function addDispatcher() {
    const email = newDispatcher.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return toast("error", "Enter a valid email");
    const { error } = await supabase.from("dispatchers").insert({ email });
    if (error) return toast("error", /duplicate/i.test(error.message) ? "Already on the list" : error.message);
    setNewDispatcher("");
    toast("success", `${email} added. Now create their login in Supabase → Authentication → Users.`);
    loadDispatchers();
  }

  async function removeDispatcher(email: string) {
    const { error } = await supabase.from("dispatchers").delete().eq("email", email);
    if (error) toast("error", error.message);
    loadDispatchers();
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6 items-start max-w-5xl">
      <section className="bg-surface border border-border rounded-lg p-4 space-y-3">
        <h2 className="font-display text-sm">Emails</h2>
        <Field label="Company name" hint="Shown at the top of every email and on the installer's job page.">
          <Input value={company} onChange={(e) => setCompany(e.target.value)} />
        </Field>
        <Field label="Office phone" hint="Installers see this if they have a question about a job.">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+256 7xx xxx xxx" />
        </Field>
        <Field
          label="Office notification emails"
          hint="Get an email when an installer accepts, declines or finishes a job. One per line."
        >
          <Textarea rows={3} value={office} onChange={(e) => setOffice(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button onClick={test} disabled={testing}>
            {testing ? "Sending…" : "Send test email"}
          </Button>
        </div>
        {testResult && (
          <p className={`text-xs rounded-md px-3 py-2 ${testResult.ok ? "bg-status-completed/10 text-[#6fd3a0]" : "bg-status-cancelled/10 text-[#e7877e]"}`}>
            {testResult.text}
          </p>
        )}
        <p className="text-[11px] text-muted">
          Emails go out through the Gmail account set in Supabase → Edge Functions → Secrets (<code>GMAIL_USER</code>,{" "}
          <code>GMAIL_APP_PASSWORD</code>). Gmail allows about 500 emails a day.
        </p>
      </section>

      <section className="bg-surface border border-border rounded-lg p-4 space-y-3">
        <h2 className="font-display text-sm">Who can use this console</h2>
        <p className="text-xs text-muted">
          Only these emails can sign in and see jobs. After adding someone, create their login in the Supabase dashboard
          (Authentication → Users → Add user, tick “Auto confirm”).
        </p>
        <div className="divide-y divide-border border border-border rounded-md">
          {dispatchers.map((d) => (
            <div key={d.email} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                {d.email}
                {d.email === myEmail.toLowerCase() && <span className="text-xs text-muted"> (you)</span>}
              </span>
              {d.email !== myEmail.toLowerCase() && (
                <button onClick={() => removeDispatcher(d.email)} className="text-muted hover:text-[#e7877e]" aria-label={`Remove ${d.email}`}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="colleague@example.com"
            value={newDispatcher}
            onChange={(e) => setNewDispatcher(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addDispatcher()}
          />
          <Button onClick={addDispatcher}>Add</Button>
        </div>
      </section>
    </div>
  );
}
