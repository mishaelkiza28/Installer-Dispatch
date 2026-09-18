// POST { work_order_id, channels?: ("sms"|"whatsapp"|"email")[] }
//
// Looks up the assigned technician, sends the notification on the
// requested channels (defaults to all three the technician has),
// logs every attempt, then advances the work order to "dispatched"
// through the guarded transition function.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sendSms, sendWhatsAppTemplate, sendEmail, type SendResult } from "../_shared/notifiers.ts";

// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are all
// injected automatically into every Edge Function's environment — no
// need to set them yourself.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // This function is deployed with verify_jwt = false (see
  // supabase/config.toml) so the platform gateway doesn't reject the
  // CORS preflight before it reaches us — browsers never attach an
  // Authorization header to a preflight OPTIONS request, and the
  // platform's own JWT check has no way to know that's expected.
  // We validate the caller's session ourselves instead, so this stays
  // restricted to signed-in dispatchers rather than becoming an open
  // endpoint anyone could call to trigger real SMS/WhatsApp/email sends.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const callerClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: userData, error: userErr } = await callerClient.auth.getUser(token);
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ ok: false, error: "Not authenticated" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { work_order_id, channels } = await req.json();
    const wanted: string[] = channels?.length ? channels : ["sms", "whatsapp", "email"];

    const { data: wo, error: woErr } = await supabase
      .from("work_orders")
      .select("*, technicians(*)")
      .eq("id", work_order_id)
      .single();
    if (woErr || !wo) throw new Error(woErr?.message ?? "work order not found");
    if (!wo.assigned_to || !wo.technicians) throw new Error("work order has no assigned technician");

    const tech = wo.technicians;
    const message =
      `New job: ${wo.title}\n` +
      `Site: ${wo.site_address ?? "n/a"}\n` +
      `Priority: ${wo.priority}\n` +
      (wo.description ? `Notes: ${wo.description}\n` : "") +
      `Reply ACK to confirm, START when you begin, DONE when finished.`;

    const results: Record<string, SendResult> = {};

    if (wanted.includes("sms") && tech.phone_e164) {
      results.sms = await sendSms(tech.phone_e164, message);
      await logNotification(wo.id, tech.id, "sms", message, results.sms);
    }
    if (wanted.includes("whatsapp") && tech.whatsapp_opt_in && tech.phone_e164) {
      results.whatsapp = await sendWhatsAppTemplate(tech.phone_e164, [
        wo.title,
        wo.site_address ?? "n/a",
        wo.priority,
      ]);
      await logNotification(wo.id, tech.id, "whatsapp", message, results.whatsapp);
    }
    if (wanted.includes("email") && tech.email) {
      results.email = await sendEmail(tech.email, `Work order: ${wo.title}`, message);
      await logNotification(wo.id, tech.id, "email", message, results.email);
    }

    if (Object.values(results).length && !Object.values(results).some((r) => r.ok)) {
      // every attempted channel failed — don't silently mark it dispatched
      throw new Error("all notification channels failed: " + JSON.stringify(results));
    }

    const { error: advErr } = await supabase.rpc("advance_work_order", {
      p_work_order_id: wo.id,
      p_new_status: "dispatched",
    });
    if (advErr) throw new Error(advErr.message);

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function logNotification(
  workOrderId: string,
  technicianId: string,
  channel: "sms" | "whatsapp" | "email",
  body: string,
  result: SendResult
) {
  await supabase.from("notification_log").insert({
    work_order_id: workOrderId,
    technician_id: technicianId,
    channel,
    direction: "outbound",
    body,
    provider_message_id: result.providerMessageId,
    status: result.ok ? "sent" : "failed",
  });
}
