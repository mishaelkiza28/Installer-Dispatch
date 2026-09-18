// Email via Gmail SMTP (port 465 — Supabase blocks 25 and 587).
//
// Secrets (Supabase → Edge Functions → Secrets):
//   GMAIL_USER          the Gmail / Google Workspace address that sends
//   GMAIL_APP_PASSWORD  a 16-character app password for that account
//                       (Google Account → Security → 2-Step Verification → App passwords)
//   EMAIL_FROM_NAME     optional display name, defaults to "<Company> Dispatch"
import nodemailer from "npm:nodemailer@6.10.1";

const GMAIL_USER = (Deno.env.get("GMAIL_USER") ?? "").trim();
const GMAIL_APP_PASSWORD = (Deno.env.get("GMAIL_APP_PASSWORD") ?? "").replace(/\s+/g, "");
const FROM_NAME = (Deno.env.get("EMAIL_FROM_NAME") ?? "").trim();

export function refLabel(refNo: number | string): string {
  return "WO-" + String(refNo).padStart(4, "0");
}

export type SendResult = { ok: boolean; error?: string; messageId?: string };

export interface Message {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string | string[];
}

export function emailConfigured(): boolean {
  return Boolean(GMAIL_USER && GMAIL_APP_PASSWORD);
}

function friendlyError(e: unknown): string {
  // deno-lint-ignore no-explicit-any
  const err = e as any;
  if (err?.code === "EAUTH" || err?.responseCode === 535 || err?.responseCode === 534) {
    return "Gmail rejected the login. Check GMAIL_USER and that GMAIL_APP_PASSWORD is a 16-character app password (not your normal password).";
  }
  if (err?.responseCode === 550 || err?.responseCode === 553) {
    return "Gmail refused the recipient address: " + (err?.response ?? String(e));
  }
  if (err?.code === "ETIMEDOUT" || err?.code === "ECONNECTION" || err?.code === "ESOCKET") {
    return "Could not reach Gmail's mail server (" + err.code + "). Try again in a minute.";
  }
  return err?.message ?? String(e);
}

/** One SMTP connection per request; call close() when done. */
export function createMailer(companyName: string) {
  // deno-lint-ignore no-explicit-any
  let transporter: any = null;
  const fromName = FROM_NAME || `${companyName} Dispatch`;

  async function send(msg: Message): Promise<SendResult> {
    if (!emailConfigured()) {
      return {
        ok: false,
        error:
          "Email isn't set up yet. Add GMAIL_USER and GMAIL_APP_PASSWORD under Supabase → Edge Functions → Secrets.",
      };
    }
    try {
      transporter ??= nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        pool: true,
        maxConnections: 1,
        auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
        connectionTimeout: 15_000,
        greetingTimeout: 10_000,
        socketTimeout: 30_000,
      });
      const info = await transporter.sendMail({
        from: { name: fromName, address: GMAIL_USER },
        to: msg.to,
        replyTo: msg.replyTo && (Array.isArray(msg.replyTo) ? msg.replyTo.length : true) ? msg.replyTo : undefined,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      });
      return { ok: true, messageId: info?.messageId };
    } catch (e) {
      return { ok: false, error: friendlyError(e) };
    }
  }

  function close() {
    try {
      transporter?.close();
    } catch {
      // ignore
    }
  }

  return { send, close };
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export interface JobForEmail {
  ref_no: number;
  title: string;
  job_type: string | null;
  client_name: string | null;
  client_phone: string | null;
  site_address: string | null;
  district: string | null;
  scheduled_for: string | null;
  priority: "low" | "normal" | "urgent";
  description: string | null;
}

export interface Branding {
  company_name: string;
  office_phone: string | null;
}

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatDate(d: string | null): string | null {
  if (!d) return null;
  const date = new Date(d + "T00:00:00Z");
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function mapsLink(job: JobForEmail): string | null {
  const q = [job.site_address, job.district].filter(Boolean).join(", ");
  return q ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q) : null;
}

function detailRows(job: JobForEmail): [string, string, string][] {
  // [label, html, text]
  const rows: [string, string, string][] = [];
  const add = (label: string, value: string | null, html?: string) => {
    if (value) rows.push([label, html ?? esc(value), value]);
  };
  add("Job type", job.job_type);
  add("Client", job.client_name);
  add(
    "Phone",
    job.client_phone,
    job.client_phone
      ? `<a href="tel:${esc(job.client_phone.replace(/\s+/g, ""))}" style="color:#1a5fb4">${esc(job.client_phone)}</a>`
      : undefined,
  );
  const site = [job.site_address, job.district].filter(Boolean).join(", ");
  const maps = mapsLink(job);
  add("Site", site || null, site ? `${esc(site)}${maps ? ` &nbsp;<a href="${maps}" style="color:#1a5fb4">Map</a>` : ""}` : undefined);
  add("Scheduled", formatDate(job.scheduled_for));
  add("Priority", job.priority === "normal" ? null : job.priority.toUpperCase());
  add("Notes", job.description, job.description ? esc(job.description).replace(/\n/g, "<br>") : undefined);
  return rows;
}

function button(href: string, label: string, bg: string, fg = "#ffffff", border?: string): string {
  return `<a href="${esc(href)}" style="display:inline-block;background:${bg};color:${fg};text-decoration:none;font-weight:bold;font-size:15px;padding:12px 18px;border-radius:8px;${
    border ? `border:2px solid ${border};` : ""
  }margin:4px 6px 4px 0">${esc(label)}</a>`;
}

function shell(company: string, kicker: string, heading: string, sub: string, inner: string, footer: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f2f3f5">
<div style="background:#f2f3f5;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#1c2126">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e1e4e8;border-radius:10px">
<tr><td style="padding:20px 24px 16px;border-bottom:3px solid #E8A33D">
<div style="font-size:12px;color:#6b7680;letter-spacing:.05em;text-transform:uppercase">${esc(company)} · ${esc(kicker)}</div>
<div style="font-size:20px;font-weight:bold;margin-top:6px;line-height:1.3">${esc(heading)}</div>
${sub ? `<div style="font-size:13px;color:#6b7680;margin-top:4px">${sub}</div>` : ""}
</td></tr>
<tr><td style="padding:18px 24px 22px;font-size:15px;line-height:1.5">${inner}</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #eef0f2;font-size:12px;color:#8a949c;line-height:1.5">${footer}</td></tr>
</table></div></body></html>`;
}

export interface JobLinks {
  page: string;
  accept: string;
  decline: string;
  on_site: string;
  done: string;
}

export function buildLinks(appUrl: string, token: string): JobLinks {
  const base = appUrl.replace(/#.*$/, "");
  const page = `${base}#/job/${token}`;
  return {
    page,
    accept: `${page}?a=accept`,
    decline: `${page}?a=decline`,
    on_site: `${page}?a=on_site`,
    done: `${page}?a=done`,
  };
}

export function jobEmail(
  job: JobForEmail,
  installerName: string,
  links: JobLinks,
  brand: Branding,
  opts: { reminder?: boolean } = {},
): { subject: string; text: string; html: string } {
  const ref = refLabel(job.ref_no);
  const where = job.district || job.site_address;
  const subject = `${opts.reminder ? "Reminder: " : ""}${job.priority === "urgent" ? "URGENT · " : ""}New job ${ref}: ${job.title}${
    where ? " — " + where : ""
  }`;
  const first = installerName.split(/\s+/)[0] || installerName;
  const rows = detailRows(job);
  const officeLine = brand.office_phone ? ` Questions? Call the office on ${esc(brand.office_phone)}.` : "";

  const table = rows.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:14px 0 18px;border-collapse:collapse">${rows
      .map(
        ([l, h]) =>
          `<tr><td style="padding:7px 12px 7px 0;color:#6b7680;font-size:13px;vertical-align:top;white-space:nowrap;border-bottom:1px solid #f0f1f3">${esc(l)}</td><td style="padding:7px 0;font-size:15px;border-bottom:1px solid #f0f1f3">${h}</td></tr>`,
      )
      .join("")}</table>`
    : "";

  const inner = `Hi ${esc(first)}, you've been assigned this job. Please let the office know if you can take it:
${table}
<div>${button(links.accept, "✓ Accept job", "#2F8F5E")}${button(links.decline, "Can't take it", "#ffffff", "#b3453b", "#d9a19b")}</div>
<div style="margin-top:18px;font-size:13px;color:#6b7680">Later, from this same email:</div>
<div>${button(links.on_site, "I'm on site", "#2d7fb0")}${button(links.done, "Job done", "#1c2126")}</div>
<div style="margin-top:16px;font-size:13px"><a href="${esc(links.page)}" style="color:#1a5fb4">Open the job page</a></div>`;

  const html = shell(
    brand.company_name,
    opts.reminder ? "Job reminder" : "New job",
    job.title,
    `${ref}${job.priority === "urgent" ? ' · <b style="color:#b3453b">URGENT</b>' : ""}`,
    inner,
    `These buttons are personal to you — please don't forward this email.${officeLine}`,
  );

  const text = [
    `${brand.company_name} — ${opts.reminder ? "job reminder" : "new job"} ${ref}`,
    ``,
    `Hi ${first}, you've been assigned: ${job.title}`,
    ...rows.map(([l, , t]) => `${l}: ${t}`),
    ``,
    `Accept:        ${links.accept}`,
    `Can't take it: ${links.decline}`,
    `I'm on site:   ${links.on_site}`,
    `Job done:      ${links.done}`,
    ``,
    `These links are personal to you — please don't forward this email.${brand.office_phone ? " Office: " + brand.office_phone : ""}`,
  ].join("\n");

  return { subject, text, html };
}

export function withdrawnEmail(
  job: JobForEmail,
  installerName: string,
  brand: Branding,
  kind: "cancelled" | "recalled",
  reason: string | null,
): { subject: string; text: string; html: string } {
  const ref = refLabel(job.ref_no);
  const first = installerName.split(/\s+/)[0] || installerName;
  const what = kind === "cancelled" ? "has been cancelled" : "has been taken off your list by the office";
  const subject = `${ref} ${kind === "cancelled" ? "cancelled" : "withdrawn"} — no need to attend`;
  const inner = `Hi ${esc(first)}, job <b>${esc(ref)}: ${esc(job.title)}</b> ${what}. You don't need to attend.${
    reason ? `<div style="margin-top:12px;padding:10px 12px;background:#f6f7f8;border-radius:6px">${esc(reason)}</div>` : ""
  }`;
  const html = shell(
    brand.company_name,
    kind === "cancelled" ? "Job cancelled" : "Job withdrawn",
    job.title,
    esc(ref),
    inner,
    brand.office_phone ? `Questions? Call the office on ${esc(brand.office_phone)}.` : "",
  );
  const text = `Hi ${first}, job ${ref}: ${job.title} ${what}. You don't need to attend.${reason ? "\n\n" + reason : ""}`;
  return { subject, text, html };
}

export function officeUpdateEmail(
  job: JobForEmail,
  installerName: string,
  action: "accept" | "decline" | "on_site" | "done",
  note: string | null,
  brand: Branding,
  consoleUrl: string | null,
): { subject: string; text: string; html: string } {
  const ref = refLabel(job.ref_no);
  const verb = {
    accept: "accepted",
    decline: "declined",
    on_site: "is on site for",
    done: "finished",
  }[action];
  const subject =
    action === "decline"
      ? `${ref} declined by ${installerName} — needs reassigning`
      : `${ref} ${verb === "is on site for" ? "on site" : verb} — ${installerName}`;
  const headline = `${installerName} ${verb} ${ref}`;
  const inner = `<b>${esc(job.title)}</b>${job.client_name ? ` for ${esc(job.client_name)}` : ""}${
    job.district || job.site_address ? `, ${esc(job.district || job.site_address)}` : ""
  }.${
    note
      ? `<div style="margin-top:12px;padding:10px 12px;background:#f6f7f8;border-radius:6px"><span style="color:#6b7680;font-size:13px">${
        action === "decline" ? "Reason" : "Note"
      }:</span><br>${esc(note).replace(/\n/g, "<br>")}</div>`
      : ""
  }${
    action === "decline"
      ? `<div style="margin-top:12px">The job is back in <b>Unassigned</b> — pick another installer and dispatch it again.</div>`
      : action === "done"
      ? `<div style="margin-top:12px">Check the work and mark it <b>verified</b> on the board.</div>`
      : ""
  }${consoleUrl ? `<div style="margin-top:16px">${button(consoleUrl, "Open the board", "#E8A33D", "#171208")}</div>` : ""}`;
  const html = shell(brand.company_name, "Job update", headline, esc(ref), inner, "Sent automatically by your dispatch console.");
  const text = `${headline}: ${job.title}${note ? `\n\n${action === "decline" ? "Reason" : "Note"}: ${note}` : ""}${
    consoleUrl ? `\n\nBoard: ${consoleUrl}` : ""
  }`;
  return { subject, text, html };
}

export function testEmail(brand: Branding, sender: string): { subject: string; text: string; html: string } {
  const html = shell(
    brand.company_name,
    "Test",
    "Email is working",
    "",
    `This test came from your dispatch console, sent through <b>${esc(sender)}</b>. Installers will get job emails from this address.`,
    "Sent from Settings → Send test email.",
  );
  return {
    subject: `${brand.company_name} dispatch — test email`,
    text: `Email is working. Installers will get job emails from ${sender}.`,
    html,
  };
}

export function senderAddress(): string {
  return GMAIL_USER;
}
