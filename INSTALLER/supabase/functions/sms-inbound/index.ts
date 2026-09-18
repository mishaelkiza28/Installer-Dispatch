// Africa's Talking inbound SMS webhook.
// Set this function's URL as the "Callback URL" for your Africa's
// Talking SMS shortcode/sender in their dashboard.
//
// A technician's reply here — ACK, START, or DONE — advances the work
// order's status with no app for them to open.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const form = await req.formData();
  const from = String(form.get("from") ?? ""); // e.g. +2567xxxxxxxx
  const text = String(form.get("text") ?? "").trim().toUpperCase();

  const { data: tech } = await supabase.from("technicians").select("id").eq("phone_e164", from).maybeSingle();

  if (tech) await handleReply(tech.id, text, "sms");

  return new Response("ok", { headers: corsHeaders });
});

async function handleReply(technicianId: string, text: string, channel: "sms" | "whatsapp") {
  const { data: wo } = await supabase
    .from("work_orders")
    .select("id, status")
    .eq("assigned_to", technicianId)
    .in("status", ["dispatched", "acknowledged", "in_progress"])
    .order("dispatched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase.from("notification_log").insert({
    work_order_id: wo?.id ?? null,
    technician_id: technicianId,
    channel,
    direction: "inbound",
    body: text,
    status: "received",
  });

  if (!wo) return;

  const nextStatus =
    text === "DONE" || text === "COMPLETE" ? "completed" :
    text === "ACK" || text === "1" || text === "OK" ? "acknowledged" :
    text === "START" ? "in_progress" :
    null;

  if (nextStatus) {
    await supabase.rpc("advance_work_order", { p_work_order_id: wo.id, p_new_status: nextStatus });
  }
}
