// Office actions that send email. Called from the dispatcher console.
//
// POST { action: "dispatch", ids: string[], app_url }
//      { action: "resend",   id }
//      { action: "recall",   id, reason? }
//      { action: "cancel",   id, reason? }
//      { action: "test_email" }
//
// Deployed with verify_jwt = false so the browser's CORS preflight gets
// through; the caller's session is checked below, and only confirmed
// logins on the dispatchers list can use it.
import { corsHeaders, json } from "../_shared/cors.ts";
import { admin, getSettings, logEvent, type Settings } from "../_shared/admin.ts";
import {
  buildLinks,
  createMailer,
  emailConfigured,
  jobEmail,
  type JobForEmail,
  refLabel,
  senderAddress,
  testEmail,
  withdrawnEmail,
} from "../_shared/email.ts";

const MAX_BATCH = 25;
const OPEN_STATUSES = ["dispatched", "accepted", "on_site"];

type Mailer = ReturnType<typeof createMailer>;

// deno-lint-ignore no-explicit-any
type Row = JobForEmail & { id: string; status: string; installer_token: string | null; assignee: any };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Use POST" }, 405);

  // --- who is calling? -----------------------------------------------------
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData } = await admin.auth.getUser(jwt);
  const user = userData?.user;
  if (!user?.email || !user.email_confirmed_at) {
    return json({ ok: false, error: "Please sign in again." }, 401);
  }
  const { data: dispatcher } = await admin
    .from("dispatchers")
    .select("email")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();
  if (!dispatcher) return json({ ok: false, error: "Your login isn't on the dispatchers list." }, 403);
  const actor = user.email;

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid request" }, 400);
  }

  const settings = await getSettings();
  const appUrl = cleanUrl(body.app_url) ?? settings.app_url;
  if (appUrl && appUrl !== settings.app_url) {
    await admin.from("app_settings").update({ app_url: appUrl }).eq("id", true);
  }

  const mailer = createMailer(settings.company_name);
  try {
    switch (body.action) {
      case "dispatch":
        return await dispatch(body.ids ?? (body.id ? [body.id] : []), appUrl, settings, mailer, actor);
      case "resend":
        return await resend(body.id, appUrl, settings, mailer, actor);
      case "recall":
        return await withdraw("recalled", body.id, body.reason, settings, mailer, actor);
      case "cancel":
        return await withdraw("cancelled", body.id, body.reason, settings, mailer, actor);
      case "test_email":
        return await sendTest(settings, mailer, user.email);
      default:
        return json({ ok: false, error: "Unknown action" }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 400);
  } finally {
    mailer.close();
  }
});

function cleanUrl(u: unknown): string | null {
  if (typeof u !== "string") return null;
  try {
    const url = new URL(u);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return null;
  }
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function loadRows(ids: string[]): Promise<Row[]> {
  const { data, error } = await admin
    .from("work_orders")
    .select("*, assignee:installers!work_orders_assigned_to_fkey(id, name, email, active)")
    .in("id", ids);
  if (error) throw new Error(error.message);
  return (data ?? []) as Row[];
}

function brand(s: Settings) {
  return { company_name: s.company_name, office_phone: s.office_phone };
}

// ---------------------------------------------------------------------------

async function dispatch(ids: string[], appUrl: string | null, settings: Settings, mailer: Mailer, actor: string) {
  if (!ids.length) return json({ ok: false, error: "Nothing to dispatch" }, 400);
  if (ids.length > MAX_BATCH) return json({ ok: false, error: `Dispatch at most ${MAX_BATCH} at a time` }, 400);
  if (!appUrl) return json({ ok: false, error: "Missing console URL" }, 400);
  if (!emailConfigured()) {
    return json({
      ok: false,
      error: "Email isn't set up yet. Add GMAIL_USER and GMAIL_APP_PASSWORD under Supabase → Edge Functions → Secrets.",
    });
  }

  const rows = await loadRows(ids);
  const results: { id: string; ref: string; ok: boolean; error?: string }[] = [];

  for (const row of rows) {
    const ref = refLabel(row.ref_no);
    const inst = row.assignee;
    if (row.status !== "unassigned") {
      results.push({ id: row.id, ref, ok: false, error: "Already dispatched or closed" });
      continue;
    }
    if (!inst) {
      results.push({ id: row.id, ref, ok: false, error: "No installer assigned" });
      continue;
    }
    if (!inst.active) {
      results.push({ id: row.id, ref, ok: false, error: `${inst.name} is marked inactive` });
      continue;
    }

    const token = randomToken();
    const mail = jobEmail(row, inst.name, buildLinks(appUrl, token), brand(settings));
    const sent = await mailer.send({ to: inst.email, replyTo: settings.office_emails, ...mail });
    if (!sent.ok) {
      await logEvent(row.id, "email_failed", "system", null, `Job email to ${inst.email} failed: ${sent.error}`);
      results.push({ id: row.id, ref, ok: false, error: sent.error });
      continue;
    }

    const { error } = await admin.rpc("wo_mark_dispatched", {
      p_id: row.id,
      p_token: token,
      p_actor_name: actor,
      p_message: `Emailed to ${inst.name} <${inst.email}>`,
    });
    if (error) {
      results.push({ id: row.id, ref, ok: false, error: error.message });
      continue;
    }
    results.push({ id: row.id, ref, ok: true });
  }

  const failed = results.filter((r) => !r.ok);
  return json({
    ok: failed.length === 0,
    results,
    error: failed.length ? failed.map((f) => `${f.ref}: ${f.error}`).join("\n") : undefined,
  });
}

async function resend(id: string, appUrl: string | null, settings: Settings, mailer: Mailer, actor: string) {
  const [row] = await loadRows([id]);
  if (!row) return json({ ok: false, error: "Work order not found" }, 404);
  if (!OPEN_STATUSES.includes(row.status) || !row.installer_token || !row.assignee) {
    return json({ ok: false, error: "Only jobs that are out with an installer can be re-sent" }, 400);
  }
  if (!appUrl) return json({ ok: false, error: "Missing console URL" }, 400);

  const mail = jobEmail(row, row.assignee.name, buildLinks(appUrl, row.installer_token), brand(settings), {
    reminder: true,
  });
  const sent = await mailer.send({ to: row.assignee.email, replyTo: settings.office_emails, ...mail });
  await logEvent(
    row.id,
    sent.ok ? "email_sent" : "email_failed",
    sent.ok ? "office" : "system",
    sent.ok ? actor : null,
    sent.ok ? `Job email re-sent to ${row.assignee.email}` : `Re-send to ${row.assignee.email} failed: ${sent.error}`,
  );
  return json(sent.ok ? { ok: true } : { ok: false, error: sent.error });
}

async function withdraw(
  kind: "recalled" | "cancelled",
  id: string,
  reason: string | undefined,
  settings: Settings,
  mailer: Mailer,
  actor: string,
) {
  const [row] = await loadRows([id]);
  if (!row) return json({ ok: false, error: "Work order not found" }, 404);
  const wasOut = OPEN_STATUSES.includes(row.status) && row.assignee;
  const note = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 1000) : null;

  const { error } = await admin.rpc("wo_transition", {
    p_id: id,
    p_to: kind === "recalled" ? "unassigned" : "cancelled",
    p_actor: "office",
    p_actor_name: actor,
    p_kind: kind,
    p_message: note,
  });
  if (error) return json({ ok: false, error: error.message }, 400);

  // Let the installer know they no longer need to go.
  if (wasOut) {
    const mail = withdrawnEmail(row, row.assignee.name, brand(settings), kind, note);
    const sent = await mailer.send({ to: row.assignee.email, replyTo: settings.office_emails, ...mail });
    await logEvent(
      row.id,
      sent.ok ? "email_sent" : "email_failed",
      "system",
      null,
      sent.ok
        ? `${row.assignee.name} told the job is ${kind === "cancelled" ? "cancelled" : "withdrawn"}`
        : `Could not email ${row.assignee.email}: ${sent.error}`,
    );
    if (!sent.ok) return json({ ok: true, warning: `Job updated, but the email to ${row.assignee.name} failed: ${sent.error}` });
  }
  return json({ ok: true });
}

async function sendTest(settings: Settings, mailer: Mailer, callerEmail: string) {
  const to = settings.office_emails.length ? settings.office_emails : [callerEmail];
  const mail = testEmail(brand(settings), senderAddress());
  const sent = await mailer.send({ to, ...mail });
  return json(sent.ok ? { ok: true, sent_to: to, from: senderAddress() } : { ok: false, error: sent.error });
}
