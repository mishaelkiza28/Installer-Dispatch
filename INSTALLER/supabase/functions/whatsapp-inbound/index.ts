// Meta WhatsApp Cloud API webhook — handles both the one-time GET
// verification handshake and the POST callbacks for inbound messages.
//
// Register this function's URL in Meta Business Manager → WhatsApp →
// Configuration → Webhook, with the same WHATSAPP_VERIFY_TOKEN you set
// as a secret here.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const payload = await req.json();
  const value = payload?.entry?.[0]?.changes?.[0]?.value;
  const msg = value?.messages?.[0];

  if (msg?.from && msg?.text?.body) {
    const from = "+" + msg.from; // Meta sends digits only, no leading +
    const text = String(msg.text.body).trim().toUpperCase();

    const { data: tech } = await supabase.from("technicians").select("id").eq("phone_e164", from).maybeSingle();

    if (tech) await handleReply(tech.id, text);
  }

  return new Response("ok", { headers: corsHeaders });
});

async function handleReply(technicianId: string, text: string) {
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
    channel: "whatsapp",
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
