// Public endpoint behind the buttons in an installer's job email.
// No login: the random token in the link identifies the job and installer,
// and it stops working as soon as the job is recalled, declined or cancelled.
//
// POST { token, action: "view" | "accept" | "decline" | "on_site" | "done", note? }
import { corsHeaders, json } from "../_shared/cors.ts";
import { admin, getSettings, logEvent } from "../_shared/admin.ts";
import { createMailer, officeUpdateEmail } from "../_shared/email.ts";

const ACTIONS = ["accept", "decline", "on_site", "done"] as const;
type Action = (typeof ACTIONS)[number];
const NOTIFY_OFFICE: Action[] = ["accept", "decline", "done"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Use POST" }, 405);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid request" }, 400);
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const action = String(body.action ?? "view");
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";

  const settings = await getSettings();
  const company = { name: settings.company_name, phone: settings.office_phone };

  if (token.length < 20) return json({ ok: false, code: "inactive", company }, 404);

  if (action !== "view") {
    if (!ACTIONS.includes(action as Action)) return json({ ok: false, error: "Unknown action" }, 400);

    const { data: before } = await admin
      .from("work_orders")
      .select("status, assignee:installers!work_orders_assigned_to_fkey(name)")
      .eq("installer_token", token)
      .maybeSingle();
    if (!before) return json({ ok: false, code: "inactive", company }, 404);
    // deno-lint-ignore no-explicit-any
    const installerName: string = (before.assignee as any)?.name ?? "The installer";

    const { data: updated, error } = await admin.rpc("wo_installer_action", {
      p_token: token,
      p_action: action,
      p_note: note || null,
    });
    if (error) {
      const inactive = /no longer active/i.test(error.message);
      return json(
        { ok: false, code: inactive ? "inactive" : "invalid", error: tidy(error.message), company },
        inactive ? 404 : 409,
      );
    }
    const changed = updated.status !== before.status;

    // Tell the office (best effort — the installer's click already counted).
    if (changed && NOTIFY_OFFICE.includes(action as Action) && settings.office_emails.length) {
      const mail = officeUpdateEmail(updated, installerName, action as Action, note || null, {
        company_name: settings.company_name,
        office_phone: settings.office_phone,
      }, settings.app_url);
      const mailer = createMailer(settings.company_name);
      const sent = await mailer.send({ to: settings.office_emails, ...mail });
      mailer.close();
      if (!sent.ok) await logEvent(updated.id, "email_failed", "system", null, `Office update email failed: ${sent.error}`);
    }

    // A decline hands the job back — the link is dead now, so answer from the row we have.
    if (action === "decline") {
      return json({ ok: true, job: publicJob(updated, installerName), company, declined: true });
    }
  }

  const { data: row } = await admin
    .from("work_orders")
    .select("*, assignee:installers!work_orders_assigned_to_fkey(name)")
    .eq("installer_token", token)
    .maybeSingle();
  if (!row) return json({ ok: false, code: "inactive", company }, 404);

  return json({ ok: true, job: publicJob(row, row.assignee?.name ?? null), company });
});

// deno-lint-ignore no-explicit-any
function publicJob(r: any, installerName: string | null) {
  return {
    ref_no: r.ref_no,
    title: r.title,
    job_type: r.job_type,
    client_name: r.client_name,
    client_phone: r.client_phone,
    site_address: r.site_address,
    district: r.district,
    scheduled_for: r.scheduled_for,
    priority: r.priority,
    description: r.description,
    status: r.status,
    completion_note: r.completion_note,
    installer_name: installerName,
    dispatched_at: r.dispatched_at,
    accepted_at: r.accepted_at,
    on_site_at: r.on_site_at,
    completed_at: r.completed_at,
  };
}

function tidy(msg: string): string {
  // "WO-0007 is completed — it can't move to accepted" → friendlier for the installer page
  return msg.replace(/^.*? is (.+?) — it can't move to (.+)$/, "This job is already $1.");
}
