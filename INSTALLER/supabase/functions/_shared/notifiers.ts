// Thin wrappers around each notification provider.
//
// Configure these as Edge Function secrets (Supabase dashboard →
// Project Settings → Edge Functions → Secrets, or `supabase secrets set`)
// — never commit real keys to this repo.

const AT_USERNAME = Deno.env.get("AFRICAS_TALKING_USERNAME") ?? "";
const AT_API_KEY = Deno.env.get("AFRICAS_TALKING_API_KEY") ?? "";
const AT_SENDER_ID = Deno.env.get("AFRICAS_TALKING_SENDER_ID") ?? ""; // optional

const WA_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const WA_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
const WA_TEMPLATE_NAME = Deno.env.get("WHATSAPP_TEMPLATE_NAME") ?? "work_order_dispatch";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "dispatch@example.com";

export type SendResult = { ok: boolean; providerMessageId?: string; error?: string };

// --- SMS via Africa's Talking -------------------------------------------
// Uganda-local routing is dramatically cheaper here than through
// international gateways (Twilio/Plivo/etc.) for MTN/Airtel numbers.
export async function sendSms(toE164: string, body: string): Promise<SendResult> {
  if (!AT_USERNAME || !AT_API_KEY) {
    return { ok: false, error: "Africa's Talking credentials not configured" };
  }
  const res = await fetch("https://api.africastalking.com/version1/messaging", {
    method: "POST",
    headers: {
      apiKey: AT_API_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      username: AT_USERNAME,
      to: toE164,
      message: body,
      ...(AT_SENDER_ID ? { from: AT_SENDER_ID } : {}),
    }),
  });
  const data = await res.json().catch(() => null);
  const recipient = data?.SMSMessageData?.Recipients?.[0];
  if (!res.ok || !recipient || recipient.status !== "Success") {
    return { ok: false, error: JSON.stringify(data ?? { status: res.status }) };
  }
  return { ok: true, providerMessageId: recipient.messageId };
}

// --- WhatsApp via Meta's Cloud API directly (no BSP markup) -------------
// Requires an approved message template — WhatsApp business-initiated
// messages must use one. Create "work_order_dispatch" (or your own name,
// set via WHATSAPP_TEMPLATE_NAME) in Meta Business Manager first.
export async function sendWhatsAppTemplate(toE164: string, bodyParams: string[]): Promise<SendResult> {
  if (!WA_PHONE_NUMBER_ID || !WA_ACCESS_TOKEN) {
    return { ok: false, error: "WhatsApp credentials not configured" };
  }
  const res = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WA_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toE164.replace("+", ""),
      type: "template",
      template: {
        name: WA_TEMPLATE_NAME,
        language: { code: "en" },
        components: bodyParams.length
          ? [{ type: "body", parameters: bodyParams.map((p) => ({ type: "text", text: p })) }]
          : [],
      },
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: JSON.stringify(data ?? { status: res.status }) };
  return { ok: true, providerMessageId: data?.messages?.[0]?.id };
}

// --- Email via Resend -----------------------------------------------------
export async function sendEmail(to: string, subject: string, body: string): Promise<SendResult> {
  if (!RESEND_API_KEY) return { ok: false, error: "Resend API key not configured" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, text: body }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: JSON.stringify(data ?? { status: res.status }) };
  return { ok: true, providerMessageId: data?.id };
}
